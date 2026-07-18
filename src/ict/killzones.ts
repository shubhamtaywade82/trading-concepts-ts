/**
 * ICT killzones / trading sessions. Tags each candle with the named session
 * window it falls in, based on `SessionConfig`. Fine-tune per exchange by
 * setting `timezoneOffsetMinutes` (to line candle UTC time up with the
 * exchange's local clock) and by supplying your own `killzones` windows.
 */

import { SessionConfig } from '../config/types';
import { Candle, KillzoneSignal, KillzoneWindow } from '../types';

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

export interface WindowProgress {
  name: string;
  weight: number;
  /** Minutes elapsed since the active window started. */
  minutesIntoWindow: number;
}

/**
 * Finds the kill zone window a given time falls in (if any) and how many
 * minutes into it that time sits — used by `findJudasSwings` to identify a
 * sweep that happened within a window's opening minutes.
 */
export function getActiveWindowProgress(timeMs: number, config: SessionConfig): WindowProgress | null {
  if (!config.enabled) return null;

  const minute = minuteOfDay(timeMs, config.timezoneOffsetMinutes);
  const window = config.killzones.find((kz) => isWithinWindow(minute, kz.startUtcMinute, kz.endUtcMinute));
  if (!window) return null;

  const minutesIntoWindow = minutesSinceWindowStart(minute, window);
  return { name: window.name, weight: window.weight ?? 1, minutesIntoWindow };
}

function minutesSinceWindowStart(minute: number, window: KillzoneWindow): number {
  if (window.startUtcMinute <= window.endUtcMinute) {
    return minute - window.startUtcMinute;
  }
  // window wraps past midnight
  return minute >= window.startUtcMinute
    ? minute - window.startUtcMinute
    : minute + (MINUTES_PER_DAY - window.startUtcMinute);
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
