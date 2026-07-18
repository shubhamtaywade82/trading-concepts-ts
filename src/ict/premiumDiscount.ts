/**
 * Premium/discount zones and Fibonacci Optimal Trade Entry (OTE) bands,
 * derived from dealing ranges between consecutive opposite-type swing points.
 */

import { PremiumDiscountConfig } from '../config/types';
import { DealingRange, PremiumDiscountZone, PriceZoneClassification, SwingPoint } from '../types';

/** Pairs up consecutive opposite-type swings into up-legs/down-legs (dealing ranges). */
export function findDealingRanges(swings: SwingPoint[]): DealingRange[] {
  const sorted = [...swings].sort((a, b) => a.index - b.index);
  const ranges: DealingRange[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    if (prev.type === curr.type) continue;

    const isBullish = prev.type === 'low' && curr.type === 'high';
    ranges.push({
      index: prev.index,
      endIndex: curr.index,
      high: isBullish ? curr.price : prev.price,
      low: isBullish ? prev.price : curr.price,
      direction: isBullish ? 'bullish' : 'bearish',
    });
  }

  return ranges;
}

/**
 * Adds the 50% equilibrium level and the Fibonacci OTE retracement band to
 * each dealing range. For a bullish (low-to-high) leg, the OTE band is the
 * pullback zone measured down from the high; for a bearish leg, up from the low.
 */
export function computePremiumDiscountZones(
  dealingRanges: DealingRange[],
  config: PremiumDiscountConfig,
): PremiumDiscountZone[] {
  return dealingRanges.map((range) => {
    const size = range.high - range.low;
    const equilibrium = range.low + size / 2;

    const oteZone =
      range.direction === 'bullish'
        ? {
            start: range.high - size * config.oteZone.max,
            end: range.high - size * config.oteZone.min,
          }
        : {
            start: range.low + size * config.oteZone.min,
            end: range.low + size * config.oteZone.max,
          };

    return { ...range, equilibrium, oteZone };
  });
}

/** Classifies a price as premium (above equilibrium), discount (below), or exactly at it. */
export function classifyPrice(price: number, zone: PremiumDiscountZone): PriceZoneClassification {
  if (price > zone.equilibrium) return 'premium';
  if (price < zone.equilibrium) return 'discount';
  return 'equilibrium';
}
