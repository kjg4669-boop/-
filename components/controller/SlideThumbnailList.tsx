"use client";

import { useEffect, useState } from "react";
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useQueueStore } from "@/stores/queueStore";
import { songDb, serviceDb } from "@/lib/db";
import type { LyricSlide, FlatSlide, Service } from "@/lib/types";
import { newSlideId } from "@/lib/utils";

function SortableItem({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        position: "relative",
        zIndex: isDragging ? 50 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

const SECTION_DOT: Record<string, string> = {
  verse: "#3b82f6",
  chorus: "#a855f7",
  bridge: "#22c55e",
  "pre-chorus": "#6366f1",
  intro: "#eab308",
  outro: "#6b7280",
};

// 슬라이드 클립보드 (모듈 레벨)
let slideClipboard: LyricSlide | null = null;

function slideKey(entry: FlatSlide): string {
  return `${entry.serviceItemIndex}-${entry.songId}-${entry.slideIndex}`;
}

interface Props {
  onOpenDesignPanel?: () => void;
}

interface CtxMenuState {
  x: number;
  y: number;
  flatIdx: number | null; // null = 빈 영역 우클릭
}

export default function SlideThumbnailList({ onOpenDesignPanel }: Props) {
  const slides = useQueueStore((s) => s.getFlatSlideList());
  const activeIdx = useQueueStore((s) => s.getActiveFlatSlideIndex());
  const currentService = useQueueStore((s) => s.currentService);
  const hiddenSlideKeys = useQueueStore((s) => s.hiddenSlideKeys);
  const setActiveFlatSlide = useQueueStore((s) => s.setActiveFlatSlide);
  const toggleHiddenSlide = useQueueStore((s) => s.toggleHiddenSlide);
  const updateServiceData = useQueueStore((s) => s.updateServiceData);
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIdx = slides.findIndex((s) => slideKey(s) === active.id);
    const toIdx = slides.findIndex((s) => slideKey(s) === over.id);
    if (fromIdx < 0 || toIdx < 0) return;

    const fromEntry = slides[fromIdx];
    const toEntry = slides[toIdx];
    if (fromEntry.serviceItemIndex !== toEntry.serviceItemIndex) return;
    if (!currentService) return;

    const song = currentService.items[fromEntry.serviceItemIndex]?.song;
    if (!song) return;

    const lyrics = [...song.lyrics_json];
    const [removed] = lyrics.splice(fromEntry.slideIndex, 1);
    lyrics.splice(toEntry.slideIndex, 0, removed);

    try {
      await songDb.update(song.id, { lyrics_json: lyrics });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        const prevItemIdx = useQueueStore.getState().activeItemIndex;
        const prevSlideIdx = useQueueStore.getState().activeLyricSlideIndex;
        // Compute where the active slide ended up after the drag reorder
        let newSlideIdx = prevSlideIdx;
        if (prevItemIdx === fromEntry.serviceItemIndex) {
          const from = fromEntry.slideIndex;
          const to = toEntry.slideIndex;
          if (prevSlideIdx === from) {
            newSlideIdx = to; // active slide was dragged
          } else if (from < to && prevSlideIdx > from && prevSlideIdx <= to) {
            newSlideIdx = prevSlideIdx - 1; // slides shifted up
          } else if (from > to && prevSlideIdx >= to && prevSlideIdx < from) {
            newSlideIdx = prevSlideIdx + 1; // slides shifted down
          }
        }
        // updateServiceData preserves activeItemIndex, activeLyricSlideIndex, hiddenSlideKeys
        updateServiceData(updated);
        if (prevItemIdx >= 0) {
          useQueueStore.setState({ activeLyricSlideIndex: newSlideIdx });
        }
      }
    } catch (e) {
      console.error("[drag reorder]", e);
    }
  }

  // 외부 클릭 시 컨텍스트 메뉴 닫기
  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    document.addEventListener("click", close);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setCtxMenu(null); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [ctxMenu]);

  function openCtx(e: React.MouseEvent, flatIdx: number | null) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, flatIdx });
  }

  if (slides.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center text-zinc-500 text-xs p-4 text-center"
        onContextMenu={(e) => openCtx(e, null)}
      >
        서비스를 선택하거나<br />곡을 추가하세요
        {ctxMenu && (
          <CtxMenuPanel
            ctxMenu={ctxMenu} slides={slides} currentService={currentService}
            onClose={() => setCtxMenu(null)} onOpenDesignPanel={onOpenDesignPanel}
            hiddenSlides={hiddenSlideKeys} toggleHiddenSlide={toggleHiddenSlide}
            updateService={updateServiceData}
          />
        )}
      </div>
    );
  }

  const slideIds = slides.map(slideKey);

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
        <div
          className="h-full overflow-y-auto py-2 flex flex-col gap-3 relative"
          onContextMenu={(e) => openCtx(e, null)}
        >
          {slides.map((entry, flatIdx) => {
            const id = slideKey(entry);
            const showSongHeader = flatIdx === 0 || slides[flatIdx - 1].songId !== entry.songId;
            const isActive = flatIdx === activeIdx;
            const isHidden = hiddenSlideKeys.has(id);
            const canvasBlocks = entry.slide.canvas?.textBlocks ?? [];
            const previewLines = canvasBlocks.length > 0
              ? canvasBlocks.map((b) => b.text)
              : entry.slide.lines;

            return (
              <SortableItem key={id} id={id}>
                <div className="px-3">
                  {showSongHeader && (
                    <div className="text-xs text-zinc-500 pt-1 pb-1 uppercase tracking-wide truncate">
                      {entry.songTitle}
                    </div>
                  )}

                  {/* 슬라이드 번호 (썸네일 위) */}
                  <div className={`text-xs mb-0.5 select-none ${isActive ? "text-zinc-200" : "text-zinc-500"}`}>
                    {flatIdx + 1}
                  </div>

                  {/* 썸네일 카드 */}
                  <div
                    className={`w-full cursor-grab rounded transition-all ${
                      isActive ? "ring-2 ring-orange-400" : "ring-1 ring-zinc-600 hover:ring-zinc-400"
                    } ${isHidden ? "opacity-40" : ""}`}
                    onClick={() => setActiveFlatSlide(flatIdx)}
                    onContextMenu={(e) => { e.stopPropagation(); openCtx(e, flatIdx); }}
                  >
                    <div style={{ aspectRatio: "16/9", position: "relative", overflow: "hidden" }} className="rounded">
                      <div style={{ position: "absolute", inset: 0, backgroundColor: "#111" }}>
                        {canvasBlocks.length > 0 ? (
                          canvasBlocks.map((b) => (
                            <div
                              key={b.id}
                              style={{
                                position: "absolute",
                                left: `${(b.x / 1920) * 100}%`,
                                top: `${(b.y / 1080) * 100}%`,
                                width: `${(b.width / 1920) * 100}%`,
                                height: `${((b.height ?? 200) / 1080) * 100}%`,
                                border: "1px solid rgba(255,255,255,0.3)",
                                background: "rgba(255,255,255,0.04)",
                                borderRadius: 1,
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                overflow: "hidden",
                                gap: 1,
                                padding: "1px 2px",
                              }}
                            >
                              {b.text.split("\n").filter(Boolean).slice(0, 3).map((line, i) => (
                                <div key={i} style={{
                                  fontSize: 7, color: "#ccc", whiteSpace: "nowrap",
                                  overflow: "hidden", maxWidth: "100%", textOverflow: "ellipsis",
                                  lineHeight: 1.3,
                                }}>
                                  {line}
                                </div>
                              ))}
                            </div>
                          ))
                        ) : (
                          <div style={{
                            position: "absolute", inset: 0,
                            display: "flex", flexDirection: "column", alignItems: "center",
                            justifyContent: "center", padding: "4px 8px", gap: 2,
                          }}>
                            {previewLines.slice(0, 4).map((line, i) => (
                              <div key={i} style={{
                                fontSize: 9, color: "#ddd", whiteSpace: "nowrap",
                                overflow: "hidden", maxWidth: "100%", textOverflow: "ellipsis", lineHeight: 1.4,
                              }}>
                                {line}
                              </div>
                            ))}
                            {previewLines.length === 0 && (
                              <div style={{ fontSize: 6, color: "#444" }}>빈 슬라이드</div>
                            )}
                          </div>
                        )}
                        {entry.songId >= 0 && (
                          <span style={{
                            position: "absolute", bottom: 2, right: 3,
                            width: 4, height: 4, borderRadius: "50%",
                            backgroundColor: SECTION_DOT[entry.slide.section] ?? "#6b7280",
                          }} />
                        )}
                        {isHidden && (
                          <span style={{ position: "absolute", top: 2, left: 3, fontSize: 6, color: "#888" }}>숨김</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </SortableItem>
            );
          })}

          {/* 컨텍스트 메뉴 */}
          {ctxMenu && (
            <CtxMenuPanel
              ctxMenu={ctxMenu} slides={slides} currentService={currentService}
              onClose={() => setCtxMenu(null)} onOpenDesignPanel={onOpenDesignPanel}
              hiddenSlides={hiddenSlideKeys} toggleHiddenSlide={toggleHiddenSlide}
              updateService={updateServiceData}
            />
          )}
        </div>
      </SortableContext>
    </DndContext>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// 컨텍스트 메뉴 패널
// ──────────────────────────────────────────────────────────────────────────────

interface CtxMenuPanelProps {
  ctxMenu: CtxMenuState;
  slides: FlatSlide[];
  currentService: Service | null;
  onClose: () => void;
  onOpenDesignPanel?: () => void;
  hiddenSlides: Set<string>;
  toggleHiddenSlide: (key: string) => void;
  updateService: (s: Service) => void;
}

function CtxMenuPanel({
  ctxMenu, slides, currentService, onClose, onOpenDesignPanel,
  hiddenSlides, toggleHiddenSlide, updateService,
}: CtxMenuPanelProps) {
  const { flatIdx } = ctxMenu;
  const entry = flatIdx !== null ? slides[flatIdx] : null;
  const canPaste = slideClipboard !== null;
  const isHidden = entry !== null && hiddenSlides.has(slideKey(entry));
  const [showSectionPicker, setShowSectionPicker] = useState(false);

  async function reloadService() {
    if (!currentService) return;
    const updated = await serviceDb.get(currentService.id);
    if (updated) updateService(updated);
  }

  async function handleNewSlide() {
    if (!entry || !currentService) { onClose(); return; }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) { onClose(); return; }
    const newSlide: LyricSlide = {
      id: newSlideId(),
      section: "verse",
      sectionIndex: song.lyrics_json.length + 1,
      lines: [],
    };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try { await songDb.update(song.id, { lyrics_json: newLyrics }); await reloadService(); }
    catch (e) { console.error(e); }
    onClose();
  }

  async function handleDuplicate() {
    if (!entry || !currentService) { onClose(); return; }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) { onClose(); return; }
    const newSlide: LyricSlide = { ...entry.slide, id: newSlideId() };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try { await songDb.update(song.id, { lyrics_json: newLyrics }); await reloadService(); }
    catch (e) { console.error(e); }
    onClose();
  }

  async function handleDelete() {
    if (!entry || !currentService) { onClose(); return; }
    if (!window.confirm("슬라이드를 삭제할까요?")) { onClose(); return; }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) { onClose(); return; }
    const newLyrics = song.lyrics_json.filter((_, i) => i !== entry.slideIndex);
    try { await songDb.update(song.id, { lyrics_json: newLyrics }); await reloadService(); }
    catch (e) { console.error(e); }
    onClose();
  }

  function handleCopy() {
    if (entry) slideClipboard = { ...entry.slide };
    onClose();
  }

  async function handleCut() {
    if (entry) {
      slideClipboard = { ...entry.slide };
      await handleDelete();
    } else {
      onClose();
    }
  }

  async function handlePaste() {
    if (!slideClipboard || !entry || !currentService) { onClose(); return; }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) { onClose(); return; }
    const newSlide: LyricSlide = { ...slideClipboard, id: newSlideId() };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try { await songDb.update(song.id, { lyrics_json: newLyrics }); await reloadService(); }
    catch (e) { console.error(e); }
    onClose();
  }

  function handleToggleHide() {
    if (!entry) { onClose(); return; }
    toggleHiddenSlide(slideKey(entry));
    onClose();
  }

  async function handleAddSection(section: import("@/lib/types").LyricSection) {
    if (!entry || !currentService) { onClose(); return; }
    const song = currentService.items[entry.serviceItemIndex]?.song;
    if (!song) { onClose(); return; }
    const newSlide: LyricSlide = {
      id: newSlideId(),
      section,
      sectionIndex: song.lyrics_json.filter(s => s.section === section).length + 1,
      lines: [],
    };
    const newLyrics = [...song.lyrics_json];
    newLyrics.splice(entry.slideIndex + 1, 0, newSlide);
    try { await songDb.update(song.id, { lyrics_json: newLyrics }); await reloadService(); }
    catch (e) { console.error(e); }
    onClose();
  }

  // 메뉴가 화면 밖으로 나가지 않도록 위치 조정
  const vw = typeof window !== "undefined" ? window.innerWidth : 1920;
  const vh = typeof window !== "undefined" ? window.innerHeight : 1080;
  const menuW = 200;
  const menuH = flatIdx !== null ? 320 : 140;
  const left = Math.min(ctxMenu.x, vw - menuW - 8);
  const top = Math.min(ctxMenu.y, vh - menuH - 8);

  return (
    <div
      style={{ position: "fixed", top, left, zIndex: 9999, width: menuW }}
      className="bg-[#1e1e1e] border border-zinc-700 rounded-lg shadow-2xl py-1 text-xs"
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {flatIdx !== null ? (
        // 슬라이드 썸네일 우클릭 메뉴
        <>
          <CItem label="잘라내기"       shortcut="⌘X" onClick={handleCut} />
          <CItem label="복사하기"       shortcut="⌘C" onClick={handleCopy} />
          <CItem label="붙여넣기"       shortcut="⌘V" onClick={handlePaste} disabled={!canPaste} />
          <CItem label="붙여넣기 옵션"                 onClick={handlePaste} disabled={!canPaste} />
          <CSep />
          <CItem label="새 슬라이드"                   onClick={handleNewSlide} />
          <CItem label="슬라이드 복제"                 onClick={handleDuplicate} />
          <CItem label="슬라이드 삭제"                 onClick={handleDelete} danger />
          {!showSectionPicker ? (
            <CItem label="구역 추가" onClick={() => setShowSectionPicker(true)} disabled={!entry} />
          ) : (
            <div className="px-2 py-1">
              <p className="text-xs text-zinc-500 mb-1 px-2">섹션 선택</p>
              {([
                ["verse", "절 (Verse)"],
                ["chorus", "후렴 (Chorus)"],
                ["bridge", "브릿지 (Bridge)"],
                ["pre-chorus", "프리코러스"],
                ["intro", "인트로"],
                ["outro", "아웃트로"],
              ] as [import("@/lib/types").LyricSection, string][]).map(([sec, label]) => (
                <button key={sec} onClick={() => handleAddSection(sec)}
                  className="w-full text-left px-4 py-1 text-xs text-zinc-200 hover:bg-zinc-700 cursor-pointer">
                  {label}
                </button>
              ))}
              <button onClick={() => setShowSectionPicker(false)}
                className="w-full text-left px-4 py-1 text-xs text-zinc-500 hover:bg-zinc-700">취소</button>
            </div>
          )}
          <CSep />
          <CItem label="배경 서식"     onClick={() => { onOpenDesignPanel?.(); onClose(); }} />
          <CItem label={isHidden ? "슬라이드 표시" : "슬라이드 숨기기"} onClick={handleToggleHide} />
        </>
      ) : (
        // 빈 영역 우클릭 메뉴
        <>
          <CItem label="붙여넣기"       shortcut="⌘V" onClick={handlePaste} disabled={!canPaste} />
          <CItem label="붙여넣기 옵션"                 onClick={handlePaste} disabled={!canPaste} />
          <CSep />
          <CItem label="새 슬라이드"  onClick={handleNewSlide} disabled={slides.length === 0} />
          <CItem label="구역 추가"    onClick={onClose} disabled={slides.length === 0} />
        </>
      )}
    </div>
  );
}

function CItem({ label, shortcut, onClick, disabled, danger }: {
  label: string; shortcut?: string; onClick: () => void; disabled?: boolean; danger?: boolean;
}) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onClick={disabled ? undefined : onClick}
      className={`w-full text-left px-4 py-1.5 flex items-center justify-between gap-4 transition-colors ${
        disabled ? "text-zinc-600 cursor-default"
        : danger  ? "text-red-400 hover:bg-zinc-700 cursor-pointer"
                  : "text-zinc-200 hover:bg-zinc-700 cursor-pointer"
      }`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-zinc-500 text-xs">{shortcut}</span>}
    </button>
  );
}

function CSep() {
  return <div className="my-1 border-t border-zinc-700" />;
}
