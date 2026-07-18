import { TradingConceptsConfigOverrides } from './types';

/**
 * Market/exchange presets. These are overrides meant to be layered onto
 * `DEFAULT_CONFIG` (or another preset) with `createConfig`. They capture the
 * "shape" of a market — session hours, typical tick size, whether volume is
 * meaningful — so you rarely have to hand-tune every field yourself.
 *
 * Fine-tune further per symbol by passing another overrides object after the
 * preset, e.g. `createConfig(mergeConfig(DEFAULT_CONFIG, CRYPTO_PRESET), { precision: 2 })`
 * or simply `createConfig(DEFAULT_CONFIG, { ...CRYPTO_PRESET, precision: 2 })`.
 */

/** 24/7 crypto spot/perp markets (Binance, Bybit, OKX, ...). No fixed session hours. */
export const CRYPTO_PRESET: TradingConceptsConfigOverrides = {
  precision: 8,
  liquidity: {
    equalTolerancePercent: 0.15,
  },
  orderBlock: {
    volumeLookback: 20,
    requireVolume: false,
  },
  session: {
    enabled: false,
  },
};

/** Spot FX majors/minors. Enables the classic ICT killzones (UTC). */
export const FOREX_PRESET: TradingConceptsConfigOverrides = {
  precision: 5,
  liquidity: {
    equalTolerancePercent: 0.05,
  },
  orderBlock: {
    // Forex volume is tick volume, not real traded volume - don't gate on it.
    requireVolume: false,
  },
  session: {
    enabled: true,
    timezoneOffsetMinutes: 0,
    // Weighted per ICT's kill zone hierarchy: London/NY carry full weight,
    // the Asian session roughly half, reflecting its lower sweep-reversal rate.
    killzones: [
      { name: 'Asian', startUtcMinute: 0, endUtcMinute: 180, weight: 0.5 },
      { name: 'London', startUtcMinute: 420, endUtcMinute: 600, weight: 1 },
      { name: 'NewYorkAM', startUtcMinute: 720, endUtcMinute: 900, weight: 1 },
      { name: 'LondonClose', startUtcMinute: 900, endUtcMinute: 1020, weight: 0.8 },
    ],
  },
};

/**
 * ICT "Silver Bullet" windows: three narrow 1-hour windows (03:00-04:00,
 * 10:00-11:00, 14:00-15:00 New York time) inside the broader kill zones above,
 * associated with a higher rate of clean reversals. Layer on top of
 * `FOREX_PRESET`/`US_EQUITY_PRESET`, e.g.
 * `createConfig(createConfig(DEFAULT_CONFIG, FOREX_PRESET), SILVER_BULLET_PRESET)`.
 * Times are in New York (ET) local clock; pass the correct `timezoneOffsetMinutes`
 * for standard time (UTC-5) vs daylight time (UTC-4) for the dates you're analyzing.
 */
export const SILVER_BULLET_PRESET: TradingConceptsConfigOverrides = {
  session: {
    enabled: true,
    timezoneOffsetMinutes: -300,
    killzones: [
      { name: 'SilverBulletAM', startUtcMinute: 180, endUtcMinute: 240, weight: 1 },
      { name: 'SilverBulletLondonClose', startUtcMinute: 600, endUtcMinute: 660, weight: 0.9 },
      { name: 'SilverBulletPM', startUtcMinute: 840, endUtcMinute: 900, weight: 1 },
    ],
  },
};

/** JPY-quoted FX pairs use 2-3 decimal pricing instead of 4-5. */
export const FOREX_JPY_PRESET: TradingConceptsConfigOverrides = {
  precision: 3,
};

/** Cash equity indices (e.g. NIFTY 50, BANKNIFTY) on Indian exchanges (NSE/BSE), IST session. */
export const NSE_INDEX_PRESET: TradingConceptsConfigOverrides = {
  precision: 2,
  liquidity: {
    equalTolerancePercent: 0.05,
  },
  orderBlock: {
    requireVolume: true,
  },
  session: {
    enabled: true,
    // IST is UTC+5:30; shift candle UTC time forward so killzone windows below
    // read as local NSE clock time (09:15-15:30 IST == 03:45-10:00 UTC).
    timezoneOffsetMinutes: 330,
    killzones: [
      { name: 'Opening', startUtcMinute: 555, endUtcMinute: 615, weight: 1 },
      { name: 'Midday', startUtcMinute: 615, endUtcMinute: 870, weight: 0.5 },
      { name: 'Closing', startUtcMinute: 870, endUtcMinute: 930, weight: 0.9 },
    ],
  },
};

/** US cash equities (NYSE/NASDAQ), regular trading hours 09:30-16:00 ET. */
export const US_EQUITY_PRESET: TradingConceptsConfigOverrides = {
  precision: 2,
  orderBlock: {
    requireVolume: true,
  },
  session: {
    enabled: true,
    // ET is UTC-5 (standard) / UTC-4 (DST); pass the correct offset for the date range you're analyzing.
    timezoneOffsetMinutes: -300,
    killzones: [
      { name: 'Open', startUtcMinute: 570, endUtcMinute: 630, weight: 1 },
      { name: 'Midday', startUtcMinute: 630, endUtcMinute: 900, weight: 0.5 },
      { name: 'Close', startUtcMinute: 900, endUtcMinute: 960, weight: 0.9 },
    ],
  },
};
