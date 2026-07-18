import { TradingConceptsConfig } from './types';

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
  },
  fvg: {
    enabled: true,
    minGapPercent: 0,
  },
  orderBlock: {
    enabled: true,
    volumeLookback: 10,
    minVolumeStrength: 0,
    requireVolume: false,
  },
  liquidity: {
    enabled: true,
    equalTolerancePercent: 0.1,
    pivotLookback: 2,
  },
  session: {
    enabled: false,
    timezoneOffsetMinutes: 0,
    killzones: [
      { name: 'Asian', startUtcMinute: 0, endUtcMinute: 180 },
      { name: 'London', startUtcMinute: 420, endUtcMinute: 600 },
      { name: 'NewYork', startUtcMinute: 720, endUtcMinute: 900 },
    ],
  },
  priceAction: {
    enabled: true,
    wickBodyRatio: 2,
  },
  confluence: {
    maxBarsAfterZone: 5,
  },
};
