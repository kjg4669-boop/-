"use client";

import { useState } from "react";
import { songDb } from "@/lib/db";
import { parsedSlidesToLyricSlides } from "@/lib/pptxParser";
import type { ParsedSlide } from "@/lib/pptxParser";
import type { Song } from "@/lib/types";

interface Props {
  fileName: string;
  slides: ParsedSlide[];        // 비어있지 않은 슬라이드만 전달됨
  onSave: (saved: Song) => void;
  onCancel: () => void;
}

export default function PptxImportModal({ fileName, slides, onSave, onCancel }: Props) {
  // 파일명에서 .pptx 제거해 초기 제목으로 사용
  const defaultTitle = fileName.replace(/\.pptx$/i, "");
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const lyrics = parsedSlidesToLyricSlides(slides);
      const songId = await songDb.create({
        title: title.trim(),
        artist: "",
        lyrics_json: lyrics,
      });
      const saved = await songDb.get(songId);
      if (saved) onSave(saved);
    } catch (err) {
      console.error("PPTX import save failed:", err);
      setError("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[480px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">PPTX 임포트</span>
          <span className="text-xs text-zinc-500 truncate max-w-[200px]">{fileName}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 제목 입력 */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">제목 (필수)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-800 text-white text-sm rounded px-3 py-1.5 border border-zinc-600 outline-none focus:border-blue-500"
              placeholder="찬양 제목을 입력하세요"
              autoFocus
            />
          </div>

          {/* 슬라이드 미리보기 */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">
              슬라이드 미리보기 ({slides.length}장)
            </p>
            {slides.length === 0 ? (
              <p className="text-xs text-yellow-400">
                텍스트가 있는 슬라이드가 없습니다. 빈 가사로 저장됩니다.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slides.map((slide, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs"
                  >
                    <span className="text-zinc-500 text-[10px]">{i + 1}</span>
                    <p className="text-white mt-0.5 line-clamp-3 leading-snug whitespace-pre-line">
                      {slide.lines.join("\n")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-white"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
          >
            {saving ? "저장 중..." : "찬양 라이브러리에 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
