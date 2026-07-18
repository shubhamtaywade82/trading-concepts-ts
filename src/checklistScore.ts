/**
 * The literal 8-point binary confluence checklist: each factor is worth
 * exactly one point (present/absent), independent of the weighted
 * 7-pillar `scoreConfluence` engine. Standalone and not auto-computed by
 * `TradingConcepts.analyze()` — call it yourself with that analysis's output
 * (see README for the full worked example).
 */

import { ChecklistScoreConfig } from './config/types';
import { classifyPrice } from './ict/premiumDiscount';
import {
  BreakerBlock,
  ChecklistScore,
  FVG,
  HTFContext,
  InverseFVG,
  JudasSwingSignal,
  KillzoneSignal,
  LiquidityZone,
  OrderBlock,
  PremiumDiscountZone,
  StructureSignal,
  ZoneDirection,
} from './types';

/**
 * Note: this checklist has no separate "price action" factor (unlike the
 * 7-pillar `scoreConfluence` engine) — the doc it's drawn from covers entry
 * confirmation via factor 7 (LTF structural shift) instead, so `candles` and
 * `priceAction` aren't needed here.
 */
export interface ChecklistScoreInputs {
  orderBlocks: OrderBlock[];
  breakerBlocks: BreakerBlock[];
  structure: StructureSignal[];
  liquidity: LiquidityZone[];
  judasSwings: JudasSwingSignal[];
  fvgs: FVG[];
  inverseFvgs: InverseFVG[];
  killzones: KillzoneSignal[];
  premiumDiscountZones: PremiumDiscountZone[];
}

function withinWindow(index: number, center: number, bars: number): boolean {
  return Math.abs(index - center) <= bars;
}

function mostRecentZone(zones: PremiumDiscountZone[], atIndex: number): PremiumDiscountZone | undefined {
  const relevant = zones.filter((z) => atIndex >= z.index);
  return relevant[relevant.length - 1];
}

// Factor 1: a clear HTF path to liquidity — an unswept HTF pool on the side
// price is being drawn toward (BSL for a bullish setup, SSL for a bearish one).
function hasHtfDrawOnLiquidity(direction: ZoneDirection, htfContext?: HTFContext): boolean {
  if (!htfContext?.liquidity) return false;
  const wantedType = direction === 'bullish' ? 'buyside' : 'sellside';
  return htfContext.liquidity.some((z) => z.type === wantedType && !z.swept);
}

// Factor 2: HTF premium/discount alignment (falls back to the local zones if
// no HTF context is supplied, so the checklist still works single-timeframe).
function hasPremiumDiscountAlignment(
  ob: OrderBlock,
  localZones: PremiumDiscountZone[],
  htfContext?: HTFContext,
): boolean {
  const zones = htfContext?.premiumDiscountZones ?? localZones;
  const zone = mostRecentZone(zones, ob.index);
  if (!zone) return false;

  const midpoint = (ob.top + ob.bottom) / 2;
  const classification = classifyPrice(midpoint, zone);
  return classification === (ob.type === 'bullish' ? 'discount' : 'premium');
}

// Factor 3: the OB itself is unmitigated (guaranteed by the caller) plus a
// supporting FVG/Inverse FVG or Breaker Block nearby confirms POI quality.
function hasPoiQuality(
  ob: OrderBlock,
  fvgs: FVG[],
  inverseFvgs: InverseFVG[],
  breakerBlocks: BreakerBlock[],
  lookaround: number,
): boolean {
  const hasFvg = fvgs.some(
    (f) => f.type === ob.type && !f.mitigated && withinWindow(f.index, ob.index, lookaround),
  );
  if (hasFvg) return true;

  const hasInverse = inverseFvgs.some(
    (f) => f.type === ob.type && withinWindow(f.inversionIndex, ob.index, lookaround),
  );
  if (hasInverse) return true;

  return breakerBlocks.some((b) => b.type === ob.type && withinWindow(b.breakIndex, ob.index, lookaround));
}

// Factor 6: a liquidity sweep (ideally a named Judas Swing) on the opposite
// side, shortly before the POI.
function hasLiquiditySweep(
  ob: OrderBlock,
  liquidity: LiquidityZone[],
  judasSwings: JudasSwingSignal[],
  lookaround: number,
): boolean {
  const hasJudas = judasSwings.some(
    (j) => j.direction === ob.type && withinWindow(j.sweepIndex, ob.index, lookaround * 2),
  );
  if (hasJudas) return true;

  const wantedType = ob.type === 'bullish' ? 'sellside' : 'buyside';
  return liquidity.some(
    (z) =>
      z.type === wantedType &&
      z.swept &&
      z.sweepIndex !== undefined &&
      withinWindow(z.sweepIndex, ob.index, lookaround * 2),
  );
}

// Factor 7: a *structural* shift specifically — CHoCH or MSS, not a plain BOS.
function hasStructuralShift(ob: OrderBlock, structure: StructureSignal[], lookaround: number): boolean {
  return structure.some(
    (s) =>
      s.direction === ob.type &&
      (s.type === 'CHoCH' || s.type === 'MSS') &&
      withinWindow(s.index, ob.index, lookaround),
  );
}

// Factor 8: the POI overlaps the Fibonacci OTE (62%-79%) band of the local dealing range.
function hasOteEntry(ob: OrderBlock, localZones: PremiumDiscountZone[]): boolean {
  const zone = mostRecentZone(localZones, ob.index);
  if (!zone) return false;

  const midpoint = (ob.top + ob.bottom) / 2;
  return midpoint >= zone.oteZone.start && midpoint <= zone.oteZone.end;
}

/**
 * Scores every unmitigated order block against the 8-point binary checklist.
 * `htfContext` is optional; without it, factor 1 (HTF draw on liquidity) is
 * never awarded and factor 2 (premium/discount alignment) falls back to
 * whatever timeframe `inputs.premiumDiscountZones` was computed from.
 */
export function scoreChecklist(
  inputs: ChecklistScoreInputs,
  config: ChecklistScoreConfig,
  htfContext?: HTFContext,
): ChecklistScore[] {
  const {
    orderBlocks,
    breakerBlocks,
    structure,
    liquidity,
    judasSwings,
    fvgs,
    inverseFvgs,
    killzones,
    premiumDiscountZones,
  } = inputs;
  const lookaround = config.lookaroundBars;

  const scores: ChecklistScore[] = [];

  for (const ob of orderBlocks.filter((o) => !o.mitigated)) {
    const breakdown = {
      htfDrawOnLiquidity: hasHtfDrawOnLiquidity(ob.type, htfContext),
      premiumDiscountAlignment: hasPremiumDiscountAlignment(ob, premiumDiscountZones, htfContext),
      poiQuality: hasPoiQuality(ob, fvgs, inverseFvgs, breakerBlocks, lookaround),
      volumeConfirmation: ob.strength >= config.minVolumeStrength,
      killzoneTiming: killzones.some((k) => withinWindow(k.index, ob.index, lookaround)),
      liquiditySweep: hasLiquiditySweep(ob, liquidity, judasSwings, lookaround),
      structuralShift: hasStructuralShift(ob, structure, lookaround),
      oteEntry: hasOteEntry(ob, premiumDiscountZones),
    };

    const points = Object.values(breakdown).filter(Boolean).length;

    scores.push({
      zoneIndex: ob.index,
      direction: ob.type,
      points,
      maxPoints: 8,
      valid: points >= config.validThreshold,
      aPlusSetup: points >= config.aPlusThreshold,
      breakdown,
    });
  }

  return scores.sort((a, b) => a.zoneIndex - b.zoneIndex);
}
