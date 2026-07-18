/**
 * Volume Profile: bins traded volume by price level to find the Point of
 * Control (the busiest price) and High/Low Volume Nodes.
 */

import { VolumeProfileConfig } from '../config/types';
import { Candle, VolumeProfile, VolumeProfileBin } from '../types';

/**
 * Builds a volume profile over the full `candles` range. Each candle's
 * volume is distributed across the bins its high-low range overlaps,
 * proportional to the overlap (not just credited to its close), which is
 * what makes this a *profile* rather than a close-price histogram.
 */
export function calculateVolumeProfile(candles: Candle[], config: VolumeProfileConfig): VolumeProfile {
  const high = Math.max(...candles.map((c) => c.high));
  const low = Math.min(...candles.map((c) => c.low));
  const binSize = (high - low) / config.bins;

  const bins: VolumeProfileBin[] = Array.from({ length: config.bins }, (_, i) => ({
    priceLow: low + i * binSize,
    priceHigh: low + (i + 1) * binSize,
    volume: 0,
    classification: 'neutral',
  }));

  for (const candle of candles) {
    const volume = candle.volume ?? 0;
    if (volume <= 0) continue;

    const candleRange = candle.high - candle.low;

    for (const bin of bins) {
      const overlapLow = Math.max(bin.priceLow, candle.low);
      const overlapHigh = Math.min(bin.priceHigh, candle.high);
      const overlap = overlapHigh - overlapLow;
      if (overlap <= 0) continue;

      const share = candleRange > 0 ? overlap / candleRange : 1;
      bin.volume += volume * share;
    }
  }

  const sortedVolumes = bins.map((b) => b.volume).sort((a, b) => a - b);
  const hvnThreshold =
    sortedVolumes[
      Math.min(sortedVolumes.length - 1, Math.floor(sortedVolumes.length * config.hvnPercentile))
    ];
  const lvnThreshold = sortedVolumes[Math.max(0, Math.floor(sortedVolumes.length * config.lvnPercentile))];

  for (const bin of bins) {
    if (bin.volume >= hvnThreshold) bin.classification = 'hvn';
    else if (bin.volume <= lvnThreshold) bin.classification = 'lvn';
  }

  const pointOfControl = bins.reduce((max, bin) => (bin.volume > max.volume ? bin : max), bins[0]);

  return {
    bins,
    pointOfControl,
    highVolumeNodes: bins.filter((b) => b.classification === 'hvn'),
    lowVolumeNodes: bins.filter((b) => b.classification === 'lvn'),
  };
}
