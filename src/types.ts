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

/**
 * An Order Block that price has closed all the way through, flipping its
 * role: a bullish OB (former support) that's decisively closed below acts as
 * bearish resistance going forward, and vice versa. `type` reflects the
 * *new* (post-break) direction; `originalType` records what it was before.
 * This is a stronger condition than `OrderBlock.mitigated` (a wick touching
 * the near edge) — a breaker requires a close beyond the *far* edge.
 */
export interface BreakerBlock {
  index: number;
  time: number;
  type: ZoneDirection;
  originalType: ZoneDirection;
  top: number;
  bottom: number;
  breakIndex: number;
  breakTime: number;
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

/**
 * A liquidity sweep that resolved as a reversal within the opening window of
 * a kill zone — a false move ("Judas Swing") designed to trap breakout
 * traders before the real directional move. `direction` is the direction of
 * the expected reversal (a sellside sweep implies a bullish reversal).
 */
export interface JudasSwingSignal {
  zoneIndex: number;
  sweepIndex: number;
  time: number;
  session: string;
  direction: ZoneDirection;
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
  /** Unswept HTF liquidity pools, used for the checklist score's "draw on liquidity" factor. */
  liquidity?: LiquidityZone[];
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

/**
 * The literal 8-point binary checklist: each factor is worth exactly one
 * point (true/false), independent of the weighted `ConfluenceScore` engine.
 * See `scoreChecklist`.
 */
export interface ChecklistBreakdown {
  htfDrawOnLiquidity: boolean;
  premiumDiscountAlignment: boolean;
  poiQuality: boolean;
  volumeConfirmation: boolean;
  killzoneTiming: boolean;
  liquiditySweep: boolean;
  structuralShift: boolean;
  oteEntry: boolean;
}

export interface ChecklistScore {
  zoneIndex: number;
  direction: ZoneDirection;
  points: number;
  maxPoints: number;
  /** `points >= config.validThreshold` (default 6/8). */
  valid: boolean;
  /** `points >= config.aPlusThreshold` (default 8/8). */
  aPlusSetup: boolean;
  breakdown: ChecklistBreakdown;
}

export interface AnalysisResult {
  swings: SwingPoint[];
  structure: StructureSignal[];
  fvgs: FVG[];
  inverseFvgs: InverseFVG[];
  orderBlocks: OrderBlock[];
  breakerBlocks: BreakerBlock[];
  liquidity: LiquidityZone[];
  liquiditySweepScores: LiquiditySweepScore[];
  judasSwings: JudasSwingSignal[];
  priceAction: PriceActionSignal[];
  killzones: KillzoneSignal[];
  premiumDiscountZones: PremiumDiscountZone[];
  signals: {
    longs: ConfluenceSignal[];
    shorts: ConfluenceSignal[];
  };
  confluenceScores: ConfluenceScore[];
}

/**
 * Indicator utilities below (ATR, Keltner, Bollinger/TTM squeeze, VWAP,
 * Volume Profile, and the OI/funding-rate extension) are standalone — they
 * are not part of `AnalysisResult` or either scoring engine. Compose them
 * yourself; see the README's indicator stack section.
 */

/** A single band-indicator reading (Keltner Channel or Bollinger Bands). */
export interface BandValue {
  middle: number;
  upper: number;
  lower: number;
}

export type VolumeNodeClassification = 'hvn' | 'lvn' | 'neutral';

export interface VolumeProfileBin {
  priceLow: number;
  priceHigh: number;
  volume: number;
  classification: VolumeNodeClassification;
}

export interface VolumeProfile {
  bins: VolumeProfileBin[];
  pointOfControl: VolumeProfileBin;
  highVolumeNodes: VolumeProfileBin[];
  lowVolumeNodes: VolumeProfileBin[];
}

/**
 * Open Interest / funding rate for one point in time, supplied by a
 * consuming project from its own exchange/derivatives feed — this library
 * cannot derive either from OHLCV candles. Both fields are optional so you
 * can supply just the one you have.
 */
export interface DerivativesDataPoint {
  time: number;
  openInterest?: number;
  fundingRate?: number;
}

export interface OpenInterestConfirmation {
  signalIndex: number;
  expectedDirection: 'increase' | 'decrease';
  /** `null` when there isn't enough surrounding OI data to compute a change. */
  actualChangePercent: number | null;
  confirmed: boolean;
}

/** Which side is crowded, per funding-rate sign/magnitude — the crowded side is the one more likely to get swept. */
export type FundingSkew = 'longs_crowded' | 'shorts_crowded' | 'neutral';
