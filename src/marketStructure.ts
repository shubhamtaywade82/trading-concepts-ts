/**
 * Market structure: swing highs/lows, Break of Structure (BOS), and
 * Change of Character (CHoCH).
 */

import { MSSConfig } from './config/types';
import { Candle, StructureSignal, SwingPoint } from './types';
import { averageRangeBefore } from './utils/range';

export function findSwingPoints(candles: Candle[], lookback = 5): SwingPoint[] {
  const swings: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = 1; j <= lookback; j++) {
      if (candles[i - j].high >= current.high || candles[i + j].high >= current.high) isHigh = false;
      if (candles[i - j].low <= current.low || candles[i + j].low <= current.low) isLow = false;
      if (!isHigh && !isLow) break;
    }

    if (isHigh) {
      swings.push({ index: i, time: current.time, price: current.high, type: 'high' });
    }
    if (isLow) {
      swings.push({ index: i, time: current.time, price: current.low, type: 'low' });
    }
  }

  return swings;
}

/**
 * Walks the candle series and emits a BOS or CHoCH signal every time price
 * closes beyond the most recent (not-yet-broken) swing high/low.
 *
 * A break is a BOS when it continues the prevailing trend, and a CHoCH when
 * it reverses it. Unlike naive implementations, this never mutates the input
 * `swings` array — the swing objects you get back from `findSwingPoints`
 * (and from `analyze()`) always keep their original price/level.
 */
export function detectStructure(candles: Candle[], swings: SwingPoint[]): StructureSignal[] {
  const signals: StructureSignal[] = [];
  const sortedSwings = [...swings].sort((a, b) => a.index - b.index);
  const brokenSwingIndices = new Set<number>();

  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;
  let trend: 'bullish' | 'bearish' | null = null;
  let swingCursor = 0;

  for (let i = 0; i < candles.length; i++) {
    while (swingCursor < sortedSwings.length && sortedSwings[swingCursor].index <= i) {
      const s = sortedSwings[swingCursor];
      if (s.type === 'high') lastHigh = s;
      else lastLow = s;
      swingCursor++;
    }

    const candle = candles[i];

    if (lastHigh && !brokenSwingIndices.has(lastHigh.index) && candle.close > lastHigh.price) {
      const type: StructureSignal['type'] = trend === 'bearish' ? 'CHoCH' : 'BOS';
      signals.push({ index: i, time: candle.time, type, direction: 'bullish', level: lastHigh.price });
      trend = 'bullish';
      brokenSwingIndices.add(lastHigh.index);
    }

    if (lastLow && !brokenSwingIndices.has(lastLow.index) && candle.close < lastLow.price) {
      const type: StructureSignal['type'] = trend === 'bullish' ? 'CHoCH' : 'BOS';
      signals.push({ index: i, time: candle.time, type, direction: 'bearish', level: lastLow.price });
      trend = 'bearish';
      brokenSwingIndices.add(lastLow.index);
    }
  }

  return signals;
}

/**
 * Upgrades CHoCH signals to MSS (Market Structure Shift) when the breaking
 * candle shows displacement: a body significantly larger than the recent
 * average true range, confirming institutional participation rather than a
 * marginal break. BOS signals are left as-is — MSS is specifically a
 * confirmed reversal, not a continuation.
 *
 * Purely additive over `detectStructure`'s output; never mutates its input.
 */
export function applyMSSClassification(
  structure: StructureSignal[],
  candles: Candle[],
  config: MSSConfig,
): StructureSignal[] {
  if (!config.enabled) return structure;

  return structure.map((signal) => {
    if (signal.type !== 'CHoCH') return signal;

    const candle = candles[signal.index];
    const bodySize = Math.abs(candle.close - candle.open);
    const avgRange = averageRangeBefore(candles, signal.index, config.atrLookback);

    if (avgRange > 0 && bodySize >= avgRange * config.displacementMultiplier) {
      return { ...signal, type: 'MSS' };
    }

    return signal;
  });
}
