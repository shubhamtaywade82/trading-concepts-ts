import { describe, expect, it } from 'vitest';
import { calculateATR, calculateKeltnerChannels } from '../src/indicators/atr';
import { candle } from './helpers';

// Each candle has a true range of exactly 1 (high-low=1, and the gap
// components against the previous close are both 0.5, so they never dominate).
const candles = [
  candle(0, 10, 10.5, 9.5, 10),
  candle(1, 10, 10.5, 9.5, 10.2),
  candle(2, 10.2, 10.7, 9.7, 10.1),
  candle(3, 10.1, 10.6, 9.6, 10.3),
  candle(4, 10.3, 10.8, 9.8, 10.5),
];

describe('calculateATR', () => {
  it('is null until `period` bars of history exist, then averages true range', () => {
    const atr = calculateATR(candles, { period: 3 });

    expect(atr.slice(0, 3)).toEqual([null, null, null]);
    expect(atr[3]).toBeCloseTo(1);
    expect(atr[4]).toBeCloseTo(1);
  });
});

describe('calculateKeltnerChannels', () => {
  it('bands the EMA midline by an ATR multiple, null until both are ready', () => {
    const channels = calculateKeltnerChannels(candles, { emaPeriod: 3, atrPeriod: 3, multiplier: 2 });

    // EMA needs 3 bars (ready at index 2) but ATR needs 3 bars starting at
    // index 3, so the combined series isn't ready until index 3.
    expect(channels[0]).toBeNull();
    expect(channels[1]).toBeNull();
    expect(channels[2]).toBeNull();

    expect(channels[3]).not.toBeNull();
    expect(channels[3]!.middle).toBeCloseTo(10.2);
    expect(channels[3]!.upper).toBeCloseTo(12.2);
    expect(channels[3]!.lower).toBeCloseTo(8.2);

    expect(channels[4]!.middle).toBeCloseTo(10.35);
  });
});
