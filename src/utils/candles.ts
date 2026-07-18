import { Candle } from '../types';

/**
 * Validates a candle series and returns it sorted ascending by time.
 * Throws if candles are missing required fields or have inverted OHLC values.
 */
export function validateCandles(candles: Candle[]): Candle[] {
  if (!Array.isArray(candles)) {
    throw new TypeError('candles must be an array');
  }

  for (const c of candles) {
    if (
      typeof c.time !== 'number' ||
      typeof c.open !== 'number' ||
      typeof c.high !== 'number' ||
      typeof c.low !== 'number' ||
      typeof c.close !== 'number' ||
      Number.isNaN(c.time) ||
      Number.isNaN(c.open) ||
      Number.isNaN(c.high) ||
      Number.isNaN(c.low) ||
      Number.isNaN(c.close)
    ) {
      throw new TypeError(`invalid candle: ${JSON.stringify(c)}`);
    }
    if (c.high < c.low) {
      throw new RangeError(`candle high < low: ${JSON.stringify(c)}`);
    }
  }

  return [...candles].sort((a, b) => a.time - b.time);
}
