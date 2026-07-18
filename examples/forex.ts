/**
 * Fine-tuning example: spot FX (e.g. EUR/USD via OANDA/cTrader/MT bridge).
 *
 * Run with: npm run example:forex
 */
import { FOREX_PRESET, TradingConcepts } from '../src';
import { generateCandles } from './generateCandles';

const candles = generateCandles({
  count: 400,
  startTime: Date.UTC(2026, 0, 5),
  intervalMs: 60 * 60 * 1000, // 1h candles
  startPrice: 1.085,
  volatility: 0.0025,
  withVolume: false, // most FX feeds only give tick volume; treat it as absent
});

// FOREX_PRESET turns on the classic ICT killzones (Asian/London/NY/London-Close, UTC)
// and tightens the equal-highs/lows tolerance for FX's tighter typical ranges.
const eurusd = TradingConcepts.withPreset(candles, FOREX_PRESET);

const analysis = eurusd.analyze();

console.log('EURUSD 1h analysis');
console.log('Config:', eurusd.getConfig());
console.log('Liquidity pools:', analysis.liquidity.length);
console.log('Swept liquidity:', analysis.liquidity.filter((z) => z.swept).length);

const sessionCounts = analysis.killzones.reduce<Record<string, number>>((acc, kz) => {
  acc[kz.session] = (acc[kz.session] ?? 0) + 1;
  return acc;
}, {});
console.log('Candles per killzone session:', sessionCounts);

// Fine-tune further for a JPY pair (2-3 decimals instead of 4-5) without
// rebuilding the whole config from scratch:
const usdjpy = TradingConcepts.withPreset(candles.map((c) => ({ ...c, open: c.open * 100, high: c.high * 100, low: c.low * 100, close: c.close * 100 })), FOREX_PRESET, {
  precision: 3,
});
console.log('USDJPY precision:', usdjpy.getConfig().precision);
