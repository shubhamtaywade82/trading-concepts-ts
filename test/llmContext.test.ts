import { describe, expect, it } from 'vitest';
import { buildLLMContext, deriveTrendFromStructure, LLMContextInput } from '../src/llmContext';
import { candle } from './helpers';

describe('buildLLMContext', () => {
  const fullInput: LLMContextInput = {
    symbol: 'ETHUSDT',
    timestamp: Date.UTC(2026, 6, 18, 14, 0, 0),
    htf: {
      timeframe: '4H',
      trend: 'bullish',
      currentPrice: 1811,
      drawOnLiquidity: { index: 0, time: 0, type: 'buyside', level: 1940, swept: false },
      premiumDiscountZone: {
        index: 0,
        endIndex: 10,
        high: 1940,
        low: 1780,
        direction: 'bullish',
        equilibrium: 1860,
        oteZone: { start: 1808, end: 1820 },
      },
      volumeProfile: {
        bins: [],
        pointOfControl: { priceLow: 1815, priceHigh: 1820, volume: 500, classification: 'hvn' },
        highVolumeNodes: [{ priceLow: 1815, priceHigh: 1820, volume: 500, classification: 'hvn' }],
        lowVolumeNodes: [],
      },
    },
    mtfPoi: {
      timeframe: '1H',
      orderBlock: {
        index: 5,
        time: 5,
        type: 'bullish',
        top: 1815,
        bottom: 1810,
        mitigated: false,
        strength: 2.1,
      },
    },
    ltfTrigger: {
      timeframe: '5m',
      sweptZone: {
        index: 2,
        time: 2,
        type: 'sellside',
        level: 1808,
        swept: true,
        sweepIndex: 6,
        sweepType: 'reversal',
      },
      structureShift: { index: 7, time: 7, type: 'CHoCH', direction: 'bullish', level: 1812 },
      sweepCandle: candle(6, 1808, 1810, 1806, 1809, 500, 1200000),
    },
    confluenceScore: {
      zoneIndex: 5,
      zoneSource: 'orderBlock',
      direction: 'bullish',
      score: 82,
      highConviction: true,
      breakdown: { structure: 20, liquidity: 15, zone: 20, fvg: 15, session: 0, priceAction: 10, htf: 0 },
    },
    checklistScore: {
      zoneIndex: 5,
      direction: 'bullish',
      points: 6,
      maxPoints: 8,
      valid: true,
      aPlusSetup: false,
      breakdown: {
        htfDrawOnLiquidity: true,
        premiumDiscountAlignment: true,
        poiQuality: true,
        volumeConfirmation: true,
        killzoneTiming: false,
        liquiditySweep: true,
        structuralShift: true,
        oteEntry: false,
      },
    },
  };

  it('builds the full semantic payload from already-selected pieces', () => {
    const context = buildLLMContext(fullInput);

    expect(context.symbol).toBe('ETHUSDT');
    expect(context.timestamp).toBe('2026-07-18T14:00:00.000Z');

    expect(context.htf_context).toEqual({
      timeframe: '4H',
      trend: 'Bullish',
      draw_on_liquidity: 'Buy-side liquidity at 1940.00',
      premium_discount: 'Discount zone (equilibrium 1860.00, OTE 1808.00-1820.00)',
      volume_profile: 'High Volume Node at 1815.00-1820.00',
    });

    expect(context.mtf_poi).toEqual({
      timeframe: '1H',
      zone_type: 'Bullish Order Block',
      zone_range: '1810.00 - 1815.00',
      status: 'Unmitigated',
      volume_confirmation: 'Volume at formation was 2.1x the recent average',
    });

    expect(context.ltf_trigger).toEqual({
      timeframe: '5m',
      event: 'Liquidity Sweep',
      swept_level: 'Sell-side liquidity at 1808.00',
      reclaim: 'Price closed back above 1808.00',
      cvd_reaction: 'Order-flow delta +1200000 (net buying)',
      structure_shift: '5m CHoCH confirmed, breaking 1812.00',
    });

    expect(context.confluence).toEqual({
      score: 82,
      highConviction: true,
      breakdown: fullInput.confluenceScore!.breakdown,
    });
    expect(context.checklist).toEqual({
      points: 6,
      maxPoints: 8,
      valid: true,
      aPlusSetup: false,
      breakdown: fullInput.checklistScore!.breakdown,
    });
  });

  it('produces null mtf_poi/ltf_trigger and fallback text when pieces are omitted', () => {
    const context = buildLLMContext({ htf: { timeframe: '4H', trend: 'neutral' } });

    expect(context.htf_context.draw_on_liquidity).toBe('No unswept liquidity identified');
    expect(context.htf_context.premium_discount).toBe('No dealing range identified');
    expect(context.htf_context.volume_profile).toBeUndefined();
    expect(context.mtf_poi).toBeNull();
    expect(context.ltf_trigger).toBeNull();
    expect(context.confluence).toBeUndefined();
    expect(context.checklist).toBeUndefined();
  });

  it('reports no reclaim for a breakthrough sweep', () => {
    const context = buildLLMContext({
      htf: { timeframe: '4H', trend: 'bearish' },
      ltfTrigger: {
        timeframe: '5m',
        sweptZone: {
          index: 0,
          time: 0,
          type: 'buyside',
          level: 100,
          swept: true,
          sweepIndex: 1,
          sweepType: 'breakthrough',
        },
      },
    });

    expect(context.ltf_trigger!.reclaim).toBe('Price closed beyond the level (no reclaim)');
    expect(context.ltf_trigger!.structure_shift).toBe('No structure shift yet');
    expect(context.ltf_trigger!.cvd_reaction).toBeUndefined();
  });

  it('reports a selling delta note for negative CVD', () => {
    const context = buildLLMContext({
      htf: { timeframe: '4H', trend: 'bearish' },
      ltfTrigger: {
        timeframe: '5m',
        sweptZone: {
          index: 0,
          time: 0,
          type: 'buyside',
          level: 100,
          swept: true,
          sweepIndex: 1,
          sweepType: 'reversal',
        },
        sweepCandle: candle(1, 100, 101, 99, 99.5, 500, -800000),
      },
    });

    expect(context.ltf_trigger!.cvd_reaction).toBe('Order-flow delta -800000 (net selling)');
  });

  it('prefers explicit overrides over auto-derived text', () => {
    const context = buildLLMContext({
      htf: { timeframe: '4H', trend: 'bullish' },
      mtfPoi: {
        timeframe: '1H',
        orderBlock: { index: 0, time: 0, type: 'bullish', top: 10, bottom: 9, mitigated: false, strength: 1 },
        volumeConfirmationNote: 'custom note',
      },
      ltfTrigger: {
        timeframe: '5m',
        sweptZone: {
          index: 0,
          time: 0,
          type: 'sellside',
          level: 9,
          swept: true,
          sweepIndex: 1,
          sweepType: 'reversal',
        },
        cvdNote: 'custom cvd note',
      },
    });

    expect(context.mtf_poi!.volume_confirmation).toBe('custom note');
    expect(context.ltf_trigger!.cvd_reaction).toBe('custom cvd note');
  });
});

describe('deriveTrendFromStructure', () => {
  it('returns neutral when there are no structure signals', () => {
    expect(deriveTrendFromStructure([])).toBe('neutral');
  });

  it('returns the direction of the most recent signal', () => {
    const structure = [
      { index: 1, time: 1, type: 'BOS' as const, direction: 'bullish' as const, level: 10 },
      { index: 5, time: 5, type: 'CHoCH' as const, direction: 'bearish' as const, level: 8 },
    ];
    expect(deriveTrendFromStructure(structure)).toBe('bearish');
  });
});
