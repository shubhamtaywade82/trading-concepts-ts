/**
 * Liquidity pools: equal highs/lows (resting stop-loss clusters) and their sweeps.
 */

import { LiquidityConfig, LiquiditySweepScoreConfig } from './config/types';
import { Candle, KillzoneSignal, LiquiditySweepScore, LiquidityZone } from './types';
import { average, clamp, percentDiff } from './utils/math';
import { averageRangeBefore } from './utils/range';

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
      const c = candles[i];

      if (zone.type === 'buyside' && c.high > zone.level) {
        zone.swept = true;
        zone.sweepIndex = i;
        // Reversal: the sweeping candle closes back below the level (a stop
        // hunt). Breakthrough: it closes beyond it (a genuine break).
        zone.sweepType = c.close > zone.level ? 'breakthrough' : 'reversal';
        break;
      }
      if (zone.type === 'sellside' && c.low < zone.level) {
        zone.swept = true;
        zone.sweepIndex = i;
        zone.sweepType = c.close < zone.level ? 'breakthrough' : 'reversal';
        break;
      }
    }
  }

  return zones.sort((a, b) => a.index - b.index);
}

/**
 * Scores the quality of a swept liquidity zone on a 0-100 scale, combining:
 * wick rejection depth (relative to average range), volume participation
 * (relative to its recent average), how far price recovered back past the
 * level after a reversal sweep, and the session-timing weight of the kill
 * zone active at the sweep. If the sweeping candle carries `Candle.delta`
 * (net order-flow delta), a fifth CVD-absorption factor is added; otherwise
 * the other four weights are renormalized to 100 so the score stays 0-100
 * either way. Returns `null` for a zone that hasn't been swept.
 */
export function scoreLiquiditySweep(
  candles: Candle[],
  zone: LiquidityZone,
  killzones: KillzoneSignal[],
  config: LiquiditySweepScoreConfig,
): LiquiditySweepScore | null {
  if (!zone.swept || zone.sweepIndex === undefined) return null;

  const sweepIndex = zone.sweepIndex;
  const sweepCandle = candles[sweepIndex];

  const wickDepth = zone.type === 'buyside' ? sweepCandle.high - zone.level : zone.level - sweepCandle.low;
  const avgRange = averageRangeBefore(candles, sweepIndex, config.lookback);
  const wickRejection = avgRange > 0 ? clamp((wickDepth / avgRange) * 50, 0, 100) : 0;

  const volumeWindow = candles
    .slice(Math.max(0, sweepIndex - config.lookback), sweepIndex)
    .map((c) => c.volume ?? 0);
  const avgVolume = average(volumeWindow);
  const volumeRatio = avgVolume > 0 ? (sweepCandle.volume ?? 0) / avgVolume : 0;
  const volumeParticipation = clamp((volumeRatio - 1) * 100, 0, 100);

  let structuralRecovery = 0;
  if (zone.sweepType === 'reversal' && wickDepth > 0) {
    const recovery =
      zone.type === 'buyside' ? zone.level - sweepCandle.close : sweepCandle.close - zone.level;
    structuralRecovery = clamp((recovery / wickDepth) * 100, 0, 100);
  }

  const sessionSignal = killzones.find((k) => k.index === sweepIndex);
  const sessionTiming = (sessionSignal?.weight ?? 0) * 100;

  let cvd: number | null = null;
  if (typeof sweepCandle.delta === 'number') {
    const deltaWindow = candles
      .slice(Math.max(0, sweepIndex - config.lookback), sweepIndex)
      .map((c) => c.delta)
      .filter((d): d is number => typeof d === 'number');
    const avgAbsDelta = average(deltaWindow.map(Math.abs));

    if (avgAbsDelta > 0) {
      // Absorption: a buyside sweep is confirmed by net selling (negative
      // delta) into the highs, and vice versa for a sellside sweep.
      const expectedSign = zone.type === 'buyside' ? -1 : 1;
      const alignment = (expectedSign * sweepCandle.delta) / avgAbsDelta;
      cvd = clamp(50 + alignment * 50, 0, 100);
    } else {
      cvd = 50;
    }
  }

  const { weights } = config;
  const activeWeights: Record<string, number> = {
    wickRejection: weights.wickRejection,
    volumeParticipation: weights.volumeParticipation,
    structuralRecovery: weights.structuralRecovery,
    sessionTiming: weights.sessionTiming,
    ...(cvd === null ? {} : { cvd: weights.cvd }),
  };
  const weightSum = Object.values(activeWeights).reduce((sum, w) => sum + w, 0);

  const weightedSum =
    wickRejection * activeWeights.wickRejection +
    volumeParticipation * activeWeights.volumeParticipation +
    structuralRecovery * activeWeights.structuralRecovery +
    sessionTiming * activeWeights.sessionTiming +
    (cvd ?? 0) * (activeWeights.cvd ?? 0);

  const score = weightSum > 0 ? weightedSum / weightSum : 0;

  return {
    zoneIndex: zone.index,
    sweepIndex,
    score: Math.round(score),
    breakdown: {
      wickRejection: Math.round(wickRejection),
      volumeParticipation: Math.round(volumeParticipation),
      structuralRecovery: Math.round(structuralRecovery),
      sessionTiming: Math.round(sessionTiming),
      cvd: cvd === null ? null : Math.round(cvd),
    },
  };
}
