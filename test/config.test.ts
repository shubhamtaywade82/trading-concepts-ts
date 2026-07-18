import { describe, expect, it } from 'vitest';
import { createConfig } from '../src/config/merge';
import { DEFAULT_CONFIG } from '../src/config/defaults';
import { CRYPTO_PRESET, FOREX_PRESET, NSE_INDEX_PRESET } from '../src/config/presets';

describe('createConfig', () => {
  it('deep-merges nested overrides without mutating the base', () => {
    const merged = createConfig(DEFAULT_CONFIG, { liquidity: { equalTolerancePercent: 0.5 } });

    expect(merged.liquidity.equalTolerancePercent).toBe(0.5);
    expect(merged.liquidity.pivotLookback).toBe(DEFAULT_CONFIG.liquidity.pivotLookback);
    expect(DEFAULT_CONFIG.liquidity.equalTolerancePercent).toBe(0.1);
  });

  it('replaces arrays wholesale instead of merging elements', () => {
    const merged = createConfig(DEFAULT_CONFIG, {
      session: { killzones: [{ name: 'Custom', startUtcMinute: 0, endUtcMinute: 10 }] },
    });
    expect(merged.session.killzones).toEqual([{ name: 'Custom', startUtcMinute: 0, endUtcMinute: 10 }]);
  });

  it('layers a market preset on top of defaults', () => {
    const cryptoConfig = createConfig(DEFAULT_CONFIG, CRYPTO_PRESET);
    expect(cryptoConfig.precision).toBe(8);
    expect(cryptoConfig.session.enabled).toBe(false);

    const forexConfig = createConfig(DEFAULT_CONFIG, FOREX_PRESET);
    expect(forexConfig.session.enabled).toBe(true);
    expect(forexConfig.session.killzones.length).toBeGreaterThan(0);

    const nseConfig = createConfig(DEFAULT_CONFIG, NSE_INDEX_PRESET);
    expect(nseConfig.orderBlock.requireVolume).toBe(true);
    expect(nseConfig.precision).toBe(2);
  });

  it('allows per-symbol fine-tuning on top of a preset', () => {
    const symbolConfig = createConfig(createConfig(DEFAULT_CONFIG, FOREX_PRESET), { precision: 3 });
    expect(symbolConfig.precision).toBe(3);
    expect(symbolConfig.session.enabled).toBe(true); // preset settings still apply
  });
});
