import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { findLiquidityZones } from '../src/liquidity';
import { candle } from './helpers';

describe('findLiquidityZones', () => {
  it('detects buyside liquidity from near-equal pivot highs and flags a sweep', () => {
    const candles = [
      candle(0, 9, 9, 8, 9),
      candle(1, 9.5, 9.5, 9, 9.2),
      candle(2, 10, 12, 9.5, 11), // pivot high #1: 12
      candle(3, 10, 10.5, 9, 10),
      candle(4, 9.5, 9.5, 9, 9.2),
      candle(5, 10, 12.02, 9.5, 11), // pivot high #2: 12.02 (~0.17% from 12)
      candle(6, 10, 10.5, 9, 10),
      candle(7, 9.5, 9.5, 9, 9.2),
      candle(8, 10, 13, 9.5, 11), // sweeps both highs
      candle(9, 10, 10.5, 9, 10),
      candle(10, 9.5, 9.5, 9, 9.2),
    ];

    const zones = findLiquidityZones(candles, { ...DEFAULT_CONFIG.liquidity, equalTolerancePercent: 0.2 });

    const buyside = zones.filter((z) => z.type === 'buyside');
    expect(buyside).toHaveLength(1);
    expect(buyside[0].level).toBeCloseTo(12.02);
    expect(buyside[0].swept).toBe(true);
    expect(buyside[0].sweepIndex).toBe(8);
  });

  it('does not group highs beyond the tolerance', () => {
    const candles = [
      candle(0, 9, 9, 8, 9),
      candle(1, 9.5, 9.5, 9, 9.2),
      candle(2, 10, 12, 9.5, 11),
      candle(3, 10, 10.5, 9, 10),
      candle(4, 9.5, 9.5, 9, 9.2),
      candle(5, 10, 13, 9.5, 11), // ~8% away from 12, well outside tolerance
      candle(6, 10, 10.5, 9, 10),
      candle(7, 9.5, 9.5, 9, 9.2),
    ];

    const zones = findLiquidityZones(candles, { ...DEFAULT_CONFIG.liquidity, equalTolerancePercent: 0.2 });
    expect(zones.filter((z) => z.type === 'buyside')).toHaveLength(0);
  });

  it('detects sellside liquidity from near-equal pivot lows and flags a sweep', () => {
    const candles = [
      candle(0, 12, 12, 11, 12),
      candle(1, 11, 11, 10.5, 10.8),
      candle(2, 11, 11.5, 9, 9.5), // pivot low #1: 9
      candle(3, 10, 11, 10, 10.5),
      candle(4, 10.5, 11, 10.5, 10.8),
      candle(5, 11, 11.5, 8.985, 9.5), // pivot low #2: 8.985 (~0.17% from 9)
      candle(6, 10, 11, 10, 10.5),
      candle(7, 10.5, 11, 10.5, 10.8),
      candle(8, 9, 9, 7, 8), // sweeps the pool
      candle(9, 10, 11, 10, 10.5),
      candle(10, 10.5, 11, 10.5, 10.8),
    ];

    const zones = findLiquidityZones(candles, { ...DEFAULT_CONFIG.liquidity, equalTolerancePercent: 0.2 });

    const sellside = zones.filter((z) => z.type === 'sellside');
    expect(sellside).toHaveLength(1);
    expect(sellside[0].level).toBeCloseTo(8.985);
    expect(sellside[0].swept).toBe(true);
    expect(sellside[0].sweepIndex).toBe(8);
  });
});
