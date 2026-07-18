import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { ConfluenceScoreInputs, scoreConfluence } from '../src/confluenceScore';
import { HTFContext, OrderBlock } from '../src/types';
import { candle } from './helpers';

function buildLiquidityCandles() {
  const candles = [];
  for (let i = 0; i < 18; i++) {
    candles.push(candle(i, 100, 100.5, 99.5, 100, 100));
  }
  // sweep candle: wicks well below the sellside level (90) then closes back
  // above it (a reversal), on 3x average volume.
  candles.push(candle(18, 95, 100.5, 85, 95, 300));
  return candles;
}

const bullishOb: OrderBlock = {
  index: 20,
  time: 20,
  type: 'bullish',
  top: 105,
  bottom: 95,
  mitigated: false,
  strength: 1,
};

const fullConfluenceInputs: ConfluenceScoreInputs = {
  candles: buildLiquidityCandles(),
  orderBlocks: [bullishOb],
  structure: [{ index: 20, time: 20, type: 'MSS', direction: 'bullish', level: 110 }],
  liquidity: [
    { index: 10, time: 10, type: 'sellside', level: 90, swept: true, sweepIndex: 18, sweepType: 'reversal' },
  ],
  fvgs: [{ index: 20, time: 20, type: 'bullish', top: 104, bottom: 96, mitigated: false }],
  inverseFvgs: [],
  priceAction: [{ index: 22, time: 22, pattern: 'bullish_engulfing', price: 102 }],
  killzones: [{ index: 20, time: 20, session: 'London', weight: 1 }],
  premiumDiscountZones: [
    {
      index: 0,
      endIndex: 20,
      high: 120,
      low: 80,
      direction: 'bullish',
      equilibrium: 100,
      oteZone: { start: 95, end: 100 },
    },
  ],
};

describe('scoreConfluence', () => {
  it('scores a bullish order block with every pillar aligned as high conviction', () => {
    const [result] = scoreConfluence(
      fullConfluenceInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
    );

    expect(result.zoneIndex).toBe(20);
    expect(result.direction).toBe('bullish');
    expect(result.breakdown.structure).toBe(100); // MSS match
    expect(result.breakdown.zone).toBe(100); // inside the OTE band
    expect(result.breakdown.fvg).toBe(100); // unmitigated bullish FVG nearby
    expect(result.breakdown.session).toBe(100); // inside a full-weight kill zone
    expect(result.breakdown.priceAction).toBe(100); // bullish engulfing nearby
    expect(result.breakdown.liquidity).toBeGreaterThan(0); // a real reversal sweep scored positively
    expect(result.breakdown.htf).toBe(0); // no HTF context supplied
    expect(result.score).toBeGreaterThanOrEqual(DEFAULT_CONFIG.confluenceScore.threshold);
    expect(result.highConviction).toBe(true);
  });

  it('adds the HTF bonus when an aligned higher-timeframe order block is supplied', () => {
    const htfContext: HTFContext = {
      orderBlocks: [
        { index: 2, time: 2, type: 'bullish', top: 106, bottom: 94, mitigated: false, strength: 1 },
      ],
    };

    const withoutHtf = scoreConfluence(
      fullConfluenceInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
    );
    const withHtf = scoreConfluence(
      fullConfluenceInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
      htfContext,
    );

    expect(withHtf[0].breakdown.htf).toBe(100);
    expect(withHtf[0].score).toBeGreaterThan(withoutHtf[0].score);
  });

  it('falls back to the HTF structure alignment bonus when no HTF order block overlaps', () => {
    const htfContext: HTFContext = {
      structure: [{ index: 1, time: 1, type: 'BOS', direction: 'bullish', level: 200 }],
    };

    const [result] = scoreConfluence(
      fullConfluenceInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
      htfContext,
    );

    expect(result.breakdown.htf).toBe(70);
  });

  it('falls back to the HTF premium/discount alignment bonus when nothing else matches', () => {
    const htfContext: HTFContext = {
      premiumDiscountZones: [
        {
          index: 0,
          endIndex: 100,
          high: 200,
          low: 0,
          direction: 'bullish',
          equilibrium: 150, // ob midpoint (100) is well below this -> classified as discount
          oteZone: { start: 10, end: 20 },
        },
      ],
    };

    const [result] = scoreConfluence(
      fullConfluenceInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
      htfContext,
    );

    expect(result.breakdown.htf).toBe(60);
  });

  it('scores an isolated order block with no nearby confluence as 0', () => {
    const isolatedInputs: ConfluenceScoreInputs = {
      candles: buildLiquidityCandles(),
      orderBlocks: [
        { index: 20, time: 20, type: 'bullish', top: 105, bottom: 95, mitigated: false, strength: 1 },
      ],
      structure: [],
      liquidity: [],
      fvgs: [],
      inverseFvgs: [],
      priceAction: [],
      killzones: [],
      premiumDiscountZones: [],
    };

    const [result] = scoreConfluence(
      isolatedInputs,
      DEFAULT_CONFIG.confluenceScore,
      DEFAULT_CONFIG.liquidity.sweepScore,
    );

    expect(result.score).toBe(0);
    expect(result.highConviction).toBe(false);
  });

  it('excludes mitigated order blocks', () => {
    const inputs: ConfluenceScoreInputs = {
      ...fullConfluenceInputs,
      orderBlocks: [{ ...bullishOb, mitigated: true }],
    };

    expect(
      scoreConfluence(inputs, DEFAULT_CONFIG.confluenceScore, DEFAULT_CONFIG.liquidity.sweepScore),
    ).toEqual([]);
  });

  it('returns nothing when disabled', () => {
    const result = scoreConfluence(
      fullConfluenceInputs,
      { ...DEFAULT_CONFIG.confluenceScore, enabled: false },
      DEFAULT_CONFIG.liquidity.sweepScore,
    );
    expect(result).toEqual([]);
  });
});
