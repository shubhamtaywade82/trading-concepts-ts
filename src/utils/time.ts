export const MINUTES_PER_DAY = 1440;

/** Minute-of-day (0-1439) for a UTC timestamp, after shifting by `offsetMinutes`. */
export function minuteOfDay(timeMs: number, offsetMinutes: number): number {
  const shifted = Math.floor(timeMs / 60000) + offsetMinutes;
  return ((shifted % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
}
