# trading-concepts-ts

A framework-agnostic TypeScript library that unifies **Smart Money Concepts (SMC)**,
**ICT (Inner Circle Trader)**, and classic **Price Action** into one configurable
analysis engine.

Works in Node.js trading bots, browser-based charting tools, and backtesting
engines. Ships as both ESM and CommonJS with full type declarations, so it
drops straight into any TypeScript or JavaScript project as a dependency or
git submodule/plugin.

## Features

- **Market structure** — swing highs/lows, Break of Structure (BOS), Change of
  Character (CHoCH)
- **Smart money zones** — Fair Value Gaps (FVG) and Order Blocks, both with
  mitigation tracking
- **Liquidity** — equal highs/lows (resting liquidity pools) and sweep detection
- **Price action** — engulfing candles, hammers, shooting stars
- **ICT killzones** — configurable session windows (Asian/London/New York/...),
  fine-tunable to any exchange's local time
- **Confluence engine** — automatically pairs unmitigated SMC zones with
  matching price-action signals into long/short setups
- **Fully fine-tunable** — one config object controls every detector; ships
  with ready-made presets for crypto, forex, and equity/index markets, and
  supports layering your own overrides per exchange, market, or symbol

## Install

This package isn't published to npm yet. Use it directly from the repo:

```bash
npm install github:shubhamtaywade82/trading-concepts-ts
# or, if you've cloned it locally:
npm install /path/to/trading-concepts-ts
```

Once published, it would be a normal:

```bash
npm install trading-concepts-ts
```

## Quick start

```typescript
import { TradingConcepts, Candle } from 'trading-concepts-ts';

const candles: Candle[] = await fetchCandlesFromYourExchange();

const analyzer = new TradingConcepts(candles);
const analysis = analyzer.analyze();

console.log(`Structure signals: ${analysis.structure.length}`);
console.log(`Unmitigated FVGs: ${analysis.fvgs.filter((f) => !f.mitigated).length}`);
console.log(`High-probability longs: ${analysis.signals.longs.length}`);

const latest = analysis.structure.at(-1);
if (latest?.type === 'CHoCH' && latest.direction === 'bullish') {
  const nearestOB = analysis.orderBlocks
    .filter((ob) => ob.type === 'bullish' && !ob.mitigated && ob.index < latest.index)
    .pop();

  if (nearestOB) {
    console.log(`Entry zone: ${nearestOB.bottom} - ${nearestOB.top}`);
  }
}
```

## Fine-tuning for an exchange, market, or symbol

Every detector reads from a single `TradingConceptsConfig`. Instead of hunting
through the code, you fine-tune behavior by passing config overrides — merged
deeply on top of sensible defaults (`DEFAULT_CONFIG`) or a market preset.

### Using a built-in preset

```typescript
import { TradingConcepts, CRYPTO_PRESET, FOREX_PRESET, NSE_INDEX_PRESET, US_EQUITY_PRESET } from 'trading-concepts-ts';

// 24/7 crypto perp, no fixed sessions, then fine-tuned per symbol
const btc = TradingConcepts.withPreset(candles, CRYPTO_PRESET, {
  precision: 2,
  orderBlock: { volumeLookback: 30 },
});

// Spot FX with ICT killzones (Asian/London/NY/London Close) turned on
const eurusd = TradingConcepts.withPreset(fxCandles, FOREX_PRESET);

// NSE index (IST session hours, volume-gated order blocks)
const nifty = TradingConcepts.withPreset(indexCandles, NSE_INDEX_PRESET);
```

Presets live in `src/config/presets.ts`: `CRYPTO_PRESET`, `FOREX_PRESET`,
`FOREX_JPY_PRESET`, `NSE_INDEX_PRESET`, `US_EQUITY_PRESET`. They're plain
overrides objects — read them for a template when building your own.

### Building a config from scratch

```typescript
import { TradingConcepts, DEFAULT_CONFIG, createConfig } from 'trading-concepts-ts';

const config = createConfig(DEFAULT_CONFIG, {
  precision: 2,
  structure: { swing: { lookback: 8 } }, // require wider confirmation for swing points
  fvg: { minGapPercent: 0.05 }, // ignore gaps smaller than 0.05% of price
  liquidity: { equalTolerancePercent: 0.03 }, // tighter grouping for a high-priced symbol
  orderBlock: { requireVolume: true, minVolumeStrength: 1.5 },
  session: {
    enabled: true,
    timezoneOffsetMinutes: 330, // shift candle UTC time to the exchange's local clock (IST here)
    killzones: [{ name: 'Opening', startUtcMinute: 555, endUtcMinute: 615 }],
  },
});

const analyzer = new TradingConcepts(candles, config);
```

### Re-tuning an existing instance

```typescript
const analyzer = new TradingConcepts(candles);
analyzer.updateConfig({ liquidity: { equalTolerancePercent: 0.2 } }); // e.g. switching symbols
analyzer.setCandles(newCandles); // e.g. a fresh page of history
```

Both calls invalidate the internal cache so the next `.analyze()` recomputes
from scratch; nothing recomputes until you call `.analyze()`.

See `src/config/types.ts` for the full list of tunable fields, and
`examples/` for three complete, runnable setups (crypto, forex, NSE index).

## API

```typescript
class TradingConcepts {
  constructor(candles: Candle[], configOverrides?: TradingConceptsConfigOverrides);
  static withPreset(candles: Candle[], preset: TradingConceptsConfigOverrides, extraOverrides?: TradingConceptsConfigOverrides): TradingConcepts;

  getConfig(): TradingConceptsConfig;
  updateConfig(overrides: TradingConceptsConfigOverrides): void;
  setCandles(candles: Candle[]): void;
  analyze(): AnalysisResult;
}
```

`AnalysisResult` contains `swings`, `structure`, `fvgs`, `orderBlocks`,
`liquidity`, `priceAction`, `killzones`, and `signals: { longs, shorts }`
(confluence between unmitigated zones and matching price action, within
`config.confluence.maxBarsAfterZone` bars).

Every detector is also exported standalone for tree-shaken, à la carte usage:

```typescript
import { findSwingPoints, detectStructure, findFVGs, findOrderBlocks, findLiquidityZones, detectPriceAction, detectKillzones } from 'trading-concepts-ts';
```

## Using it as an external library / plugin

- **npm dependency**: point `package.json` at this repo (`github:owner/repo`)
  or a built tarball (`npm pack` then `npm install ./trading-concepts-ts-*.tgz`).
- **Monorepo package**: drop the repo into `packages/trading-concepts-ts` and
  reference it via your workspace tooling (npm/yarn/pnpm workspaces, Turborepo).
- **Charting plugin**: import the standalone detector functions and feed their
  output into your charting library's drawing/annotation layer — none of the
  detectors depend on a DOM or Node API, so they run identically in a browser
  bundle.
- **Backtester**: call `.analyze()` on each expanding window of candles (or
  recompute incrementally) to drive strategy logic; `updateConfig`/`setCandles`
  are built for exactly that loop.

## Development

```bash
npm install
npm run build       # emits dist/ (ESM + CJS + .d.ts) via tsup
npm test            # vitest
npm run typecheck
npm run lint
npm run example:crypto   # or example:forex / example:index
```

## Project layout

```
src/
  types.ts              shared data structures (Candle, SwingPoint, FVG, ...)
  config/                config types, defaults, market presets, deep-merge helper
  marketStructure.ts     swing points, BOS/CHoCH
  smartMoney.ts           order blocks, fair value gaps
  liquidity.ts            equal highs/lows, sweeps
  priceAction.ts          candlestick patterns
  ict/killzones.ts        session/killzone tagging
  TradingConcepts.ts      main class: wiring + confluence engine
  index.ts                public exports
test/                    vitest unit tests per module
examples/                runnable fine-tuning examples (crypto/forex/index)
```

## Disclaimer

This library implements pattern-detection heuristics for educational and
research purposes. It does not constitute financial advice, and none of the
signals it produces are a guarantee of future performance. Always validate
against your own risk management before trading with real capital.

## License

MIT — see [LICENSE](./LICENSE).
