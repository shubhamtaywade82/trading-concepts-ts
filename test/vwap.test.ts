import { describe, expect, it } from 'vitest';
import { calculateVWAP } from '../src/indicators/vwap';
import { candle } from './helpers';

const MINUTE = 60_000;

describe('calculateVWAP', () => {
  it('accumulates volume-weighted typical price across candles', () => {
    const candles = [
      candle(0, 10, 11, 9, 10, 100), // typical (11+9+10)/3 = 10
      candle(MINUTE, 10, 12, 10, 11, 100), // typical (12+10+11)/3 = 11
    ];

    const vwap = calculateVWAP(candles, { resetDaily: false, timezoneOffsetMinutes: 0 });

    expect(vwap[0]).toBeCloseTo(10);
    // cumulative: (10*100 + 11*100) / 200 = 10.5
    expect(vwap[1]).toBeCloseTo(10.5);
  });

  it('returns null for candles with no volume accumulated yet', () => {
    const candles = [candle(0, 10, 11, 9, 10, undefined)];
    const vwap = calculateVWAP(candles, { resetDaily: false, timezoneOffsetMinutes: 0 });
    expect(vwap[0]).toBeNull();
  });

  it('resets the cumulative sums at each new trading day when resetDaily is true', () => {
    const dayOneLate = (23 * 60 + 50) * MINUTE; // 23:50 on day one
    const dayTwoEarly = (24 * 60 + 10) * MINUTE; // 00:10 on day two

    const candles = [
      candle(dayOneLate, 10, 11, 9, 10, 100), // typical 10
      candle(dayTwoEarly, 11, 12, 10, 11, 50), // typical 11, should NOT blend with day one
    ];

    const vwap = calculateVWAP(candles, { resetDaily: true, timezoneOffsetMinutes: 0 });

    expect(vwap[0]).toBeCloseTo(10);
    expect(vwap[1]).toBeCloseTo(11); // fresh accumulation, not (10*100+11*50)/150
  });
});
