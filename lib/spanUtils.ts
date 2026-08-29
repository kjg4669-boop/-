import type { TextSpan } from "./types";

/** 스팬 배열을 텍스트로 변환 */
export function spansToText(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join("");
}

/** 텍스트를 단일 스팬으로 변환 */
export function textToSpans(text: string): TextSpan[] {
  return text ? [{ text }] : [];
}

/**
 * 스팬 배열에서 [start, end) 범위에 스타일 패치 적용
 */
export function applyFormatToSpans(
  text: string,
  spans: TextSpan[] | undefined,
  start: number,
  end: number,
  patch: Partial<Omit<TextSpan, "text">>
): TextSpan[] {
  const current: TextSpan[] = spans && spans.length > 0 ? spans : textToSpans(text);

  const result: TextSpan[] = [];
  let pos = 0;

  for (const span of current) {
    const spanEnd = pos + span.text.length;

    if (spanEnd <= start || pos >= end) {
      // 범위 밖: 그대로
      result.push({ ...span });
    } else {
      // 범위와 겹침: 최대 3개로 분리
      if (pos < start) {
        result.push({ ...span, text: span.text.slice(0, start - pos) });
      }

      const overlapStart = Math.max(pos, start) - pos;
      const overlapEnd = Math.min(spanEnd, end) - pos;
      result.push({ ...span, ...patch, text: span.text.slice(overlapStart, overlapEnd) });

      if (spanEnd > end) {
        result.push({ ...span, text: span.text.slice(end - pos) });
      }
    }

    pos = spanEnd;
  }

  return mergeAdjacentSpans(result.filter((s) => s.text.length > 0));
}

/** 스타일이 동일한 인접 스팬 병합 */
function mergeAdjacentSpans(spans: TextSpan[]): TextSpan[] {
  if (spans.length === 0) return spans;
  const result: TextSpan[] = [{ ...spans[0] }];
  for (let i = 1; i < spans.length; i++) {
    const prev = result[result.length - 1];
    const curr = spans[i];
    if (
      prev.fontWeight === curr.fontWeight &&
      prev.fontStyle === curr.fontStyle &&
      prev.textDecoration === curr.textDecoration &&
      prev.color === curr.color &&
      prev.fontSize === curr.fontSize
    ) {
      prev.text += curr.text;
    } else {
      result.push({ ...curr });
    }
  }
  return result;
}
