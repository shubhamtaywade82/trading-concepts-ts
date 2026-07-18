/**
 * Judas Swing: a liquidity sweep that resolves as a reversal within the
 * opening minutes of a kill zone — a false move designed to trap breakout
 * traders before the real directional move for the session.
 */

import { JudasSwingConfig, SessionConfig } from '../config/types';
import { Candle, JudasSwingSignal, LiquidityZone } from '../types';
import { getActiveWindowProgress } from './killzones';

export function findJudasSwings(
  candles: Candle[],
  liquidity: LiquidityZone[],
  sessionConfig: SessionConfig,
  config: JudasSwingConfig,
): JudasSwingSignal[] {
  if (!config.enabled || !sessionConfig.enabled) return [];

  const signals: JudasSwingSignal[] = [];

  for (const zone of liquidity) {
    if (!zone.swept || zone.sweepIndex === undefined || zone.sweepType !== 'reversal') continue;

    const candle = candles[zone.sweepIndex];
    const progress = getActiveWindowProgress(candle.time, sessionConfig);
    if (!progress || progress.minutesIntoWindow > config.openingWindowMinutes) continue;

    signals.push({
      zoneIndex: zone.index,
      sweepIndex: zone.sweepIndex,
      time: candle.time,
      session: progress.name,
      // a sellside sweep reversal implies the real move is up; a buyside sweep reversal implies down
      direction: zone.type === 'sellside' ? 'bullish' : 'bearish',
    });
  }

  return signals.sort((a, b) => a.sweepIndex - b.sweepIndex);
}
