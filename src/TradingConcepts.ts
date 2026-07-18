/**
 * Main entry point: wires market structure, smart money, liquidity, price
 * action, and killzone detection together behind a single configurable class.
 */

import { createConfig } from './config/merge';
import { DEFAULT_CONFIG } from './config/defaults';
import { TradingConceptsConfig, TradingConceptsConfigOverrides } from './config/types';
import { detectKillzones } from './ict/killzones';
import { findLiquidityZones } from './liquidity';
import { detectStructure, findSwingPoints } from './marketStructure';
import { detectPriceAction } from './priceAction';
import { findFVGs, findOrderBlocks } from './smartMoney';
import {
  AnalysisResult,
  Candle,
  ConfluenceSignal,
  FVG,
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

  /** Runs the full SMC + ICT + price-action analysis. Results are cached until candles/config change. */
  analyze(): AnalysisResult {
    if (this.cache) return this.cache;

    const swings = findSwingPoints(this.candles, this.config.structure.swing.lookback);
    const structure = detectStructure(this.candles, swings);
    const fvgs = this.config.fvg.enabled ? findFVGs(this.candles, this.config.fvg) : [];
    const orderBlocks = this.config.orderBlock.enabled
      ? findOrderBlocks(this.candles, swings, this.config.orderBlock)
      : [];
    const liquidity = this.config.liquidity.enabled ? findLiquidityZones(this.candles, this.config.liquidity) : [];
    const priceAction = this.config.priceAction.enabled ? detectPriceAction(this.candles, this.config.priceAction) : [];
    const killzones = detectKillzones(this.candles, this.config.session);

    const longs = [
      ...this.findConfluence(orderBlocks, priceAction, 'bullish', 'orderBlock'),
      ...this.findConfluence(fvgs, priceAction, 'bullish', 'fvg'),
    ].sort((a, b) => a.zoneIndex - b.zoneIndex);

    const shorts = [
      ...this.findConfluence(orderBlocks, priceAction, 'bearish', 'orderBlock'),
      ...this.findConfluence(fvgs, priceAction, 'bearish', 'fvg'),
    ].sort((a, b) => a.zoneIndex - b.zoneIndex);

    this.cache = {
      swings,
      structure,
      fvgs,
      orderBlocks,
      liquidity,
      priceAction,
      killzones,
      signals: { longs, shorts },
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
