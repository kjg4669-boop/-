"use client";

import { useState, useEffect, useRef } from "react";
import { songDb } from "@/lib/db";
import type { Song, LyricSection, LyricSlide } from "@/lib/types";
import { newSlideId } from "@/lib/utils";

const SECTION_LABELS: Record<LyricSection, string> = {
  intro: "인트로",
  verse: "절",
  "pre-chorus": "프리코러스",
  chorus: "코러스",
  bridge: "브릿지",
  outro: "아웃트로",
};

const SECTION_OPTIONS: LyricSection[] = [
  "intro", "verse", "pre-chorus", "chorus", "bridge", "outro",
];

interface BlockInput {
  id: number;
  section: LyricSection;
  text: string;
  slideId?: string;               // original slide ID (undefined = new block)
  canvas?: LyricSlide["canvas"]; // preserve existing canvas positioning
}

interface Props {
  song: Song | null; // null = 신규
  onSave: (song: Song) => void;
  onCancel: () => void;
}

function parseBlocksToSlides(blocks: BlockInput[]): LyricSlide[] {
  const counts: Partial<Record<LyricSection, number>> = {};
  return blocks
    .filter((b) => b.text.trim())
    .map((block) => {
      counts[block.section] = (counts[block.section] ?? 0) + 1;
      const idx = counts[block.section]!;
      const slideId = block.slideId ?? newSlideId();
      const lines = block.text.split("\n").filter((l) => l.trim());
      // Preserve existing canvas layout but sync lyric text block with current lines
      const lyricText = lines.join("\n");
      const canvas: LyricSlide["canvas"] = block.canvas
        ? {
            ...block.canvas,
            textBlocks: block.canvas.textBlocks.map((tb) =>
              tb.id === `${slideId}-lyric` ? { ...tb, text: lyricText } : tb
            ),
          }
        : {
            textBlocks: [{
              id: `${slideId}-lyric`,
              x: 160, y: 290,
              width: 1600, height: 500,
              text: lyricText,
              fontSize: 60,
              color: "#ffffff",
              fontFamily: "sans-serif",
              textAlign: "center",
            }],
          };
      return {
        id: slideId,
        section: block.section,
        sectionIndex: idx,
        lines,
        canvas,
      };
    });
}

export default function SongEditor({ song, onSave, onCancel }: Props) {
  const blockIdCounter = useRef(0);
  const nextId = () => ++blockIdCounter.current;

  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [blocks, setBlocks] = useState<BlockInput[]>(() => [
    { id: nextId(), section: "verse", text: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTitle(song?.title ?? "");
    setArtist(song?.artist ?? "");
    if (song && song.lyrics_json.length > 0) {
      setBlocks(
        song.lyrics_json.map((slide) => ({
          id: nextId(),
          section: slide.section,
          text: slide.lines.join("\n"),
          slideId: slide.id,
          canvas: slide.canvas,
        }))
      );
    } else {
      setBlocks([{ id: nextId(), section: "verse", text: "" }]);
    }
  }, [song?.id, song?.updated_at]);

  function addBlock() {
    setBlocks((prev) => [...prev, { id: nextId(), section: "verse", text: "" }]);
  }

  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateBlock(i: number, field: keyof BlockInput, value: string) {
    setBlocks((prev) =>
      prev.map((b, idx) =>
        idx === i ? { ...b, [field]: value } : b
      )
    );
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const lyrics_json = parseBlocksToSlides(blocks);
      if (song) {
        await songDb.update(song.id, { title: title.trim(), artist: artist.trim(), lyrics_json });
        onSave({ ...song, title: title.trim(), artist: artist.trim(), lyrics_json, updated_at: new Date().toISOString() });
      } else {
        const id = await songDb.create({
          title: title.trim(),
          artist: artist.trim(),
          lyrics_json,
        });
        const now = new Date().toISOString();
        onSave({
          id,
          title: title.trim(),
          artist: artist.trim(),
          lyrics_json,
          created_at: now,
          updated_at: now,
        });
      }
    } catch {
      setError("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700 flex items-center gap-2">
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700"
        >
          ← 목록
        </button>
        <span className="flex-1 text-xs text-zinc-400 truncate">
          {song ? song.title : "새 찬양"}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-3 py-1.5 bg-red-900 text-red-200 text-xs">
          {error}
        </div>
      )}

      {/* Fields */}
      <div className="p-2 border-b border-zinc-700 space-y-1">
        <input
          type="text"
          placeholder="제목 *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="아티스트"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {blocks.map((block, i) => (
          <div key={block.id} className="border border-zinc-700 rounded p-2 space-y-1">
            <div className="flex items-center gap-1">
              <select
                value={block.section}
                onChange={(e) =>
                  updateBlock(i, "section", e.target.value as LyricSection)
                }
                className="bg-zinc-800 text-white text-xs rounded px-1 py-0.5 border border-zinc-600 outline-none"
              >
                {SECTION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SECTION_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="flex-1 text-xs text-zinc-500">블록 {i + 1}</span>
              {blocks.length > 1 && (
                <button
                  onClick={() => removeBlock(i)}
                  className="text-zinc-500 hover:text-red-400 text-xs px-1"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={block.text}
              onChange={(e) => updateBlock(i, "text", e.target.value)}
              placeholder="가사를 입력하세요&#10;(Enter로 줄 구분)"
              rows={3}
              className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500 resize-none"
            />
          </div>
        ))}

        <button
          onClick={addBlock}
          className="w-full py-1.5 text-xs text-zinc-400 border border-dashed border-zinc-600 rounded hover:border-zinc-400 hover:text-white transition-colors"
        >
          + 섹션 추가
        </button>
      </div>
    </div>
  );
}
