/**
 * Merges overrides into base (1 level deep for objects, not arrays).
 * Returns a new object — does not mutate base.
 */
export function deepMerge<T extends object>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (
      overVal !== undefined &&
      typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal) &&
      typeof overVal === "object" && overVal !== null && !Array.isArray(overVal)
    ) {
      result[key] = { ...baseVal, ...(overVal as object) } as T[keyof T];
    } else if (overVal !== undefined) {
      result[key] = overVal as T[keyof T];
    }
  }
  return result;
}

export const GLOBAL_SETTINGS_KEY = "worship-layer-defaults";

export function loadGlobalDefaults(fallback: import("./types").LayerConfig): import("./types").LayerConfig {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(GLOBAL_SETTINGS_KEY);
    if (!raw) return fallback;
    return deepMerge(fallback, JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveGlobalDefaults(config: import("./types").LayerConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(config));
}
