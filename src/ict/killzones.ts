/**
 * ICT killzones / trading sessions. Tags each candle with the named session
 * window it falls in, based on `SessionConfig`. Fine-tune per exchange by
 * setting `timezoneOffsetMinutes` (to line candle UTC time up with the
 * exchange's local clock) and by supplying your own `killzones` windows.
 */

import { SessionConfig } from '../config/types';
import { Candle, KillzoneSignal } from '../types';

const MINUTES_PER_DAY = 1440;

function minuteOfDay(timeMs: number, offsetMinutes: number): number {
  const shifted = Math.floor(timeMs / 60000) + offsetMinutes;
  return ((shifted % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}

function isWithinWindow(minute: number, startUtcMinute: number, endUtcMinute: number): boolean {
  if (startUtcMinute <= endUtcMinute) {
    return minute >= startUtcMinute && minute < endUtcMinute;
  }
  // window wraps past midnight, e.g. 23:00 - 02:00
  return minute >= startUtcMinute || minute < endUtcMinute;
}

export function detectKillzones(candles: Candle[], config: SessionConfig): KillzoneSignal[] {
  if (!config.enabled) return [];

  const signals: KillzoneSignal[] = [];

  for (let index = 0; index < candles.length; index++) {
    const candle = candles[index];
    const minute = minuteOfDay(candle.time, config.timezoneOffsetMinutes);
    const window = config.killzones.find((kz) => isWithinWindow(minute, kz.startUtcMinute, kz.endUtcMinute));
    if (window) {
      signals.push({ index, time: candle.time, session: window.name, weight: window.weight ?? 1 });
    }
  }

  return signals;
}
