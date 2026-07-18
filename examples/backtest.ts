/**
 * A minimal, honest walk-forward backtest harness for this library.
 *
 * IMPORTANT: the candles below are synthetically generated (see
 * generateCandles.ts) purely so this example runs out of the box. The
 * numbers it prints describe THIS synthetic random walk, not real market
 * performance — they are not a performance claim for the confluence
 * framework in general. Swap `generateCandles(...)` for real historical
 * OHLCV data (from your exchange/broker/data vendor) to get numbers that
 * mean something, and re-run this same harness against several instruments,
 * timeframes, and date ranges before trusting a strategy with real capital.
 *
 * What this harness does, bar by bar, starting after a warmup period:
 *   1. Re-runs `TradingConcepts.analyze()` on every candle *up to and
 *      including* the current bar only — never on future data.
 *   2. Looks at `confluenceScores` for unmitigated order blocks that just
 *      crossed the configured score threshold.
 *   3. "Enters" at the *next* bar's open (not the signal bar's close —
 *      that would be lookahead bias), with a stop at the order block's far
 *      edge and a target at a fixed reward multiple of the risk.
 *   4. Scans forward bar by bar for whichever of stop/target is hit first.
 *      Simplification: if a single candle's range covers both levels, this
 *      assumes the stop was hit first (the conservative assumption — real
 *      intrabar sequencing needs tick or 1m data to resolve precisely).
 *   5. Tallies the *actual* win rate and average R-multiple achieved.
 *
 * Run with: npm run example:backtest
 */
import { TradingConcepts } from '../src';
import { Candle, ZoneDirection } from '../src/types';
import { generateCandles } from './generateCandles';

const TARGET_R = 2;
const MAX_HOLD_BARS = 50;
const WARMUP_BARS = 30;
const MAX_SIGNAL_AGE_BARS = 10;

// Confluence requires several pillars to land within the same narrow window,
// so high-conviction setups are rare by design — on ~3000 bars of pure random
// walk (no real trend/liquidity structure to speak of) the default threshold
// (65) and lookaround (5 bars) can realistically produce zero trades. This
// example widens the lookaround and lowers the threshold, and turns sessions
// on, purely so the harness has enough sample trades to demonstrate the win
// rate/R-multiple math below. Do not treat these as recommended settings —
// tune `confluenceScore.threshold`/`lookaroundBars` against real data instead.
const DEMO_CONFIG = {
  structure: { swing: { lookback: 3 } },
  confluenceScore: { lookaroundBars: 10, threshold: 40 },
  session: { enabled: true },
};

interface Trade {
  zoneIndex: number;
  direction: ZoneDirection;
  confluenceScore: number;
  entryIndex: number;
  entryPrice: number;
  stopPrice: number;
  targetPrice: number;
  exitIndex: number;
  exitPrice: number;
  outcome: 'win' | 'loss' | 'timeout';
  rMultiple: number;
}

function simulateExit(
  candles: Candle[],
  entryIndex: number,
  direction: ZoneDirection,
  stopPrice: number,
  targetPrice: number,
): { exitIndex: number; exitPrice: number; outcome: Trade['outcome'] } {
  const maxIndex = Math.min(candles.length - 1, entryIndex + MAX_HOLD_BARS);

  for (let i = entryIndex; i <= maxIndex; i++) {
    const c = candles[i];
    if (direction === 'bullish') {
      if (c.low <= stopPrice) return { exitIndex: i, exitPrice: stopPrice, outcome: 'loss' };
      if (c.high >= targetPrice) return { exitIndex: i, exitPrice: targetPrice, outcome: 'win' };
    } else {
      if (c.high >= stopPrice) return { exitIndex: i, exitPrice: stopPrice, outcome: 'loss' };
      if (c.low <= targetPrice) return { exitIndex: i, exitPrice: targetPrice, outcome: 'win' };
    }
  }

  return { exitIndex: maxIndex, exitPrice: candles[maxIndex].close, outcome: 'timeout' };
}

function runBacktest(candles: Candle[]): Trade[] {
  const trades: Trade[] = [];
  const takenZones = new Set<number>();

  for (let i = WARMUP_BARS; i < candles.length - 1; i++) {
    const tc = new TradingConcepts(candles.slice(0, i + 1), DEMO_CONFIG);
    const { confluenceScores, orderBlocks } = tc.analyze();
    const threshold = tc.getConfig().confluenceScore.threshold;

    for (const score of confluenceScores) {
      if (takenZones.has(score.zoneIndex)) continue;
      if (score.score < threshold) continue;
      if (i - score.zoneIndex > MAX_SIGNAL_AGE_BARS) continue;

      const ob = orderBlocks.find((candidate) => candidate.index === score.zoneIndex);
      if (!ob) continue;

      const entryIndex = i + 1;
      if (entryIndex >= candles.length) continue;

      takenZones.add(score.zoneIndex);

      const entryPrice = candles[entryIndex].open;
      const stopPrice = score.direction === 'bullish' ? ob.bottom : ob.top;
      const risk = Math.abs(entryPrice - stopPrice);
      if (risk <= 0) continue;

      const targetPrice =
        score.direction === 'bullish' ? entryPrice + risk * TARGET_R : entryPrice - risk * TARGET_R;

      const { exitIndex, exitPrice, outcome } = simulateExit(
        candles,
        entryIndex,
        score.direction,
        stopPrice,
        targetPrice,
      );

      const rMultiple =
        score.direction === 'bullish' ? (exitPrice - entryPrice) / risk : (entryPrice - exitPrice) / risk;

      trades.push({
        zoneIndex: score.zoneIndex,
        direction: score.direction,
        confluenceScore: score.score,
        entryIndex,
        entryPrice,
        stopPrice,
        targetPrice,
        exitIndex,
        exitPrice,
        outcome,
        rMultiple,
      });
    }
  }

  return trades;
}

function summarize(trades: Trade[]): void {
  const wins = trades.filter((t) => t.outcome === 'win').length;
  const losses = trades.filter((t) => t.outcome === 'loss').length;
  const timeouts = trades.filter((t) => t.outcome === 'timeout').length;
  const winRate = trades.length > 0 ? (wins / trades.length) * 100 : 0;
  const avgR = trades.length > 0 ? trades.reduce((sum, t) => sum + t.rMultiple, 0) / trades.length : 0;

  console.log('=== Backtest summary (SYNTHETIC data — not a real performance claim) ===');
  console.log(`Trades: ${trades.length} (wins: ${wins}, losses: ${losses}, timeouts: ${timeouts})`);
  console.log(`Win rate: ${winRate.toFixed(1)}%`);
  console.log(`Average R multiple: ${avgR.toFixed(2)}`);

  if (trades.length === 0) {
    console.log(
      '\nNo trades met the confluence threshold in this run. Confluence is ' +
        'deliberately selective — try more candles, a lower ' +
        '`confluenceScore.threshold`, a wider `lookaroundBars`, or (best of ' +
        'all) real historical data with real trend/liquidity structure.',
    );
    return;
  }

  console.log('\nFirst 5 trades:');
  for (const t of trades.slice(0, 5)) {
    console.log(
      `  #${t.zoneIndex} ${t.direction} score=${t.confluenceScore} entry=${t.entryPrice.toFixed(2)} ` +
        `stop=${t.stopPrice.toFixed(2)} target=${t.targetPrice.toFixed(2)} -> ${t.outcome} (${t.rMultiple.toFixed(2)}R)`,
    );
  }
}

const candles = generateCandles({
  count: 3000,
  startTime: Date.UTC(2026, 0, 1),
  intervalMs: 15 * 60 * 1000,
  startPrice: 100,
  volatility: 1.2,
});

summarize(runBacktest(candles));
