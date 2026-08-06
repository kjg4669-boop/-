let _slideIdCounter = 0;
export function newSlideId(): string {
  return `slide_${Date.now()}_${++_slideIdCounter}`;
}

export function getSlidesInOrder(song: { lyrics_json: import("./types").LyricSlide[]; verse_order?: string[] }): import("./types").LyricSlide[] {
  if (!song.verse_order || song.verse_order.length === 0) return song.lyrics_json;
  const map = new Map(song.lyrics_json.map((s) => [s.id, s]));
  // Only return slides referenced in verse_order; omitted slides are intentionally excluded
  return song.verse_order.filter((id) => map.has(id)).map((id) => map.get(id)!);
}

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
const GLOBAL_SETTINGS_VERSION = 2; // bump when defaults change

let _globalDefaultsCache: import("./types").LayerConfig | null = null;

export function loadGlobalDefaults(fallback: import("./types").LayerConfig): import("./types").LayerConfig {
  if (typeof window === "undefined") return fallback;
  if (_globalDefaultsCache) return _globalDefaultsCache;
  try {
    const raw = localStorage.getItem(GLOBAL_SETTINGS_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    // If version doesn't match, discard saved settings and use new defaults
    if (parsed.__v !== GLOBAL_SETTINGS_VERSION) return fallback;
    const { __v: _, ...parsedConfig } = parsed;
    _globalDefaultsCache = deepMerge(fallback, parsedConfig);
    return _globalDefaultsCache;
  } catch {
    return fallback;
  }
}

export function saveGlobalDefaults(config: import("./types").LayerConfig): void {
  if (typeof window === "undefined") return;
  _globalDefaultsCache = null; // invalidate cache
  // Strip runtime-only fields so stale lyrics/canvas don't bleed into next session
  const { subtitle: { visible: _v, lines: _l, ...subtitleRest }, canvas: _canvas, ...rest } = config;
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify({ ...rest, subtitle: subtitleRest, __v: GLOBAL_SETTINGS_VERSION }));
}
