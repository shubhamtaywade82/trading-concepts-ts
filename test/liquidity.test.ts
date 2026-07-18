import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { findLiquidityZones, scoreLiquiditySweep } from '../src/liquidity';
import { KillzoneSignal, LiquidityZone } from '../src/types';
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
    // closes (11) back below the level (12.02) after wicking through it
    expect(buyside[0].sweepType).toBe('reversal');
  });

  it('classifies a buyside sweep as a breakthrough when the candle closes beyond the level', () => {
    const candles = [
      candle(0, 9, 9, 8, 9),
      candle(1, 9.5, 9.5, 9, 9.2),
      candle(2, 10, 12, 9.5, 11),
      candle(3, 10, 10.5, 9, 10),
      candle(4, 9.5, 9.5, 9, 9.2),
      candle(5, 10, 12.02, 9.5, 11),
      candle(6, 10, 10.5, 9, 10),
      candle(7, 9.5, 9.5, 9, 9.2),
      candle(8, 12, 13, 12, 12.5), // closes (12.5) beyond the level (12.02)
    ];

    const zones = findLiquidityZones(candles, { ...DEFAULT_CONFIG.liquidity, equalTolerancePercent: 0.2 });
    const buyside = zones.filter((z) => z.type === 'buyside');
    expect(buyside[0].sweepType).toBe('breakthrough');
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
    // closes (8) back below the level (8.985), confirming the breakdown
    expect(sellside[0].sweepType).toBe('breakthrough');
  });

  it('classifies a sellside sweep as a reversal when the candle closes back above the level', () => {
    const candles = [
      candle(0, 12, 12, 11, 12),
      candle(1, 11, 11, 10.5, 10.8),
      candle(2, 11, 11.5, 9, 9.5),
      candle(3, 10, 11, 10, 10.5),
      candle(4, 10.5, 11, 10.5, 10.8),
      candle(5, 11, 11.5, 8.985, 9.5),
      candle(6, 10, 11, 10, 10.5),
      candle(7, 10.5, 11, 10.5, 10.8),
      candle(8, 9, 11, 7, 10.5), // wicks to 7, closes (10.5) back above the level (8.985)
    ];

    const zones = findLiquidityZones(candles, { ...DEFAULT_CONFIG.liquidity, equalTolerancePercent: 0.2 });
    const sellside = zones.filter((z) => z.type === 'sellside');
    expect(sellside[0].sweepType).toBe('reversal');
  });
});

describe('scoreLiquiditySweep', () => {
  const config = {
    enabled: true,
    lookback: 3,
    weights: {
      wickRejection: 30,
      volumeParticipation: 25,
      structuralRecovery: 15,
      sessionTiming: 5,
      cvd: 25,
    },
  };

  const baseZone: LiquidityZone = {
    index: 0,
    time: 0,
    type: 'buyside',
    level: 10.8,
    swept: true,
    sweepIndex: 5,
    sweepType: 'reversal',
  };

  function buildCandles(withDelta: boolean) {
    return [
      candle(0, 10, 10.5, 9.5, 10),
      candle(1, 10, 10.5, 9.5, 10.2),
      candle(2, 10.2, 10.7, 9.7, 10.1, 100, withDelta ? 10 : undefined),
      candle(3, 10.1, 10.6, 9.6, 10.3, 100, withDelta ? 10 : undefined),
      candle(4, 10.3, 10.8, 9.8, 10.5, 100, withDelta ? 10 : undefined),
      // sweep candle: wicks 3x the ~1 average range above the level, closes
      // back below it (reversal), on 2x average volume
      candle(5, 10.5, 13.8, 10.2, 10.3, 200, withDelta ? -50 : undefined),
    ];
  }

  it('returns null when the zone was never swept', () => {
    const unswept: LiquidityZone = { index: 0, time: 0, type: 'buyside', level: 10.8, swept: false };
    expect(scoreLiquiditySweep(buildCandles(false), unswept, [], config)).toBeNull();
  });

  it('scores the four OHLCV-only factors and renormalizes when delta is absent', () => {
    const killzones: KillzoneSignal[] = [{ index: 5, time: 5, session: 'London', weight: 1 }];

    const result = scoreLiquiditySweep(buildCandles(false), baseZone, killzones, config);

    expect(result).not.toBeNull();
    expect(result!.breakdown.cvd).toBeNull();
    expect(result!.breakdown.wickRejection).toBe(100);
    expect(result!.breakdown.volumeParticipation).toBe(100);
    expect(result!.breakdown.sessionTiming).toBe(100);
    expect(result!.breakdown.structuralRecovery).toBeGreaterThan(0);
    expect(result!.score).toBe(83);
  });

  it('adds a CVD factor and re-weights to 100 when delta is present', () => {
    const killzones: KillzoneSignal[] = [{ index: 5, time: 5, session: 'London', weight: 1 }];

    const result = scoreLiquiditySweep(buildCandles(true), baseZone, killzones, config);

    expect(result!.breakdown.cvd).toBe(100);
    expect(result!.score).toBe(88);
  });

  it('scores session timing as 0 when the sweep falls outside any kill zone', () => {
    const result = scoreLiquiditySweep(buildCandles(false), baseZone, [], config);
    expect(result!.breakdown.sessionTiming).toBe(0);
  });
});
