export function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Absolute percent difference between two values, relative to `reference`. */
export function percentDiff(a: number, reference: number): number {
  if (reference === 0) return 0;
  return (Math.abs(a - reference) / Math.abs(reference)) * 100;
}

export function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
