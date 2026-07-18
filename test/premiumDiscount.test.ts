import { describe, expect, it } from 'vitest';
import { classifyPrice, computePremiumDiscountZones, findDealingRanges } from '../src/ict/premiumDiscount';
import { SwingPoint } from '../src/types';

describe('findDealingRanges', () => {
  it('pairs consecutive opposite-type swings into legs', () => {
    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 100, type: 'low' },
      { index: 5, time: 5, price: 150, type: 'high' },
      { index: 8, time: 8, price: 120, type: 'low' },
    ];

    const ranges = findDealingRanges(swings);

    expect(ranges).toEqual([
      { index: 0, endIndex: 5, high: 150, low: 100, direction: 'bullish' },
      { index: 5, endIndex: 8, high: 150, low: 120, direction: 'bearish' },
    ]);
  });

  it('skips consecutive same-type swings (no leg between two lows)', () => {
    const swings: SwingPoint[] = [
      { index: 0, time: 0, price: 100, type: 'low' },
      { index: 3, time: 3, price: 95, type: 'low' },
      { index: 6, time: 6, price: 140, type: 'high' },
    ];

    const ranges = findDealingRanges(swings);

    expect(ranges).toEqual([{ index: 3, endIndex: 6, high: 140, low: 95, direction: 'bullish' }]);
  });

  it('sorts unordered input by index before pairing', () => {
    const swings: SwingPoint[] = [
      { index: 5, time: 5, price: 150, type: 'high' },
      { index: 0, time: 0, price: 100, type: 'low' },
    ];

    expect(findDealingRanges(swings)).toEqual([
      { index: 0, endIndex: 5, high: 150, low: 100, direction: 'bullish' },
    ]);
  });
});

describe('computePremiumDiscountZones', () => {
  const config = { enabled: true, oteZone: { min: 0.618, max: 0.79 } };

  it('computes equilibrium and the OTE band for a bullish leg', () => {
    const ranges = [{ index: 0, endIndex: 5, high: 150, low: 100, direction: 'bullish' as const }];
    const [zone] = computePremiumDiscountZones(ranges, config);

    expect(zone.equilibrium).toBe(125);
    expect(zone.oteZone.start).toBeCloseTo(110.5);
    expect(zone.oteZone.end).toBeCloseTo(119.1);
  });

  it('computes equilibrium and the OTE band for a bearish leg', () => {
    const ranges = [{ index: 5, endIndex: 8, high: 150, low: 120, direction: 'bearish' as const }];
    const [zone] = computePremiumDiscountZones(ranges, config);

    expect(zone.equilibrium).toBe(135);
    expect(zone.oteZone.start).toBeCloseTo(138.54);
    expect(zone.oteZone.end).toBeCloseTo(143.7);
  });
});

describe('classifyPrice', () => {
  const [zone] = computePremiumDiscountZones(
    [{ index: 0, endIndex: 5, high: 150, low: 100, direction: 'bullish' }],
    { enabled: true, oteZone: { min: 0.618, max: 0.79 } },
  );

  it('classifies above equilibrium as premium', () => {
    expect(classifyPrice(130, zone)).toBe('premium');
  });

  it('classifies below equilibrium as discount', () => {
    expect(classifyPrice(110, zone)).toBe('discount');
  });

  it('classifies exactly at equilibrium as equilibrium', () => {
    expect(classifyPrice(125, zone)).toBe('equilibrium');
  });
});
