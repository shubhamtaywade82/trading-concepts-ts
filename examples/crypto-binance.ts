/**
 * Fine-tuning example: 24/7 crypto perpetuals (e.g. Binance/Bybit BTCUSDT).
 *
 * Run with: npm run example:crypto
 *
 * In production, replace `generateCandles` below with real OHLCV candles
 * pulled from your exchange's REST/WebSocket API.
 */
import { CRYPTO_PRESET, TradingConcepts } from '../src';
import { generateCandles } from './generateCandles';

const candles = generateCandles({
  count: 500,
  startTime: Date.UTC(2026, 0, 1),
  intervalMs: 15 * 60 * 1000, // 15m candles
  startPrice: 43000,
  volatility: 120,
});

// Start from the crypto preset (24/7, no sessions), then fine-tune per symbol:
// BTCUSDT trades in whole-dollar-ish increments, so 2 decimals of precision
// and a slightly wider order-block volume lookback (busier market) make sense.
const btc = TradingConcepts.withPreset(candles, CRYPTO_PRESET, {
  precision: 2,
  orderBlock: { volumeLookback: 30 },
});

const analysis = btc.analyze();

console.log('BTCUSDT/Binance 15m analysis');
console.log('Config:', btc.getConfig());
console.log('Swings:', analysis.swings.length);
console.log('Structure signals:', analysis.structure.length);
console.log('Unmitigated FVGs:', analysis.fvgs.filter((f) => !f.mitigated).length);
console.log('Unmitigated order blocks:', analysis.orderBlocks.filter((ob) => !ob.mitigated).length);
console.log('High-probability longs:', analysis.signals.longs.length);
console.log('High-probability shorts:', analysis.signals.shorts.length);

const latestStructure = analysis.structure[analysis.structure.length - 1];
if (latestStructure) {
  console.log(
    `Latest structure event: ${latestStructure.type} (${latestStructure.direction}) at level ${latestStructure.level}`,
  );
}
