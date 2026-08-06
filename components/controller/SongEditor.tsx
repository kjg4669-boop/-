"use client";

import { useState, useEffect, useRef } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, horizontalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { songDb, tagDb } from "@/lib/db";
import type { Tag } from "@/lib/db";
import type { Song, LyricSection, LyricSlide, BackingTrack } from "@/lib/types";
import { backingTrackDb } from "@/lib/backingTrackDb";
import { newSlideId } from "@/lib/utils";
import { SECTION_LABEL, SECTION_COLORS } from "@/lib/constants";

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
  text2?: string;   // secondary language lyrics
  chords?: string;  // chord line for musicians e.g. "C  G  Am  F"
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
        lines2: block.text2 ? block.text2.split("\n").filter((l) => l.trim()) : undefined,
        chords: block.chords || undefined,
        canvas,
      };
    });
}

function SortableVerseChip({ id, label, color }: { id: string; label: string; color: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        backgroundColor: color,
        color: "#fff",
        borderRadius: 4,
        padding: "2px 8px",
        fontSize: 11,
        fontWeight: 600,
        cursor: "grab",
        flexShrink: 0,
      }}
      {...attributes}
      {...listeners}
    >
      {label}
    </div>
  );
}

export default function SongEditor({ song, onSave, onCancel }: Props) {
  const blockIdCounter = useRef(0);
  const nextId = () => ++blockIdCounter.current;

  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [ccliNumber, setCcliNumber] = useState(song?.ccli_number ?? "");
  const [copyrightText, setCopyrightText] = useState(song?.copyright_text ?? "");
  const [publisher, setPublisher] = useState(song?.publisher ?? "");
  const [bpm, setBpm] = useState<number | undefined>(song?.bpm);
  const [blocks, setBlocks] = useState<BlockInput[]>(() => [
    { id: nextId(), section: "verse", text: "" },
  ]);
  const [saving, setSaving] = useState(false);
  const [verseOrder, setVerseOrder] = useState<string[]>(song?.verse_order ?? []);
  const [error, setError] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set());
  const [newTagName, setNewTagName] = useState("");
  const TAG_COLORS = ["#6366f1","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#8b5cf6","#06b6d4"];
  const [selectedTagColor, setSelectedTagColor] = useState(TAG_COLORS[0]);
  const [backingTracks, setBackingTracks] = useState<BackingTrack[]>([]);

  useEffect(() => {
    if (!song?.id) return;
    backingTrackDb.list(song.id).then(setBackingTracks).catch(console.error);
  }, [song?.id]);

  useEffect(() => {
    tagDb.list().then(setAllTags).catch(console.error);
    if (song?.id) {
      tagDb.getForSong(song.id).then((tags) => setSelectedTagIds(new Set(tags.map((t) => t.id)))).catch(console.error);
    } else {
      setSelectedTagIds(new Set());
    }
  }, [song?.id]);

  useEffect(() => {
    const validIds = new Set(blocks.map((b) => b.slideId).filter(Boolean));
    setVerseOrder((prev) => prev.filter((id) => validIds.has(id)));
  }, [blocks]);

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
    setCcliNumber(song?.ccli_number ?? "");
    setCopyrightText(song?.copyright_text ?? "");
    setPublisher(song?.publisher ?? "");
    setBpm(song?.bpm);
    if (song && song.lyrics_json.length > 0) {
      setBlocks(
        song.lyrics_json.map((slide) => ({
          id: nextId(),
          section: slide.section,
          text: slide.lines.join("\n"),
          slideId: slide.id,
          canvas: slide.canvas,
          text2: slide.lines2?.join("\n") ?? "",
          chords: slide.chords ?? "",
        }))
      );
    } else {
      setBlocks([{ id: nextId(), section: "verse", text: "" }]);
    }
    setVerseOrder(song?.verse_order ?? []);
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

  async function handleAddTrack() {
    if (!song?.id) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        multiple: false,
        filters: [{ name: "오디오", extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac"] }],
      });
      if (!path || typeof path !== "string") return;
      await backingTrackDb.create(song.id, path);
      setBackingTracks(await backingTrackDb.list(song.id));
    } catch { /* ignore */ }
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const lyrics_json = parseBlocksToSlides(blocks);
      const verse_order = verseOrder.length > 0 ? verseOrder : undefined;
      let savedSong: Song;
      if (song) {
        await songDb.update(song.id, { title: title.trim(), artist: artist.trim(), lyrics_json, verse_order, ccli_number: ccliNumber.trim() || undefined, copyright_text: copyrightText.trim() || undefined, publisher: publisher.trim() || undefined, bpm });
        savedSong = { ...song, title: title.trim(), artist: artist.trim(), lyrics_json, verse_order, ccli_number: ccliNumber.trim() || undefined, copyright_text: copyrightText.trim() || undefined, publisher: publisher.trim() || undefined, bpm, updated_at: new Date().toISOString() };
      } else {
        const savedId = await songDb.create({ title: title.trim(), artist: artist.trim(), lyrics_json, verse_order, ccli_number: ccliNumber.trim() || undefined, copyright_text: copyrightText.trim() || undefined, publisher: publisher.trim() || undefined, bpm });
        const now = new Date().toISOString();
        savedSong = { id: savedId, title: title.trim(), artist: artist.trim(), lyrics_json, verse_order, ccli_number: ccliNumber.trim() || undefined, copyright_text: copyrightText.trim() || undefined, publisher: publisher.trim() || undefined, bpm, created_at: now, updated_at: now };
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
        <input
          type="text"
          placeholder="CCLI 번호"
          value={ccliNumber}
          onChange={(e) => setCcliNumber(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="저작권 텍스트"
          value={copyrightText}
          onChange={(e) => setCopyrightText(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="출판사"
          value={publisher}
          onChange={(e) => setPublisher(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
        <input
          type="number"
          placeholder="BPM (템포, 선택사항)"
          value={bpm ?? ""}
          onChange={(e) => setBpm(e.target.value ? Number(e.target.value) : undefined)}
          min={40} max={300}
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
            <textarea
              value={block.text2 ?? ""}
              onChange={(e) => updateBlock(i, "text2", e.target.value)}
              placeholder="번역 가사 (선택사항, Enter로 줄 구분)"
              rows={2}
              className="w-full bg-zinc-900 text-xs italic text-zinc-400 rounded px-2 py-1 border border-zinc-700 outline-none focus:border-yellow-500 resize-none"
            />
            <input
              type="text"
              value={block.chords ?? ""}
              onChange={(e) => updateBlock(i, "chords", e.target.value)}
              placeholder="코드 (예: C  G  Am  F)"
              className="w-full bg-zinc-900 text-xs font-mono text-blue-400 rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500"
            />
          </div>
        ))}

        <button
          onClick={addBlock}
          className="w-full py-1.5 text-xs text-zinc-400 border border-dashed border-zinc-600 rounded hover:border-zinc-400 hover:text-white transition-colors"
        >
          + 섹션 추가
        </button>

        {/* Verse Order Editor */}
        <div className="border border-zinc-700 rounded p-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">절 순서</p>
            {verseOrder.length > 0 && (
              <button
                onClick={() => setVerseOrder([])}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                초기화
              </button>
            )}
          </div>
          {verseOrder.length === 0 ? (
            <button
              onClick={() => {
                const ids = blocks.filter((b) => b.slideId).map((b) => b.slideId!);
                if (ids.length > 0) setVerseOrder(ids);
              }}
              disabled={!blocks.some((b) => b.slideId)}
              className="w-full text-xs py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-40 rounded text-zinc-300"
              title={blocks.some((b) => b.slideId) ? "현재 블록 순서로 절 순서 생성" : "저장 후 편집 가능"}
            >
              절 순서 편집 (저장 후 사용 가능)
            </button>
          ) : (
            <DndContext
              collisionDetection={closestCenter}
              onDragEnd={(event: DragEndEvent) => {
                const { active, over } = event;
                if (!over || active.id === over.id) return;
                const oldIdx = verseOrder.indexOf(String(active.id));
                const newIdx = verseOrder.indexOf(String(over.id));
                if (oldIdx !== -1 && newIdx !== -1) setVerseOrder(arrayMove(verseOrder, oldIdx, newIdx));
              }}
            >
              <SortableContext items={verseOrder} strategy={horizontalListSortingStrategy}>
                <div className="flex flex-wrap gap-1">
                  {verseOrder.map((id) => {
                    const block = blocks.find((b) => b.slideId === id);
                    if (!block) return null;
                    const label = `${SECTION_LABEL[block.section] ?? block.section}`;
                    const color = SECTION_COLORS[block.section] ?? "#6b7280";
                    return <SortableVerseChip key={id} id={id} label={label} color={color} />;
                  })}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Tags */}
        <div className="border border-zinc-700 rounded p-2 space-y-1.5">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">태그</p>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => toggleTag(tag.id)}
                className="px-2 py-0.5 rounded-full text-xs border transition-all"
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
              <span className="text-xs text-zinc-600">태그 없음 — 아래에서 추가</span>
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

        {/* Backing Tracks */}
        {song?.id && (
          <div className="border border-zinc-700 rounded p-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500 uppercase tracking-wide">배킹 트랙</p>
              <button
                onClick={handleAddTrack}
                className="text-xs px-2 py-0.5 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
              >
                + 파일 추가
              </button>
            </div>
            {backingTracks.length === 0 && (
              <p className="text-xs text-zinc-600">오디오 파일을 추가하면 슬라이드 첫 진입 시 자동 재생됩니다</p>
            )}
            {backingTracks.map((track) => (
              <div key={track.id} className="space-y-1">
                <div className="flex items-center gap-1">
                  <span className="flex-1 text-xs text-zinc-300 truncate" title={track.file_path}>
                    {track.file_path.split(/[\\/]/).pop() ?? track.file_path}
                  </span>
                  <button
                    onClick={async () => {
                      const songId = song?.id;
                      await backingTrackDb.delete(track.id);
                      if (songId) setBackingTracks(await backingTrackDb.list(songId));
                    }}
                    className="text-zinc-600 hover:text-red-400 text-xs px-1"
                  >✕</button>
                </div>
                <div className="flex items-center gap-2 pl-1">
                  <span className="text-zinc-500 text-xs w-8">볼륨</span>
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={track.volume}
                    onChange={async (e) => {
                      const volume = Number(e.target.value);
                      await backingTrackDb.update(track.id, { volume });
                      setBackingTracks((prev) => prev.map((t) => t.id === track.id ? { ...t, volume } : t));
                    }}
                    className="flex-1"
                  />
                  <span className="text-zinc-500 text-xs w-6">{Math.round(track.volume * 100)}%</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={track.repeat}
                      onChange={async (e) => {
                        const repeat = e.target.checked;
                        await backingTrackDb.update(track.id, { repeat });
                        setBackingTracks((prev) => prev.map((t) => t.id === track.id ? { ...t, repeat } : t));
                      }}
                      className="rounded"
                    />
                    <span className="text-xs text-zinc-400">반복</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
