/**
 * Smart Money Concepts: Fair Value Gaps (FVG) and Order Blocks (OB).
 */

import { FVGConfig, OrderBlockConfig } from './config/types';
import { Candle, FVG, InverseFVG, OrderBlock, SwingPoint } from './types';
import { average, percentDiff } from './utils/math';

export function findFVGs(candles: Candle[], config: FVGConfig): FVG[] {
  const fvgs: FVG[] = [];

  for (let i = 2; i < candles.length; i++) {
    const c1 = candles[i - 2];
    const c3 = candles[i];

    // Bullish FVG (gap up): candle 1's high sits below candle 3's low.
    if (c1.high < c3.low) {
      const gapPercent = percentDiff(c3.low, c1.high);
      if (gapPercent >= config.minGapPercent) {
        fvgs.push({
          index: i - 1,
          time: candles[i - 1].time,
          type: 'bullish',
          top: c3.low,
          bottom: c1.high,
          mitigated: false,
        });
      }
    }

    // Bearish FVG (gap down): candle 1's low sits above candle 3's high.
    if (c1.low > c3.high) {
      const gapPercent = percentDiff(c1.low, c3.high);
      if (gapPercent >= config.minGapPercent) {
        fvgs.push({
          index: i - 1,
          time: candles[i - 1].time,
          type: 'bearish',
          top: c1.low,
          bottom: c3.high,
          mitigated: false,
        });
      }
    }
  }

  for (const fvg of fvgs) {
    for (let i = fvg.index + 2; i < candles.length; i++) {
      const c = candles[i];
      if (fvg.type === 'bullish' && c.low <= fvg.bottom) {
        fvg.mitigated = true;
        fvg.mitigationIndex = i;
        break;
      }
      if (fvg.type === 'bearish' && c.high >= fvg.top) {
        fvg.mitigated = true;
        fvg.mitigationIndex = i;
        break;
      }
    }
  }

  return fvgs;
}

/**
 * Detects FVGs that price has decisively closed all the way through,
 * flipping their polarity: a bullish FVG becomes bearish resistance once a
 * candle *closes* below its bottom, and a bearish FVG becomes bullish support
 * once a candle closes above its top. This is a stronger condition than
 * `FVG.mitigated` (a wick touching the near edge) — inversion requires a
 * close beyond the *far* edge.
 */
export function findInverseFVGs(candles: Candle[], fvgs: FVG[]): InverseFVG[] {
  const inverseFvgs: InverseFVG[] = [];

  for (const fvg of fvgs) {
    for (let i = fvg.index + 2; i < candles.length; i++) {
      const c = candles[i];

      if (fvg.type === 'bullish' && c.close < fvg.bottom) {
        inverseFvgs.push({
          index: fvg.index,
          time: fvg.time,
          type: 'bearish',
          originalType: 'bullish',
          top: fvg.top,
          bottom: fvg.bottom,
          inversionIndex: i,
          inversionTime: c.time,
        });
        break;
      }

      if (fvg.type === 'bearish' && c.close > fvg.top) {
        inverseFvgs.push({
          index: fvg.index,
          time: fvg.time,
          type: 'bullish',
          originalType: 'bearish',
          top: fvg.top,
          bottom: fvg.bottom,
          inversionIndex: i,
          inversionTime: c.time,
        });
        break;
      }
    }
  }

  return inverseFvgs;
}

export function findOrderBlocks(
  candles: Candle[],
  swings: SwingPoint[],
  config: OrderBlockConfig,
): OrderBlock[] {
  const obs: OrderBlock[] = [];
  const sortedSwings = [...swings].sort((a, b) => a.index - b.index);

  const strengthAt = (obIndex: number): number | null => {
    const start = Math.max(0, obIndex - config.volumeLookback);
    const window = candles.slice(start, obIndex);
    const volumes = window.map((c) => c.volume ?? 0);
    const hasVolume = window.some((c) => typeof c.volume === 'number' && c.volume > 0);
    if (!hasVolume) return config.requireVolume ? null : 1;

    const avgVolume = average(volumes);
    if (avgVolume <= 0) return config.requireVolume ? null : 1;
    return (candles[obIndex].volume ?? 0) / avgVolume;
  };

  for (let i = 1; i < sortedSwings.length; i++) {
    const swing = sortedSwings[i];
    const prevSwing = sortedSwings[i - 1];

    // Bullish OB: last down-close candle before a leg up into a new swing high.
    if (swing.type === 'high' && prevSwing.type === 'low') {
      const obIndex = swing.index - 1;
      if (obIndex >= 0 && candles[obIndex].close < candles[obIndex].open) {
        const strength = strengthAt(obIndex);
        if (strength !== null && strength >= config.minVolumeStrength) {
          obs.push({
            index: obIndex,
            time: candles[obIndex].time,
            type: 'bullish',
            top: candles[obIndex].high,
            bottom: candles[obIndex].low,
            mitigated: false,
            strength,
          });
        }
      }
    }

    // Bearish OB: last up-close candle before a leg down into a new swing low.
    if (swing.type === 'low' && prevSwing.type === 'high') {
      const obIndex = swing.index - 1;
      if (obIndex >= 0 && candles[obIndex].close > candles[obIndex].open) {
        const strength = strengthAt(obIndex);
        if (strength !== null && strength >= config.minVolumeStrength) {
          obs.push({
            index: obIndex,
            time: candles[obIndex].time,
            type: 'bearish',
            top: candles[obIndex].high,
            bottom: candles[obIndex].low,
            mitigated: false,
            strength,
          });
        }
      }
    }
  }

  for (const ob of obs) {
    for (let i = ob.index + 1; i < candles.length; i++) {
      const c = candles[i];
      if (ob.type === 'bullish' && c.low <= ob.bottom) {
        ob.mitigated = true;
        ob.mitigationIndex = i;
        break;
      }
      if (ob.type === 'bearish' && c.high >= ob.top) {
        ob.mitigated = true;
        ob.mitigationIndex = i;
        break;
      }
    }
  }

  return obs.sort((a, b) => a.index - b.index);
}
