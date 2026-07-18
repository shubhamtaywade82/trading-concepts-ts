/**
 * Average True Range and Keltner Channels — pure OHLCV volatility indicators.
 * Standalone; not wired into either scoring engine.
 */

import { ATRConfig, KeltnerChannelConfig } from '../config/types';
import { BandValue, Candle } from '../types';
import { trueRange } from '../utils/range';

/** Simple (non-Wilder-smoothed) moving average of true range, one value per candle. `null` until `period` bars of history exist. */
export function calculateATR(candles: Candle[], config: ATRConfig): Array<number | null> {
  const result: Array<number | null> = new Array(candles.length).fill(null);

  for (let i = config.period; i < candles.length; i++) {
    let sum = 0;
    for (let j = i - config.period + 1; j <= i; j++) {
      sum += trueRange(candles[j], candles[j - 1]);
    }
    result[i] = sum / config.period;
  }

  return result;
}

function calculateEMA(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let previous: number | null = null;

  for (let i = period - 1; i < values.length; i++) {
    if (previous === null) {
      const seed = values.slice(i - period + 1, i + 1);
      previous = seed.reduce((sum, v) => sum + v, 0) / period;
    } else {
      previous = values[i] * k + previous * (1 - k);
    }
    result[i] = previous;
  }

  return result;
}

/** EMA midline with ATR-multiple bands. `null` until both the EMA and ATR periods have enough history. */
export function calculateKeltnerChannels(
  candles: Candle[],
  config: KeltnerChannelConfig,
): Array<BandValue | null> {
  const ema = calculateEMA(
    candles.map((c) => c.close),
    config.emaPeriod,
  );
  const atr = calculateATR(candles, { period: config.atrPeriod });

  return candles.map((_, i) => {
    const middle = ema[i];
    const range = atr[i];
    if (middle === null || range === null) return null;

    return {
      middle,
      upper: middle + range * config.multiplier,
      lower: middle - range * config.multiplier,
    };
  });
}
