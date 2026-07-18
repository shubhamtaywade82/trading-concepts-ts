import { Candle } from '../src/types';

export function candle(
  time: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume?: number,
  delta?: number,
): Candle {
  return { time, open, high, low, close, volume, delta };
}
