"use client";

import { useEffect, useRef, useState } from "react";
import {
  getBibleVersions,
  getBibleBooks,
  getChapterCount,
  getVerses,
  searchBible,
  importBibleJson,
  type BibleVersion,
  type BibleBook,
  type BibleVerse,
  type BibleVerseResult,
  type BibleImportJson,
} from "@/lib/bibleDb";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { ScriptureSlide } from "@/lib/types";

interface Props {
  onAdd: (book: string, reference: string, slides: ScriptureSlide[]) => void;
  isAdding?: boolean;
}

type ViewMode = "browse" | "search";

export function BibleBrowser({ onAdd, isAdding }: Props) {
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [chapterCount, setChapterCount] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [checkedVerses, setCheckedVerses] = useState<Set<number>>(new Set());
  const [versesPerSlide, setVersesPerSlide] = useState(2);
  const [mode, setMode] = useState<ViewMode>("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BibleVerseResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load versions
  useEffect(() => {
    getBibleVersions().then((v) => {
      setVersions(v);
      if (v.length > 0) setSelectedVersionId(v[0].id);
    }).catch(console.error);
  }, []);

  // Load books when version changes
  useEffect(() => {
    if (!selectedVersionId) return;
    getBibleBooks(selectedVersionId).then((b) => {
      setBooks(b);
      setSelectedBook(b[0] ?? null);
    }).catch(console.error);
    setCheckedVerses(new Set());
  }, [selectedVersionId]);

  // Load chapter count when book changes
  useEffect(() => {
    if (!selectedBook) return;
    getChapterCount(selectedBook.id).then((c) => {
      setChapterCount(c);
      setSelectedChapter(1);
    }).catch(console.error);
    setCheckedVerses(new Set());
  }, [selectedBook]);

  // Load verses when chapter changes
  useEffect(() => {
    if (!selectedBook) return;
    getVerses(selectedBook.id, selectedChapter).then(setVerses).catch(console.error);
    setCheckedVerses(new Set());
  }, [selectedBook, selectedChapter]);

  // Search with 300ms debounce
  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (mode !== "search" || !selectedVersionId || !searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    searchDebounceRef.current = setTimeout(() => {
      searchBible(selectedVersionId, searchQuery).then(setSearchResults).catch(console.error);
    }, 300);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [mode, selectedVersionId, searchQuery]);

  function toggleVerse(verseNum: number) {
    setCheckedVerses((prev) => {
      const next = new Set(prev);
      if (next.has(verseNum)) next.delete(verseNum);
      else next.add(verseNum);
      return next;
    });
  }

  function buildReference(): string {
    if (!selectedBook || checkedVerses.size === 0) return "";
    const sorted = [...checkedVerses].sort((a, b) => a - b);
    // Check if selection is contiguous
    const isContiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
    if (sorted.length === 1) return `${selectedChapter}:${sorted[0]}`;
    if (isContiguous) return `${selectedChapter}:${sorted[0]}-${sorted[sorted.length - 1]}`;
    return `${selectedChapter}:${sorted.join(",")}`;
  }

  function buildSlides(): ScriptureSlide[] {
    if (!selectedBook || checkedVerses.size === 0) return [];
    const sorted = [...checkedVerses].sort((a, b) => a - b);
    const lines = sorted.map((vNum) => {
      const v = verses.find((x) => x.verse === vNum);
      return v ? `${vNum} ${v.text}` : "";
    }).filter(Boolean);
    const slides: ScriptureSlide[] = [];
    for (let i = 0; i < lines.length; i += versesPerSlide) {
      slides.push({ lines: lines.slice(i, i + versesPerSlide) });
    }
    return slides;
  }

  function handleAdd() {
    if (!selectedBook) return;
    const slides = buildSlides();
    if (slides.length === 0) return;
    onAdd(selectedBook.name, buildReference(), slides);
    setCheckedVerses(new Set());
  }

  async function handleImport() {
    setIsImporting(true);
    try {
      const filePath = await openDialog({
        multiple: false,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });
      if (!filePath || typeof filePath !== "string") return;
      const text = await readTextFile(filePath);
      const json = JSON.parse(text) as BibleImportJson;
      await importBibleJson(json);
      const v = await getBibleVersions();
      setVersions(v);
      // Preserve current selection if still present; otherwise fall back to first
      if (v.length > 0 && !v.find((x) => x.id === selectedVersionId)) {
        setSelectedVersionId(v[0].id);
      }
    } catch (e) {
      console.error("[BibleBrowser] import error", e);
    } finally {
      setIsImporting(false);
    }
  }

  // No versions yet — show import prompt
  if (versions.length === 0) {
    return (
      <div className="p-3 space-y-2 text-center">
        <p className="text-zinc-300 text-xs font-medium">성경 데이터가 없습니다</p>
        <p className="text-xs text-zinc-500 leading-relaxed text-left">
          성경 JSON 파일을 먼저 가져와야 합니다.<br />
          파일 형식: <span className="text-zinc-300">{"{ version, books: [...] }"}</span><br />
          개역개정·NIV 등 원하는 버전을 JSON으로 준비 후 아래 버튼을 누르세요.
        </p>
        <button
          onClick={handleImport}
          disabled={isImporting}
          className="w-full text-xs py-1.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded"
        >
          {isImporting ? "가져오는 중..." : "📂 성경 JSON 가져오기"}
        </button>
      </div>
    );
  }

  const checkedCount = checkedVerses.size;

  return (
    <div className="flex flex-col" style={{ maxHeight: 320 }}>
      {/* Top bar */}
      <div className="flex items-center gap-1 px-1.5 py-1 border-b border-zinc-700 flex-shrink-0">
        <select
          value={selectedVersionId ?? ""}
          onChange={(e) => setSelectedVersionId(Number(e.target.value))}
          className="bg-zinc-800 text-white text-xs rounded px-1 py-0.5 border border-zinc-600 flex-shrink-0"
        >
          {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <div className="flex flex-1 gap-0.5">
          <button
            onClick={() => setMode("browse")}
            className={`flex-1 text-xs py-0.5 rounded ${mode === "browse" ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-white"}`}
          >탐색</button>
          <button
            onClick={() => setMode("search")}
            className={`flex-1 text-xs py-0.5 rounded ${mode === "search" ? "bg-zinc-600 text-white" : "text-zinc-500 hover:text-white"}`}
          >검색</button>
        </div>
        <button
          onClick={handleImport}
          disabled={isImporting}
          title="JSON 가져오기"
          className="text-zinc-500 hover:text-white text-xs px-1 disabled:opacity-50 flex-shrink-0"
        >↓JSON</button>
      </div>

      {mode === "search" ? (
        <div className="flex flex-col flex-1 min-h-0">
          <div className="px-1.5 py-1 flex-shrink-0">
            <input
              type="text"
              placeholder="구절 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1 min-h-0">
            {searchResults.map((r) => (
              <div key={r.id} className="px-2 py-1.5 border-b border-zinc-800 text-xs">
                <div className="text-zinc-400">{r.book_name} {r.chapter}:{r.verse}</div>
                <div className="text-white">{r.text}</div>
              </div>
            ))}
            {searchQuery.trim() && searchResults.length === 0 && (
              <p className="text-xs text-zinc-600 p-2">검색 결과 없음</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 min-h-0">
          {/* Book list */}
          <div className="w-14 overflow-y-auto flex-shrink-0 border-r border-zinc-700">
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setSelectedBook(b)}
                className={`w-full text-left px-1 py-1 text-xs truncate ${
                  selectedBook?.id === b.id
                    ? "bg-zinc-600 text-white"
                    : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
                }`}
              >
                {b.abbr}
              </button>
            ))}
          </div>

          {/* Chapter + Verses */}
          <div className="flex flex-col flex-1 min-w-0 min-h-0">
            {/* Chapter grid */}
            <div className="flex flex-wrap gap-0.5 p-1 border-b border-zinc-700 flex-shrink-0 max-h-14 overflow-y-auto">
              {Array.from({ length: chapterCount }, (_, i) => i + 1).map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSelectedChapter(ch)}
                  className={`w-6 h-6 text-xs rounded ${
                    selectedChapter === ch
                      ? "bg-blue-600 text-white"
                      : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                  }`}
                >
                  {ch}
                </button>
              ))}
            </div>

            {/* Verse list */}
            <div className="overflow-y-auto flex-1 min-h-0">
              {verses.map((v) => (
                <label
                  key={v.verse}
                  className={`flex gap-1.5 px-2 py-1 border-b border-zinc-800 cursor-pointer text-xs ${
                    checkedVerses.has(v.verse) ? "bg-blue-900/30" : "hover:bg-zinc-800"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checkedVerses.has(v.verse)}
                    onChange={() => toggleVerse(v.verse)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <span className="text-zinc-500 w-5 flex-shrink-0">{v.verse}</span>
                  <span className="text-white">{v.text}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bottom action bar */}
      <div className="flex items-center gap-1.5 px-1.5 py-1.5 border-t border-zinc-700 flex-shrink-0 bg-zinc-900">
        <select
          value={versesPerSlide}
          onChange={(e) => setVersesPerSlide(Number(e.target.value))}
          className="bg-zinc-800 text-white text-xs rounded px-1 py-0.5 border border-zinc-600 flex-shrink-0"
        >
          <option value={1}>1절/슬라이드</option>
          <option value={2}>2절/슬라이드</option>
          <option value={3}>3절/슬라이드</option>
        </select>
        <span className="text-zinc-500 text-xs flex-1">
          {checkedCount > 0 ? `${checkedCount}절 선택` : "구절 선택"}
        </span>
        <button
          onClick={handleAdd}
          disabled={checkedCount === 0 || isAdding}
          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
        >
          {isAdding ? "추가 중..." : "+ 추가"}
        </button>
      </div>
    </div>
  );
}
