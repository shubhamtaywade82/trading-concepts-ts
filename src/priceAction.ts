/**
 * Pure price-action candlestick patterns, used as entry confirmation
 * confluence for SMC/ICT zones.
 */

import { PriceActionConfig } from './config/types';
import { Candle, PriceActionSignal } from './types';

export function detectPriceAction(candles: Candle[], config: PriceActionConfig): PriceActionSignal[] {
  const signals: PriceActionSignal[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1];
    const curr = candles[i];

    if (
      prev.close < prev.open &&
      curr.close > curr.open &&
      curr.close > prev.open &&
      curr.open < prev.close
    ) {
      signals.push({ index: i, time: curr.time, pattern: 'bullish_engulfing', price: curr.close });
    }

    if (
      prev.close > prev.open &&
      curr.close < curr.open &&
      curr.close < prev.open &&
      curr.open > prev.close
    ) {
      signals.push({ index: i, time: curr.time, pattern: 'bearish_engulfing', price: curr.close });
    }

    const bodySize = Math.abs(curr.close - curr.open);
    const lowerWick = Math.min(curr.open, curr.close) - curr.low;
    const upperWick = curr.high - Math.max(curr.open, curr.close);

    if (lowerWick > bodySize * config.wickBodyRatio && upperWick < bodySize * 0.5) {
      signals.push({ index: i, time: curr.time, pattern: 'hammer', price: curr.close });
    }

    if (upperWick > bodySize * config.wickBodyRatio && lowerWick < bodySize * 0.5) {
      signals.push({ index: i, time: curr.time, pattern: 'shooting_star', price: curr.close });
    }
  }

  return signals;
}
