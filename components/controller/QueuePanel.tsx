"use client";

import { useEffect, useState, useRef } from "react";
import { DndContext, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { ServiceItem, ServiceItemSettings, LyricSlide } from "@/lib/types";
import { AddItemPanel } from "./AddItemPanel";
import { SECTION_LABEL, SECTION_COLORS } from "@/lib/constants";
import { getSlidesInOrder } from "@/lib/utils";

const ITEM_TYPE_ICON: Record<string, string> = {
  song: "♪",
  announcement: "📣",
  blank: "□",
  scripture: "✝",
  video: "▶",
};

function SortableQueueItem({
  item, isActive, onActivate, onDelete, onContextMenu,
}: {
  item: ServiceItem;
  isActive: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      onClick={onActivate}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e); }}
      className={`flex items-center px-2 py-1.5 text-xs border-b border-zinc-800 gap-1 group hover:bg-zinc-700 cursor-pointer transition-colors ${
        isActive ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
      }`}
    >
      <span
        {...attributes}
        {...listeners}
        onClick={(e) => e.stopPropagation()}
        className="cursor-grab active:cursor-grabbing text-zinc-500 hover:text-zinc-300 px-1 select-none"
        title="드래그하여 순서 변경"
      >
        ⠿
      </span>
      <span className="text-zinc-500 text-xs w-4 flex-shrink-0">{ITEM_TYPE_ICON[item.type] ?? "•"}</span>
      <div className="flex-1 min-w-0">
        <div className="text-white truncate">{item.song?.title ?? item.label ?? item.type}</div>
        {item.song?.artist && <div className="text-zinc-500 text-xs truncate">{item.song.artist}</div>}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="px-1 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
      >
        ✕
      </button>
    </div>
  );
}

export default function QueuePanel() {
  const [services, setServices] = useState<Array<{ id: number; name: string; date: string; count: number }>>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addItemTab, setAddItemTab] = useState<"song" | "announcement" | "blank" | "direct" | "scripture">("song");
  const [opNotice, setOpNotice] = useState<{ msg: string; error?: boolean } | null>(null);
  const opNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [itemNotes, setItemNotes] = useState("");
  const itemNotesRef = useRef("");
  const activeItemIdRef = useRef<number | null>(null);
  const itemNotesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: ServiceItem; itemIndex: number } | null>(null);

  useEffect(() => {
    const close = () => setContextMenu(null);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContextMenu(null); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const { currentService, activeItemIndex, activeLyricSlideIndex, setCurrentService, setActiveItem, updateServiceItems, updateItemNotesInStore, reorderItemsAndActive, setActiveFlatSlide, getFlatSlideList, pushHistory } = useQueueStore();

  function showOpNotice(msg: string, error = false) {
    setOpNotice({ msg, error });
    if (opNoticeTimer.current) clearTimeout(opNoticeTimer.current);
    if (!error) {
      opNoticeTimer.current = setTimeout(() => { setOpNotice(null); opNoticeTimer.current = null; }, 2500);
    }
  }

  async function handleDuplicate() {
    if (!currentService) return;
    try {
      const newId = await serviceDb.duplicate(currentService.id);
      const updated = await serviceDb.listWithCounts();
      setServices(updated);
      const newSvc = await serviceDb.get(newId);
      if (newSvc) { localStorage.setItem("lastServiceId", String(newId)); useQueueStore.getState().setCurrentService(newSvc); }
      showOpNotice("예배를 복제했습니다");
    } catch {
      showOpNotice("복제에 실패했습니다", true);
    }
  }

  async function handleRename() {
    if (!currentService || !renameVal.trim()) { setRenaming(false); return; }
    try {
      await serviceDb.rename(currentService.id, renameVal.trim());
      useQueueStore.getState().updateCurrentServiceMeta({ id: currentService.id, name: renameVal.trim(), date: currentService.date });
      setServices((prev) => prev.map((s) => s.id === currentService.id ? { ...s, name: renameVal.trim() } : s));
      setRenaming(false);
    } catch {
      showOpNotice("이름 변경에 실패했습니다", true);
      setRenaming(false);
    }
  }

  useEffect(() => {
    return () => {
      if (opNoticeTimer.current) clearTimeout(opNoticeTimer.current);
      if (itemNotesDebounceRef.current) clearTimeout(itemNotesDebounceRef.current);
    };
  }, []);

  useEffect(() => { itemNotesRef.current = itemNotes; }, [itemNotes]);

  // Sync itemNotes when active item changes; flush pending debounce to avoid losing edits
  useEffect(() => {
    if (itemNotesDebounceRef.current) {
      clearTimeout(itemNotesDebounceRef.current);
      itemNotesDebounceRef.current = null;
      const prevId = activeItemIdRef.current;
      if (prevId !== null) {
        const notes = itemNotesRef.current;
        updateItemNotesInStore(prevId, notes);
        void serviceDb.updateItemNotes(prevId, notes).catch(() => {});
      }
    }
    const items = useQueueStore.getState().currentService?.items ?? [];
    const activeItem = activeItemIndex >= 0 ? items[activeItemIndex] : undefined;
    activeItemIdRef.current = activeItem?.id ?? null;
    setItemNotes(activeItem?.notes ?? "");
  }, [activeItemIndex, currentService?.id, updateItemNotesInStore]);

  useEffect(() => {
    const handler = () => { setShowAddPanel(true); setAddItemTab("scripture"); };
    window.addEventListener("worship:open-scripture-tab", handler);
    return () => window.removeEventListener("worship:open-scripture-tab", handler);
  }, []);

  useEffect(() => {
    serviceDb.listWithCounts().then((list) => {
      setServices(list);
      // 앱 시작 시 마지막 사용 서비스 자동 로드
      if (list.length > 0 && !useQueueStore.getState().currentService) {
        const lastId = Number(localStorage.getItem("lastServiceId") ?? list[0].id);
        const target = list.find((s) => s.id === lastId) ?? list[0];
        serviceDb.get(target.id).then((s) => { if (s) useQueueStore.getState().setCurrentService(s); }).catch(console.error);
      } else if (list.length === 0) {
        // 서비스가 하나도 없으면 바로 생성 폼 열기
        setShowNewForm(true);
      }
    }).catch(console.error);
  }, []);

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
      const updated = await serviceDb.listWithCounts();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) { localStorage.setItem("lastServiceId", String(id)); setCurrentService(service); }
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      setCreateError("예배 생성에 실패했습니다.");
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteService() {
    if (!currentService) return;
    if (!window.confirm(`"${currentService.name}" 예배를 삭제할까요?`)) return;
    try {
      await serviceDb.delete(currentService.id);
      const updated = await serviceDb.listWithCounts();
      setServices(updated);
      if (updated.length > 0) {
        const next = await serviceDb.get(updated[0].id);
        if (next) setCurrentService(next);
      } else {
        setCurrentService(null);
      }
    } catch {
      showOpNotice("예배 삭제에 실패했습니다", true);
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id || !currentService) return;
    const oldIndex = currentService.items.findIndex((i) => i.id === active.id);
    const newIndex = currentService.items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(currentService.items, oldIndex, newIndex);
    // Compute new active index before async call (dnd blocks interactions during drag)
    const liveActiveIdx = useQueueStore.getState().activeItemIndex;
    let newActiveIdx = liveActiveIdx;
    if (liveActiveIdx === oldIndex) {
      newActiveIdx = newIndex;
    } else if (oldIndex < liveActiveIdx && newIndex >= liveActiveIdx) {
      newActiveIdx = liveActiveIdx - 1;
    } else if (oldIndex > liveActiveIdx && newIndex <= liveActiveIdx) {
      newActiveIdx = liveActiveIdx + 1;
    }
    try {
      await serviceDb.reorderItems(currentService.id, reordered.map((i) => i.id));
      pushHistory();
      // Atomic: update items + activeItemIndex in one set() call to avoid intermediate render
      reorderItemsAndActive(reordered, newActiveIdx);
    } catch {
      showOpNotice("순서 변경에 실패했습니다", true);
    }
  }

  async function deleteItem(itemId: number) {
    try {
      pushHistory();
      await serviceDb.deleteItem(itemId);
      const liveItems = useQueueStore.getState().currentService?.items ?? [];
      const deletedIndex = liveItems.findIndex((i) => i.id === itemId);
      const newItems = liveItems.filter((i) => i.id !== itemId);
      updateServiceItems(newItems);
      const currentActive = useQueueStore.getState().activeItemIndex;
      if (deletedIndex !== -1) {
        if (deletedIndex < currentActive) {
          useQueueStore.getState().setActiveItem(currentActive - 1);
        } else if (deletedIndex === currentActive) {
          useQueueStore.getState().setActiveItem(newItems.length === 0 ? -1 : Math.min(currentActive, newItems.length - 1));
        }
      }
    } catch {
      showOpNotice("항목 삭제에 실패했습니다", true);
    }
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Service selector header */}
      <div className="p-2 border-b border-zinc-700 space-y-1">
        {opNotice && (
          <div
            className={`px-2 py-1 rounded text-xs text-center ${opNotice.error ? "bg-red-900/60 text-red-200 cursor-pointer hover:bg-red-900/80" : "bg-blue-900/60 text-blue-200"}`}
            onClick={opNotice.error ? () => setOpNotice(null) : undefined}
            title={opNotice.error ? "클릭하여 닫기" : undefined}
          >
            {opNotice.msg}{opNotice.error && " ✕"}
          </div>
        )}
        <div className="flex items-center gap-1">
          {renaming ? (
            <>
              <input
                autoFocus
                value={renameVal}
                onChange={(e) => setRenameVal(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void handleRename(); if (e.key === "Escape") setRenaming(false); }}
                className="flex-1 bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-blue-500 outline-none min-w-0"
              />
              <button onClick={handleRename} className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded">확인</button>
              <button onClick={() => setRenaming(false)} className="text-xs px-1.5 py-1 bg-zinc-700 hover:bg-zinc-600 rounded">취소</button>
            </>
          ) : (
            <>
              <select
                className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 min-w-0"
                onChange={(e) => { const val = e.target.value; if (val) { localStorage.setItem("lastServiceId", val); loadService(Number(val)).catch(console.error); } }}
                value={currentService?.id ?? ""}
              >
                <option value="">-- 예배 선택 --</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.date}){s.count > 0 ? ` · ${s.count}곡` : ""}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
                title="새 예배 만들기"
              >
                + 새 예배
              </button>
              {currentService && (
                <button
                  onClick={() => window.dispatchEvent(new CustomEvent("worship:quick-search"))}
                  className="text-xs px-1.5 py-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded"
                  title="슬라이드 빠른 검색 (/)"
                >
                  🔍
                </button>
              )}
              {currentService && (
                <>
                  <button
                    onClick={handleDuplicate}
                    className="text-xs px-1.5 py-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded"
                    title="예배 복제"
                  >
                    ⧉
                  </button>
                  <button
                    onClick={() => { setRenameVal(currentService.name); setRenaming(true); }}
                    className="text-xs px-1.5 py-1 text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 rounded"
                    title="예배 이름 변경"
                  >
                    ✎
                  </button>
                  <button
                    onClick={handleDeleteService}
                    className="text-xs px-1.5 py-1 text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded"
                    title="예배 삭제"
                  >
                    ✕
                  </button>
                </>
              )}
            </>
          )}
        </div>
        {showNewForm && (
          <div className="space-y-1 pt-1 border-t border-zinc-700">
            <p className="text-xs text-zinc-400 font-medium">새 예배 만들기</p>
            <input
              type="text" placeholder="예배 이름" value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            <input
              type="date" value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
            {createError && <p className="text-xs text-red-400">{createError}</p>}
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

      {/* Queue items — always DnD + click */}
      <div className="flex-1 overflow-y-auto">
        {!currentService ? (
          <div className="p-3 space-y-2 text-xs text-zinc-500">
            <p className="text-zinc-300 font-medium">시작하기</p>
            <p>① 위에서 <span className="text-zinc-200">+ 새 예배</span> 버튼 클릭</p>
            <p>② 예배 이름 입력 후 <span className="text-zinc-200">만들기</span></p>
            <p>③ 아래 <span className="text-zinc-200">+ 찬양/순서 추가</span>로 곡 추가</p>
            <p>④ 좌측 슬라이드 목록에서 슬라이드 클릭</p>
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">아래 버튼으로 찬양이나 순서를 추가하세요</p>
        ) : (
          <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
              {items.map((item, i) => {
                const isActive = i === activeItemIndex;
                const scriptureSlides = (item.settings_json as ServiceItemSettings)?.scripture?.slides;
                const slides: LyricSlide[] = item.song ? getSlidesInOrder(item.song) :
                  scriptureSlides?.map((s, i) => ({ id: `scripture-${i}`, section: "verse" as const, sectionIndex: i + 1, lines: s.lines })) ?? [];
                return (
                  <div key={item.id}>
                    <SortableQueueItem
                      item={item}
                      isActive={isActive}
                      onActivate={() => setActiveItem(i)}
                      onDelete={() => {
                        if (window.confirm(`"${item.song?.title ?? item.label ?? item.type}" 항목을 삭제할까요?`)) void deleteItem(item.id);
                      }}
                      onContextMenu={(e) => setContextMenu({ x: e.clientX, y: e.clientY, item, itemIndex: i })}
                    />
                    {/* Slide thumbnail strip — only for active song items */}
                    {isActive && slides.length > 0 && (
                      <div className="bg-zinc-900 border-b border-zinc-800">
                        {(() => {
                          // Compute once per active item, not per slide
                          const flatList = getFlatSlideList();
                          const itemFlatOffset = flatList.findIndex((f) => f.serviceItemIndex === i && f.slideIndex === 0);
                          return slides.map((slide, j) => {
                          const isActiveSlide = j === activeLyricSlideIndex;
                          const flatIdx = itemFlatOffset >= 0 ? itemFlatOffset + j : -1;
                          return (
                            <div
                              key={slide.id}
                              onClick={() => { if (flatIdx >= 0) setActiveFlatSlide(flatIdx); }}
                              className={`flex items-start gap-1.5 px-3 py-1 text-xs cursor-pointer border-l-2 transition-colors ${
                                isActiveSlide
                                  ? "bg-blue-950 border-l-blue-400 text-white"
                                  : "border-l-transparent text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                              }`}
                            >
                              <span
                                style={{
                                  backgroundColor: SECTION_COLORS[slide.section] ?? "#6b7280",
                                  opacity: isActiveSlide ? 1 : 0.55,
                                  color: "#fff",
                                  flexShrink: 0,
                                  padding: "0px 4px",
                                  borderRadius: 3,
                                  fontSize: 9,
                                  fontWeight: 600,
                                  marginTop: 1,
                                }}
                              >
                                {SECTION_LABEL[slide.section] ?? slide.section}{slide.sectionIndex}
                              </span>
                              <span className="truncate leading-relaxed">
                                {slide.lines[0] ?? "(빈 슬라이드)"}
                              </span>
                            </div>
                          );
                        });
                        })()}
                      </div>
                    )}
                    {/* Item notes — shown for active item */}
                    {isActive && (
                      <div className="bg-zinc-950 border-b border-zinc-800 px-2 py-1.5">
                        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">발표자 메모</p>
                        <textarea
                          value={itemNotes}
                          onChange={(e) => {
                            const val = e.target.value;
                            setItemNotes(val);
                            if (itemNotesDebounceRef.current) clearTimeout(itemNotesDebounceRef.current);
                            itemNotesDebounceRef.current = setTimeout(async () => {
                              itemNotesDebounceRef.current = null;
                              try {
                                await serviceDb.updateItemNotes(item.id, val);
                                updateItemNotesInStore(item.id, val);
                              } catch { /* ignore */ }
                            }, 400);
                          }}
                          placeholder="이 순서에 대한 메모 (Stage Display에 표시)"
                          rows={2}
                          className="w-full bg-zinc-900 text-zinc-300 text-xs rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500 resize-none placeholder-zinc-700"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Add panel — always accessible when service is loaded */}
      {currentService && (
        <div className="border-t border-zinc-700 flex-shrink-0">
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {showAddPanel ? "▲ 닫기" : "+ 항목 추가"}
          </button>
          {showAddPanel && <AddItemPanel initialTab={addItemTab} />}
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          style={{ position: "fixed", top: Math.min(contextMenu.y, window.innerHeight - 160), left: Math.min(contextMenu.x, window.innerWidth - 160), zIndex: 9999 }}
          className="bg-zinc-800 border border-zinc-600 rounded shadow-xl py-1 min-w-[130px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-xs text-zinc-500 border-b border-zinc-700 truncate max-w-[180px]">
            {contextMenu.item.song?.title ?? contextMenu.item.label ?? contextMenu.item.type}
          </div>
          <button
            onClick={() => {
              setActiveItem(contextMenu.itemIndex);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
          >
            ▶ 선택
          </button>
          {contextMenu.item.type === "song" && contextMenu.item.song && (
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("worship:edit-song", { detail: contextMenu.item.song }));
                setContextMenu(null);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-700"
            >
              ✎ 편집
            </button>
          )}
          <button
            onClick={() => {
              if (window.confirm(`"${contextMenu.item.song?.title ?? contextMenu.item.label ?? contextMenu.item.type}" 항목을 삭제할까요?`)) {
                void deleteItem(contextMenu.item.id);
              }
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-zinc-700 hover:text-red-300"
          >
            ✕ 삭제
          </button>
        </div>
      )}
    </div>
  );
}
