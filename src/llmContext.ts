/**
 * Semantic data translation for LLM-based reasoning systems: formats
 * already-computed/selected analysis pieces into the structured JSON shape
 * an LLM (or any downstream consumer) can read as market narrative, instead
 * of raw arrays of zones and signals.
 *
 * This is a pure formatter — it does not decide which order block is "the"
 * MTF POI or which sweep is "the" LTF trigger; you select those (the same
 * way `examples/killzone-polarity-shift.ts` and
 * `examples/htf-accumulation-expansion.ts` do) and hand them in. Building
 * the actual reasoning/agent layer on top (LLM API calls, prompt
 * orchestration, RAG, execution) is a separate concern for a consuming
 * application — see the README.
 */

import {
  Candle,
  ChecklistScore,
  ConfluenceScore,
  LiquidityZone,
  LLMContext,
  OrderBlock,
  PremiumDiscountZone,
  StructureSignal,
  VolumeProfile,
  VolumeProfileBin,
  ZoneDirection,
} from './types';
import { classifyPrice } from './ict/premiumDiscount';

export interface LLMHTFContextInput {
  timeframe: string;
  trend: ZoneDirection | 'neutral';
  /** The unswept liquidity pool price is being drawn toward. */
  drawOnLiquidity?: LiquidityZone;
  premiumDiscountZone?: PremiumDiscountZone;
  /** Needed to classify premium/discount and to pick the nearest volume node. */
  currentPrice?: number;
  volumeProfile?: VolumeProfile;
  /** Decimal places used when formatting prices in the output text. */
  pricePrecision?: number;
}

export interface LLMMtfPoiInput {
  timeframe: string;
  orderBlock: OrderBlock;
  /** Override the auto-generated volume confirmation text (derived from `orderBlock.strength` otherwise). */
  volumeConfirmationNote?: string;
  pricePrecision?: number;
}

export interface LLMLtfTriggerInput {
  timeframe: string;
  sweptZone: LiquidityZone;
  structureShift?: StructureSignal;
  /** The candle at `sweptZone.sweepIndex`, used to derive a CVD note from `Candle.delta` when present. */
  sweepCandle?: Candle;
  /** Override the auto-generated CVD note. */
  cvdNote?: string;
  pricePrecision?: number;
}

export interface LLMContextInput {
  symbol?: string;
  /** Epoch ms; defaults to now. */
  timestamp?: number;
  htf: LLMHTFContextInput;
  mtfPoi?: LLMMtfPoiInput;
  ltfTrigger?: LLMLtfTriggerInput;
  confluenceScore?: ConfluenceScore;
  checklistScore?: ChecklistScore;
}

function formatPrice(value: number, precision = 2): string {
  return value.toFixed(precision);
}

function findNearestBin(bins: VolumeProfileBin[], price: number): VolumeProfileBin | undefined {
  return bins.reduce<VolumeProfileBin | undefined>((nearest, bin) => {
    const binMid = (bin.priceLow + bin.priceHigh) / 2;
    if (!nearest) return bin;
    const nearestMid = (nearest.priceLow + nearest.priceHigh) / 2;
    return Math.abs(binMid - price) < Math.abs(nearestMid - price) ? bin : nearest;
  }, undefined);
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describeDrawOnLiquidity(zone: LiquidityZone | undefined, precision: number): string {
  if (!zone) return 'No unswept liquidity identified';
  const side = zone.type === 'buyside' ? 'Buy-side' : 'Sell-side';
  return `${side} liquidity at ${formatPrice(zone.level, precision)}`;
}

function describePremiumDiscount(
  zone: PremiumDiscountZone | undefined,
  currentPrice: number | undefined,
  precision: number,
): string {
  if (!zone) return 'No dealing range identified';
  const classification = currentPrice !== undefined ? classifyPrice(currentPrice, zone) : null;
  const label = classification ? `${capitalize(classification)} zone` : 'Dealing range';
  return (
    `${label} (equilibrium ${formatPrice(zone.equilibrium, precision)}, ` +
    `OTE ${formatPrice(zone.oteZone.start, precision)}-${formatPrice(zone.oteZone.end, precision)})`
  );
}

function describeVolumeProfile(
  profile: VolumeProfile | undefined,
  currentPrice: number | undefined,
  precision: number,
): string | undefined {
  if (!profile || currentPrice === undefined) return undefined;
  const nearestHvn = findNearestBin(profile.highVolumeNodes, currentPrice);
  if (!nearestHvn) return undefined;
  return `High Volume Node at ${formatPrice(nearestHvn.priceLow, precision)}-${formatPrice(nearestHvn.priceHigh, precision)}`;
}

function describeMtfPoi(input: LLMMtfPoiInput | undefined): LLMContext['mtf_poi'] {
  if (!input) return null;
  const { orderBlock, pricePrecision = 2 } = input;

  return {
    timeframe: input.timeframe,
    zone_type: `${capitalize(orderBlock.type)} Order Block`,
    zone_range: `${formatPrice(orderBlock.bottom, pricePrecision)} - ${formatPrice(orderBlock.top, pricePrecision)}`,
    status: orderBlock.mitigated ? 'Mitigated' : 'Unmitigated',
    volume_confirmation:
      input.volumeConfirmationNote ??
      `Volume at formation was ${orderBlock.strength.toFixed(1)}x the recent average`,
  };
}

function describeCvdReaction(input: LLMLtfTriggerInput): string | undefined {
  if (input.cvdNote) return input.cvdNote;
  const delta = input.sweepCandle?.delta;
  if (typeof delta !== 'number') return undefined;
  return `Order-flow delta ${delta >= 0 ? '+' : ''}${delta} (net ${delta >= 0 ? 'buying' : 'selling'})`;
}

function describeLtfTrigger(input: LLMLtfTriggerInput | undefined): LLMContext['ltf_trigger'] {
  if (!input) return null;
  const { sweptZone, structureShift, pricePrecision = 2 } = input;
  const sweptSide = sweptZone.type === 'sellside' ? 'Sell-side' : 'Buy-side';
  const reclaimSide = sweptZone.type === 'sellside' ? 'above' : 'below';

  return {
    timeframe: input.timeframe,
    event: 'Liquidity Sweep',
    swept_level: `${sweptSide} liquidity at ${formatPrice(sweptZone.level, pricePrecision)}`,
    reclaim:
      sweptZone.sweepType === 'reversal'
        ? `Price closed back ${reclaimSide} ${formatPrice(sweptZone.level, pricePrecision)}`
        : 'Price closed beyond the level (no reclaim)',
    cvd_reaction: describeCvdReaction(input),
    structure_shift: structureShift
      ? `${input.timeframe} ${structureShift.type} confirmed, breaking ${formatPrice(structureShift.level, pricePrecision)}`
      : 'No structure shift yet',
  };
}

/** Builds the semantic JSON payload from already-selected analysis pieces. See the module docstring. */
export function buildLLMContext(input: LLMContextInput): LLMContext {
  const precision = input.htf.pricePrecision ?? 2;

  return {
    symbol: input.symbol,
    timestamp: new Date(input.timestamp ?? Date.now()).toISOString(),
    htf_context: {
      timeframe: input.htf.timeframe,
      trend: capitalize(input.htf.trend),
      draw_on_liquidity: describeDrawOnLiquidity(input.htf.drawOnLiquidity, precision),
      premium_discount: describePremiumDiscount(
        input.htf.premiumDiscountZone,
        input.htf.currentPrice,
        precision,
      ),
      volume_profile: describeVolumeProfile(input.htf.volumeProfile, input.htf.currentPrice, precision),
    },
    mtf_poi: describeMtfPoi(input.mtfPoi),
    ltf_trigger: describeLtfTrigger(input.ltfTrigger),
    confluence: input.confluenceScore
      ? {
          score: input.confluenceScore.score,
          highConviction: input.confluenceScore.highConviction,
          breakdown: input.confluenceScore.breakdown,
        }
      : undefined,
    checklist: input.checklistScore
      ? {
          points: input.checklistScore.points,
          maxPoints: input.checklistScore.maxPoints,
          valid: input.checklistScore.valid,
          aPlusSetup: input.checklistScore.aPlusSetup,
          breakdown: input.checklistScore.breakdown,
        }
      : undefined,
  };
}

/**
 * One reasonable heuristic for deriving an overall trend label from
 * structure signals: the direction of the most recent signal. Not the only
 * valid way to define "trend" — pass your own `trend` to `buildLLMContext`
 * if your strategy defines it differently (e.g. majority of the last N
 * signals, or an HTF moving-average slope).
 */
export function deriveTrendFromStructure(structure: StructureSignal[]): ZoneDirection | 'neutral' {
  const latest = structure[structure.length - 1];
  return latest ? latest.direction : 'neutral';
}
