/**
 * 런타임 타입 검증 유틸리티 — DB에서 읽어온 JSON을 안전하게 파싱합니다.
 * 외부 의존성 없이 타입 안전성을 제공합니다.
 */

import type { LyricSlide, LyricSection, ServiceItem, MediaType, ServiceItemSettings } from "./types";

// ─── 유효 값 집합 ────────────────────────────────────────────────────────────

const VALID_LYRIC_SECTIONS = new Set<string>([
  "verse", "chorus", "bridge", "pre-chorus", "outro", "intro",
]);
const VALID_SERVICE_ITEM_TYPES = new Set<string>([
  "song", "video", "announcement", "scripture", "blank",
]);
const VALID_MEDIA_TYPES = new Set<string>(["video", "image", "color"]);

// ─── 내부 헬퍼 ──────────────────────────────────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

// ─── 파서 함수 ──────────────────────────────────────────────────────────────

/**
 * 단일 LyricSlide 검증. id 필드가 없으면 null 반환.
 * section/lines가 유효하지 않으면 기본값으로 복구합니다.
 */
export function parseLyricSlide(v: unknown): LyricSlide | null {
  if (!isObject(v)) return null;
  if (typeof v.id !== "string" || !v.id) return null;
  const section: LyricSection = VALID_LYRIC_SECTIONS.has(v.section as string)
    ? (v.section as LyricSection)
    : "verse";
  const sectionIndex = typeof v.sectionIndex === "number" ? v.sectionIndex : 1;
  const lines = Array.isArray(v.lines)
    ? (v.lines as unknown[]).filter((l): l is string => typeof l === "string")
    : [];
  const result: LyricSlide = { id: v.id, section, sectionIndex, lines };
  // Preserve canvas text blocks (free-position layout from SlideCanvas editor)
  if (isObject(v.canvas) && Array.isArray((v.canvas as Record<string, unknown>).textBlocks)) {
    result.canvas = v.canvas as LyricSlide["canvas"];
  }
  return result;
}

/**
 * LyricSlide 배열 검증. 파싱 실패한 항목은 건너뜁니다.
 */
export function parseLyricSlides(v: unknown): LyricSlide[] {
  if (!Array.isArray(v)) return [];
  const result: LyricSlide[] = [];
  for (const item of v) {
    const parsed = parseLyricSlide(item);
    if (parsed) result.push(parsed);
  }
  return result;
}

/**
 * ServiceItem.type 검증. 알 수 없는 값은 "blank"로 폴백합니다.
 */
export function parseServiceItemType(v: unknown): ServiceItem["type"] {
  return VALID_SERVICE_ITEM_TYPES.has(v as string)
    ? (v as ServiceItem["type"])
    : "blank";
}

/**
 * MediaItem.type 검증. 알 수 없는 값은 "image"로 폴백합니다.
 */
export function parseMediaType(v: unknown): MediaType {
  return VALID_MEDIA_TYPES.has(v as string) ? (v as MediaType) : "image";
}

/**
 * ServiceItemSettings 검증. 객체임을 보장합니다.
 * 중첩 필드는 app이 작성한 데이터이므로 객체 레벨 검증으로 충분합니다.
 */
export function parseServiceItemSettings(v: unknown): ServiceItemSettings {
  return isObject(v) ? (v as ServiceItemSettings) : {};
}

/**
 * JSON 문자열을 안전하게 파싱합니다. 실패 시 fallback 반환.
 */
export function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== "string") return (raw ?? fallback) as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
