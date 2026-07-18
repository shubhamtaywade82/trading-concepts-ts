import { TradingConceptsConfig, TradingConceptsConfigOverrides } from './types';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merges config overrides onto a base config. Arrays and primitives in the
 * overrides replace the base value entirely; plain objects are merged key by key.
 */
export function mergeConfig<T>(base: T, overrides?: TradingConceptsConfigOverrides): T {
  if (!overrides) return base;

  const result: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };

  for (const key of Object.keys(overrides)) {
    const overrideValue = (overrides as Record<string, unknown>)[key];
    const baseValue = result[key];

    if (overrideValue === undefined) continue;

    if (isPlainObject(overrideValue) && isPlainObject(baseValue)) {
      result[key] = mergeConfig(baseValue, overrideValue as TradingConceptsConfigOverrides);
    } else {
      result[key] = overrideValue;
    }
  }

  return result as T;
}

/**
 * Builds a full config by layering overrides on top of a base (default or preset) config.
 * Use this to fine-tune the library for a specific exchange, market, or symbol.
 */
export function createConfig(
  base: TradingConceptsConfig,
  overrides?: TradingConceptsConfigOverrides,
): TradingConceptsConfig {
  return mergeConfig(base, overrides);
}
