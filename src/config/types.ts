import { KillzoneWindow } from '../types';

export interface SwingConfig {
  /** Bars required on each side of a candle to confirm it as a swing point. */
  lookback: number;
}

export interface MSSConfig {
  enabled: boolean;
  /** Bars used to compute the average candle range a breaking candle's body is compared against. */
  atrLookback: number;
  /**
   * How many times the average range a CHoCH-breaking candle's body must
   * reach to be upgraded from a plain CHoCH to a displacement-confirmed MSS.
   */
  displacementMultiplier: number;
}

export interface FVGConfig {
  enabled: boolean;
  /** Minimum gap size, as a percent of price (0-100), required to keep a gap. Filters noise. */
  minGapPercent: number;
  /** Detect Inverse FVGs (gaps price has closed all the way through, flipping polarity). */
  inverse: {
    enabled: boolean;
  };
}

export interface OrderBlockConfig {
  enabled: boolean;
  /** Bars used to compute the average volume an order block candle is compared against. */
  volumeLookback: number;
  /** Minimum volume strength (relative to the lookback average) required to keep a block. 0 disables the filter. */
  minVolumeStrength: number;
  /** When true, blocks are discarded if volume data is unavailable instead of defaulting to a pass. */
  requireVolume: boolean;
}

export interface LiquiditySweepScoreWeights {
  wickRejection: number;
  volumeParticipation: number;
  structuralRecovery: number;
  sessionTiming: number;
  /** Only applied when a swept candle carries `Candle.delta`; otherwise the remaining weights are renormalized to 100. */
  cvd: number;
}

export interface LiquiditySweepScoreConfig {
  enabled: boolean;
  /** Bars used as the volume/delta baseline for the volume-participation and CVD factors. */
  lookback: number;
  weights: LiquiditySweepScoreWeights;
}

export interface LiquidityConfig {
  enabled: boolean;
  /** Percent tolerance (0-100) used to group nearby highs/lows into an equal-high/low liquidity pool. */
  equalTolerancePercent: number;
  /** Bars required on each side of a candle to confirm it as a liquidity pivot. */
  pivotLookback: number;
  sweepScore: LiquiditySweepScoreConfig;
}

export interface StructureConfig {
  swing: SwingConfig;
  mss: MSSConfig;
}

export interface SessionConfig {
  enabled: boolean;
  /**
   * Minutes to add to a candle's UTC timestamp before computing its minute-of-day.
   * Use this to line sessions up with an exchange's local trading hours.
   */
  timezoneOffsetMinutes: number;
  killzones: KillzoneWindow[];
}

export interface PriceActionConfig {
  enabled: boolean;
  /** How many times larger the wick must be than the body to qualify as a hammer/shooting star. */
  wickBodyRatio: number;
}

export interface ConfluenceConfig {
  /** Max bars after a zone forms in which a matching price-action signal still counts as confluence. */
  maxBarsAfterZone: number;
}

export interface PremiumDiscountConfig {
  enabled: boolean;
  /** Retracement band, as 0-1 fractions of the dealing range, treated as the Optimal Trade Entry (OTE) zone. */
  oteZone: { min: number; max: number };
}

export interface ConfluenceScoreWeights {
  structure: number;
  liquidity: number;
  zone: number;
  fvg: number;
  session: number;
  priceAction: number;
  htf: number;
}

export interface ConfluenceScoreConfig {
  enabled: boolean;
  /** Score (0-100) at or above which a setup is considered valid. */
  threshold: number;
  /** Score (0-100) at or above which a setup is flagged as high conviction. */
  highConvictionThreshold: number;
  /** Bars around a zone searched for supporting structure/liquidity/session/price-action signals. */
  lookaroundBars: number;
  weights: ConfluenceScoreWeights;
}

export interface TradingConceptsConfig {
  /** Decimal places used when rounding computed levels; align with the symbol's tick size. */
  precision: number;
  structure: StructureConfig;
  fvg: FVGConfig;
  orderBlock: OrderBlockConfig;
  liquidity: LiquidityConfig;
  session: SessionConfig;
  priceAction: PriceActionConfig;
  confluence: ConfluenceConfig;
  premiumDiscount: PremiumDiscountConfig;
  confluenceScore: ConfluenceScoreConfig;
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U> ? Array<U> : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type TradingConceptsConfigOverrides = DeepPartial<TradingConceptsConfig>;
