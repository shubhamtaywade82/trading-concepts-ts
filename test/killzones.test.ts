import { describe, expect, it } from 'vitest';
import { detectKillzones, getActiveWindowProgress } from '../src/ict/killzones';
import { candle } from './helpers';

const MINUTE = 60_000;

describe('detectKillzones', () => {
  it('returns nothing when sessions are disabled', () => {
    const candles = [candle(8 * 60 * MINUTE, 1, 1, 1, 1)];
    const signals = detectKillzones(candles, {
      enabled: false,
      timezoneOffsetMinutes: 0,
      killzones: [{ name: 'London', startUtcMinute: 420, endUtcMinute: 600 }],
    });
    expect(signals).toEqual([]);
  });

  it('tags candles that fall inside a UTC killzone window', () => {
    // 08:00 UTC -> inside London (07:00-10:00), 11:00 UTC -> outside every window
    const candles = [candle(8 * 60 * MINUTE, 1, 1, 1, 1), candle(11 * 60 * MINUTE, 1, 1, 1, 1)];

    const signals = detectKillzones(candles, {
      enabled: true,
      timezoneOffsetMinutes: 0,
      killzones: [{ name: 'London', startUtcMinute: 420, endUtcMinute: 600 }],
    });

    expect(signals).toEqual([{ index: 0, time: candles[0].time, session: 'London', weight: 1 }]);
  });

  it('applies the timezone offset before matching windows', () => {
    // 03:45 UTC + 330 min (IST offset) = 09:15 local -> inside the 09:15-10:15 window
    const time = (3 * 60 + 45) * MINUTE;
    const candles = [candle(time, 1, 1, 1, 1)];

    const signals = detectKillzones(candles, {
      enabled: true,
      timezoneOffsetMinutes: 330,
      killzones: [{ name: 'Opening', startUtcMinute: 555, endUtcMinute: 615 }],
    });

    expect(signals).toEqual([{ index: 0, time, session: 'Opening', weight: 1 }]);
  });

  it('uses the window weight when provided', () => {
    const candles = [candle(8 * 60 * MINUTE, 1, 1, 1, 1)];
    const signals = detectKillzones(candles, {
      enabled: true,
      timezoneOffsetMinutes: 0,
      killzones: [{ name: 'Asian', startUtcMinute: 420, endUtcMinute: 600, weight: 0.5 }],
    });
    expect(signals[0].weight).toBe(0.5);
  });

  it('supports windows that wrap past midnight', () => {
    const lateNight = (23 * 60 + 30) * MINUTE; // 23:30
    const earlyMorning = 30 * MINUTE; // 00:30
    const midday = 12 * 60 * MINUTE;

    const config = {
      enabled: true,
      timezoneOffsetMinutes: 0,
      killzones: [{ name: 'Overnight', startUtcMinute: 1380, endUtcMinute: 60 }],
    };

    const signals = detectKillzones(
      [candle(lateNight, 1, 1, 1, 1), candle(earlyMorning, 1, 1, 1, 1), candle(midday, 1, 1, 1, 1)],
      config,
    );

    expect(signals.map((s) => s.time)).toEqual([lateNight, earlyMorning]);
  });
});

describe('getActiveWindowProgress', () => {
  const config = {
    enabled: true,
    timezoneOffsetMinutes: 0,
    killzones: [{ name: 'London', startUtcMinute: 420, endUtcMinute: 600, weight: 1 }],
  };

  it('returns null when sessions are disabled', () => {
    expect(getActiveWindowProgress(8 * 60 * MINUTE, { ...config, enabled: false })).toBeNull();
  });

  it('returns null when no window matches', () => {
    expect(getActiveWindowProgress(11 * 60 * MINUTE, config)).toBeNull();
  });

  it('reports minutes elapsed since the window started', () => {
    // 07:20 UTC is 20 minutes into the 07:00-10:00 London window
    const progress = getActiveWindowProgress((7 * 60 + 20) * MINUTE, config);
    expect(progress).toEqual({ name: 'London', weight: 1, minutesIntoWindow: 20 });
  });

  it('computes progress correctly for a window that wraps past midnight', () => {
    const wrapConfig = {
      enabled: true,
      timezoneOffsetMinutes: 0,
      killzones: [{ name: 'Overnight', startUtcMinute: 1380, endUtcMinute: 60, weight: 1 }], // 23:00-01:00
    };

    // 00:30 is 90 minutes after the 23:00 start
    const progress = getActiveWindowProgress(30 * MINUTE, wrapConfig);
    expect(progress).toEqual({ name: 'Overnight', weight: 1, minutesIntoWindow: 90 });
  });
});
