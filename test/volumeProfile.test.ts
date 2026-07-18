import { describe, expect, it } from 'vitest';
import { calculateVolumeProfile } from '../src/indicators/volumeProfile';
import { candle } from './helpers';

describe('calculateVolumeProfile', () => {
  // Overall range [100, 104] split into 4 equal 1-wide bins: [100,101), [101,102), [102,103), [103,104].
  const candles = [
    candle(0, 100.5, 101, 100, 100.5, 100), // fully inside bin 0
    candle(1, 103.5, 104, 103, 103.5, 100), // fully inside bin 3
    candle(2, 101.5, 102, 101, 101.5, 50), // fully inside bin 1
  ];
  const config = { bins: 4, hvnPercentile: 0.7, lvnPercentile: 0.3 };

  it('distributes each candle full volume into the single bin its range overlaps', () => {
    const profile = calculateVolumeProfile(candles, config);

    expect(profile.bins).toHaveLength(4);
    expect(profile.bins[0].volume).toBeCloseTo(100);
    expect(profile.bins[1].volume).toBeCloseTo(50);
    expect(profile.bins[2].volume).toBeCloseTo(0);
    expect(profile.bins[3].volume).toBeCloseTo(100);
  });

  it('classifies the busiest bins as HVN and the quietest as LVN', () => {
    const profile = calculateVolumeProfile(candles, config);

    expect(profile.highVolumeNodes.map((b) => b.priceLow)).toEqual([100, 103]);
    expect(profile.lowVolumeNodes.map((b) => b.priceLow)).toEqual([101, 102]);
  });

  it('picks the point of control as the single busiest bin', () => {
    const profile = calculateVolumeProfile(candles, config);
    expect(profile.pointOfControl.priceLow).toBe(100);
    expect(profile.pointOfControl.volume).toBeCloseTo(100);
  });

  it('splits a candle volume proportionally across multiple overlapping bins', () => {
    // A candle spanning exactly two bins [100.5, 102.5] should split its
    // volume 50/50 between bin 0/1 (0.5 of its range) and bin 1/2.
    const spanning = [candle(0, 101.5, 102.5, 100.5, 101.5, 100)];
    const profile = calculateVolumeProfile(spanning, { bins: 4, hvnPercentile: 0.7, lvnPercentile: 0.3 });

    // range [100.5, 102.5], bins derived from this candle's own high/low: binSize = 2/4 = 0.5
    // bins: [100.5,101), [101,101.5), [101.5,102), [102,102.5) - each gets an equal 25 share
    for (const bin of profile.bins) {
      expect(bin.volume).toBeCloseTo(25);
    }
  });
});
