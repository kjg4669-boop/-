"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb, songDb } from "@/lib/db";
import type { Service, ServiceItem, Song, LyricSlide } from "@/lib/types";

function parseLyricsToSlides(text: string): LyricSlide[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((para, i) => ({
    id: `verse-${i + 1}`,
    section: "verse" as const,
    sectionIndex: i + 1,
    lines: para.split("\n").map((l) => l.trim()).filter(Boolean),
  }));
}

// ─── Sortable item component ──────────────────────────────────────────────────

function SortableQueueItem({
  item,
  index,
  total,
  onDelete,
  onMoveUp,
  onMoveDown,
}: {
  item: ServiceItem;
  index: number;
  total: number;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.4 : 1,
      }}
      className="flex items-center px-2 py-1.5 text-xs border-b border-zinc-800 gap-1"
    >
      <span
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-300 px-1 select-none"
        title="드래그하여 순서 변경"
      >
        ⠿
      </span>
      <span className="flex-1 truncate text-white">
        {item.song?.title ?? item.label ?? item.type}
      </span>
      <button
        onClick={onMoveUp}
        disabled={index === 0}
        className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
      >
        ↑
      </button>
      <button
        onClick={onMoveDown}
        disabled={index === total - 1}
        className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
      >
        ↓
      </button>
      <button
        onClick={onDelete}
        className="px-1 text-zinc-500 hover:text-red-400"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addTab, setAddTab] = useState<"song" | "announcement" | "blank" | "direct">("song");
  const [addSearch, setAddSearch] = useState("");
  const [addSongs, setAddSongs] = useState<Song[]>([]);
  const [addLabel, setAddLabel] = useState("");
  const [addDirectTitle, setAddDirectTitle] = useState("");
  const [addDirectArtist, setAddDirectArtist] = useState("");
  const [addDirectLyrics, setAddDirectLyrics] = useState("");
  const [isDirectSubmitting, setIsDirectSubmitting] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  const searchGenRef = useRef(0);

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  useEffect(() => {
    if (showAddPanel && addTab === "song") {
      songDb.list().then(setAddSongs).catch(console.error);
    }
  }, [showAddPanel, addTab]);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  async function handleCreateService() {
    if (!newName.trim() || !newDate) return;
    setCreating(true);
    setCreateError(null);
    try {
      const id = await serviceDb.create(newName.trim(), newDate);
      const updated = await serviceDb.list();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) setCurrentService(service);
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      setCreateError("예배 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    if (!currentService) return;
    const reordered = [...currentService.items];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= reordered.length) return;
    [reordered[index], reordered[swapIndex]] = [reordered[swapIndex], reordered[index]];
    try {
      await serviceDb.reorderItems(currentService.id, reordered.map((i) => i.id));
      updateServiceItems(reordered);
    } catch {
      console.error("Failed to reorder items");
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentService) return;
    const oldIndex = currentService.items.findIndex((i) => i.id === active.id);
    const newIndex = currentService.items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(currentService.items, oldIndex, newIndex);
    try {
      await serviceDb.reorderItems(currentService.id, reordered.map((i) => i.id));
      updateServiceItems(reordered);
    } catch {
      console.error("Failed to reorder items");
    }
  }

  async function deleteItem(itemId: number) {
    if (!useQueueStore.getState().currentService) return;
    try {
      await serviceDb.deleteItem(itemId);
      const liveItems = useQueueStore.getState().currentService?.items ?? [];
      updateServiceItems(liveItems.filter((i) => i.id !== itemId));
    } catch {
      console.error("Failed to delete item");
    }
  }

  async function addSongItem(song: Song) {
    if (!currentService) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order,
        type: "song",
        song_id: song.id,
        media_id: undefined,
        settings_json: {},
        label: song.title,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        setCurrentService(updated);
        setActiveItem(updated.items.length - 1);
      }
    } catch {
      setAddError("찬양 추가에 실패했습니다.");
    }
  }

  async function addAnnouncementItem() {
    if (!currentService || !addLabel.trim()) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order,
        type: "announcement",
        song_id: undefined,
        media_id: undefined,
        settings_json: {},
        label: addLabel.trim(),
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        setCurrentService(updated);
        setActiveItem(updated.items.length - 1);
      }
      setAddLabel("");
    } catch {
      setAddError("항목 추가에 실패했습니다.");
    }
  }

  async function addBlankItem() {
    if (!currentService) return;
    setAddError(null);
    try {
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order,
        type: "blank",
        song_id: undefined,
        media_id: undefined,
        settings_json: {},
        label: "블랭크",
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        setCurrentService(updated);
        setActiveItem(updated.items.length - 1);
      }
    } catch {
      setAddError("블랭크 추가에 실패했습니다.");
    }
  }

  async function addDirectItem() {
    if (!currentService || !addDirectTitle.trim() || isDirectSubmitting) return;
    const lyrics = parseLyricsToSlides(addDirectLyrics);
    if (lyrics.length === 0) {
      setAddError("가사를 입력해 주세요.");
      return;
    }
    setAddError(null);
    setIsDirectSubmitting(true);
    try {
      const songId = await songDb.create({
        title: addDirectTitle.trim(),
        artist: addDirectArtist.trim(),
        lyrics_json: lyrics,
      });
      const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order,
        type: "song",
        song_id: songId,
        media_id: undefined,
        settings_json: {},
        label: addDirectTitle.trim(),
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        setCurrentService(updated);
        setActiveItem(updated.items.length - 1);
      }
      setAddDirectTitle("");
      setAddDirectArtist("");
      setAddDirectLyrics("");
    } catch (err) {
      console.error("Failed to add direct item:", err);
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

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                + 새 예배
              </button>
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {currentService?.name ?? "예배 없음"}
              </span>
              {currentService && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`"${currentService.name}" 예배를 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
                    try {
                      await serviceDb.delete(currentService.id);
                      const updated = await serviceDb.list();
                      setServices(updated);
                      if (updated.length > 0) {
                        const next = await serviceDb.get(updated[0].id);
                        if (next) setCurrentService(next);
                      } else {
                        setCurrentService(null);
                      }
                      setIsEditing(false);
                    } catch {
                      console.error("Failed to delete service");
                    }
                  }}
                  className="text-xs px-2 py-1 bg-red-700 hover:bg-red-600 rounded whitespace-nowrap text-white"
                  title="현재 예배 삭제"
                >
                  삭제
                </button>
              )}
              <button
                onClick={() => { setIsEditing(false); setShowNewForm(false); setShowAddPanel(false); }}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
              >
                ✓ 완료
              </button>
            </div>
            {showNewForm && (
              <div className="space-y-1 pt-1 border-t border-zinc-700">
                <input
                  type="text"
                  placeholder="예배 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                {createError && (
                  <p className="text-xs text-red-400">{createError}</p>
                )}
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateService}
                    disabled={creating || !newName.trim() || !newDate}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {creating ? "생성 중..." : "만들기"}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 text-xs py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => {
                const val = e.target.value;
                if (val) loadService(Number(val)).catch(console.error);
              }}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            <button
              onClick={() => setIsEditing(true)}
              className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
            >
              편집
            </button>
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : isEditing ? (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, i) => (
                <SortableQueueItem
                  key={item.id}
                  item={item}
                  index={i}
                  total={items.length}
                  onDelete={() => deleteItem(item.id)}
                  onMoveUp={() => moveItem(i, "up")}
                  onMoveDown={() => moveItem(i, "down")}
                />
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => setActiveItem(i)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
              }`}
            >
              <div className="font-medium text-white">
                {item.song?.title ?? item.label ?? item.type}
              </div>
              {item.song?.artist && (
                <div className="text-zinc-500">{item.song.artist}</div>
              )}
              <div className="text-zinc-600 capitalize">{item.type}</div>
            </button>
          ))
        )}
      </div>

      {/* Add panel (edit mode only) */}
      {isEditing && currentService && (
        <div className="border-t border-zinc-700">
          <button
            onClick={() => { setShowAddPanel((v) => !v); setAddError(null); }}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {showAddPanel ? "▲ 닫기" : "+ 항목 추가"}
          </button>

          {showAddPanel && (
            <div className="border-t border-zinc-700 bg-zinc-900">
              {addError && (
                <p className="text-xs text-red-400 px-2 py-1">{addError}</p>
              )}
              {/* Tabs */}
              <div className="flex border-b border-zinc-700">
                {(["song", "announcement", "blank", "direct"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => { setAddTab(tab); setAddError(null); }}
                    className={`flex-1 py-1 text-xs ${
                      addTab === tab
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {tab === "song" ? "찬양" : tab === "announcement" ? "기도·안내" : tab === "blank" ? "블랭크" : "직접 입력"}
                  </button>
                ))}
              </div>

              {/* Song tab */}
              {addTab === "song" && (
                <div className="flex flex-col" style={{ maxHeight: 180 }}>
                  <div className="p-1.5">
                    <input
                      type="text"
                      placeholder="찬양 검색..."
                      value={addSearch}
                      onChange={(e) => handleAddSearch(e.target.value)}
                      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {addSongs.map((song) => (
                      <button
                        key={song.id}
                        onClick={() => addSongItem(song)}
                        className="w-full text-left px-2 py-1.5 text-xs border-b border-zinc-800 hover:bg-zinc-700"
                      >
                        <div className="text-white truncate">{song.title}</div>
                        {song.artist && (
                          <div className="text-zinc-500 text-xs">{song.artist}</div>
                        )}
                      </button>
                    ))}
                    {addSongs.length === 0 && (
                      <p className="text-xs text-zinc-600 p-2">찬양이 없습니다</p>
                    )}
                  </div>
                </div>
              )}

              {/* Announcement tab */}
              {addTab === "announcement" && (
                <div className="p-1.5 space-y-1">
                  <input
                    type="text"
                    placeholder="항목 이름 (예: 대표기도)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={addAnnouncementItem}
                    disabled={!addLabel.trim()}
                    className="w-full text-xs py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded"
                  >
                    + 추가
                  </button>
                </div>
              )}

              {/* Blank tab */}
              {addTab === "blank" && (
                <div className="p-1.5">
                  <button
                    onClick={addBlankItem}
                    className="w-full text-xs py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    + 블랭크 추가
                  </button>
                </div>
              )}

              {/* Direct input tab */}
              {addTab === "direct" && (() => {
                const slideCount = parseLyricsToSlides(addDirectLyrics).length;
                return (
                  <div className="p-1.5 space-y-1.5" style={{ maxHeight: 300, overflowY: "auto" }}>
                    <input
                      type="text"
                      placeholder="제목 (필수)"
                      value={addDirectTitle}
                      onChange={(e) => setAddDirectTitle(e.target.value)}
                      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                    />
                    <input
                      type="text"
                      placeholder="아티스트 (선택)"
                      value={addDirectArtist}
                      onChange={(e) => setAddDirectArtist(e.target.value)}
                      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                    />
                    <textarea
                      placeholder={"가사를 붙여넣으세요.\n빈 줄로 슬라이드를 구분합니다."}
                      value={addDirectLyrics}
                      onChange={(e) => setAddDirectLyrics(e.target.value)}
                      rows={6}
                      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500 resize-none"
                    />
                    {addDirectLyrics.trim() && (
                      <p className="text-zinc-500 text-xs">슬라이드 {slideCount}개</p>
                    )}
                    <button
                      onClick={addDirectItem}
                      disabled={!addDirectTitle.trim() || isDirectSubmitting}
                      className="w-full text-xs py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                    >
                      {isDirectSubmitting ? "추가 중..." : "+ 큐에 추가"}
                    </button>
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
