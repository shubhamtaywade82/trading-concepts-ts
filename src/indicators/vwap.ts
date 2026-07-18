/**
 * Session-anchored Volume Weighted Average Price.
 */

import { VWAPConfig } from '../config/types';
import { Candle } from '../types';
import { minuteOfDay } from '../utils/time';

/**
 * Cumulative VWAP, resetting at each new trading day (00:00 local, per
 * `config.timezoneOffsetMinutes`) when `config.resetDaily` is true;
 * otherwise accumulates from the start of `candles`. Assumes `candles` are
 * chronologically ordered with no large time gaps (a day-boundary crossing
 * is detected as the local minute-of-day going backwards between candles).
 * `null` for candles with no volume data yet accumulated.
 */
export function calculateVWAP(candles: Candle[], config: VWAPConfig): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  let lastMinute: number | null = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    if (config.resetDaily) {
      const minute = minuteOfDay(candle.time, config.timezoneOffsetMinutes);
      if (lastMinute !== null && minute < lastMinute) {
        cumulativePV = 0;
        cumulativeVolume = 0;
      }
      lastMinute = minute;
    }

    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    const volume = candle.volume ?? 0;

    cumulativePV += typicalPrice * volume;
    cumulativeVolume += volume;

    result[i] = cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : null;
  }

  return result;
}
