import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { findBreakerBlocks, findFVGs, findInverseFVGs, findOrderBlocks } from '../src/smartMoney';
import { SwingPoint } from '../src/types';
import { candle } from './helpers';

describe('findFVGs', () => {
  it('detects and mitigates a bullish FVG', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 12, 13, 12, 12.5), // c1.high(10) < c3.low(12) -> bullish gap
      candle(3, 10, 10.5, 9.5, 10), // high(10.5) avoids a spurious bearish gap; low(9.5) <= bottom(10) mitigates
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);

    expect(fvgs).toHaveLength(1);
    expect(fvgs[0]).toMatchObject({
      index: 1,
      type: 'bullish',
      top: 12,
      bottom: 10,
      mitigated: true,
      mitigationIndex: 3,
    });
  });

  it('detects a bearish FVG that stays unmitigated', () => {
    const candles = [
      candle(0, 13, 13, 12, 12.5),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 9, 9.5, 9, 9.2), // c1.low(12) > c3.high(9.5) -> bearish gap
      candle(3, 9.9, 10.2, 9.7, 9.8), // high(10.2) avoids a spurious bullish gap and stays below top(12), unmitigated
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);

    expect(fvgs).toHaveLength(1);
    expect(fvgs[0]).toMatchObject({ type: 'bearish', top: 12, bottom: 9.5, mitigated: false });
  });

  it('mitigates a bearish FVG once price trades back up into it', () => {
    const candles = [
      candle(0, 13, 13, 12, 12.5),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 9, 9.5, 9, 9.2), // bearish gap: top=12, bottom=9.5
      candle(3, 9.9, 10.2, 9.7, 9.8), // stays below top, no mitigation yet
      candle(4, 10, 12.5, 9, 12.2), // high(12.5) >= top(12) -> mitigated; low(9) avoids a spurious bullish gap
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);

    expect(fvgs).toHaveLength(1);
    expect(fvgs[0]).toMatchObject({ type: 'bearish', mitigated: true, mitigationIndex: 4 });
  });

  it('filters out gaps smaller than minGapPercent', () => {
    const candles = [
      candle(0, 10, 10, 9.999, 10),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 10.001, 10.002, 10.001, 10.0015), // tiny gap
      candle(3, 10, 10, 9.9, 9.95),
    ];

    const fvgs = findFVGs(candles, { enabled: true, minGapPercent: 5, inverse: { enabled: true } });
    expect(fvgs).toHaveLength(0);
  });
});

describe('findInverseFVGs', () => {
  it('flips a bullish FVG to bearish once price closes back below its bottom', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 12, 13, 12, 12.5), // bullish FVG @1: top=12, bottom=10
      candle(3, 10.5, 11, 9.5, 10.2), // wicks into the gap (mitigated) but closes above bottom: no inversion yet
      candle(4, 9.5, 12.5, 9, 9.5), // closes (9.5) below bottom(10) -> inversion
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);
    const inverseFvgs = findInverseFVGs(candles, fvgs);

    const bullishInversion = inverseFvgs.find((f) => f.originalType === 'bullish');
    expect(bullishInversion).toMatchObject({
      index: 1,
      type: 'bearish',
      originalType: 'bullish',
      top: 12,
      bottom: 10,
      inversionIndex: 4,
    });
  });

  it('flips a bearish FVG to bullish once price closes back above its top', () => {
    const candles = [
      candle(0, 13, 13, 12, 12.5),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 9, 9.5, 9, 9.2), // bearish FVG @1: top=12, bottom=9.5
      candle(3, 9.9, 10.2, 9.7, 9.8), // stays below top: no inversion yet
      candle(4, 10, 12.5, 9.9, 12.3), // closes (12.3) above top(12) -> inversion
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);
    const inverseFvgs = findInverseFVGs(candles, fvgs);

    const bearishInversion = inverseFvgs.find((f) => f.originalType === 'bearish');
    expect(bearishInversion).toMatchObject({
      index: 1,
      type: 'bullish',
      originalType: 'bearish',
      top: 12,
      bottom: 9.5,
      inversionIndex: 4,
    });
  });

  it('returns nothing when price never closes through the far edge', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 11, 11, 10, 10.5),
      candle(2, 12, 13, 12, 12.5),
      candle(3, 10.5, 11, 9.9, 10.2),
    ];

    const fvgs = findFVGs(candles, DEFAULT_CONFIG.fvg);
    expect(findInverseFVGs(candles, fvgs)).toEqual([]);
  });
});

describe('findOrderBlocks', () => {
  it('detects a bullish order block and marks it mitigated', () => {
    const candles = [
      candle(0, 5, 5, 4, 4.5), // swing low candle
      candle(1, 10, 11, 9, 9), // down-close candle -> bullish OB (top=11, bottom=9)
      candle(2, 9, 12, 9.5, 12), // swing high candle
      candle(3, 12, 12, 8.5, 9), // low(8.5) <= bottom(9) -> mitigated
    ];

    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 4.5, type: 'low' },
      { index: 2, time: 2, price: 12, type: 'high' },
    ];

    const obs = findOrderBlocks(candles, swings, DEFAULT_CONFIG.orderBlock);

    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({
      index: 1,
      type: 'bullish',
      top: 11,
      bottom: 9,
      mitigated: true,
      mitigationIndex: 3,
      strength: 1,
    });
  });

  it('filters blocks below minVolumeStrength', () => {
    const candles = [
      candle(0, 5, 5, 4, 4.5, 100),
      candle(1, 10, 11, 9, 9, 100), // strength = 100 / avg(100,100) = 1
      candle(2, 9, 12, 9, 12, 100),
    ];

    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 4.5, type: 'low' },
      { index: 2, time: 2, price: 12, type: 'high' },
    ];

    const obs = findOrderBlocks(candles, swings, {
      ...DEFAULT_CONFIG.orderBlock,
      minVolumeStrength: 1.5,
    });

    expect(obs).toHaveLength(0);
  });
});

describe('findBreakerBlocks', () => {
  it('flips a bullish order block to a bearish breaker once price closes below its bottom', () => {
    const candles = [
      candle(0, 5, 5, 4, 4.5), // swing low candle
      candle(1, 10, 11, 9, 9), // down-close candle -> bullish OB (top=11, bottom=9)
      candle(2, 9, 12, 9.5, 12), // swing high candle
      candle(3, 9.5, 9.5, 8, 8.5), // closes (8.5) decisively below bottom(9) -> breaker
    ];

    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 4.5, type: 'low' },
      { index: 2, time: 2, price: 12, type: 'high' },
    ];

    const obs = findOrderBlocks(candles, swings, DEFAULT_CONFIG.orderBlock);
    const breakers = findBreakerBlocks(candles, obs);

    expect(breakers).toHaveLength(1);
    expect(breakers[0]).toMatchObject({
      index: 1,
      type: 'bearish',
      originalType: 'bullish',
      top: 11,
      bottom: 9,
      breakIndex: 3,
    });
  });

  it('flips a bearish order block to a bullish breaker once price closes above its top', () => {
    const candles = [
      candle(0, 12, 13, 12, 12.5), // swing high candle
      candle(1, 9, 10, 9, 10), // up-close candle -> bearish OB (top=10, bottom=9)
      candle(2, 9.5, 9.5, 7, 7.5), // swing low candle
      candle(3, 9.8, 10.6, 9.8, 10.5), // closes (10.5) decisively above top(10) -> breaker
    ];

    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 12.5, type: 'high' },
      { index: 2, time: 2, price: 7.5, type: 'low' },
    ];

    const obs = findOrderBlocks(candles, swings, DEFAULT_CONFIG.orderBlock);
    const breakers = findBreakerBlocks(candles, obs);

    expect(breakers).toHaveLength(1);
    expect(breakers[0]).toMatchObject({
      index: 1,
      type: 'bullish',
      originalType: 'bearish',
      top: 10,
      bottom: 9,
      breakIndex: 3,
    });
  });

  it('returns nothing when price never closes through the far edge', () => {
    const candles = [
      candle(0, 5, 5, 4, 4.5),
      candle(1, 10, 11, 9, 9),
      candle(2, 9, 12, 9.5, 12),
      candle(3, 9.5, 9.5, 8.5, 9.2), // wicks near the bottom but closes above it
    ];

    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 4.5, type: 'low' },
      { index: 2, time: 2, price: 12, type: 'high' },
    ];

    const obs = findOrderBlocks(candles, swings, DEFAULT_CONFIG.orderBlock);
    expect(findBreakerBlocks(candles, obs)).toEqual([]);
  });
});
