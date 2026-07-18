import { describe, expect, it } from 'vitest';
import { findJudasSwings } from '../src/ict/judasSwing';
import { LiquidityZone } from '../src/types';
import { candle } from './helpers';

const MINUTE = 60_000;

const sessionConfig = {
  enabled: true,
  timezoneOffsetMinutes: 0,
  killzones: [{ name: 'London', startUtcMinute: 420, endUtcMinute: 600, weight: 1 }], // 07:00-10:00 UTC
};
const judasConfig = { enabled: true, openingWindowMinutes: 30 };

function buildCandles(sweepTime: number) {
  const candles = [];
  for (let i = 0; i < 3; i++) candles.push(candle(i, 1, 1, 1, 1));
  candles[2] = candle(sweepTime, 1, 1, 1, 1);
  return candles;
}

describe('findJudasSwings', () => {
  it('flags a sellside reversal sweep within the opening minutes of a kill zone as a bullish Judas Swing', () => {
    const sweepTime = (7 * 60 + 10) * MINUTE; // 10 min into the 07:00-10:00 window
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'sellside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    const signals = findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, judasConfig);

    expect(signals).toEqual([
      { zoneIndex: 0, sweepIndex: 2, time: sweepTime, session: 'London', direction: 'bullish' },
    ]);
  });

  it('flags a buyside reversal sweep as a bearish Judas Swing', () => {
    const sweepTime = (7 * 60 + 10) * MINUTE;
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'buyside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    const signals = findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, judasConfig);

    expect(signals[0].direction).toBe('bearish');
  });

  it('ignores a sweep that happens after the opening window has passed', () => {
    const sweepTime = (7 * 60 + 45) * MINUTE; // 45 min in, past the 30-minute opening window
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'sellside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    expect(findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, judasConfig)).toEqual([]);
  });

  it('ignores a breakthrough sweep (not a false move)', () => {
    const sweepTime = (7 * 60 + 10) * MINUTE;
    const liquidity: LiquidityZone[] = [
      {
        index: 0,
        time: 0,
        type: 'sellside',
        level: 100,
        swept: true,
        sweepIndex: 2,
        sweepType: 'breakthrough',
      },
    ];

    expect(findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, judasConfig)).toEqual([]);
  });

  it('ignores a sweep outside any kill zone window', () => {
    const sweepTime = 11 * 60 * MINUTE; // 11:00 UTC, outside the London window
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'sellside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    expect(findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, judasConfig)).toEqual([]);
  });

  it('returns nothing when sessions are disabled', () => {
    const sweepTime = (7 * 60 + 10) * MINUTE;
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'sellside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    expect(
      findJudasSwings(buildCandles(sweepTime), liquidity, { ...sessionConfig, enabled: false }, judasConfig),
    ).toEqual([]);
  });

  it('returns nothing when the Judas Swing detector itself is disabled', () => {
    const sweepTime = (7 * 60 + 10) * MINUTE;
    const liquidity: LiquidityZone[] = [
      { index: 0, time: 0, type: 'sellside', level: 100, swept: true, sweepIndex: 2, sweepType: 'reversal' },
    ];

    expect(
      findJudasSwings(buildCandles(sweepTime), liquidity, sessionConfig, { ...judasConfig, enabled: false }),
    ).toEqual([]);
  });

  it('ignores unswept liquidity zones', () => {
    const liquidity: LiquidityZone[] = [{ index: 0, time: 0, type: 'sellside', level: 100, swept: false }];
    expect(
      findJudasSwings(buildCandles((7 * 60 + 10) * MINUTE), liquidity, sessionConfig, judasConfig),
    ).toEqual([]);
  });
});
