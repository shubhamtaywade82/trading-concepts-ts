/**
 * Fine-tuning example: NSE cash index (e.g. NIFTY 50), IST session hours.
 *
 * Run with: npm run example:index
 */
import { NSE_INDEX_PRESET, TradingConcepts, createConfig, DEFAULT_CONFIG } from '../src';
import { generateCandles } from './generateCandles';

const candles = generateCandles({
  count: 375, // one trading day of 1m candles, 09:15-15:30 IST
  startTime: Date.UTC(2026, 0, 6, 3, 45), // 09:15 IST
  intervalMs: 60 * 1000,
  startPrice: 21850,
  volatility: 8,
});

// NSE_INDEX_PRESET bakes in the IST offset (UTC+5:30) and NSE's opening/midday/
// closing windows, plus requireVolume=true since index futures volume is meaningful.
const nifty = TradingConcepts.withPreset(candles, NSE_INDEX_PRESET);
const analysis = nifty.analyze();

console.log('NIFTY 50 1m analysis (NSE, IST)');
console.log('Killzone tags:', new Set(analysis.killzones.map((k) => k.session)));
console.log('Order blocks (volume-gated):', analysis.orderBlocks.length);

// You can also build a config from scratch instead of `withPreset`, e.g. for a
// custom index or a market open you want to model precisely:
const bankNiftyConfig = createConfig(DEFAULT_CONFIG, {
  ...NSE_INDEX_PRESET,
  precision: 1,
  liquidity: { equalTolerancePercent: 0.03 }, // BANKNIFTY moves in bigger absolute points, tighten the %
});
const bankNifty = new TradingConcepts(candles, bankNiftyConfig);
console.log('BANKNIFTY config precision:', bankNifty.getConfig().precision);
