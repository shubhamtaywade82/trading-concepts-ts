import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { detectPriceAction } from '../src/priceAction';
import { candle } from './helpers';

describe('detectPriceAction', () => {
  it('detects a bullish engulfing pattern', () => {
    const candles = [
      candle(0, 10, 10.2, 9.5, 9.6), // bearish candle
      candle(1, 9.5, 11, 9.4, 10.5), // engulfs the previous body
    ];
    const signals = detectPriceAction(candles, DEFAULT_CONFIG.priceAction);
    expect(signals).toEqual([{ index: 1, time: 1, pattern: 'bullish_engulfing', price: 10.5 }]);
  });

  it('detects a bearish engulfing pattern', () => {
    const candles = [
      candle(0, 9.6, 10.2, 9.5, 10), // bullish candle
      candle(1, 10.5, 10.6, 9, 9.4), // engulfs the previous body
    ];
    const signals = detectPriceAction(candles, DEFAULT_CONFIG.priceAction);
    expect(signals).toEqual([{ index: 1, time: 1, pattern: 'bearish_engulfing', price: 9.4 }]);
  });

  it('detects a hammer', () => {
    const candles = [
      candle(0, 10, 10.5, 9, 9.5),
      candle(1, 10, 10.11, 7, 10.1), // long lower wick, tiny upper wick
    ];
    const signals = detectPriceAction(candles, DEFAULT_CONFIG.priceAction);
    expect(signals.map((s) => s.pattern)).toContain('hammer');
  });

  it('detects a shooting star', () => {
    const candles = [
      candle(0, 10, 10.5, 9, 9.5),
      candle(1, 10, 13, 9.97, 10.1), // long upper wick, tiny lower wick
    ];
    const signals = detectPriceAction(candles, DEFAULT_CONFIG.priceAction);
    expect(signals.map((s) => s.pattern)).toContain('shooting_star');
  });
});
