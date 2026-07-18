/**
 * The 7-pillar confluence scoring engine: for every unmitigated order block,
 * combines market structure, liquidity, premium/discount positioning, fair
 * value gaps, session timing, and price action into a single 0-100 score,
 * with an optional higher-timeframe alignment bonus.
 */

import { ConfluenceScoreConfig, LiquiditySweepScoreConfig } from './config/types';
import { classifyPrice } from './ict/premiumDiscount';
import { scoreLiquiditySweep } from './liquidity';
import {
  Candle,
  ConfluenceScore,
  FVG,
  HTFContext,
  InverseFVG,
  KillzoneSignal,
  LiquidityZone,
  OrderBlock,
  PremiumDiscountZone,
  PriceActionSignal,
  StructureSignal,
  ZoneDirection,
} from './types';

const BULLISH_PA_PATTERNS = new Set(['bullish_engulfing', 'hammer']);
const BEARISH_PA_PATTERNS = new Set(['bearish_engulfing', 'shooting_star']);

export interface ConfluenceScoreInputs {
  candles: Candle[];
  orderBlocks: OrderBlock[];
  structure: StructureSignal[];
  liquidity: LiquidityZone[];
  fvgs: FVG[];
  inverseFvgs: InverseFVG[];
  priceAction: PriceActionSignal[];
  killzones: KillzoneSignal[];
  premiumDiscountZones: PremiumDiscountZone[];
}

function withinWindow(index: number, center: number, bars: number): boolean {
  return Math.abs(index - center) <= bars;
}

function scoreStructure(ob: OrderBlock, structure: StructureSignal[], lookaround: number): number {
  const match = structure.find((s) => s.direction === ob.type && withinWindow(s.index, ob.index, lookaround));
  if (!match) return 0;
  if (match.type === 'MSS') return 100;
  if (match.type === 'CHoCH') return 80;
  return 60;
}

function scoreLiquidityPillar(
  ob: OrderBlock,
  liquidity: LiquidityZone[],
  killzones: KillzoneSignal[],
  candles: Candle[],
  liquiditySweepScoreConfig: LiquiditySweepScoreConfig,
  lookaround: number,
): number {
  // A bullish OB is confirmed by sellside liquidity being swept beforehand
  // (a low stop-hunt before reversing up), and vice versa for bearish.
  const wantedType = ob.type === 'bullish' ? 'sellside' : 'buyside';
  const candidates = liquidity.filter(
    (z) =>
      z.type === wantedType &&
      z.swept &&
      z.sweepIndex !== undefined &&
      withinWindow(z.sweepIndex, ob.index, lookaround * 2),
  );
  if (candidates.length === 0) return 0;

  let best = 0;
  for (const zone of candidates) {
    const sweepScore = scoreLiquiditySweep(candles, zone, killzones, liquiditySweepScoreConfig);
    const score = sweepScore ? sweepScore.score : zone.sweepType === 'reversal' ? 70 : 40;
    if (score > best) best = score;
  }
  return best;
}

function scoreZone(ob: OrderBlock, zones: PremiumDiscountZone[]): number {
  const relevantZones = zones.filter((z) => ob.index >= z.index);
  const zone = relevantZones[relevantZones.length - 1];
  if (!zone) return 0;

  const midpoint = (ob.top + ob.bottom) / 2;
  const inOte = midpoint >= zone.oteZone.start && midpoint <= zone.oteZone.end;
  if (inOte) return 100;

  const classification = classifyPrice(midpoint, zone);
  const wantedClassification = ob.type === 'bullish' ? 'discount' : 'premium';
  if (classification === wantedClassification) return 60;
  if (classification === 'equilibrium') return 40;
  return 0;
}

function scoreFvgPillar(ob: OrderBlock, fvgs: FVG[], inverseFvgs: InverseFVG[], lookaround: number): number {
  const hasFvg = fvgs.some(
    (f) => f.type === ob.type && !f.mitigated && withinWindow(f.index, ob.index, lookaround),
  );
  if (hasFvg) return 100;

  const hasInverse = inverseFvgs.some(
    (f) => f.type === ob.type && withinWindow(f.inversionIndex, ob.index, lookaround),
  );
  return hasInverse ? 80 : 0;
}

function scoreSession(ob: OrderBlock, killzones: KillzoneSignal[], lookaround: number): number {
  const nearby = killzones.filter((k) => withinWindow(k.index, ob.index, lookaround));
  if (nearby.length === 0) return 0;
  return Math.max(...nearby.map((k) => k.weight)) * 100;
}

function scorePriceAction(ob: OrderBlock, priceAction: PriceActionSignal[], lookaround: number): number {
  const patterns = ob.type === 'bullish' ? BULLISH_PA_PATTERNS : BEARISH_PA_PATTERNS;
  const hasMatch = priceAction.some(
    (pa) => patterns.has(pa.pattern) && pa.index >= ob.index && pa.index <= ob.index + lookaround,
  );
  return hasMatch ? 100 : 0;
}

function scoreHTF(ob: OrderBlock, direction: ZoneDirection, htfContext?: HTFContext): number {
  if (!htfContext) return 0;

  const obAligned = htfContext.orderBlocks?.some(
    (htfOb) => htfOb.type === direction && htfOb.top >= ob.bottom && htfOb.bottom <= ob.top,
  );
  if (obAligned) return 100;

  const structureAligned = htfContext.structure?.some((s) => s.direction === direction);
  if (structureAligned) return 70;

  const zoneAligned = htfContext.premiumDiscountZones?.some((zone) => {
    const midpoint = (ob.top + ob.bottom) / 2;
    const classification = classifyPrice(midpoint, zone);
    return classification === (direction === 'bullish' ? 'discount' : 'premium');
  });
  if (zoneAligned) return 60;

  return 0;
}

/**
 * Scores every unmitigated order block against the 7-pillar confluence
 * framework. `htfContext` is optional — supply it (computed from your own
 * higher-timeframe candles) to enable the HTF alignment bonus; without it,
 * the score is out of the 90 points the other six pillars carry.
 */
export function scoreConfluence(
  inputs: ConfluenceScoreInputs,
  config: ConfluenceScoreConfig,
  liquiditySweepScoreConfig: LiquiditySweepScoreConfig,
  htfContext?: HTFContext,
): ConfluenceScore[] {
  if (!config.enabled) return [];

  const {
    candles,
    orderBlocks,
    structure,
    liquidity,
    fvgs,
    inverseFvgs,
    priceAction,
    killzones,
    premiumDiscountZones,
  } = inputs;
  const lookaround = config.lookaroundBars;
  const weights = config.weights;

  const scores: ConfluenceScore[] = [];

  for (const ob of orderBlocks.filter((o) => !o.mitigated)) {
    const structureScore = scoreStructure(ob, structure, lookaround);
    const liquidityScore = scoreLiquidityPillar(
      ob,
      liquidity,
      killzones,
      candles,
      liquiditySweepScoreConfig,
      lookaround,
    );
    const zoneScore = scoreZone(ob, premiumDiscountZones);
    const fvgScore = scoreFvgPillar(ob, fvgs, inverseFvgs, lookaround);
    const sessionScore = scoreSession(ob, killzones, lookaround);
    const priceActionScore = scorePriceAction(ob, priceAction, lookaround);
    const htfScore = scoreHTF(ob, ob.type, htfContext);

    const breakdown = {
      structure: Math.round(structureScore),
      liquidity: Math.round(liquidityScore),
      zone: Math.round(zoneScore),
      fvg: Math.round(fvgScore),
      session: Math.round(sessionScore),
      priceAction: Math.round(priceActionScore),
      htf: Math.round(htfScore),
    };

    const score =
      (structureScore / 100) * weights.structure +
      (liquidityScore / 100) * weights.liquidity +
      (zoneScore / 100) * weights.zone +
      (fvgScore / 100) * weights.fvg +
      (sessionScore / 100) * weights.session +
      (priceActionScore / 100) * weights.priceAction +
      (htfScore / 100) * weights.htf;

    scores.push({
      zoneIndex: ob.index,
      zoneSource: 'orderBlock',
      direction: ob.type,
      score: Math.round(score),
      highConviction: score >= config.highConvictionThreshold,
      breakdown,
    });
  }

  return scores.sort((a, b) => a.zoneIndex - b.zoneIndex);
}
