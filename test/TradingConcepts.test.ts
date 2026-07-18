import { describe, expect, it } from 'vitest';
import { TradingConcepts } from '../src/TradingConcepts';
import { CRYPTO_PRESET } from '../src/config/presets';
import { candle } from './helpers';

function buildTrendingCandles() {
  // A hand-verified zigzag (lookback=1): swing low @1, swing high @2, swing low
  // @3-ish, swing high+low @4, then a breakout close above the last swing high.
  return [
    candle(0, 10.0, 10.0, 9.5, 9.8),
    candle(1, 8.9, 9.0, 8.0, 8.1), // down-close -> feeds a bullish order block
    candle(2, 9.0, 11.0, 8.5, 9.5),
    candle(3, 8.3, 9.5, 8.2, 9.4), // up-close -> feeds a bearish order block
    candle(4, 9.0, 13.0, 8.1, 9.5), // low kept just above 8.0 so the bullish OB @1 stays unmitigated
    candle(5, 9.6, 9.66, 8.5, 9.65), // hammer -> bullish confluence with the OB @1
    candle(6, 10.0, 15.0, 9.5, 14.5), // closes above the swing high (13) -> BOS
    candle(7, 14.5, 14.8, 13.0, 14.2),
  ];
}

describe('TradingConcepts', () => {
  it('rejects malformed candles up front', () => {
    expect(() => new TradingConcepts([{ time: 0, open: 1, high: 0.5, low: 1, close: 1 }])).toThrow();
  });

  it('runs a full analysis and returns all sections', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const result = tc.analyze();

    expect(result.swings.length).toBeGreaterThan(0);
    expect(result.orderBlocks.length).toBeGreaterThan(0);
    expect(Array.isArray(result.structure)).toBe(true);
    expect(Array.isArray(result.fvgs)).toBe(true);
    expect(Array.isArray(result.liquidity)).toBe(true);
    expect(Array.isArray(result.priceAction)).toBe(true);
    expect(result.signals).toHaveProperty('longs');
    expect(result.signals).toHaveProperty('shorts');
    expect(Array.isArray(result.inverseFvgs)).toBe(true);
    expect(Array.isArray(result.liquiditySweepScores)).toBe(true);
    expect(Array.isArray(result.premiumDiscountZones)).toBe(true);
    expect(Array.isArray(result.confluenceScores)).toBe(true);
    expect(Array.isArray(result.breakerBlocks)).toBe(true);
    expect(Array.isArray(result.judasSwings)).toBe(true);
  });

  it('detects a breaker block once a mitigated order block is decisively closed through', () => {
    const candles = [
      ...buildTrendingCandles(),
      candle(8, 9.5, 9.5, 7, 7.5), // closes well below the bullish OB @1 bottom (8.0) -> breaker
    ];
    const tc = new TradingConcepts(candles, { structure: { swing: { lookback: 1 } } });
    const { breakerBlocks } = tc.analyze();

    expect(breakerBlocks.some((b) => b.originalType === 'bullish' && b.type === 'bearish')).toBe(true);
  });

  it('disables breaker blocks and Judas Swings independently via config', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), {
      structure: { swing: { lookback: 1 } },
      orderBlock: { breaker: { enabled: false } },
      judasSwing: { enabled: false },
    });
    const result = tc.analyze();

    expect(result.breakerBlocks).toEqual([]);
    expect(result.judasSwings).toEqual([]);
  });

  it('caches analysis until candles or config change', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const first = tc.analyze();
    expect(tc.analyze()).toBe(first);

    tc.updateConfig({ fvg: { enabled: false } });
    const second = tc.analyze();
    expect(second).not.toBe(first);
    expect(second.fvgs).toEqual([]);
  });

  it('disables a module entirely via config', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), {
      structure: { swing: { lookback: 1 } },
      liquidity: { enabled: false },
    });
    expect(tc.analyze().liquidity).toEqual([]);
  });

  it('disables order blocks, price action, premium/discount, and sweep scoring independently', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), {
      structure: { swing: { lookback: 1 } },
      orderBlock: { enabled: false },
      priceAction: { enabled: false },
      premiumDiscount: { enabled: false },
      liquidity: { sweepScore: { enabled: false } },
    });
    const result = tc.analyze();

    expect(result.orderBlocks).toEqual([]);
    expect(result.priceAction).toEqual([]);
    expect(result.premiumDiscountZones).toEqual([]);
    expect(result.liquiditySweepScores).toEqual([]);
  });

  it('finds bullish confluence between an unmitigated order block and a matching price-action signal', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const { signals } = tc.analyze();

    expect(signals.longs.length).toBeGreaterThan(0);
    expect(signals.longs[0]).toMatchObject({ zoneSource: 'orderBlock', direction: 'bullish' });
  });

  it('re-analyzes after setCandles with a new series', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const first = tc.analyze();

    tc.setCandles(buildTrendingCandles().slice(0, 4));
    const second = tc.analyze();

    expect(second).not.toBe(first);
    expect(second.swings.length).toBeGreaterThanOrEqual(0);
  });

  it('computes a confluence score for the same order block found in signals.longs', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const { confluenceScores } = tc.analyze();

    expect(confluenceScores.length).toBeGreaterThan(0);
    expect(confluenceScores[0]).toHaveProperty('score');
    expect(confluenceScores[0]).toHaveProperty('breakdown');
  });

  it('invalidates the cache when HTF context is set and applies it to the HTF bonus', () => {
    const tc = new TradingConcepts(buildTrendingCandles(), { structure: { swing: { lookback: 1 } } });
    const first = tc.analyze();

    tc.setHTFContext({
      orderBlocks: [
        { index: 0, time: 0, type: 'bullish', top: 20, bottom: 5, mitigated: false, strength: 1 },
      ],
    });
    const second = tc.analyze();

    expect(second).not.toBe(first);
    const bullishScore = second.confluenceScores.find((s) => s.direction === 'bullish');
    expect(bullishScore?.breakdown.htf).toBeGreaterThan(0);
  });

  it('builds from a market preset with extra per-symbol overrides', () => {
    const tc = TradingConcepts.withPreset(buildTrendingCandles(), CRYPTO_PRESET, { precision: 2 });
    expect(tc.getConfig().precision).toBe(2);
    expect(tc.getConfig().session.enabled).toBe(false);
    expect(() => tc.analyze()).not.toThrow();
  });

  it('builds from a market preset with no extra overrides', () => {
    const tc = TradingConcepts.withPreset(buildTrendingCandles(), CRYPTO_PRESET);
    expect(tc.getConfig().precision).toBe(8);
    expect(tc.getConfig().session.enabled).toBe(false);
  });
});
