import { describe, expect, it } from 'vitest';
import { DEFAULT_CHECKLIST_SCORE_CONFIG } from '../src/config/defaults';
import { ChecklistScoreInputs, scoreChecklist } from '../src/checklistScore';
import { HTFContext, OrderBlock } from '../src/types';

const bullishOb: OrderBlock = {
  index: 20,
  time: 20,
  type: 'bullish',
  top: 105,
  bottom: 95,
  mitigated: false,
  strength: 2,
};

const fullInputs: ChecklistScoreInputs = {
  orderBlocks: [bullishOb],
  breakerBlocks: [],
  structure: [{ index: 20, time: 20, type: 'CHoCH', direction: 'bullish', level: 110 }],
  liquidity: [],
  judasSwings: [{ zoneIndex: 10, sweepIndex: 18, time: 18, session: 'London', direction: 'bullish' }],
  fvgs: [{ index: 20, time: 20, type: 'bullish', top: 104, bottom: 96, mitigated: false }],
  inverseFvgs: [],
  killzones: [{ index: 20, time: 20, session: 'London', weight: 1 }],
  premiumDiscountZones: [
    {
      index: 0,
      endIndex: 20,
      high: 130,
      low: 90,
      direction: 'bullish',
      equilibrium: 110,
      oteZone: { start: 95, end: 105 },
    },
  ],
};

const htfContext: HTFContext = {
  liquidity: [{ index: 5, time: 5, type: 'buyside', level: 200, swept: false }],
};

describe('scoreChecklist', () => {
  it('awards all 8 points when every factor lines up, including HTF', () => {
    const [result] = scoreChecklist(fullInputs, DEFAULT_CHECKLIST_SCORE_CONFIG, htfContext);

    expect(result.zoneIndex).toBe(20);
    expect(result.direction).toBe('bullish');
    expect(result.points).toBe(8);
    expect(result.maxPoints).toBe(8);
    expect(result.valid).toBe(true);
    expect(result.aPlusSetup).toBe(true);
    expect(result.breakdown).toEqual({
      htfDrawOnLiquidity: true,
      premiumDiscountAlignment: true,
      poiQuality: true,
      volumeConfirmation: true,
      killzoneTiming: true,
      liquiditySweep: true,
      structuralShift: true,
      oteEntry: true,
    });
  });

  it('scores 0 for an isolated order block with nothing nearby, and is invalid', () => {
    const isolatedInputs: ChecklistScoreInputs = {
      // low strength too, so volume confirmation (the only intrinsic factor
      // that doesn't depend on nearby signals) also comes back false
      orderBlocks: [{ ...bullishOb, strength: 1 }],
      breakerBlocks: [],
      structure: [],
      liquidity: [],
      judasSwings: [],
      fvgs: [],
      inverseFvgs: [],
      killzones: [],
      premiumDiscountZones: [],
    };

    const [result] = scoreChecklist(isolatedInputs, DEFAULT_CHECKLIST_SCORE_CONFIG);

    expect(result.points).toBe(0);
    expect(result.valid).toBe(false);
    expect(result.aPlusSetup).toBe(false);
  });

  it('omits the HTF draw-on-liquidity point without HTF context, capping below 8', () => {
    const [result] = scoreChecklist(fullInputs, DEFAULT_CHECKLIST_SCORE_CONFIG);

    expect(result.breakdown.htfDrawOnLiquidity).toBe(false);
    expect(result.points).toBe(7);
    expect(result.aPlusSetup).toBe(false);
    expect(result.valid).toBe(true); // still >= the default 6-point threshold
  });

  it('falls back to a plain liquidity sweep when no Judas Swing is present', () => {
    const inputs: ChecklistScoreInputs = {
      ...fullInputs,
      judasSwings: [],
      liquidity: [
        {
          index: 5,
          time: 5,
          type: 'sellside',
          level: 90,
          swept: true,
          sweepIndex: 18,
          sweepType: 'reversal',
        },
      ],
    };

    const [result] = scoreChecklist(inputs, DEFAULT_CHECKLIST_SCORE_CONFIG);
    expect(result.breakdown.liquiditySweep).toBe(true);
  });

  it('rejects volume confirmation below the configured threshold', () => {
    const inputs: ChecklistScoreInputs = {
      ...fullInputs,
      orderBlocks: [{ ...bullishOb, strength: 1.2 }],
    };

    const [result] = scoreChecklist(inputs, DEFAULT_CHECKLIST_SCORE_CONFIG);
    expect(result.breakdown.volumeConfirmation).toBe(false);
  });

  it('rejects a plain BOS as a structural shift (requires CHoCH/MSS)', () => {
    const inputs: ChecklistScoreInputs = {
      ...fullInputs,
      structure: [{ index: 20, time: 20, type: 'BOS', direction: 'bullish', level: 110 }],
    };

    const [result] = scoreChecklist(inputs, DEFAULT_CHECKLIST_SCORE_CONFIG);
    expect(result.breakdown.structuralShift).toBe(false);
  });

  it('excludes mitigated order blocks', () => {
    const inputs: ChecklistScoreInputs = { ...fullInputs, orderBlocks: [{ ...bullishOb, mitigated: true }] };
    expect(scoreChecklist(inputs, DEFAULT_CHECKLIST_SCORE_CONFIG, htfContext)).toEqual([]);
  });
});
