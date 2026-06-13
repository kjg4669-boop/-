"use client";

import { useEffect, useState, useRef } from "react";
import { songDb, mediaDb, serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";
import type { Song, MediaItem } from "@/lib/types";
import SongEditor from "./SongEditor";
import { parsePptx } from "@/lib/pptxParser";
import PptxImportModal from "./PptxImportModal";
import type { ParsedSlide } from "@/lib/pptxParser";

interface Props {
  mode?: "media" | "songs";
}

export default function LibraryPanel({ mode = "media" }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editSong, setEditSong] = useState<Song | null>(null); // null = 신규
  const [notice, setNotice] = useState("");

  const { currentService, setCurrentService } = useQueueStore();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSongRef = useRef<Song | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pptxInputRef = useRef<HTMLInputElement | null>(null);
  const [pptxModal, setPptxModal] = useState<{ fileName: string; slides: ParsedSlide[] } | null>(null);
  const [pptxLoading, setPptxLoading] = useState(false);

  useEffect(() => {
    if (mode === "songs") {
      songDb.list().then(setSongs).catch(console.error);
    } else {
      mediaDb.list().then(setMedia).catch(console.error);
    }
  }, [mode]);

  // Fix 1 + 2: cleanup on unmount
  useEffect(() => {
    return () => {
      if (clickTimerRef.current !== null) clearTimeout(clickTimerRef.current);
      if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  function showNotice(msg: string) {
    setNotice(msg);
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice("");
    }, 1500);
  }

  async function handleSearch(q: string) {
    setSearch(q);
    if (mode === "songs") {
      const results = q ? await songDb.search(q) : await songDb.list();
      setSongs(results);
    }
  }

  // Fix 3: try/catch + showNotice
  async function handleAddToService(song: Song) {
    if (!currentService) {
      showNotice("예배를 먼저 선택해주세요");
      return;
    }
    try {
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order: currentService.items.length,
        type: "song",
        song_id: song.id,
        media_id: undefined,
        settings_json: {},
        label: song.title,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) setCurrentService(updated);
      showNotice(`"${song.title}" 추가됨`);
    } catch {
      showNotice("추가에 실패했습니다. 다시 시도해 주세요.");
    }
  }

  function handleSongClick(song: Song) {
    if (clickTimerRef.current !== null && pendingSongRef.current?.id === song.id) {
      // Same song clicked twice within 300ms → double click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      pendingSongRef.current = null;
      handleAddToService(song);
    } else {
      // Cancel any pending single-click from a different song
      if (clickTimerRef.current !== null) {
        clearTimeout(clickTimerRef.current);
        clickTimerRef.current = null;
      }
      pendingSongRef.current = song;
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        const s = pendingSongRef.current;
        pendingSongRef.current = null;
        if (s) {
          setEditSong(s);
          setEditMode(true);
        }
      }, 300);
    }
  }

  function handleNewSong() {
    setEditSong(null);
    setEditMode(true);
  }

  // Fix 4: optimistic update using saved Song
  function handleSongSaved(saved: Song) {
    setEditMode(false);
    setEditSong(null);
    setSongs((prev) =>
      prev.some((s) => s.id === saved.id)
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved]
    );
  }

  function handleEditCancel() {
    setEditMode(false);
    setEditSong(null);
  }

  async function handlePptxFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // 동일 파일 재선택 허용을 위해 value 초기화
    e.target.value = "";
    setPptxLoading(true);
    try {
      const slides = await parsePptx(file);
      setPptxModal({ fileName: file.name, slides });
    } catch (err) {
      console.error("PPTX parse failed:", err);
      showNotice("PPTX 파일을 읽을 수 없습니다.");
    } finally {
      setPptxLoading(false);
    }
  }

  function handlePptxSaved(saved: Song) {
    setPptxModal(null);
    setSongs((prev) =>
      prev.some((s) => s.id === saved.id)
        ? prev.map((s) => (s.id === saved.id ? saved : s))
        : [...prev, saved]
    );
    showNotice(`"${saved.title}" 임포트됨`);
  }

  // Song edit mode
  if (mode === "songs" && editMode) {
    return (
      <SongEditor
        song={editSong}
        onSave={handleSongSaved}
        onCancel={handleEditCancel}
      />
    );
  }

  if (mode === "songs") {
    return (
      <div className="h-full flex flex-col">
        {/* PPTX 임포트 모달 */}
        {pptxModal && (
          <PptxImportModal
            fileName={pptxModal.fileName}
            slides={pptxModal.slides}
            onSave={handlePptxSaved}
            onCancel={() => setPptxModal(null)}
          />
        )}
        {/* Notice */}
        {notice && (
          <div className="px-3 py-1.5 bg-blue-900 text-blue-200 text-xs text-center">
            {notice}
          </div>
        )}
        <div className="p-2 border-b border-zinc-700 flex gap-1">
          <input
            type="text"
            placeholder="찬양 검색..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
          />
          {/* 숨겨진 파일 입력 */}
          <input
            ref={pptxInputRef}
            type="file"
            accept=".pptx"
            onChange={handlePptxFile}
            className="hidden"
          />
          <button
            onClick={() => pptxInputRef.current?.click()}
            disabled={pptxLoading}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
          >
            {pptxLoading ? "..." : "PPTX"}
          </button>
          <button
            onClick={handleNewSong}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
          >
            + 새 찬양
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {songs.map((song) => (
            <div
              key={song.id}
              onClick={() => handleSongClick(song)}
              className="px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer select-none"
            >
              <div className="font-medium text-white">{song.title}</div>
              {song.artist && <div className="text-zinc-500">{song.artist}</div>}
              <div className="text-zinc-600">{song.lyrics_json.length}절</div>
            </div>
          ))}
          {songs.length === 0 && (
            <p className="text-xs text-zinc-500 p-3">찬양이 없습니다</p>
          )}
        </div>
        <div className="p-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">클릭: 편집 · 더블클릭: 예배 추가</p>
        </div>
      </div>
    );
  }

  // Media mode (unchanged)
  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-zinc-700">
        <p className="text-xs text-zinc-500">미디어 파일</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {media.map((item) => (
          <div
            key={item.id}
            className="px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer"
          >
            <div className="font-medium text-white">{item.name}</div>
            <div className="text-zinc-500 capitalize">{item.type}</div>
          </div>
        ))}
        {media.length === 0 && (
          <p className="text-xs text-zinc-500 p-3">미디어 파일이 없습니다</p>
        )}
      </div>
    </div>
  );
}
