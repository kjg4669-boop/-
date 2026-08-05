"use client";

import { useEffect, useState, useRef } from "react";
import { songDb, mediaDb, serviceDb, tagDb } from "@/lib/db";
import type { Tag } from "@/lib/db";
import { importMediaFile, toDisplayUrl, captureVideoThumbnail } from "@/lib/media";
import { useQueueStore } from "@/stores/queueStore";
import type { Song, MediaItem } from "@/lib/types";
import SongEditor from "./SongEditor";
import { openHelpWindow } from "./HelpWindow";
import { parsePptx } from "@/lib/pptxParser";
import PptxImportModal from "./PptxImportModal";
import type { ParsedSlide } from "@/lib/pptxParser";
import { parseOpenLyricsFile } from "@/lib/openLyricsParser";

interface Props {
  mode?: "media" | "songs";
  initialEditSong?: Song | null;
  onEditSongConsumed?: () => void;
}

export default function LibraryPanel({ mode = "media", initialEditSong, onEditSongConsumed }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editSong, setEditSong] = useState<Song | null>(null); // null = 신규
  const [notice, setNotice] = useState("");
  const [deletingSongId, setDeletingSongId] = useState<number | null>(null);
  const [hoveredSongId, setHoveredSongId] = useState<number | null>(null);
  const [sort, setSort] = useState<"title" | "recent">("title");
  const [openLPLoading, setOpenLPLoading] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [filterTagId, setFilterTagId] = useState<number | null>(null);
  const [songTagMap, setSongTagMap] = useState<Record<number, Tag[]>>({});

  const { currentService, setCurrentService } = useQueueStore();
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchGenRef = useRef(0);
  const pptxInputRef = useRef<HTMLInputElement | null>(null);
  const openLPInputRef = useRef<HTMLInputElement | null>(null);
  const [pptxModal, setPptxModal] = useState<{ fileName: string; slides: ParsedSlide[] } | null>(null);
  const [pptxLoading, setPptxLoading] = useState(false);

  // Media mode state
  const [importing, setImporting] = useState<"image" | "video" | null>(null);
  const [deletingMediaId, setDeletingMediaId] = useState<number | null>(null);
  const deleteMediaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [videoThumbs, setVideoThumbs] = useState<Record<number, string | null>>({});

  useEffect(() => {
    if (mode === "songs") {
      songDb.list().then(setSongs).catch(console.error);
      tagDb.list().then(setAllTags).catch(console.error);
      tagDb.getAllSongTagMap().then(setSongTagMap).catch(console.error);
    } else {
      mediaDb.list().then((items) => {
        setMedia(items);
        // Capture thumbnails for existing video items on mount
        items.filter((m) => m.type === "video").forEach((m) => {
          const url = toDisplayUrl(m.file_path);
          if (url) {
            void captureVideoThumbnail(url).then((thumb) =>
              setVideoThumbs((prev) => ({ ...prev, [m.id]: thumb }))
            );
          }
        });
      }).catch(console.error);
    }
  }, [mode]);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
      if (deleteTimerRef.current !== null) clearTimeout(deleteTimerRef.current);
      if (searchDebounceRef.current !== null) clearTimeout(searchDebounceRef.current);
      if (deleteMediaTimerRef.current !== null) clearTimeout(deleteMediaTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialEditSong) {
      setEditSong(initialEditSong);
      setEditMode(true);
      onEditSongConsumed?.();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditSong]);

  function showNotice(msg: string) {
    setNotice(msg);
    if (noticeTimerRef.current !== null) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      noticeTimerRef.current = null;
      setNotice("");
    }, 1500);
  }

  function handleSearch(q: string) {
    setSearch(q);
    if (mode !== "songs") return;
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const gen = ++searchGenRef.current;
    searchDebounceRef.current = setTimeout(async () => {
      searchDebounceRef.current = null;
      const results = q ? await songDb.search(q) : await songDb.list();
      if (searchGenRef.current === gen) setSongs(results);
    }, 300);
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
      if (updated) { setCurrentService(updated); useQueueStore.getState().setActiveItem(updated.items.length - 1); }
      showNotice(`"${song.title}" 추가됨`);
    } catch {
      showNotice("추가에 실패했습니다. 다시 시도해 주세요.");
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
    // Refresh tags and tag map in case tags changed
    tagDb.list().then(setAllTags).catch(console.error);
    tagDb.getAllSongTagMap().then(setSongTagMap).catch(console.error);
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

  async function handleOpenLPFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    setOpenLPLoading(true);
    let imported = 0;
    let failed = 0;
    const newSongs: Song[] = [];
    for (const file of files) {
      try {
        const parsed = await parseOpenLyricsFile(file);
        if (parsed.slides.length === 0) { failed++; continue; }
        const id = await songDb.create({ title: parsed.title, artist: parsed.artist, lyrics_json: parsed.slides, media_id: undefined });
        const song = await songDb.get(id);
        if (song) { newSongs.push(song); imported++; }
      } catch { failed++; }
    }
    setSongs((prev) => [...prev, ...newSongs]);
    if (imported > 0) showNotice(`${imported}곡 임포트됨${failed > 0 ? ` (${failed}개 실패)` : ""}`);
    else showNotice("임포트에 실패했습니다.");
    setOpenLPLoading(false);
  }

  async function handleDuplicate(song: Song) {
    try {
      const duplicated = await songDb.duplicate(song.id);
      setSongs((prev) => [...prev, duplicated]);
      showNotice(`"${duplicated.title}" 복제됨`);
    } catch {
      showNotice("복제에 실패했습니다.");
    }
  }

  async function handleAddMediaToService(item: MediaItem) {
    if (!currentService) {
      showNotice("예배를 먼저 선택해주세요");
      return;
    }
    try {
      const settings: import("@/lib/types").ServiceItemSettings = {
        background: {
          type: item.type,
          src: item.file_path,
          loop: true,
          opacity: 1,
        },
      };
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order: currentService.items.length,
        type: item.type === "video" ? "video" : "announcement",
        song_id: undefined,
        media_id: item.id,
        settings_json: settings,
        label: item.name,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        useQueueStore.getState().setCurrentService(updated);
        useQueueStore.getState().setActiveItem(updated.items.length - 1);
      }
      showNotice(`"${item.name}" 큐에 추가됨`);
    } catch {
      showNotice("추가 실패");
    }
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
          <input ref={pptxInputRef} type="file" accept=".pptx" onChange={handlePptxFile} className="hidden" />
          <input ref={openLPInputRef} type="file" accept=".xml" multiple onChange={handleOpenLPFiles} className="hidden" />
          <button
            onClick={() => pptxInputRef.current?.click()}
            disabled={pptxLoading}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
          >
            {pptxLoading ? "..." : "PPTX"}
          </button>
          <button
            onClick={() => openLPInputRef.current?.click()}
            disabled={openLPLoading}
            title="OpenLP / OpenLyrics XML 파일 임포트"
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
          >
            {openLPLoading ? "..." : "OpenLP"}
          </button>
          <button
            onClick={() => setSort((s) => s === "title" ? "recent" : "title")}
            title={sort === "title" ? "제목순 정렬 중 (클릭: 최신순)" : "최신순 정렬 중 (클릭: 제목순)"}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap text-zinc-400"
          >
            {sort === "title" ? "가나다↑" : "최신↓"}
          </button>
          <button
            onClick={handleNewSong}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
          >
            + 새 찬양
          </button>
          <button
            onClick={openHelpWindow}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-400 hover:text-white"
            title="도움말"
          >
            ?
          </button>
        </div>
        {/* Tag filter row */}
        {allTags.length > 0 && (
          <div className="px-2 py-1.5 border-b border-zinc-700 flex gap-1 flex-wrap">
            <button
              onClick={() => setFilterTagId(null)}
              className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                filterTagId === null
                  ? "bg-zinc-400 border-zinc-400 text-zinc-900"
                  : "border-zinc-600 text-zinc-400 hover:border-zinc-400"
              }`}
            >
              전체
            </button>
            {allTags.map((tag) => (
              <button
                key={tag.id}
                onClick={() => setFilterTagId((prev) => prev === tag.id ? null : tag.id)}
                className="px-2 py-0.5 rounded-full text-[10px] border transition-all"
                style={
                  filterTagId === tag.id
                    ? { backgroundColor: tag.color, borderColor: tag.color, color: "#fff" }
                    : { borderColor: "#52525b", color: "#a1a1aa" }
                }
              >
                {tag.name}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {(sort === "title"
            ? [...songs].sort((a, b) => a.title.localeCompare(b.title, "ko"))
            : [...songs].sort((a, b) => b.id - a.id)
          ).filter((song) =>
            filterTagId === null || (songTagMap[song.id] ?? []).some((t) => t.id === filterTagId)
          ).map((song) => (
            <div
              key={song.id}
              className="flex items-center group px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer select-none relative"
              onMouseEnter={() => setHoveredSongId(song.id)}
              onMouseLeave={() => setHoveredSongId(null)}
            >
              {hoveredSongId === song.id && song.lyrics_json.length > 0 && (
                <div className="absolute right-full top-0 mr-2 z-50 w-44 bg-zinc-800 border border-zinc-600 rounded shadow-xl p-2 pointer-events-none">
                  <p className="text-[10px] text-zinc-400 font-medium mb-1 uppercase tracking-wide">
                    {song.lyrics_json[0]?.section ?? "verse"} 미리보기
                  </p>
                  {song.lyrics_json[0]?.lines.slice(0, 4).map((line, i) => (
                    <p key={i} className="text-[10px] text-zinc-200 leading-snug truncate">{line}</p>
                  ))}
                  {song.lyrics_json[0]?.lines.length === 0 && (
                    <p className="text-[10px] text-zinc-600 italic">빈 슬라이드</p>
                  )}
                  {song.lyrics_json.length > 1 && (
                    <p className="text-[10px] text-zinc-500 mt-1">+{song.lyrics_json.length - 1}절 더</p>
                  )}
                </div>
              )}
              <div className="flex-1 min-w-0" onClick={() => handleAddToService(song)}>
                <div className="font-medium text-white truncate">{song.title}</div>
                {song.artist && <div className="text-zinc-500 truncate">{song.artist}</div>}
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="text-zinc-600 text-[10px]">{song.lyrics_json.length}절</span>
                  {(songTagMap[song.id] ?? []).map((tag) => (
                    <span
                      key={tag.id}
                      className="inline-block w-1.5 h-1.5 rounded-full"
                      style={{ backgroundColor: tag.color }}
                      title={tag.name}
                    />
                  ))}
                </div>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setEditSong(song); setEditMode(true); }}
                className="ml-1 px-1.5 py-0.5 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white hover:bg-zinc-800"
              >
                편집
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); void handleDuplicate(song); }}
                className="ml-1 px-1.5 py-0.5 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-white hover:bg-zinc-800"
                title="복제"
              >
                복제
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (deletingSongId === song.id) {
                    // Second click = confirm delete
                    songDb.delete(song.id).then(async () => {
                      setSongs((prev) => prev.filter((s) => s.id !== song.id));
                      setDeletingSongId(null);
                      // Reload current service: DB also deleted service_items referencing this song
                      const store = useQueueStore.getState();
                      if (store.currentService) {
                        const updated = await serviceDb.get(store.currentService.id);
                        if (updated) store.setCurrentService(updated);
                      }
                    }).catch(() => showNotice("삭제 실패"));
                  } else {
                    setDeletingSongId(song.id);
                    // Auto-cancel after 3s
                    if (deleteTimerRef.current) clearTimeout(deleteTimerRef.current);
                    deleteTimerRef.current = setTimeout(() => {
                      deleteTimerRef.current = null;
                      setDeletingSongId((prev) => prev === song.id ? null : prev);
                    }, 3000);
                  }
                }}
                className={`ml-1 px-1.5 py-0.5 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity ${
                  deletingSongId === song.id
                    ? "bg-red-600 text-white opacity-100"
                    : "text-zinc-500 hover:text-red-400 hover:bg-zinc-800"
                }`}
                title={deletingSongId === song.id ? "한 번 더 클릭하여 삭제 확인" : "삭제"}
              >
                {deletingSongId === song.id ? "확인?" : "✕"}
              </button>
            </div>
          ))}
          {songs.length === 0 && (
            <div className="p-4 text-center space-y-2">
              <p className="text-xs text-zinc-400 font-medium">찬양이 없습니다</p>
              <p className="text-[11px] text-zinc-600 leading-relaxed">
                <span className="text-zinc-400">+ 새 찬양</span> 버튼으로 가사를 입력하거나<br />
                <span className="text-zinc-400">PPTX</span> 버튼으로 파일을 가져오세요
              </p>
              <button
                onClick={openHelpWindow}
                className="text-[11px] text-blue-400 hover:text-blue-300 underline"
              >
                처음이세요? 도움말 보기
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Media mode
  return (
    <div className="h-full flex flex-col">
      {notice && (
        <div className="px-3 py-1.5 bg-blue-900 text-blue-200 text-xs text-center">{notice}</div>
      )}
      {/* 툴바 */}
      <div className="p-2 border-b border-zinc-700 flex gap-1">
        <button
          disabled={importing !== null}
          onClick={async () => {
            setImporting("image");
            try {
              const item = await importMediaFile("image");
              if (item) {
                setMedia((prev) => [...prev, item]);
                showNotice(`"${item.name}" 추가됨`);
              }
            } catch { showNotice("이미지 추가 실패"); }
            finally { setImporting(null); }
          }}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
        >
          {importing === "image" ? "..." : "+ 이미지"}
        </button>
        <button
          disabled={importing !== null}
          onClick={async () => {
            setImporting("video");
            try {
              const item = await importMediaFile("video");
              if (item) {
                setMedia((prev) => [...prev, item]);
                showNotice(`"${item.name}" 추가됨`);
                const url = toDisplayUrl(item.file_path);
                if (url) {
                  void captureVideoThumbnail(url).then((thumb) =>
                    setVideoThumbs((prev) => ({ ...prev, [item.id]: thumb }))
                  );
                }
              }
            } catch { showNotice("영상 추가 실패"); }
            finally { setImporting(null); }
          }}
          className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
        >
          {importing === "video" ? "..." : "+ 영상"}
        </button>
      </div>

      {/* 미디어 그리드 */}
      <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
        {media.map((item) => {
          const thumbSrc =
            item.type === "image"
              ? toDisplayUrl(item.file_path)
              : (videoThumbs[item.id] ?? null);
          const isDeleting = deletingMediaId === item.id;

          return (
            <div
              key={item.id}
              className="relative group rounded overflow-hidden border border-zinc-700 hover:border-zinc-500 cursor-pointer bg-zinc-800"
              onClick={() => handleAddMediaToService(item)}
            >
              {/* 썸네일 */}
              <div className="aspect-video bg-zinc-900 flex items-center justify-center">
                {thumbSrc ? (
                  <img src={thumbSrc} alt={item.name} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl text-zinc-600">
                    {item.type === "video" ? "▶" : "🖼"}
                  </span>
                )}
              </div>
              {/* 파일명 */}
              <div className="px-1.5 py-1 text-[10px] text-zinc-400 truncate">{item.name}</div>
              {/* 삭제 버튼 */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDeleting) {
                    mediaDb.delete(item.id)
                      .then(() => {
                        setMedia((prev) => prev.filter((m) => m.id !== item.id));
                        setDeletingMediaId(null);
                      })
                      .catch(() => showNotice("삭제 실패"));
                  } else {
                    setDeletingMediaId(item.id);
                    if (deleteMediaTimerRef.current) clearTimeout(deleteMediaTimerRef.current);
                    deleteMediaTimerRef.current = setTimeout(() => {
                      deleteMediaTimerRef.current = null;
                      setDeletingMediaId((prev) => (prev === item.id ? null : prev));
                    }, 3000);
                  }
                }}
                className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] transition-opacity ${
                  isDeleting
                    ? "bg-red-600 text-white opacity-100"
                    : "bg-zinc-900/80 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100"
                }`}
              >
                {isDeleting ? "확인?" : "✕"}
              </button>
            </div>
          );
        })}
        {media.length === 0 && (
          <div className="col-span-2 p-4 text-center text-xs text-zinc-500 space-y-1">
            <p>미디어 파일이 없습니다</p>
            <p className="text-[11px] text-zinc-600">위 버튼으로 이미지·영상을 추가하세요</p>
          </div>
        )}
      </div>
    </div>
  );
}
