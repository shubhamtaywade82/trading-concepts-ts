import { describe, expect, it } from 'vitest';
import { detectStructure, findSwingPoints } from '../src/marketStructure';
import { SwingPoint } from '../src/types';
import { candle } from './helpers';

describe('findSwingPoints', () => {
  it('detects a swing high and a swing low with lookback=2', () => {
    const candles = [
      candle(0, 5, 5, 4, 5),
      candle(1, 6, 6, 4.5, 6),
      candle(2, 12, 15, 11, 12), // swing high: high=15
      candle(3, 7, 7, 5, 7),
      candle(4, 3, 6, 2, 3), // swing low: low=2
      candle(5, 6, 7, 5, 6),
      candle(6, 5, 6, 4, 5),
      candle(7, 4, 5, 3.5, 4),
      candle(8, 3, 4, 3, 3),
    ];

    const swings = findSwingPoints(candles, 2);

    const highs = swings.filter((s) => s.type === 'high');
    const lows = swings.filter((s) => s.type === 'low');

    expect(highs).toEqual([{ index: 2, time: 2, price: 15, type: 'high' }]);
    expect(lows).toEqual([{ index: 4, time: 4, price: 2, type: 'low' }]);
  });

  it('returns no swings when the series is shorter than 2*lookback+1', () => {
    const candles = [candle(0, 1, 2, 1, 1.5), candle(1, 1.5, 2, 1, 1.5)];
    expect(findSwingPoints(candles, 5)).toEqual([]);
  });
});

describe('detectStructure', () => {
  it('emits a BOS on a continuation break and a CHoCH on a reversal break', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 10, 11, 10, 10.5),
      candle(2, 10.5, 11, 10, 10.5),
      candle(3, 10.5, 11, 9, 9.5),
      candle(4, 9.5, 10, 8, 8.5),
      candle(5, 8.5, 16, 8.5, 16), // closes above the swing high (15) -> bullish BOS
      candle(6, 16, 16, 7, 7), // closes below the swing low (8) -> bearish CHoCH
    ];

    const swings: SwingPoint[] = [
      { index: 1, time: 1, price: 15, type: 'high' },
      { index: 3, time: 3, price: 8, type: 'low' },
    ];
    const frozenSwings = JSON.parse(JSON.stringify(swings));

    const structure = detectStructure(candles, swings);

    expect(structure).toEqual([
      { index: 5, time: 5, type: 'BOS', direction: 'bullish', level: 15 },
      { index: 6, time: 6, type: 'CHoCH', direction: 'bearish', level: 8 },
    ]);

    // the input swings must never be mutated
    expect(swings).toEqual(frozenSwings);
  });

  it('does not re-trigger the same swing break on subsequent candles', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 10, 11, 10, 10.5),
      candle(2, 10.5, 16, 10, 16), // breaks the high once
      candle(3, 16, 17, 15, 17), // stays above it, should not re-signal
    ];
    const swings: SwingPoint[] = [{ index: 1, time: 1, price: 15, type: 'high' }];

    const structure = detectStructure(candles, swings);

    expect(structure).toHaveLength(1);
    expect(structure[0].index).toBe(2);
  });

  it('emits a bearish BOS first, then a bullish CHoCH on the reversal', () => {
    const candles = [
      candle(0, 10, 10, 9, 10),
      candle(1, 10, 11, 10, 10.5),
      candle(2, 10.5, 11, 10, 10.5),
      candle(3, 10.5, 11, 9, 9.5),
      candle(4, 9.5, 10, 8, 8.5),
      candle(5, 8.5, 8.5, 7, 7), // closes below the swing low (8) -> bearish BOS (trend was null)
      candle(6, 7, 16, 6.5, 16), // closes above the swing high (15) -> bullish CHoCH (trend was bearish)
    ];

    const swings: SwingPoint[] = [
      { index: 1, time: 1, price: 15, type: 'high' },
      { index: 3, time: 3, price: 8, type: 'low' },
    ];

    const structure = detectStructure(candles, swings);

    expect(structure).toEqual([
      { index: 5, time: 5, type: 'BOS', direction: 'bearish', level: 8 },
      { index: 6, time: 6, type: 'CHoCH', direction: 'bullish', level: 15 },
    ]);
  });
});
