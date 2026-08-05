import type { LyricSection, LyricSlide } from "@/lib/types";
import { newSlideId } from "@/lib/utils";

export interface ParsedOpenLyricsSong {
  title: string;
  artist: string;
  slides: LyricSlide[];
}

function getSectionFromName(name: string): LyricSection {
  const n = name.toLowerCase().replace(/\d+$/, ""); // strip trailing numbers
  if (n === "c" || n === "chorus") return "chorus";
  if (n === "b" || n === "bridge") return "bridge";
  if (n === "p" || n === "pre-chorus" || n === "prechorus") return "pre-chorus";
  if (n === "i" || n === "intro") return "intro";
  if (n === "e" || n === "ending" || n === "o" || n === "outro") return "outro";
  return "verse"; // v1, v2, ... default
}

function getLinesFromElement(el: Element): string[] {
  // Replace <br> with newline, then extract text
  const serialized = new XMLSerializer().serializeToString(el);
  const text = serialized
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")         // strip remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
  return text.split("\n").map((l) => l.trim()).filter(Boolean);
}

export function parseOpenLyricsXml(xmlText: string): ParsedOpenLyricsSong {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");

  const parseError = doc.querySelector("parsererror");
  if (parseError) throw new Error("XML 파싱 실패: " + parseError.textContent);

  // Title (try with and without namespace)
  const titleEl =
    doc.querySelector("titles title") ??
    doc.querySelector("title");
  const title = titleEl?.textContent?.trim() ?? "제목 없음";

  // Author
  const authorEl =
    doc.querySelector("authors author") ??
    doc.querySelector("author");
  const artist = authorEl?.textContent?.trim() ?? "";

  // Verses
  const verseEls = Array.from(doc.querySelectorAll("verse"));
  const slides: LyricSlide[] = [];
  const sectionCounts: Partial<Record<LyricSection, number>> = {};

  verseEls.forEach((verseEl) => {
    const name = verseEl.getAttribute("name") ?? "v1";
    const section = getSectionFromName(name);
    sectionCounts[section] = (sectionCounts[section] ?? 0) + 1;
    const sectionIndex = sectionCounts[section]!;

    const linesEls = Array.from(verseEl.querySelectorAll("lines"));
    const allLines: string[] = linesEls.length > 0
      ? linesEls.flatMap(getLinesFromElement)
      : getLinesFromElement(verseEl);

    if (allLines.length > 0) {
      slides.push({ id: newSlideId(), section, sectionIndex, lines: allLines });
    }
  });

  return { title, artist, slides };
}

export async function parseOpenLyricsFile(file: File): Promise<ParsedOpenLyricsSong> {
  const text = await file.text();
  return parseOpenLyricsXml(text);
}
