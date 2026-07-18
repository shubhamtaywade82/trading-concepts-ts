import { describe, expect, it } from 'vitest';
import { average, percentDiff } from '../src/utils/math';
import { validateCandles } from '../src/utils/candles';
import { candle } from './helpers';

describe('average', () => {
  it('returns 0 for an empty array', () => {
    expect(average([])).toBe(0);
  });

  it('averages a list of numbers', () => {
    expect(average([1, 2, 3])).toBe(2);
  });
});

describe('percentDiff', () => {
  it('returns 0 when the reference is 0', () => {
    expect(percentDiff(5, 0)).toBe(0);
  });

  it('computes the absolute percent difference', () => {
    expect(percentDiff(110, 100)).toBe(10);
  });
});

describe('validateCandles', () => {
  it('throws when passed a non-array', () => {
    // @ts-expect-error - intentionally invalid input for the runtime guard
    expect(() => validateCandles('not an array')).toThrow(TypeError);
  });

  it('throws on a non-numeric field', () => {
    expect(() =>
      // @ts-expect-error - intentionally invalid input for the runtime guard
      validateCandles([{ time: 0, open: '10', high: 10, low: 9, close: 9.5 }]),
    ).toThrow(TypeError);
  });

  it('throws on a NaN field', () => {
    expect(() => validateCandles([candle(0, NaN, 10, 9, 9.5)])).toThrow(TypeError);
  });

  it('throws when high is below low', () => {
    expect(() => validateCandles([candle(0, 9, 8, 10, 9)])).toThrow(RangeError);
  });

  it('sorts candles ascending by time', () => {
    const sorted = validateCandles([
      candle(2, 1, 2, 1, 1.5),
      candle(0, 1, 2, 1, 1.5),
      candle(1, 1, 2, 1, 1.5),
    ]);
    expect(sorted.map((c) => c.time)).toEqual([0, 1, 2]);
  });
});
