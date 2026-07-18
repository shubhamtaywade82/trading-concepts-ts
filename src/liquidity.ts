/**
 * Liquidity pools: equal highs/lows (resting stop-loss clusters) and their sweeps.
 */

import { LiquidityConfig } from './config/types';
import { Candle, LiquidityZone } from './types';
import { percentDiff } from './utils/math';

interface Pivot {
  index: number;
  price: number;
}

function findPivotHighsAndLows(candles: Candle[], pivotLookback: number): { highs: Pivot[]; lows: Pivot[] } {
  const highs: Pivot[] = [];
  const lows: Pivot[] = [];

  for (let i = pivotLookback; i < candles.length - pivotLookback; i++) {
    const windowHigh = candles.slice(i - pivotLookback, i + pivotLookback + 1).map((c) => c.high);
    const windowLow = candles.slice(i - pivotLookback, i + pivotLookback + 1).map((c) => c.low);

    if (candles[i].high === Math.max(...windowHigh)) {
      highs.push({ index: i, price: candles[i].high });
    }
    if (candles[i].low === Math.min(...windowLow)) {
      lows.push({ index: i, price: candles[i].low });
    }
  }

  return { highs, lows };
}

export function findLiquidityZones(candles: Candle[], config: LiquidityConfig): LiquidityZone[] {
  const zones: LiquidityZone[] = [];
  const { highs, lows } = findPivotHighsAndLows(candles, config.pivotLookback);

  for (let i = 1; i < highs.length; i++) {
    if (percentDiff(highs[i].price, highs[i - 1].price) <= config.equalTolerancePercent) {
      zones.push({
        index: highs[i - 1].index,
        time: candles[highs[i - 1].index].time,
        type: 'buyside',
        level: Math.max(highs[i].price, highs[i - 1].price),
        swept: false,
      });
    }
  }

  for (let i = 1; i < lows.length; i++) {
    if (percentDiff(lows[i].price, lows[i - 1].price) <= config.equalTolerancePercent) {
      zones.push({
        index: lows[i - 1].index,
        time: candles[lows[i - 1].index].time,
        type: 'sellside',
        level: Math.min(lows[i].price, lows[i - 1].price),
        swept: false,
      });
    }
  }

  for (const zone of zones) {
    for (let i = zone.index + 1; i < candles.length; i++) {
      if (zone.type === 'buyside' && candles[i].high > zone.level) {
        zone.swept = true;
        zone.sweepIndex = i;
        break;
      }
      if (zone.type === 'sellside' && candles[i].low < zone.level) {
        zone.swept = true;
        zone.sweepIndex = i;
        break;
      }
    }
  }

  return zones.sort((a, b) => a.index - b.index);
}
