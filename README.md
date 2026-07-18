# trading-concepts-ts

[![CI](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/ci.yml)
[![CodeQL](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/codeql.yml/badge.svg)](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/codeql.yml)
[![Security](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/security.yml/badge.svg)](https://github.com/shubhamtaywade82/trading-concepts-ts/actions/workflows/security.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

A framework-agnostic TypeScript library that unifies **Smart Money Concepts (SMC)**,
**ICT (Inner Circle Trader)**, and classic **Price Action** into one configurable
analysis engine.

Works in Node.js trading bots, browser-based charting tools, and backtesting
engines. Ships as both ESM and CommonJS with full type declarations, so it
drops straight into any TypeScript or JavaScript project as a dependency or
git submodule/plugin.

## Features

- **Market structure** — swing highs/lows, Break of Structure (BOS), Change of
  Character (CHoCH), and displacement-confirmed Market Structure Shift (MSS)
- **Smart money zones** — Fair Value Gaps (FVG) and Order Blocks with
  mitigation tracking, plus Inverse FVG (IFVG) detection for gaps that flip
  polarity once price closes through them
- **Liquidity** — equal highs/lows (resting liquidity pools), sweep detection
  classified as reversal (stop hunt) vs. breakthrough, and a 0-100 sweep
  quality score
- **Premium/discount & OTE zones** — Fibonacci equilibrium and Optimal Trade
  Entry (61.8%-79%) bands over swing-to-swing dealing ranges
- **Price action** — engulfing candles, hammers, shooting stars
- **ICT killzones** — configurable, weighted session windows (Asian/London/New
  York/London Close, plus a Silver Bullet preset), fine-tunable to any
  exchange's local time
- **7-pillar confluence engine** — a weighted 0-100 score per unmitigated order
  block combining structure, liquidity, zone positioning, FVGs, session
  timing, and price action, with an optional higher-timeframe alignment bonus;
  plus the original simple long/short pairing for lighter use cases
- **Fully fine-tunable** — one config object controls every detector; ships
  with ready-made presets for crypto, forex, and equity/index markets, and
  supports layering your own overrides per exchange, market, or symbol
- **Extensible with your own data** — optional `Candle.delta` (order-flow/CVD)
  and an `HTFContext` interface let a consuming project feed in data this
  library can't derive from OHLCV alone (see
  [Supplying data this library can't compute](#supplying-data-this-library-cant-compute))

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
import {
  TradingConcepts,
  CRYPTO_PRESET,
  FOREX_PRESET,
  NSE_INDEX_PRESET,
  US_EQUITY_PRESET,
} from 'trading-concepts-ts';

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
`examples/` for four complete, runnable setups (crypto, forex, NSE index,
backtest).

## The 7-pillar confluence framework

`analyze()` scores every **unmitigated order block** against the framework
below and returns the results in `confluenceScores` (`config.confluenceScore`).
Six pillars sum to 90 points; a seventh (higher-timeframe alignment) adds up
to 10 more when you supply `HTFContext`, so the max score is 90 without it and
100 with it.

| Pillar       | Weight | What raises it                                                                  |
| ------------ | -----: | ------------------------------------------------------------------------------- |
| Structure    |     20 | A BOS/CHoCH/MSS in the same direction nearby (MSS scores higher than CHoCH/BOS) |
| Liquidity    |     15 | An opposite-side liquidity sweep nearby, scored by `scoreLiquiditySweep`        |
| Zone         |     20 | The order block sits in discount (longs) / premium (shorts), or in the OTE band |
| FVG          |     15 | An unmitigated same-direction FVG or Inverse FVG nearby                         |
| Session      |     10 | The order block formed inside a (weighted) kill zone                            |
| Price action |     10 | A matching engulfing/hammer/shooting-star candle nearby                         |
| HTF (bonus)  |     10 | Optional — see below                                                            |

```typescript
const analysis = analyzer.analyze();
const highConviction = analysis.confluenceScores.filter((s) => s.highConviction);
// each entry: { zoneIndex, direction, score, highConviction, breakdown: { structure, liquidity, zone, fvg, session, priceAction, htf } }
```

Tune `config.confluenceScore.threshold` (default 65), `.highConvictionThreshold`
(default 75), `.lookaroundBars` (default 5), and `.weights` per market — the
weights don't have to sum to 100 for the score to work, but 90 (+10 HTF) is
the framework's own accounting and a sane starting point.

The original, simpler `signals.longs` / `signals.shorts` pairing (unmitigated
zone + nearby matching price action, no scoring) is still there unchanged —
use whichever fits your strategy; they run independently.

### Market Structure Shift (MSS)

`applyMSSClassification` upgrades a `CHoCH` to `MSS` when the breaking candle's
body displaces well beyond the recent average true range (`structure.mss`),
confirming institutional participation rather than a marginal break. It's
applied automatically inside `analyze()`; call it directly for standalone use:

```typescript
import { detectStructure, findSwingPoints, applyMSSClassification } from 'trading-concepts-ts';

const swings = findSwingPoints(candles, 5);
const raw = detectStructure(candles, swings);
const structure = applyMSSClassification(raw, candles, {
  enabled: true,
  atrLookback: 14,
  displacementMultiplier: 1.5,
});
```

### Premium/discount & OTE zones

```typescript
import { findDealingRanges, computePremiumDiscountZones, classifyPrice } from 'trading-concepts-ts';

const zones = computePremiumDiscountZones(findDealingRanges(analysis.swings), {
  enabled: true,
  oteZone: { min: 0.618, max: 0.79 },
});
const classification = classifyPrice(currentPrice, zones.at(-1)!); // 'premium' | 'discount' | 'equilibrium'
```

### Inverse FVG (IFVG)

An FVG that price _closes_ all the way through (not just wicks into) flips
polarity — a bullish FVG becomes bearish resistance and vice versa:

```typescript
import { findFVGs, findInverseFVGs } from 'trading-concepts-ts';

const fvgs = findFVGs(candles, config.fvg);
const inverseFvgs = findInverseFVGs(candles, fvgs); // also in analysis.inverseFvgs
```

### Liquidity sweep classification & quality score

Every swept `LiquidityZone` is tagged `sweepType: 'reversal' | 'breakthrough'`.
`scoreLiquiditySweep` combines wick-rejection depth, volume participation,
how far price recovered past the level, and kill zone weighting into a 0-100
score (also available pre-computed per zone in `analysis.liquiditySweepScores`):

```typescript
import { scoreLiquiditySweep } from 'trading-concepts-ts';

const score = scoreLiquiditySweep(candles, zone, analysis.killzones, config.liquidity.sweepScore);
```

### Kill zone hierarchy & Silver Bullet

`KillzoneWindow.weight` (0-1) marks a session's relative importance — the
presets weight London/New York at 1 and Asian sessions around 0.5, matching
ICT's kill zone hierarchy. A `SILVER_BULLET_PRESET` adds the three narrow
03:00-04:00 / 10:00-11:00 / 14:00-15:00 (New York time) windows on top of
another preset:

```typescript
import { createConfig, DEFAULT_CONFIG, FOREX_PRESET, SILVER_BULLET_PRESET } from 'trading-concepts-ts';

const config = createConfig(createConfig(DEFAULT_CONFIG, FOREX_PRESET), SILVER_BULLET_PRESET);
```

## Supplying data this library can't compute

Two pieces of the framework in the original research (CVD/order-flow
absorption, and higher-timeframe alignment) genuinely can't be derived from a
single OHLCV series. Rather than fake them, the library exposes typed
extension points so a consuming project can supply real data when it has it —
both are entirely optional and everything works without them.

**Order-flow delta (CVD)** — if your data source gives you buy/sell volume
per candle (footprint charts, an exchange trade-tape aggregator, a CVD feed),
set it on the candle:

```typescript
const candles: Candle[] = rawBars.map((bar) => ({
  time: bar.time,
  open: bar.open,
  high: bar.high,
  low: bar.low,
  close: bar.close,
  volume: bar.volume,
  delta: bar.buyVolume - bar.sellVolume, // net order-flow delta
}));
```

`scoreLiquiditySweep` picks up `delta` automatically and adds a 5th CVD factor
to the sweep quality score, re-weighting the other four down proportionally
when it's absent — the score is always 0-100 either way.

**Higher-timeframe context** — run a second `TradingConcepts` (or the
standalone detectors) on your own higher-timeframe candles, then hand the
result to the lower-timeframe instance:

```typescript
const htf = new TradingConcepts(fourHourCandles);
const htfAnalysis = htf.analyze();

const ltf = new TradingConcepts(fifteenMinuteCandles);
ltf.setHTFContext({
  orderBlocks: htfAnalysis.orderBlocks.filter((ob) => !ob.mitigated),
  structure: htfAnalysis.structure,
  premiumDiscountZones: htfAnalysis.premiumDiscountZones,
});

const analysis = ltf.analyze(); // confluenceScores now include the HTF bonus
```

`HTFContext`'s fields are all optional — supply whichever you have; the score
simply skips the HTF bonus for fields you don't provide.

## Backtesting

The framework doc this library was built from includes illustrative win-rate/
R:R tables. **Those numbers are not from a real backtest of this codebase** —
presenting them as measured results would be misleading, so they don't appear
anywhere in this repo. What you get instead is a real, runnable harness so you
can measure your own numbers, on your own data:

```bash
npm run example:backtest
```

`examples/backtest.ts` is a minimal walk-forward harness: for every bar it
re-runs `analyze()` on history _up to that bar only_ (never future data),
takes any newly-qualifying `confluenceScores` entry, "enters" at the _next_
bar's open, and simulates forward to whichever of a stop (order block's far
edge) or a fixed-R target is hit first, tallying the actual win rate and
average R-multiple achieved. Read the comments at the top of the file for the
exact assumptions and their limitations (same-candle stop/target ambiguity,
O(n²) re-analysis cost, etc.) before trusting its numbers.

To backtest for real:

1. Replace `generateCandles(...)` in `examples/backtest.ts` with real
   historical OHLCV for the symbol/timeframe you care about (from your
   exchange/broker/data vendor).
2. Run across multiple symbols, timeframes, and date ranges — a strategy that
   only works on one slice of history isn't validated.
3. Treat `confluenceScore.threshold`, `.weights`, and `.lookaroundBars` (along
   with every other config field) as parameters to tune against your data,
   not fixed constants — the defaults are reasonable starting points, not
   claims about optimality.
4. Compare against a simple baseline (e.g. random entries with the same stop/
   target) before concluding the confluence signal itself adds edge.
5. Paper trade before risking real capital, even after a backtest looks good —
   backtests overfit to history in ways that are easy to miss.

## API

```typescript
class TradingConcepts {
  constructor(candles: Candle[], configOverrides?: TradingConceptsConfigOverrides);
  static withPreset(
    candles: Candle[],
    preset: TradingConceptsConfigOverrides,
    extraOverrides?: TradingConceptsConfigOverrides,
  ): TradingConcepts;

  getConfig(): TradingConceptsConfig;
  updateConfig(overrides: TradingConceptsConfigOverrides): void;
  setCandles(candles: Candle[]): void;
  setHTFContext(htfContext: HTFContext | undefined): void;
  analyze(): AnalysisResult;
}
```

`AnalysisResult` contains `swings`, `structure` (BOS/CHoCH/MSS), `fvgs`,
`inverseFvgs`, `orderBlocks`, `liquidity`, `liquiditySweepScores`,
`priceAction`, `killzones`, `premiumDiscountZones`,
`signals: { longs, shorts }` (the original simple confluence pairing), and
`confluenceScores` (the 7-pillar scoring engine).

Every detector is also exported standalone for tree-shaken, à la carte usage:

```typescript
import {
  findSwingPoints,
  detectStructure,
  applyMSSClassification,
  findFVGs,
  findInverseFVGs,
  findOrderBlocks,
  findLiquidityZones,
  scoreLiquiditySweep,
  detectPriceAction,
  detectKillzones,
  findDealingRanges,
  computePremiumDiscountZones,
  classifyPrice,
  scoreConfluence,
} from 'trading-concepts-ts';
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
npm install                # also wires up husky git hooks (prepare script)
npm run build               # emits dist/ (ESM + CJS + .d.ts) via tsup
npm test                    # vitest
npm run test:coverage       # vitest with coverage thresholds enforced
npm run typecheck
npm run lint                # eslint src test
npm run lint:fix
npm run format               # prettier --write .
npm run format:check
npm run audit                # audit-ci: fails on high/critical prod-dep advisories
npm run example:crypto       # or example:forex / example:index / example:backtest
```

### Commit convention & pre-commit hooks

Commits follow [Conventional Commits](https://www.conventionalcommits.org/)
(`feat:`, `fix:`, `docs:`, `chore:`, ...), enforced locally by a `commit-msg`
hook (commitlint) and on PRs by the "PR title" workflow. A `pre-commit` hook
runs `lint-staged` (ESLint + Prettier) on staged files. Hooks are installed
automatically by `npm install` via the `prepare` script.

## CI/CD & security

Everything below runs in GitHub Actions on every push/PR to `main` (see
`.github/workflows/`):

| Workflow       | What it checks                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ci.yml`       | Prettier format check, ESLint, `tsc --noEmit`, Vitest (Node 18/20/22 matrix) with coverage thresholds, package build + export-resolution verification, and a smoke test of all three examples        |
| `codeql.yml`   | GitHub CodeQL static analysis (`security-and-quality` query pack), on push/PR and weekly                                                                                                             |
| `security.yml` | `audit-ci` (fails on high/critical advisories in production dependencies), Dependency Review on PRs, production-dependency license allowlist check, and a Gitleaks secret scan over full git history |
| `pr-title.yml` | Enforces a Conventional Commits PR title                                                                                                                                                             |
| `release.yml`  | On a `vX.Y.Z` tag push: lint/typecheck/test/build, verifies the tag matches `package.json`, publishes to npm with provenance, and creates a GitHub release                                           |

Dependabot (`.github/dependabot.yml`) opens weekly PRs for both npm and
GitHub Actions dependencies.

### Cutting a release

```bash
npm version patch   # or minor / major — updates package.json and tags
git push origin main --tags
```

Pushing the resulting `vX.Y.Z` tag triggers `release.yml`, which publishes to
npm (requires an `NPM_TOKEN` repository secret with publish rights) and opens
a GitHub release with auto-generated notes.

See [SECURITY.md](./SECURITY.md) for how to report a vulnerability.

## Project layout

```
src/
  types.ts                    shared data structures (Candle, SwingPoint, FVG, ConfluenceScore, HTFContext, ...)
  config/                      config types, defaults, market + Silver Bullet presets, deep-merge helper
  marketStructure.ts           swing points, BOS/CHoCH, MSS displacement classification
  smartMoney.ts                 order blocks, fair value gaps, Inverse FVGs
  liquidity.ts                  equal highs/lows, sweeps (reversal/breakthrough), sweep quality score
  priceAction.ts                 candlestick patterns
  ict/killzones.ts               session/killzone tagging (weighted)
  ict/premiumDiscount.ts          dealing ranges, premium/discount/equilibrium, OTE zones
  confluenceScore.ts               the 7-pillar weighted confluence scoring engine
  TradingConcepts.ts               main class: wiring + both confluence approaches + HTF context
  index.ts                         public exports
test/                              vitest unit tests per module
examples/                          runnable fine-tuning examples (crypto/forex/index) + backtest harness
```

## Disclaimer

This library implements pattern-detection heuristics for educational and
research purposes. It does not constitute financial advice, and none of the
signals it produces are a guarantee of future performance. Always validate
against your own risk management before trading with real capital.

## License

MIT — see [LICENSE](./LICENSE).
