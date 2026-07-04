"use client";

import { useEffect, useRef, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb, songDb } from "@/lib/db";
import type { Song, LyricSlide } from "@/lib/types";

function parseLyricsToSlides(text: string): LyricSlide[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((para, i) => ({
    id: `verse-${i + 1}`,
    section: "verse" as const,
    sectionIndex: i + 1,
    lines: para.split("\n").map((l) => l.trim()).filter(Boolean),
  }));
}

export function AddItemPanel() {
  const [addError, setAddError] = useState<string | null>(null);
  const [addTab, setAddTab] = useState<"song" | "announcement" | "blank" | "direct" | "scripture">("song");
  const [addSearch, setAddSearch] = useState("");
  const [addSongs, setAddSongs] = useState<Song[]>([]);
  const [addLabel, setAddLabel] = useState("");
  const [addDirectTitle, setAddDirectTitle] = useState("");
  const [addDirectArtist, setAddDirectArtist] = useState("");
  const [addDirectLyrics, setAddDirectLyrics] = useState("");
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);
  const [scriptureBook, setScriptureBook] = useState("");
  const [scriptureRef, setScriptureRef] = useState("");
  const [scriptureText, setScriptureText] = useState("");
  const [isScriptureSubmitting, setIsScriptureSubmitting] = useState(false);

  const { setCurrentService, setActiveItem } = useQueueStore();
  const searchGenRef = useRef(0);

  useEffect(() => {
    if (addTab === "song") {
      songDb.list().then(setAddSongs).catch(console.error);
    }
  }, [addTab]);

  async function addSongItem(song: Song) {
    const currentService = useQueueStore.getState().currentService;
    if (!currentService) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id, item_order, type: "song",
        song_id: song.id, media_id: undefined, settings_json: {}, label: song.title,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) { setCurrentService(updated); setActiveItem(updated.items.length - 1); useQueueStore.getState().setIsDirty(true); }
    } catch (e) {
      console.error("[addSongItem]", e);
      setAddError("찬양 추가에 실패했습니다.");
    }
  }

  async function addAnnouncementItem() {
    const currentService = useQueueStore.getState().currentService;
    if (!currentService || !addLabel.trim()) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id, item_order, type: "announcement",
        song_id: undefined, media_id: undefined, settings_json: {}, label: addLabel.trim(),
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) { setCurrentService(updated); setActiveItem(updated.items.length - 1); useQueueStore.getState().setIsDirty(true); }
      setAddLabel("");
    } catch (e) {
      console.error("[addAnnouncementItem]", e);
      setAddError("항목 추가에 실패했습니다.");
    }
  }

  async function addBlankItem() {
    const currentService = useQueueStore.getState().currentService;
    if (!currentService) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id, item_order, type: "blank",
        song_id: undefined, media_id: undefined, settings_json: {}, label: "블랭크",
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) { setCurrentService(updated); setActiveItem(updated.items.length - 1); useQueueStore.getState().setIsDirty(true); }
    } catch (e) {
      console.error("[addBlankItem]", e);
      setAddError("블랭크 추가에 실패했습니다.");
    }
  }

  async function addScriptureItem() {
    const currentService = useQueueStore.getState().currentService;
    if (!currentService || !scriptureBook.trim() || isScriptureSubmitting) return;
    const slides = scriptureText
      .split(/\n\s*\n/)
      .map((p) => ({ lines: p.split("\n").map((l) => l.trim()).filter(Boolean) }))
      .filter((s) => s.lines.length > 0);
    if (slides.length === 0) { setAddError("구절 내용을 입력해 주세요."); return; }
    setAddError(null);
    setIsScriptureSubmitting(true);
    try {
      const label = `${scriptureBook.trim()} ${scriptureRef.trim()}`.trim();
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id, item_order, type: "scripture",
        song_id: undefined, media_id: undefined,
        settings_json: { scripture: { book: scriptureBook.trim(), reference: scriptureRef.trim(), slides } },
        label,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) { setCurrentService(updated); setActiveItem(updated.items.length - 1); useQueueStore.getState().setIsDirty(true); }
      setScriptureBook(""); setScriptureRef(""); setScriptureText("");
    } catch (e) {
      console.error("[addScriptureItem]", e);
      setAddError("성경 추가에 실패했습니다.");
    } finally {
      setIsScriptureSubmitting(false);
    }
  }

  async function addDirectItem() {
    const currentService = useQueueStore.getState().currentService;
    if (!currentService || !addDirectTitle.trim() || isDirectSubmitting) return;
    const lyrics = parseLyricsToSlides(addDirectLyrics);
    if (lyrics.length === 0) { setAddError("가사를 입력해 주세요."); return; }
    setAddError(null);
    setIsDirectSubmitting(true);
    try {
      const songId = await songDb.create({
        title: addDirectTitle.trim(), artist: addDirectArtist.trim(), lyrics_json: lyrics,
      });
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id, item_order, type: "song",
        song_id: songId, media_id: undefined, settings_json: {}, label: addDirectTitle.trim(),
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) { setCurrentService(updated); setActiveItem(updated.items.length - 1); useQueueStore.getState().setIsDirty(true); }
      setAddDirectTitle(""); setAddDirectArtist(""); setAddDirectLyrics("");
    } catch (e) {
      console.error("[addDirectItem]", e);
      setAddError("가사 추가에 실패했습니다.");
    } finally {
      setIsDirectSubmitting(false);
    }
  }

  async function handleAddSearch(q: string) {
    setAddSearch(q);
    const gen = ++searchGenRef.current;
    try {
      const results = q ? await songDb.search(q) : await songDb.list();
      if (gen === searchGenRef.current) setAddSongs(results);
    } catch {
      console.error("Failed to search songs");
    }
  }

  return (
    <div className="border-t border-zinc-700 bg-zinc-900">
      {addError && <p className="text-xs text-red-400 px-2 py-1">{addError}</p>}
      <div className="flex border-b border-zinc-700">
        {(["song", "announcement", "blank", "direct", "scripture"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => { setAddTab(tab); setAddError(null); }}
            className={`flex-1 py-1 text-xs ${addTab === tab ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-white"}`}
          >
            {tab === "song" ? "찬양" : tab === "announcement" ? "기도" : tab === "blank" ? "빈칸" : tab === "direct" ? "직접" : "성경"}
          </button>
        ))}
      </div>

      {addTab === "song" && (
        <div className="flex flex-col" style={{ maxHeight: 180 }}>
          <div className="p-1.5">
            <input type="text" placeholder="찬양 검색..." value={addSearch}
              onChange={(e) => handleAddSearch(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="overflow-y-auto flex-1">
            {addSongs.map((song) => (
              <button key={song.id} onClick={() => addSongItem(song)}
                className="w-full text-left px-2 py-1.5 text-xs border-b border-zinc-800 hover:bg-zinc-700"
              >
                <div className="text-white truncate">{song.title}</div>
                {song.artist && <div className="text-zinc-500 text-xs">{song.artist}</div>}
              </button>
            ))}
            {addSongs.length === 0 && <p className="text-xs text-zinc-600 p-2">찬양이 없습니다</p>}
          </div>
        </div>
      )}

      {addTab === "announcement" && (
        <div className="p-1.5 space-y-1">
          <input type="text" placeholder="항목 이름 (예: 대표기도)" value={addLabel}
            onChange={(e) => setAddLabel(e.target.value)}
            className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
          />
          <button onClick={addAnnouncementItem} disabled={!addLabel.trim()}
            className="w-full text-xs py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded"
          >
            + 추가
          </button>
        </div>
      )}

      {addTab === "blank" && (
        <div className="p-1.5">
          <button onClick={addBlankItem}
            className="w-full text-xs py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded"
          >
            + 빈 슬라이드 추가
          </button>
        </div>
      )}

      {addTab === "direct" && (() => {
        const slideCount = parseLyricsToSlides(addDirectLyrics).length;
        return (
          <div className="p-1.5 space-y-1.5" style={{ maxHeight: 280, overflowY: "auto" }}>
            <input type="text" placeholder="제목 (필수)" value={addDirectTitle}
              onChange={(e) => setAddDirectTitle(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <input type="text" placeholder="아티스트 (선택)" value={addDirectArtist}
              onChange={(e) => setAddDirectArtist(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <textarea
              placeholder={"가사를 붙여넣으세요.\n빈 줄로 슬라이드를 구분합니다."}
              value={addDirectLyrics} onChange={(e) => setAddDirectLyrics(e.target.value)}
              rows={5}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500 resize-none"
            />
            {addDirectLyrics.trim() && <p className="text-zinc-500 text-xs">슬라이드 {slideCount}개</p>}
            <button onClick={addDirectItem}
              disabled={!addDirectTitle.trim() || isDirectSubmitting}
              className="w-full text-xs py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
            >
              {isDirectSubmitting ? "추가 중..." : "+ 큐에 추가"}
            </button>
          </div>
        );
      })()}

      {addTab === "scripture" && (() => {
        const slideCount = scriptureText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean).length;
        return (
          <div className="p-1.5 space-y-1.5" style={{ maxHeight: 280, overflowY: "auto" }}>
            <input type="text" placeholder="책 이름 (예: 요한복음)" value={scriptureBook}
              onChange={(e) => setScriptureBook(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <input type="text" placeholder="장절 (예: 3:16)" value={scriptureRef}
              onChange={(e) => setScriptureRef(e.target.value)}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <textarea
              placeholder={"구절 내용을 붙여넣으세요.\n빈 줄로 슬라이드를 구분합니다."}
              value={scriptureText} onChange={(e) => setScriptureText(e.target.value)}
              rows={5}
              className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500 resize-none"
            />
            {scriptureText.trim() && <p className="text-zinc-500 text-xs">슬라이드 {slideCount}개</p>}
            <button onClick={addScriptureItem}
              disabled={!scriptureBook.trim() || !scriptureText.trim() || isScriptureSubmitting}
              className="w-full text-xs py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
            >
              {isScriptureSubmitting ? "추가 중..." : "+ 큐에 추가"}
            </button>
          </div>
        );
      })()}
    </div>
  );
}
