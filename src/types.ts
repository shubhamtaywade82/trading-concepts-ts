/**
 * Core data structures shared across the library.
 */

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  /**
   * Optional net order-flow delta (buy volume minus sell volume) for this
   * candle, if your data source provides it (footprint charts, CVD feeds,
   * exchange trade-tape aggregation, ...). Purely additive: every detector in
   * this library works from OHLCV alone, and only the liquidity sweep quality
   * score (`scoreLiquiditySweep`) uses `delta` when present, to add a CVD
   * absorption factor on top of the OHLCV-only factors.
   */
  delta?: number;
}

export type SwingType = 'high' | 'low';

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: SwingType;
}

export type ZoneDirection = 'bullish' | 'bearish';

export interface FVG {
  /** Index of the middle candle that created the gap. */
  index: number;
  time: number;
  type: ZoneDirection;
  top: number;
  bottom: number;
  mitigated: boolean;
  mitigationIndex?: number;
}

/**
 * An FVG that price has closed all the way through, flipping its polarity:
 * a bullish FVG that's decisively closed below becomes bearish resistance,
 * and vice versa. `type` reflects the *new* (post-inversion) direction;
 * `originalType` records what it was before.
 */
export interface InverseFVG {
  index: number;
  time: number;
  type: ZoneDirection;
  originalType: ZoneDirection;
  top: number;
  bottom: number;
  inversionIndex: number;
  inversionTime: number;
}

export interface OrderBlock {
  index: number;
  time: number;
  type: ZoneDirection;
  top: number;
  bottom: number;
  mitigated: boolean;
  mitigationIndex?: number;
  /** Volume of the block candle relative to its recent average (1 = average). */
  strength: number;
}

export type LiquidityType = 'buyside' | 'sellside';

/**
 * How a sweep resolved: `reversal` means price wicked through the level and
 * closed back on the origin side (a classic stop hunt); `breakthrough` means
 * the sweeping candle closed beyond the level (a genuine break, not a hunt).
 */
export type SweepType = 'reversal' | 'breakthrough';

export interface LiquidityZone {
  index: number;
  time: number;
  type: LiquidityType;
  level: number;
  swept: boolean;
  sweepIndex?: number;
  sweepType?: SweepType;
}

/** 0-100 composite quality score for a liquidity sweep. See `scoreLiquiditySweep`. */
export interface LiquiditySweepScore {
  zoneIndex: number;
  sweepIndex: number;
  score: number;
  breakdown: {
    wickRejection: number;
    volumeParticipation: number;
    structuralRecovery: number;
    sessionTiming: number;
    cvd: number | null;
  };
}

export type StructureType = 'BOS' | 'CHoCH' | 'MSS';

export interface StructureSignal {
  index: number;
  time: number;
  type: StructureType;
  direction: ZoneDirection;
  level: number;
}

export type PriceActionPattern = 'bullish_engulfing' | 'bearish_engulfing' | 'hammer' | 'shooting_star';

export interface PriceActionSignal {
  index: number;
  time: number;
  pattern: PriceActionPattern;
  price: number;
}

export interface KillzoneWindow {
  name: string;
  /** Minutes from UTC midnight (0-1439). */
  startUtcMinute: number;
  /** Minutes from UTC midnight (0-1439). Can be < start to wrap past midnight. */
  endUtcMinute: number;
  /**
   * Relative importance of this session (0-1), used as the "session timing"
   * factor in `scoreLiquiditySweep` and the confluence score. Defaults to 1
   * when omitted. ICT's kill zone hierarchy treats London/New York as full
   * weight and the Asian session as roughly half.
   */
  weight?: number;
}

export interface KillzoneSignal {
  index: number;
  time: number;
  session: string;
  weight: number;
}

export interface ConfluenceSignal {
  zoneIndex: number;
  zoneLevel: { top: number; bottom: number };
  zoneSource: 'orderBlock' | 'fvg';
  paSignal: PriceActionSignal;
  direction: ZoneDirection;
}

/** A swing-low-to-swing-high (or high-to-low) leg used as a Fibonacci dealing range. */
export interface DealingRange {
  /** Index of the swing point that starts the leg. */
  index: number;
  /** Index of the swing point that ends the leg. */
  endIndex: number;
  high: number;
  low: number;
  /** `bullish` = low occurred before high (an up-leg); `bearish` = the reverse. */
  direction: ZoneDirection;
}

/** Premium/discount classification and Optimal Trade Entry (OTE) band for a dealing range. */
export interface PremiumDiscountZone extends DealingRange {
  equilibrium: number;
  /** The 61.8%-79% (configurable) retracement band into the leg, in the direction of a pullback entry. */
  oteZone: { start: number; end: number };
}

export type PriceZoneClassification = 'premium' | 'discount' | 'equilibrium';

/**
 * Higher-timeframe context a consuming project can supply for alignment
 * scoring, computed from its own HTF candles (e.g. run `TradingConcepts` or
 * the standalone detectors on 4H/1D candles and pass the results in here).
 * Every field is optional; the confluence score simply skips HTF alignment
 * bonuses for fields that aren't provided.
 */
export interface HTFContext {
  orderBlocks?: OrderBlock[];
  structure?: StructureSignal[];
  premiumDiscountZones?: PremiumDiscountZone[];
}

export interface ConfluenceScoreBreakdown {
  structure: number;
  liquidity: number;
  zone: number;
  fvg: number;
  session: number;
  priceAction: number;
  htf: number;
}

/** A 0-100 weighted confluence score for one unmitigated order block, per the 7-pillar framework. */
export interface ConfluenceScore {
  zoneIndex: number;
  zoneSource: 'orderBlock';
  direction: ZoneDirection;
  score: number;
  highConviction: boolean;
  breakdown: ConfluenceScoreBreakdown;
}

export interface AnalysisResult {
  swings: SwingPoint[];
  structure: StructureSignal[];
  fvgs: FVG[];
  inverseFvgs: InverseFVG[];
  orderBlocks: OrderBlock[];
  liquidity: LiquidityZone[];
  liquiditySweepScores: LiquiditySweepScore[];
  priceAction: PriceActionSignal[];
  killzones: KillzoneSignal[];
  premiumDiscountZones: PremiumDiscountZone[];
  signals: {
    longs: ConfluenceSignal[];
    shorts: ConfluenceSignal[];
  };
  confluenceScores: ConfluenceScore[];
}
