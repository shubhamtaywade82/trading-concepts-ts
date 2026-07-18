import { ChecklistScoreConfig, TradingConceptsConfig } from './types';

/**
 * Baseline configuration. Presets in `presets.ts` layer market/exchange-specific
 * overrides on top of this via `createConfig`.
 */
export const DEFAULT_CONFIG: TradingConceptsConfig = {
  precision: 8,
  structure: {
    swing: {
      lookback: 5,
    },
    mss: {
      enabled: true,
      atrLookback: 14,
      displacementMultiplier: 1.5,
    },
  },
  fvg: {
    enabled: true,
    minGapPercent: 0,
    inverse: {
      enabled: true,
    },
  },
  orderBlock: {
    enabled: true,
    volumeLookback: 10,
    minVolumeStrength: 0,
    requireVolume: false,
    breaker: {
      enabled: true,
    },
  },
  liquidity: {
    enabled: true,
    equalTolerancePercent: 0.1,
    pivotLookback: 2,
    sweepScore: {
      enabled: true,
      lookback: 20,
      weights: {
        wickRejection: 30,
        volumeParticipation: 25,
        structuralRecovery: 15,
        sessionTiming: 5,
        cvd: 25,
      },
    },
  },
  session: {
    enabled: false,
    timezoneOffsetMinutes: 0,
    killzones: [
      { name: 'Asian', startUtcMinute: 0, endUtcMinute: 180, weight: 0.5 },
      { name: 'London', startUtcMinute: 420, endUtcMinute: 600, weight: 1 },
      { name: 'NewYork', startUtcMinute: 720, endUtcMinute: 900, weight: 1 },
    ],
  },
  judasSwing: {
    enabled: true,
    openingWindowMinutes: 30,
  },
  priceAction: {
    enabled: true,
    wickBodyRatio: 2,
  },
  confluence: {
    maxBarsAfterZone: 5,
  },
  premiumDiscount: {
    enabled: true,
    oteZone: { min: 0.618, max: 0.79 },
  },
  confluenceScore: {
    enabled: true,
    threshold: 65,
    highConvictionThreshold: 75,
    lookaroundBars: 5,
    // The first six weights sum to 90; `htf` is a bonus added only when
    // HTFContext data is supplied and aligned, so the max possible score is
    // 100 with HTF confluence and 90 without it.
    weights: {
      structure: 20,
      liquidity: 15,
      zone: 20,
      fvg: 15,
      session: 10,
      priceAction: 10,
      htf: 10,
    },
  },
};

/**
 * Default config for the standalone 8-point checklist scorer (`scoreChecklist`).
 * Independent of `DEFAULT_CONFIG` — pass your own to tune it.
 */
export const DEFAULT_CHECKLIST_SCORE_CONFIG: ChecklistScoreConfig = {
  validThreshold: 6,
  aPlusThreshold: 8,
  lookaroundBars: 5,
  minVolumeStrength: 1.5,
};
