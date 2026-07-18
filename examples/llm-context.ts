/**
 * Demonstrates the "Data Translation Layer" for an LLM-based reasoning
 * system: runs the library's own detectors across three timeframes, then
 * formats whatever pieces were found into the semantic JSON payload an LLM
 * (or any downstream consumer) would read.
 *
 * IMPORTANT: this is Phase 1 only — turning computed analysis into
 * structured text. It does NOT call an LLM, run an agent, or place a trade.
 * Building that layer (prompt orchestration, RAG, execution) is a separate
 * concern for a consuming application; see the README for why this library
 * stops here.
 *
 * `buildLLMContext` is a pure formatter: it does not decide which order
 * block is "the" POI or which sweep is "the" trigger — this example selects
 * those the same way killzone-polarity-shift.ts does (most recent
 * unmitigated/qualifying, matching the HTF bias) and hands them in.
 *
 * Run with: npm run example:llm-context
 */
import {
  TradingConcepts,
  buildLLMContext,
  deriveTrendFromStructure,
  scoreConfluence,
  calculateVolumeProfile,
} from '../src';
import { OrderBlock } from '../src/types';
import { aggregateCandles, generateCandles } from './generateCandles';

const fiveMinute = generateCandles({
  count: 120 * 24 * 12,
  startTime: Date.UTC(2026, 0, 1),
  intervalMs: 5 * 60 * 1000,
  startPrice: 1800,
  volatility: 8,
  driftBias: 0.47, // see killzone-polarity-shift.ts for why a mild bias is used
});
const fifteenMinute = aggregateCandles(fiveMinute, 3);
const oneHour = aggregateCandles(fifteenMinute, 4);
const daily = aggregateCandles(oneHour, 24);

// --- HTF (Daily) ---
const htf = new TradingConcepts(daily, { structure: { swing: { lookback: 2 } } });
const htfAnalysis = htf.analyze();
const trend = deriveTrendFromStructure(htfAnalysis.structure);
const currentPrice = daily[daily.length - 1].close;
const dailyZone = htfAnalysis.premiumDiscountZones[htfAnalysis.premiumDiscountZones.length - 1];
const drawSide = trend === 'bullish' ? 'buyside' : 'sellside';
const unsweptHtfLiquidity = htfAnalysis.liquidity.filter((z) => z.type === drawSide && !z.swept);
const drawOnLiquidity = unsweptHtfLiquidity[unsweptHtfLiquidity.length - 1];
const dailyVolumeProfile = calculateVolumeProfile(daily, {
  bins: 24,
  hvnPercentile: 0.7,
  lvnPercentile: 0.3,
});

// --- MTF (1H) POI: most recent unmitigated order block matching the HTF trend ---
const mtf = new TradingConcepts(oneHour, { structure: { swing: { lookback: 5 } } });
mtf.setHTFContext({
  orderBlocks: htfAnalysis.orderBlocks.filter((ob) => !ob.mitigated),
  structure: htfAnalysis.structure,
  premiumDiscountZones: htfAnalysis.premiumDiscountZones,
  liquidity: htfAnalysis.liquidity.filter((z) => !z.swept),
});
const mtfAnalysis = mtf.analyze();
const mtfCandidates = mtfAnalysis.orderBlocks.filter((ob) => ob.type === trend && !ob.mitigated);
const mtfPoiOb: OrderBlock | undefined = mtfCandidates[mtfCandidates.length - 1];

// --- LTF (15m) trigger: most recent reversal sweep after the POI, with a nearby structure shift ---
const ltf = new TradingConcepts(fifteenMinute, { structure: { swing: { lookback: 3 } } });
if (mtfPoiOb) {
  ltf.setHTFContext({
    orderBlocks: [mtfPoiOb],
    structure: mtfAnalysis.structure,
    premiumDiscountZones: mtfAnalysis.premiumDiscountZones,
    liquidity: mtfAnalysis.liquidity.filter((z) => !z.swept),
  });
}
const ltfAnalysis = ltf.analyze();

const sweepSide = trend === 'bullish' ? 'sellside' : 'buyside';
const poiLtfIndex = mtfPoiOb ? fifteenMinute.findIndex((c) => c.time >= mtfPoiOb.time) : 0;
const ltfSweepCandidates = ltfAnalysis.liquidity.filter(
  (z) => z.type === sweepSide && z.swept && z.sweepType === 'reversal' && (z.sweepIndex ?? 0) >= poiLtfIndex,
);
const ltfSweep = ltfSweepCandidates[ltfSweepCandidates.length - 1];
const ltfStructureShift = ltfSweep
  ? ltfAnalysis.structure.find(
      (s) =>
        s.direction === trend &&
        (s.type === 'CHoCH' || s.type === 'MSS') &&
        s.index >= (ltfSweep.sweepIndex ?? 0) &&
        s.index <= (ltfSweep.sweepIndex ?? 0) + 15,
    )
  : undefined;

// --- Confluence score for the POI, if one was found ---
const confluenceScore = mtfPoiOb
  ? scoreConfluence(
      {
        candles: oneHour,
        orderBlocks: mtfAnalysis.orderBlocks,
        structure: mtfAnalysis.structure,
        liquidity: mtfAnalysis.liquidity,
        fvgs: mtfAnalysis.fvgs,
        inverseFvgs: mtfAnalysis.inverseFvgs,
        priceAction: mtfAnalysis.priceAction,
        killzones: mtfAnalysis.killzones,
        premiumDiscountZones: mtfAnalysis.premiumDiscountZones,
      },
      mtf.getConfig().confluenceScore,
      mtf.getConfig().liquidity.sweepScore,
    ).find((s) => s.zoneIndex === mtfPoiOb.index)
  : undefined;

const context = buildLLMContext({
  symbol: 'ETHUSDT',
  htf: {
    timeframe: '1D',
    trend,
    currentPrice,
    drawOnLiquidity,
    premiumDiscountZone: dailyZone,
    volumeProfile: dailyVolumeProfile,
  },
  mtfPoi: mtfPoiOb ? { timeframe: '1H', orderBlock: mtfPoiOb } : undefined,
  ltfTrigger: ltfSweep
    ? {
        timeframe: '15m',
        sweptZone: ltfSweep,
        structureShift: ltfStructureShift,
        sweepCandle: fifteenMinute[ltfSweep.sweepIndex ?? 0],
      }
    : undefined,
  confluenceScore,
});

console.log(JSON.stringify(context, null, 2));

if (!mtfPoiOb)
  console.log('\n(No MTF POI found in this synthetic run — mtf_poi is null above, as designed.)');
if (mtfPoiOb && !ltfSweep)
  console.log('\n(No LTF trigger found after the POI in this run — ltf_trigger is null above.)');
// Note: this generator's long-run upward drift, compounded over months of
// 5m bars, can leave the only still-unmitigated order block far below the
// current price (it's simply the oldest one price never came back to) —
// that's a property of this synthetic dataset, not the serializer; a real
// feed's more varied price history won't produce that pattern.
