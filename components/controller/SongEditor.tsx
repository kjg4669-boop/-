"use client";

import { useState, useEffect, useRef } from "react";
import { songDb, tagDb } from "@/lib/db";
import type { Tag } from "@/lib/db";
import type { Song, LyricSection, LyricSlide } from "@/lib/types";
import { newSlideId } from "@/lib/utils";
import { SECTION_LABEL } from "@/lib/constants";

const SECTION_LABELS: Record<LyricSection, string> = SECTION_LABEL as Record<LyricSection, string>;

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
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const TAG_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4"];
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0]);

  useEffect(() => {
    tagDb.list().then(setAllTags).catch(console.error);
    if (song?.id) {
      tagDb.getForSong(song.id).then((tags) => setSelectedTagIds(new Set(tags.map((t) => t.id)))).catch(console.error);
    } else {
      setSelectedTagIds(new Set());
    }
  }, [song?.id]);

  async function handleCreateTag() {
    if (!newTagName.trim()) return;
    const color = selectedTagColor;
    try {
      const id = await tagDb.create(newTagName.trim(), color);
      const newTag: Tag = { id, name: newTagName.trim(), color };
      setAllTags((prev) => [...prev, newTag]);
      setSelectedTagIds((prev) => new Set([...prev, id]));
      setNewTagName("");
    } catch { /* ignore */ }
  }

  function toggleTag(tagId: number) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId); else next.add(tagId);
      return next;
    });
  }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function splitBlock(i: number) {
    setBlocks((prev) => {
      const block = prev[i];
      const lines = block.text.split("\n").filter((l) => l.trim());
      if (lines.length < 2) return prev;
      const mid = Math.ceil(lines.length / 2);
      const first: BlockInput = { id: nextId(), section: block.section, text: lines.slice(0, mid).join("\n") };
      const second: BlockInput = { id: nextId(), section: block.section, text: lines.slice(mid).join("\n") };
      return [...prev.slice(0, i), first, second, ...prev.slice(i + 1)];
    });
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const lyrics_json = parseBlocksToSlides(blocks);
      let savedSong: Song;
      if (song) {
        await songDb.update(song.id, { title: title.trim(), artist: artist.trim(), lyrics_json });
        savedSong = { ...song, title: title.trim(), artist: artist.trim(), lyrics_json, updated_at: new Date().toISOString() };
      } else {
        const savedId = await songDb.create({ title: title.trim(), artist: artist.trim(), lyrics_json });
        const now = new Date().toISOString();
        savedSong = { id: savedId, title: title.trim(), artist: artist.trim(), lyrics_json, created_at: now, updated_at: now };
      }
      // Save tags first so parent refresh sees correct associations
      await Promise.all(
        allTags.map((tag) => tagDb.setSongTag(savedSong.id, tag.id, selectedTagIds.has(tag.id)))
      );
      onSave(savedSong);
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
        {blocks.some((b) => b.text.split("\n").filter((l) => l.trim()).length >= 4) && (
          <button
            onClick={() => {
              setBlocks((prev) => {
                const result: BlockInput[] = [];
                for (let i = 0; i < prev.length; i++) {
                  const block = prev[i];
                  const lines = block.text.split("\n").filter((l) => l.trim());
                  if (lines.length >= 4) {
                    const mid = Math.ceil(lines.length / 2);
                    result.push({ id: nextId(), section: block.section, text: lines.slice(0, mid).join("\n") });
                    result.push({ id: nextId(), section: block.section, text: lines.slice(mid).join("\n") });
                  } else {
                    result.push(block);
                  }
                }
                return result;
              });
            }}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
            title="4줄 이상인 블록을 모두 반으로 분할"
          >
            전체 분할
          </button>
        )}
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
              {block.text.split("\n").filter((l) => l.trim()).length >= 4 && (
                <button
                  onClick={() => splitBlock(i)}
                  className="text-zinc-400 hover:text-blue-400 text-xs px-1"
                  title="이 블록을 반으로 분할"
                >
                  분할
                </button>
              )}
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

        {/* Tags */}
        <div className="border border-zinc-700 rounded p-2 space-y-1.5">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wide">태그</p>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className="px-2 py-0.5 rounded-full text-[10px] border transition-all"
                style={
                  selectedTagIds.has(tag.id)
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                    : { borderColor: "#52525b", color: "#a1a1aa" }
                }
              >
                {tag.name}
              </button>
            ))}
            {allTags.length === 0 && (
              <span className="text-[10px] text-zinc-600">태그 없음 — 아래에서 추가</span>
            )}
          </div>
          {/* Tag color picker */}
          <div className="flex gap-1 flex-wrap">
            {TAG_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setSelectedTagColor(c)}
                title={c}
                style={{ backgroundColor: c, width: 18, height: 18, borderRadius: "50%", border: selectedTagColor === c ? "2px solid white" : "2px solid transparent", flexShrink: 0 }}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <input
              type="text"
              placeholder="새 태그..."
              value={newTagName}
              onChange={(e) => setNewTagName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void handleCreateTag(); } }}
              className="flex-1 bg-zinc-900 text-white text-xs rounded px-2 py-0.5 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <div style={{ width: 14, height: 14, borderRadius: "50%", backgroundColor: selectedTagColor, flexShrink: 0, alignSelf: "center" }} />
            <button
              onClick={handleCreateTag}
              disabled={!newTagName.trim()}
              className="text-xs px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded"
            >추가</button>
          </div>
        </div>
      </div>
    </div>
  );
}
