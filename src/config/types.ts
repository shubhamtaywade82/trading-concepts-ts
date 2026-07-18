import { KillzoneWindow } from '../types';

export interface SwingConfig {
  /** Bars required on each side of a candle to confirm it as a swing point. */
  lookback: number;
}

export interface FVGConfig {
  enabled: boolean;
  /** Minimum gap size, as a percent of price (0-100), required to keep a gap. Filters noise. */
  minGapPercent: number;
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

export interface LiquidityConfig {
  enabled: boolean;
  /** Percent tolerance (0-100) used to group nearby highs/lows into an equal-high/low liquidity pool. */
  equalTolerancePercent: number;
  /** Bars required on each side of a candle to confirm it as a liquidity pivot. */
  pivotLookback: number;
}

export interface StructureConfig {
  swing: SwingConfig;
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
}

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends Array<infer U> ? Array<U> : T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type TradingConceptsConfigOverrides = DeepPartial<TradingConceptsConfig>;
