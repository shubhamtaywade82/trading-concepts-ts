import { Candle } from '../src/types';

/**
 * Deterministic synthetic OHLCV generator, only for these examples.
 * Swap this out for real candles from your exchange/broker/data vendor.
 */
export function generateCandles(options: {
  count: number;
  startTime: number;
  intervalMs: number;
  startPrice: number;
  volatility: number;
  seed?: number;
  withVolume?: boolean;
}): Candle[] {
  const { count, startTime, intervalMs, startPrice, volatility, withVolume = true } = options;
  let seed = options.seed ?? 42;
  const rand = () => {
    // simple LCG - deterministic across runs, good enough for demo data
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  const candles: Candle[] = [];
  let price = startPrice;

  for (let i = 0; i < count; i++) {
    const open = price;
    const drift = (rand() - 0.48) * volatility;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + rand() * volatility * 0.5;
    const low = Math.max(0.01, Math.min(open, close) - rand() * volatility * 0.5);
    const volume = withVolume ? Math.round(rand() * 1000) + 100 : undefined;

    candles.push({ time: startTime + i * intervalMs, open, high, low, close, volume });
    price = close;
  }

  return candles;
}
