/**
 * Main entry point: wires market structure, smart money, liquidity, price
 * action, killzone, premium/discount, and confluence-scoring detection
 * together behind a single configurable class.
 */

import { createConfig } from './config/merge';
import { DEFAULT_CONFIG } from './config/defaults';
import { TradingConceptsConfig, TradingConceptsConfigOverrides } from './config/types';
import { ConfluenceScoreInputs, scoreConfluence } from './confluenceScore';
import { detectKillzones } from './ict/killzones';
import { computePremiumDiscountZones, findDealingRanges } from './ict/premiumDiscount';
import { findLiquidityZones, scoreLiquiditySweep } from './liquidity';
import { applyMSSClassification, detectStructure, findSwingPoints } from './marketStructure';
import { detectPriceAction } from './priceAction';
import { findFVGs, findInverseFVGs, findOrderBlocks } from './smartMoney';
import {
  AnalysisResult,
  Candle,
  ConfluenceSignal,
  FVG,
  HTFContext,
  OrderBlock,
  PriceActionSignal,
  ZoneDirection,
} from './types';
import { validateCandles } from './utils/candles';

const BULLISH_PA_PATTERNS = new Set(['bullish_engulfing', 'hammer']);
const BEARISH_PA_PATTERNS = new Set(['bearish_engulfing', 'shooting_star']);

export class TradingConcepts {
  private candles: Candle[];
  private config: TradingConceptsConfig;
  private htfContext?: HTFContext;
  private cache: AnalysisResult | null = null;

  constructor(candles: Candle[], configOverrides?: TradingConceptsConfigOverrides) {
    this.candles = validateCandles(candles);
    this.config = createConfig(DEFAULT_CONFIG, configOverrides);
  }

  /** Build an instance from a market preset (see `config/presets.ts`), with optional extra overrides. */
  static withPreset(
    candles: Candle[],
    preset: TradingConceptsConfigOverrides,
    extraOverrides?: TradingConceptsConfigOverrides,
  ): TradingConcepts {
    const instance = new TradingConcepts(candles);
    instance.config = extraOverrides
      ? createConfig(createConfig(DEFAULT_CONFIG, preset), extraOverrides)
      : createConfig(DEFAULT_CONFIG, preset);
    return instance;
  }

  getConfig(): TradingConceptsConfig {
    return this.config;
  }

  /** Fine-tune the config after construction (e.g. per-symbol tick size). Invalidates cached results. */
  updateConfig(overrides: TradingConceptsConfigOverrides): void {
    this.config = createConfig(this.config, overrides);
    this.cache = null;
  }

  setCandles(candles: Candle[]): void {
    this.candles = validateCandles(candles);
    this.cache = null;
  }

  /**
   * Supplies higher-timeframe context (order blocks, structure, and/or
   * premium/discount zones) computed from your own HTF candles — e.g. run a
   * second `TradingConcepts` instance on 4H/1D candles and pass its results
   * in here. Enables the HTF alignment bonus in the confluence score.
   */
  setHTFContext(htfContext: HTFContext | undefined): void {
    this.htfContext = htfContext;
    this.cache = null;
  }

  /** Runs the full SMC + ICT + price-action analysis. Results are cached until candles/config/HTF context change. */
  analyze(): AnalysisResult {
    if (this.cache) return this.cache;

    const swings = findSwingPoints(this.candles, this.config.structure.swing.lookback);
    const rawStructure = detectStructure(this.candles, swings);
    const structure = applyMSSClassification(rawStructure, this.candles, this.config.structure.mss);

    const fvgs = this.config.fvg.enabled ? findFVGs(this.candles, this.config.fvg) : [];
    const inverseFvgs =
      this.config.fvg.enabled && this.config.fvg.inverse.enabled ? findInverseFVGs(this.candles, fvgs) : [];

    const orderBlocks = this.config.orderBlock.enabled
      ? findOrderBlocks(this.candles, swings, this.config.orderBlock)
      : [];

    const liquidity = this.config.liquidity.enabled
      ? findLiquidityZones(this.candles, this.config.liquidity)
      : [];

    const priceAction = this.config.priceAction.enabled
      ? detectPriceAction(this.candles, this.config.priceAction)
      : [];

    const killzones = detectKillzones(this.candles, this.config.session);

    const premiumDiscountZones = this.config.premiumDiscount.enabled
      ? computePremiumDiscountZones(findDealingRanges(swings), this.config.premiumDiscount)
      : [];

    const liquiditySweepScores = this.config.liquidity.sweepScore.enabled
      ? liquidity
          .map((zone) => scoreLiquiditySweep(this.candles, zone, killzones, this.config.liquidity.sweepScore))
          .filter((score): score is NonNullable<typeof score> => score !== null)
      : [];

    const longs = [
      ...this.findConfluence(orderBlocks, priceAction, 'bullish', 'orderBlock'),
      ...this.findConfluence(fvgs, priceAction, 'bullish', 'fvg'),
    ].sort((a, b) => a.zoneIndex - b.zoneIndex);

    const shorts = [
      ...this.findConfluence(orderBlocks, priceAction, 'bearish', 'orderBlock'),
      ...this.findConfluence(fvgs, priceAction, 'bearish', 'fvg'),
    ].sort((a, b) => a.zoneIndex - b.zoneIndex);

    const confluenceInputs: ConfluenceScoreInputs = {
      candles: this.candles,
      orderBlocks,
      structure,
      liquidity,
      fvgs,
      inverseFvgs,
      priceAction,
      killzones,
      premiumDiscountZones,
    };
    const confluenceScores = scoreConfluence(
      confluenceInputs,
      this.config.confluenceScore,
      this.config.liquidity.sweepScore,
      this.htfContext,
    );

    this.cache = {
      swings,
      structure,
      fvgs,
      inverseFvgs,
      orderBlocks,
      liquidity,
      liquiditySweepScores,
      priceAction,
      killzones,
      premiumDiscountZones,
      signals: { longs, shorts },
      confluenceScores,
    };

    return this.cache;
  }

  private findConfluence(
    zones: Array<OrderBlock | FVG>,
    priceAction: PriceActionSignal[],
    direction: ZoneDirection,
    source: 'orderBlock' | 'fvg',
  ): ConfluenceSignal[] {
    const confluences: ConfluenceSignal[] = [];
    const matchingPatterns = direction === 'bullish' ? BULLISH_PA_PATTERNS : BEARISH_PA_PATTERNS;
    const relevantZones = zones.filter((z) => !z.mitigated && z.type === direction);
    const maxBars = this.config.confluence.maxBarsAfterZone;

    for (const zone of relevantZones) {
      const match = priceAction.find(
        (signal) =>
          signal.index >= zone.index &&
          signal.index <= zone.index + maxBars &&
          matchingPatterns.has(signal.pattern),
      );

      if (match) {
        confluences.push({
          zoneIndex: zone.index,
          zoneLevel: { top: zone.top, bottom: zone.bottom },
          zoneSource: source,
          paSignal: match,
          direction,
        });
      }
    }

    return confluences;
  }
}
