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
  /**
   * Mean of the per-candle draw driving drift, in (0, 1). 0.5 is a pure
   * random walk (no trend); lower values bias the walk upward, higher values
   * bias it downward. Defaults to a very slight upward bias (0.48).
   */
  driftBias?: number;
}): Candle[] {
  const {
    count,
    startTime,
    intervalMs,
    startPrice,
    volatility,
    withVolume = true,
    driftBias = 0.48,
  } = options;
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
    const drift = (rand() - driftBias) * volatility;
    const close = Math.max(0.01, open + drift);
    const high = Math.max(open, close) + rand() * volatility * 0.5;
    const low = Math.max(0.01, Math.min(open, close) - rand() * volatility * 0.5);
    const volume = withVolume ? Math.round(rand() * 1000) + 100 : undefined;

    candles.push({ time: startTime + i * intervalMs, open, high, low, close, volume });
    price = close;
  }

  return candles;
}

/**
 * Aggregates `factor` consecutive candles into one higher-timeframe candle
 * (standard OHLCV rollup: first open, max high, min low, last close, summed
 * volume). Drops a trailing partial group so every output candle represents
 * a full `factor`-candle window. Use this to derive consistent HTF/MTF/LTF
 * datasets from one base series, so a multi-timeframe example's zones
 * actually line up across timeframes instead of being independently random.
 */
export function aggregateCandles(candles: Candle[], factor: number): Candle[] {
  const aggregated: Candle[] = [];

  for (let i = 0; i + factor <= candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    const volumes = group.map((c) => c.volume).filter((v): v is number => typeof v === 'number');

    aggregated.push({
      time: group[0].time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: volumes.length > 0 ? volumes.reduce((sum, v) => sum + v, 0) : undefined,
    });
  }

  return aggregated;
}
