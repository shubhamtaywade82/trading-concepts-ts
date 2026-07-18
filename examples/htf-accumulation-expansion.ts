/**
 * "HTF Accumulation Expansion" — a swing setup demonstrating the same 3-tier
 * HTF -> MTF -> LTF composition pattern as killzone-polarity-shift.ts, at
 * swing-trade granularity:
 *
 *   1. HTF (Weekly) context: price has tapped an unmitigated weekly bullish
 *      Order Block, or swept a major weekly sellside liquidity pool.
 *   2. MTF (4H) shift: a 4H MSS (displacement-confirmed reversal), leaving an
 *      unmitigated 4H bullish FVG — fed the HTF's context via setHTFContext.
 *   3. LTF (1H) entry: after the 4H FVG, a 1H sellside liquidity sweep (a
 *      minor swing low taken out) followed by a 1H bullish CHoCH — fed the
 *      MTF's context via setHTFContext.
 *   4. Entry at the CHoCH candle's close, stop below the weekly OB's origin,
 *      targets at the nearest 4H buyside liquidity and the weekly high.
 *      (The source framework also references a separate Daily target tier;
 *      this demo only builds Weekly/4H/1H, so the weekly high stands in for
 *      it — noted here rather than silently doing something different from
 *      what's described.)
 *
 * IMPORTANT: candles are synthetically generated (see generateCandles.ts /
 * aggregateCandles) so this runs out of the box and so the Weekly/4H/1H
 * datasets are mutually consistent. This demonstrates the *wiring*, not a
 * validated trading signal — see killzone-polarity-shift.ts's header for why
 * a mild drift bias is used, and note each stage below reports honestly
 * if it doesn't find a match rather than forcing one. Backtest against real
 * data (see the Backtesting section in README) before trusting any of this
 * with real capital.
 *
 * Run with: npm run example:htf-accumulation-expansion
 */
import { TradingConcepts } from '../src';
import { HTFContext } from '../src/types';
import { aggregateCandles, generateCandles } from './generateCandles';

const oneHour = generateCandles({
  count: 2 * 365 * 24, // 2 years of 1H bars
  startTime: Date.UTC(2024, 0, 1),
  intervalMs: 60 * 60 * 1000,
  startPrice: 100,
  volatility: 0.5,
  driftBias: 0.47, // see killzone-polarity-shift.ts for why
});
const fourHour = aggregateCandles(oneHour, 4);
const weekly = aggregateCandles(oneHour, 168); // 7 * 24

console.log('=== HTF Accumulation Expansion (synthetic demo) ===');

// --- 1. HTF (Weekly) context ---
const htf = new TradingConcepts(weekly, { structure: { swing: { lookback: 2 } } });
const htfAnalysis = htf.analyze();

const unmitigatedWeeklyBullishObs = htfAnalysis.orderBlocks.filter(
  (ob) => ob.type === 'bullish' && !ob.mitigated,
);
const weeklyOb = unmitigatedWeeklyBullishObs[unmitigatedWeeklyBullishObs.length - 1];

const sweptWeeklySsl = htfAnalysis.liquidity.filter((z) => z.type === 'sellside' && z.swept);
const tappedWeeklySsl = sweptWeeklySsl[sweptWeeklySsl.length - 1];

if (!weeklyOb && !tappedWeeklySsl) {
  console.log('No unmitigated weekly bullish OB and no tapped weekly SSL in this run.');
  process.exit(0);
}
if (weeklyOb) {
  console.log(
    `HTF (Weekly) context: unmitigated bullish OB [${weeklyOb.bottom.toFixed(2)}, ${weeklyOb.top.toFixed(2)}].`,
  );
} else {
  console.log(`HTF (Weekly) context: sellside liquidity tapped at ${tappedWeeklySsl!.level.toFixed(2)}.`);
}

const weeklyHigh = htfAnalysis.liquidity.filter((z) => z.type === 'buyside');
const weeklyOrigin = weeklyOb ?? { bottom: tappedWeeklySsl!.level, top: tappedWeeklySsl!.level };

const htfContextForMtf: HTFContext = {
  orderBlocks: weeklyOb ? [weeklyOb] : [],
  structure: htfAnalysis.structure,
  premiumDiscountZones: htfAnalysis.premiumDiscountZones,
  liquidity: htfAnalysis.liquidity.filter((z) => !z.swept),
};

// --- 2. MTF (4H) shift: MSS -> supporting FVG ---
const mtf = new TradingConcepts(fourHour, { structure: { swing: { lookback: 5 } } });
mtf.setHTFContext(htfContextForMtf);
const mtfAnalysis = mtf.analyze();

const mtfShift = mtfAnalysis.structure.filter((s) => s.type === 'MSS' && s.direction === 'bullish');
const lastShift = mtfShift[mtfShift.length - 1];
if (!lastShift) {
  console.log('No bullish 4H MSS in this run.');
  process.exit(0);
}

const mtfFvg = mtfAnalysis.fvgs.find(
  (f) => f.type === 'bullish' && !f.mitigated && f.index >= lastShift.index && f.index <= lastShift.index + 5,
);
if (!mtfFvg) {
  console.log(`Bullish 4H MSS at index ${lastShift.index}, but no supporting unmitigated FVG within 5 bars.`);
  process.exit(0);
}
console.log(
  `MTF (4H) shift: MSS at index ${lastShift.index} (level ${lastShift.level.toFixed(2)}), FVG [${mtfFvg.bottom.toFixed(2)}, ${mtfFvg.top.toFixed(2)}].`,
);

const htfContextForLtf: HTFContext = {
  orderBlocks: weeklyOb ? [weeklyOb] : [],
  structure: mtfAnalysis.structure,
  premiumDiscountZones: mtfAnalysis.premiumDiscountZones,
  liquidity: mtfAnalysis.liquidity.filter((z) => !z.swept),
};

// --- 3. LTF (1H) entry: sweep -> CHoCH, after the 4H FVG formed ---
const ltf = new TradingConcepts(oneHour, { structure: { swing: { lookback: 3 } } });
ltf.setHTFContext(htfContextForLtf);
const ltfAnalysis = ltf.analyze();

const ltfCutoffIndex = oneHour.findIndex((c) => c.time >= fourHour[mtfFvg.index].time);

const sweep = ltfAnalysis.liquidity.find(
  (z) =>
    z.type === 'sellside' && z.swept && z.sweepType === 'reversal' && (z.sweepIndex ?? 0) >= ltfCutoffIndex,
);
if (!sweep) {
  console.log('No 1H sellside sweep after the 4H FVG in this run.');
  process.exit(0);
}

const choch = ltfAnalysis.structure.find(
  (s) =>
    (s.type === 'CHoCH' || s.type === 'MSS') &&
    s.direction === 'bullish' &&
    s.index >= (sweep.sweepIndex ?? 0) &&
    s.index <= (sweep.sweepIndex ?? 0) + 15,
);
if (!choch) {
  console.log('No 1H bullish CHoCH confirmed the sweep within 15 bars in this run.');
  process.exit(0);
}

// --- 4. Trade plan ---
const entryCandle = oneHour[choch.index];
const entry = entryCandle.close;
const stop = weeklyOrigin.bottom;
const risk = entry - stop;

console.log(`\n1H bullish CHoCH confirmed at index ${choch.index} (level ${choch.level.toFixed(2)}).`);
console.log(`\nEntry: ${entry.toFixed(2)} (1H CHoCH candle close)`);
console.log(`Stop:  ${stop.toFixed(2)} (below the weekly OB origin)`);
console.log(`TP1:   ${(entry + risk).toFixed(2)} (1R)`);
const fourHourBsl = mtfAnalysis.liquidity.find((z) => z.type === 'buyside' && !z.swept);
if (fourHourBsl) console.log(`TP2:   ${fourHourBsl.level.toFixed(2)} (nearest 4H buyside liquidity)`);
const weeklyBsl = weeklyHigh[weeklyHigh.length - 1];
if (weeklyBsl)
  console.log(`TP3:   ${weeklyBsl.level.toFixed(2)} (weekly high, standing in for the doc's Daily BSL)`);
