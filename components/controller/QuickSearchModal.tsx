"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import type { FlatSlide } from "@/lib/types";
import { SECTION_LABEL } from "@/lib/constants";

interface Props {
  slides: FlatSlide[];
  activeIdx: number;
  onSelect: (flatIdx: number) => void;
  onClose: () => void;
}

export default function QuickSearchModal({ slides, activeIdx, onSelect, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [selIdx, setSelIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return slides
      .map((s, i) => ({ ...s, flatIdx: i }))
      .filter((s) =>
        !q ||
        s.songTitle.toLowerCase().includes(q) ||
        s.slide.lines.some((l) => l.toLowerCase().includes(q))
      );
  }, [slides, query]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setSelIdx(0); }, [query]);

  useEffect(() => {
    if (!listRef.current) return;
    const item = listRef.current.children[selIdx] as HTMLElement;
    item?.scrollIntoView({ block: "nearest" });
  }, [selIdx]);

  function onKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setSelIdx((v) => Math.min(v + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelIdx((v) => Math.max(v - 1, 0)); }
    else if (e.key === "Enter" && filtered[selIdx]) { e.preventDefault(); onSelect(filtered[selIdx].flatIdx); onClose(); }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center pt-16"
      onClick={onClose}
    >
      <div
        className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-[500px] max-h-[65vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-3 border-b border-zinc-700 flex items-center gap-2">
          <span className="text-zinc-500 text-sm">🔍</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="슬라이드 검색... 곡명 또는 가사"
            className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-zinc-600"
          />
          <span className="text-[10px] text-zinc-600">Esc 닫기</span>
        </div>
        <div ref={listRef} className="overflow-y-auto flex-1">
          {filtered.length === 0 && (
            <p className="text-xs text-zinc-500 p-4 text-center">검색 결과 없음</p>
          )}
          {filtered.map((s, i) => (
            <button
              key={s.flatIdx}
              onClick={() => { onSelect(s.flatIdx); onClose(); }}
              className={`w-full text-left px-4 py-2 border-b border-zinc-800 transition-colors ${
                i === selIdx ? "bg-blue-900/50 border-l-2 border-l-blue-400" : "hover:bg-zinc-800"
              } ${s.flatIdx === activeIdx ? "ring-inset ring-1 ring-orange-400/40" : ""}`}
            >
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] text-zinc-600 w-6 shrink-0 text-right">{s.flatIdx + 1}</span>
                <span className="text-xs font-medium text-zinc-300 truncate">{s.songTitle}</span>
                <span className="text-[10px] text-zinc-600 shrink-0 ml-auto">{SECTION_LABEL[s.slide.section] ?? s.slide.section}</span>
              </div>
              <div className="text-xs text-zinc-500 truncate pl-8">
                {s.slide.lines[0] ?? <span className="italic text-zinc-700">빈 슬라이드</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="px-4 py-1.5 border-t border-zinc-800 text-[10px] text-zinc-600 flex gap-4">
          <span>↑↓ 이동</span>
          <span>Enter 선택</span>
          <span>/ 열기</span>
          <span className="ml-auto">{filtered.length} / {slides.length}개</span>
        </div>
      </div>
    </div>
  );
}
