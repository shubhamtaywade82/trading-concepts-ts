/**
 * "Kill Zone Polarity Shift" — an intraday setup demonstrating the 3-tier
 * HTF -> MTF -> LTF composition pattern documented in the README:
 *
 *   1. HTF (Daily) bias: is price in a discount zone, drawing toward BSL
 *      (buyside liquidity) at a prior high?
 *   2. MTF (1H) POI: the most recent unmitigated bullish Order Block, fed
 *      the HTF's context via setHTFContext, checked against that discount zone.
 *   3. LTF (15m) trigger, inside the NY AM kill zone (07:00-10:00 ET), *after*
 *      the POI formed: a Judas Swing (a false sweep of sellside liquidity
 *      that reverses) — fed the MTF's context via setHTFContext — followed
 *      by an MSS and a supporting bullish FVG.
 *   4. Entry at the FVG/displacement origin, stop below the sweep wick,
 *      targets at 1R, the prior daily high, and the nearest 1H resistance.
 *
 * IMPORTANT: candles are synthetically generated (see generateCandles.ts /
 * aggregateCandles) purely so this runs out of the box and so the HTF/MTF/LTF
 * datasets are mutually consistent (the 15m/1H/Daily series are literally
 * aggregated from the same base data, so their zones actually line up). A
 * mild upward drift bias is used so the synthetic walk actually trends enough
 * to leave swings/order blocks behind at every timeframe simultaneously —
 * without it, a pure random walk is either too noisy (every order block gets
 * retested within hours) or, with too much drift, too monotonic (no swings
 * form at all). This demonstrates the *wiring*, not a validated trading
 * signal — whether every stage lines up still depends on this run's random
 * walk, and each stage below reports honestly if it doesn't find one rather
 * than forcing a result. Backtest against real data (see the Backtesting
 * section in README) before trusting any of this with real capital.
 *
 * Run with: npm run example:killzone-polarity-shift
 */
import { TradingConcepts } from '../src';
import { classifyPrice } from '../src/ict/premiumDiscount';
import { HTFContext } from '../src/types';
import { aggregateCandles, generateCandles } from './generateCandles';

const NY_AM_KILLZONE = {
  enabled: true,
  timezoneOffsetMinutes: -300, // EST (adjust to -240 for EDT dates)
  killzones: [{ name: 'NewYorkAM', startUtcMinute: 420, endUtcMinute: 600, weight: 1 }], // 07:00-10:00 local
};

const fiveMinute = generateCandles({
  count: 120 * 24 * 12, // 120 days of 5m bars
  startTime: Date.UTC(2026, 0, 1),
  intervalMs: 5 * 60 * 1000,
  startPrice: 100,
  volatility: 0.6,
  driftBias: 0.47, // see the note above on why a pure 0.5 (or the other examples' default 0.48) doesn't work here
});
const fifteenMinute = aggregateCandles(fiveMinute, 3);
const oneHour = aggregateCandles(fifteenMinute, 4);
const daily = aggregateCandles(oneHour, 24);

console.log('=== Kill Zone Polarity Shift (synthetic demo) ===');

// --- 1. HTF (Daily) bias ---
const htf = new TradingConcepts(daily, { structure: { swing: { lookback: 2 } } });
const htfAnalysis = htf.analyze();
const dailyZone = htfAnalysis.premiumDiscountZones[htfAnalysis.premiumDiscountZones.length - 1];

if (!dailyZone) {
  console.log('No daily dealing range yet — need more history.');
  process.exit(0);
}
console.log(
  `HTF (Daily) equilibrium=${dailyZone.equilibrium.toFixed(2)}, discount below it, premium above it. ` +
    `Draw on liquidity: unswept BSL above ${dailyZone.high.toFixed(2)}.`,
);

const htfContextForMtf: HTFContext = {
  orderBlocks: htfAnalysis.orderBlocks.filter((ob) => !ob.mitigated),
  structure: htfAnalysis.structure,
  premiumDiscountZones: htfAnalysis.premiumDiscountZones,
  liquidity: htfAnalysis.liquidity.filter((z) => !z.swept),
};

// --- 2. MTF (1H) POI: the most recent unmitigated bullish OB ---
const mtf = new TradingConcepts(oneHour, { structure: { swing: { lookback: 5 } } });
mtf.setHTFContext(htfContextForMtf);
const mtfAnalysis = mtf.analyze();

const unmitigatedBullishObs = mtfAnalysis.orderBlocks.filter((ob) => ob.type === 'bullish' && !ob.mitigated);
const mtfPoi = unmitigatedBullishObs[unmitigatedBullishObs.length - 1];

if (!mtfPoi) {
  console.log('No unmitigated 1H bullish Order Block in this run — try more history or a different seed.');
  process.exit(0);
}

const poiClassification = classifyPrice((mtfPoi.top + mtfPoi.bottom) / 2, dailyZone);
console.log(
  `MTF (1H) POI: bullish OB [${mtfPoi.bottom.toFixed(2)}, ${mtfPoi.top.toFixed(2)}] — classified ${poiClassification} vs the daily zone.`,
);
if (poiClassification !== 'discount') {
  console.log(
    "This run's most recent POI isn't in HTF discount, so the setup's zone-alignment condition fails here.",
  );
  process.exit(0);
}

const htfContextForLtf: HTFContext = {
  orderBlocks: [mtfPoi],
  structure: mtfAnalysis.structure,
  premiumDiscountZones: mtfAnalysis.premiumDiscountZones,
  liquidity: mtfAnalysis.liquidity.filter((z) => !z.swept),
};

// --- 3. LTF (15m) trigger: Judas Swing -> MSS -> supporting FVG, all *after* the POI formed ---
const ltf = new TradingConcepts(fifteenMinute, {
  structure: { swing: { lookback: 3 } },
  session: NY_AM_KILLZONE,
});
ltf.setHTFContext(htfContextForLtf);
const ltfAnalysis = ltf.analyze();

const poiLtfIndex = fifteenMinute.findIndex((c) => c.time >= mtfPoi.time);

const judas = ltfAnalysis.judasSwings.find((j) => j.direction === 'bullish' && j.sweepIndex >= poiLtfIndex);
if (!judas) {
  console.log('No bullish Judas Swing after the POI formed, in the NY AM kill zone, in this run.');
  process.exit(0);
}
console.log(`LTF (15m) Judas Swing at index ${judas.sweepIndex} during the ${judas.session} kill zone.`);

// MSS (a displacement-confirmed CHoCH) is the strongest confirmation, but a
// plain CHoCH is still a valid reversal signal per the general MTF framework —
// accept either.
const mss = ltfAnalysis.structure.find(
  (s) =>
    (s.type === 'MSS' || s.type === 'CHoCH') &&
    s.direction === 'bullish' &&
    s.index >= judas.sweepIndex &&
    s.index <= judas.sweepIndex + 15,
);
if (!mss) {
  console.log('No bullish CHoCH/MSS confirmed the Judas Swing within 15 bars in this run.');
  process.exit(0);
}

const supportingFvg = ltfAnalysis.fvgs.find(
  (f) => f.type === 'bullish' && !f.mitigated && f.index >= mss.index && f.index <= mss.index + 5,
);

// --- 4. Trade plan ---
const sweepCandle = fifteenMinute[judas.sweepIndex];
const entry = supportingFvg ? supportingFvg.top : mss.level;
const stop = sweepCandle.low;
const risk = entry - stop;

console.log(`\nBullish MSS confirmed at index ${mss.index} (level ${mss.level.toFixed(2)}).`);
if (supportingFvg) {
  console.log(
    `Supporting bullish FVG: [${supportingFvg.bottom.toFixed(2)}, ${supportingFvg.top.toFixed(2)}]`,
  );
}

console.log(`\nEntry:  ${entry.toFixed(2)}`);
console.log(`Stop:   ${stop.toFixed(2)} (below the sweep wick)`);
console.log(`TP1:    ${(entry + risk).toFixed(2)} (1R)`);
console.log(`TP2:    ${dailyZone.high.toFixed(2)} (prior daily high / BSL)`);
const mtfResistance = mtfAnalysis.liquidity.find((z) => z.type === 'buyside' && !z.swept);
if (mtfResistance) console.log(`TP3:    ${mtfResistance.level.toFixed(2)} (nearest 1H buyside liquidity)`);
