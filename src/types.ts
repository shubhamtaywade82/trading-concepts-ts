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

export interface LiquidityZone {
  index: number;
  time: number;
  type: LiquidityType;
  level: number;
  swept: boolean;
  sweepIndex?: number;
}

export type StructureType = 'BOS' | 'CHoCH';

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
}

export interface KillzoneSignal {
  index: number;
  time: number;
  session: string;
}

export interface ConfluenceSignal {
  zoneIndex: number;
  zoneLevel: { top: number; bottom: number };
  zoneSource: 'orderBlock' | 'fvg';
  paSignal: PriceActionSignal;
  direction: ZoneDirection;
}

export interface AnalysisResult {
  swings: SwingPoint[];
  structure: StructureSignal[];
  fvgs: FVG[];
  orderBlocks: OrderBlock[];
  liquidity: LiquidityZone[];
  priceAction: PriceActionSignal[];
  killzones: KillzoneSignal[];
  signals: {
    longs: ConfluenceSignal[];
    shorts: ConfluenceSignal[];
  };
}
