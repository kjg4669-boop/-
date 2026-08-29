import type { TextSpan } from "./types";

/** 스팬 배열을 텍스트로 변환 */
export function spansToText(spans: TextSpan[]): string {
  return spans.map((s) => s.text).join("");
}

/** 텍스트를 단일 스팬으로 변환 */
export function textToSpans(text: string): TextSpan[] {
  return text ? [{ text }] : [];
}

function escapeHtmlText(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** TextSpan[] → HTML (contentEditable 초기 렌더 용) */
export function spansToHtml(spans: TextSpan[] | undefined, text: string): string {
  const effective = spans && spans.length > 0 ? spans : [{ text }];
  return effective.map((span) => {
    const content = span.text.split("\n").map(escapeHtmlText).join("<br>");
    const styles: string[] = [];
    if (span.fontFamily) styles.push(`font-family:${span.fontFamily}`);
    if (span.fontWeight) styles.push(`font-weight:${span.fontWeight}`);
    if (span.fontStyle) styles.push(`font-style:${span.fontStyle}`);
    if (span.textDecoration) styles.push(`text-decoration:${span.textDecoration}`);
    if (span.color) styles.push(`color:${span.color}`);
    if (span.fontSize !== undefined) styles.push(`font-size:${span.fontSize}px`);
    if (styles.length === 0) return content;
    return `<span style="${styles.join(";")}">${content}</span>`;
  }).join("");
}

/** contentEditable innerHTML → {text, spans} (클라이언트 전용) */
export function htmlToSpans(html: string): { text: string; spans: TextSpan[] } {
  if (typeof document === "undefined") return { text: "", spans: [] };
  const temp = document.createElement("div");
  temp.innerHTML = html;
  const result: TextSpan[] = [];

  function walk(node: Node, style: Partial<Omit<TextSpan, "text">>) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? "";
      if (t) result.push({ text: t, ...style });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") { result.push({ text: "\n", ...style }); return; }
    const s = { ...style };
    if (tag === "b" || tag === "strong") s.fontWeight = "bold";
    if (tag === "i" || tag === "em") s.fontStyle = "italic";
    if (tag === "u") s.textDecoration = "underline";
    if (tag === "s" || tag === "strike" || tag === "del") s.textDecoration = "line-through";
    if (tag === "span") {
      const cs = el.style;
      if (cs.fontFamily) s.fontFamily = cs.fontFamily;
      if (cs.fontWeight) s.fontWeight = cs.fontWeight as TextSpan["fontWeight"];
      if (cs.fontStyle) s.fontStyle = cs.fontStyle as TextSpan["fontStyle"];
      if (cs.textDecoration) s.textDecoration = cs.textDecoration as TextSpan["textDecoration"];
      if (cs.color) s.color = cs.color;
      if (cs.fontSize) { const px = parseFloat(cs.fontSize); if (!isNaN(px)) s.fontSize = px; }
    }
    if (tag === "div" && result.length > 0 && !result[result.length - 1].text.endsWith("\n")) {
      result.push({ text: "\n", ...style });
    }
    for (const child of Array.from(el.childNodes)) walk(child, s);
  }

  for (const child of Array.from(temp.childNodes)) walk(child, {});
  const text = result.map((s) => s.text).join("");
  return { text, spans: mergeAdjacentSpans(result.filter((s) => s.text.length > 0)) };
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
export function mergeAdjacentSpans(spans: TextSpan[]): TextSpan[] {
  if (spans.length === 0) return spans;
  const result: TextSpan[] = [{ ...spans[0] }];
  for (let i = 1; i < spans.length; i++) {
    const prev = result[result.length - 1];
    const curr = spans[i];
    if (
      prev.fontFamily === curr.fontFamily &&
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
