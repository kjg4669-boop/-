"use client";

import JSZip from "jszip";
import type { LyricSlide } from "./types";
import { newSlideId } from "./utils";

export interface ParsedSlide {
  slideNumber: number;  // 원본 슬라이드 번호 (1-based)
  lines: string[];      // 단락별 텍스트 (빈 항목 제거됨)
}

/**
 * PPTX 파일에서 슬라이드 텍스트를 추출한다.
 * 텍스트가 없는 슬라이드는 제외된다.
 */
export async function parsePptx(file: File): Promise<ParsedSlide[]> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // ppt/slides/slideN.xml 목록을 번호 순 정렬
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const results: ParsedSlide[] = [];

  for (const slideFile of slideEntries) {
    const match = slideFile.match(/slide(\d+)\.xml$/);
    const originalSlideNumber = match ? parseInt(match[1], 10) : results.length + 1;
    const xml = await zip.files[slideFile].async("string");
    const lines = extractLinesFromSlideXml(xml);
    if (lines.length > 0) {
      results.push({ slideNumber: originalSlideNumber, lines });
    }
  }

  return results;
}

/**
 * 슬라이드 XML에서 단락별 텍스트를 추출한다.
 * 각 <a:p> 단락의 <a:t> 텍스트를 이어붙인 것이 하나의 lines 항목이 된다.
 */
const DRAWINGML_NS = "http://schemas.openxmlformats.org/drawingml/2006/main";

function extractLinesFromSlideXml(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const paragraphs = Array.from(doc.getElementsByTagNameNS(DRAWINGML_NS, "p"));

  const lines: string[] = [];
  for (const para of paragraphs) {
    const runs = Array.from(para.getElementsByTagNameNS(DRAWINGML_NS, "t"));
    const text = runs.map((r) => r.textContent ?? "").join("").trim();
    if (text) {
      lines.push(text);
    }
  }
  return lines;
}

/**
 * ParsedSlide[] → LyricSlide[] 변환.
 * 각 ParsedSlide가 하나의 LyricSlide(verse)가 된다.
 */
export function parsedSlidesToLyricSlides(slides: ParsedSlide[]): LyricSlide[] {
  return slides.map((slide, i) => ({
    id: newSlideId(),
    section: "verse" as const,
    sectionIndex: i + 1,
    lines: slide.lines,
  }));
}
