import { Candle } from '../types';

export function trueRange(current: Candle, previous: Candle): number {
  return Math.max(
    current.high - current.low,
    Math.abs(current.high - previous.close),
    Math.abs(current.low - previous.close),
  );
}

/** Average true range over the `lookback` candles ending just before `endIndex` (excludes `endIndex` itself). */
export function averageRangeBefore(candles: Candle[], endIndex: number, lookback: number): number {
  const start = Math.max(1, endIndex - lookback);
  let sum = 0;
  let count = 0;

  for (let i = start; i < endIndex; i++) {
    sum += trueRange(candles[i], candles[i - 1]);
    count++;
  }

  return count > 0 ? sum / count : 0;
}
