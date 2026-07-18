/**
 * Bollinger Bands and the TTM Squeeze (Bollinger Bands compressed inside
 * Keltner Channels, often preceding a displacement move).
 */

import { BollingerBandsConfig, TTMSqueezeConfig } from '../config/types';
import { BandValue, Candle } from '../types';
import { calculateKeltnerChannels } from './atr';

/** SMA midline with standard-deviation bands. `null` until `period` bars of history exist. */
export function calculateBollingerBands(
  candles: Candle[],
  config: BollingerBandsConfig,
): Array<BandValue | null> {
  const closes = candles.map((c) => c.close);

  return candles.map((_, i) => {
    if (i < config.period - 1) return null;

    const window = closes.slice(i - config.period + 1, i + 1);
    const middle = window.reduce((sum, v) => sum + v, 0) / config.period;
    const variance = window.reduce((sum, v) => sum + (v - middle) ** 2, 0) / config.period;
    const stdev = Math.sqrt(variance);

    return {
      middle,
      upper: middle + stdev * config.stdevMultiplier,
      lower: middle - stdev * config.stdevMultiplier,
    };
  });
}

/**
 * True when the Bollinger Bands sit entirely inside the Keltner Channel —
 * a volatility compression that often precedes a displacement move.
 */
export function detectTTMSqueeze(candles: Candle[], config: TTMSqueezeConfig): boolean[] {
  const bollinger = calculateBollingerBands(candles, config.bollinger);
  const keltner = calculateKeltnerChannels(candles, config.keltner);

  return candles.map((_, i) => {
    const bb = bollinger[i];
    const kc = keltner[i];
    if (!bb || !kc) return false;
    return bb.upper < kc.upper && bb.lower > kc.lower;
  });
}
