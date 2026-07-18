/**
 * Open Interest and funding-rate helpers. Neither is derivable from OHLCV
 * candles — supply your own `DerivativesDataPoint[]` from your exchange's
 * futures/perp API (see README).
 */

import { DerivativesDataPoint, FundingSkew, OpenInterestConfirmation, StructureSignal } from '../types';

function findAtOrBefore(sorted: DerivativesDataPoint[], time: number): number {
  let result = -1;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i].time > time) break;
    result = i;
  }
  return result;
}

/**
 * Confirms structure signals against Open Interest: a BOS (continuation)
 * should coincide with rising OI (new money entering); a CHoCH/MSS
 * (reversal) should coincide with falling OI (existing positions being
 * liquidated rather than fresh conviction building in the new direction).
 *
 * `lookbackPoints` is how many `derivativesData` entries before the signal
 * to compare against (not candles — OI/funding feeds are usually a coarser,
 * independently-timestamped series).
 */
export function confirmStructureWithOpenInterest(
  signals: StructureSignal[],
  derivativesData: DerivativesDataPoint[],
  lookbackPoints = 1,
): OpenInterestConfirmation[] {
  const sorted = [...derivativesData].sort((a, b) => a.time - b.time);

  return signals.map((signal) => {
    const expectedDirection: 'increase' | 'decrease' = signal.type === 'BOS' ? 'increase' : 'decrease';
    const atIndex = findAtOrBefore(sorted, signal.time);
    const beforeIndex = atIndex - lookbackPoints;

    const at = sorted[atIndex];
    const before = sorted[beforeIndex];

    if (
      !at ||
      !before ||
      typeof at.openInterest !== 'number' ||
      typeof before.openInterest !== 'number' ||
      before.openInterest === 0
    ) {
      return { signalIndex: signal.index, expectedDirection, actualChangePercent: null, confirmed: false };
    }

    const actualChangePercent = ((at.openInterest - before.openInterest) / before.openInterest) * 100;
    const confirmed = expectedDirection === 'increase' ? actualChangePercent > 0 : actualChangePercent < 0;

    return { signalIndex: signal.index, expectedDirection, actualChangePercent, confirmed };
  });
}

/**
 * Classifies funding-rate skew: heavily negative funding means shorts are
 * paying longs (retail is crowded short), raising the odds of an upside
 * sweep to liquidate them, and vice versa for heavily positive funding.
 */
export function classifyFundingSkew(fundingRate: number, threshold = 0.01): FundingSkew {
  if (fundingRate <= -threshold) return 'shorts_crowded';
  if (fundingRate >= threshold) return 'longs_crowded';
  return 'neutral';
}
