import { describe, expect, it } from 'vitest';
import { calculateBollingerBands, detectTTMSqueeze } from '../src/indicators/bollinger';
import { candle } from './helpers';

describe('calculateBollingerBands', () => {
  it('is null until `period` bars of history exist, then bands the SMA by stdev', () => {
    const candles = [
      candle(0, 10, 10.5, 9.5, 10),
      candle(1, 10, 10.5, 9.5, 10.2),
      candle(2, 10.2, 10.7, 9.7, 10.1),
    ];

    const bands = calculateBollingerBands(candles, { period: 3, stdevMultiplier: 2 });

    expect(bands[0]).toBeNull();
    expect(bands[1]).toBeNull();

    // closes [10, 10.2, 10.1]: mean 10.1, stdev = sqrt(((0.01)+(0.01)+0)/3)
    expect(bands[2]!.middle).toBeCloseTo(10.1);
    expect(bands[2]!.upper).toBeCloseTo(10.1 + 2 * Math.sqrt(0.02 / 3));
    expect(bands[2]!.lower).toBeCloseTo(10.1 - 2 * Math.sqrt(0.02 / 3));
  });
});

describe('detectTTMSqueeze', () => {
  const config = {
    bollinger: { period: 3, stdevMultiplier: 2 },
    keltner: { emaPeriod: 3, atrPeriod: 3, multiplier: 2 },
  };

  it('is false until enough history exists for both indicators', () => {
    const candles = [
      candle(0, 10, 11, 9, 10),
      candle(1, 10, 11.05, 9.05, 10.05),
      candle(2, 9.95, 10.95, 8.95, 9.95),
    ];
    const squeeze = detectTTMSqueeze(candles, config);
    expect(squeeze).toEqual([false, false, false]);
  });

  it('is true when tight closes (narrow Bollinger Bands) sit inside wide wicks (wide Keltner Channel)', () => {
    const candles = [
      candle(0, 10, 11, 9, 10),
      candle(1, 10, 11.05, 9.05, 10.05),
      candle(2, 9.95, 10.95, 8.95, 9.95),
      candle(3, 10.05, 11.05, 9.05, 10.05),
      candle(4, 9.95, 10.95, 8.95, 9.95),
    ];

    const squeeze = detectTTMSqueeze(candles, config);

    expect(squeeze[3]).toBe(true);
    expect(squeeze[4]).toBe(true);
  });
});
