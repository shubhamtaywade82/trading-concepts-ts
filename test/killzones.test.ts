import { describe, expect, it } from 'vitest';
import { detectKillzones } from '../src/ict/killzones';
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

    expect(signals).toEqual([{ index: 0, time: candles[0].time, session: 'London' }]);
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

    expect(signals).toEqual([{ index: 0, time, session: 'Opening' }]);
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

    const signals = detectKillzones([candle(lateNight, 1, 1, 1, 1), candle(earlyMorning, 1, 1, 1, 1), candle(midday, 1, 1, 1, 1)], config);

    expect(signals.map((s) => s.time)).toEqual([lateNight, earlyMorning]);
  });
});
