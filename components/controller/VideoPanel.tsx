"use client";

import { useEffect, useState } from "react";
import { useVideoStore } from "@/stores/videoStore";
import { useQueueStore } from "@/stores/queueStore";
import { mediaDb } from "@/lib/db";
import { importMediaFile, toDisplayUrl } from "@/lib/media";
import { ipc } from "@/lib/ipc";
import { getSlidesInOrder } from "@/lib/utils";
import type { LayerConfig, MediaItem } from "@/lib/types";

interface Props {
  layerConfig: LayerConfig;
  onChange: (config: LayerConfig) => void;
}

export default function VideoPanel({ layerConfig, onChange }: Props) {
  const {
    phases, slidePhaseMap, selectedPhaseId,
    addPhase, removePhase, updatePhase, selectPhase,
    assignSlidePhase, unassignSlidePhase,
  } = useVideoStore();

  const { activeLyricSlideIndex, activeItemIndex, getActiveLyricSlide, currentService, setActiveFlatSlide } = useQueueStore();
  const currentSlide = getActiveLyricSlide();

  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [editingPhaseId, setEditingPhaseId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const selectedPhase = phases.find((p) => p.id === selectedPhaseId) ?? null;
  const bg = selectedPhase?.background ?? { type: "color" as const, color: "#000000", loop: true, opacity: 1 };
  const currentSlidePhaseId = currentSlide ? slidePhaseMap[currentSlide.id] : undefined;
  const currentSlidePhase = phases.find((p) => p.id === currentSlidePhaseId) ?? null;

  const videoItems = mediaItems.filter((m) => m.type === "video");
  const imageItems = mediaItems.filter((m) => m.type === "image");

  useEffect(() => {
    mediaDb.list().then(setMediaItems).catch(console.error);
  }, []);

  // Sync playback status from output window
  useEffect(() => {
    if (bg.type !== "video") return;
    const p = ipc.onPlaybackStatus((status) => {
      setCurrentTime(status.currentTime);
      setDuration(status.duration);
      setIsPlaying(status.playing);
    });
    return () => { void p.then((fn) => fn()); };
  }, [bg.type]);

  // Reset playback state when video src changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setVolume(1);
    if (bg.type === "video" && bg.src) {
      void ipc.sendVideoControl({ action: "volume", value: 1 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bg.src]);

  function updateBackground(patch: Partial<LayerConfig["background"]>) {
    if (!selectedPhase) return;
    const newBg = { ...selectedPhase.background, ...patch };
    updatePhase(selectedPhase.id, { background: newBg });
    // Live-update output only if this phase is assigned to the current slide
    if (currentSlidePhaseId === selectedPhase.id) {
      onChange({ ...layerConfig, background: newBg });
    }
  }

  function handleApplyPhase() {
    if (!selectedPhase || !currentSlide) return;
    assignSlidePhase(currentSlide.id, selectedPhase.id);
    onChange({ ...layerConfig, background: selectedPhase.background, subtitle: { ...layerConfig.subtitle, visible: true } });
  }

  function handleUnassign() {
    if (!currentSlide) return;
    unassignSlidePhase(currentSlide.id);
  }

  async function handleImport(type: "image" | "video") {
    setImporting(true);
    try {
      const item = await importMediaFile(type);
      if (item) {
        setMediaItems((prev) => [...prev, item]);
        updateBackground({ src: item.file_path });
      }
    } catch (e) {
      console.error("미디어 가져오기 실패:", e);
    } finally {
      setImporting(false);
    }
  }

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  // activeLyricSlideIndex / activeItemIndex subscriptions ensure re-render on slide navigation

  return (
    <div className="h-full flex flex-col overflow-y-auto text-xs">

      {/* ── 페이즈 목록 ────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">페이즈</p>
        <div className="space-y-1">
          {phases.map((phase) => {
            const assignedCount = Object.values(slidePhaseMap).filter((v) => v === phase.id).length;
            const isSelected = selectedPhaseId === phase.id;
            return (
              <div
                key={phase.id}
                onClick={() => { if (editingPhaseId !== phase.id) selectPhase(phase.id); }}
                className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer ${
                  isSelected ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                {editingPhaseId === phase.id ? (
                  <input
                    autoFocus
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onBlur={() => {
                      if (editingName.trim()) updatePhase(phase.id, { name: editingName.trim() });
                      setEditingPhaseId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.currentTarget.blur(); }
                      if (e.key === "Escape") { setEditingPhaseId(null); }
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 bg-transparent border-b border-white/60 outline-none text-xs px-0"
                  />
                ) : (
                  <span
                    className="flex-1 truncate"
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      selectPhase(phase.id);
                      setEditingPhaseId(phase.id);
                      setEditingName(phase.name);
                    }}
                    title="더블클릭하여 이름 편집"
                  >{phase.name}</span>
                )}
                <span className="text-xs uppercase opacity-60">
                  {phase.background.type === "color" ? "단색" : phase.background.type === "image" ? "이미지" : "영상"}
                </span>
                {assignedCount > 0 && (
                  <span className="text-[10px] bg-green-600/60 px-1 rounded">
                    {assignedCount}
                  </span>
                )}
                {phases.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); removePhase(phase.id); }}
                    className="opacity-50 hover:opacity-100 text-red-400 leading-none"
                    title="삭제"
                  >✕</button>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={addPhase}
          className="w-full py-1 text-xs bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
        >
          + 페이즈 추가
        </button>
      </section>

      {/* ── 선택된 페이즈 설정 ──────────────────────────── */}
      {selectedPhase && (
        <section className="border-b border-zinc-700 p-3 space-y-2">
          {/* Type tabs */}
          <div className="flex gap-1">
            {(["color", "image", "video"] as const).map((t) => (
              <button
                key={t}
                onClick={() => updateBackground({ type: t })}
                className={`flex-1 py-1 rounded text-xs ${
                  bg.type === t ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
                }`}
              >
                {t === "color" ? "단색" : t === "image" ? "이미지" : "영상"}
              </button>
            ))}
          </div>

          {/* Color picker */}
          {bg.type === "color" && (
            <div className="flex items-center gap-2">
              <span className="text-zinc-400">색상</span>
              <input
                type="color"
                value={bg.color ?? "#000000"}
                onChange={(e) => updateBackground({ color: e.target.value })}
                className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
              />
              <span className="text-zinc-500">{bg.color ?? "#000000"}</span>
            </div>
          )}

          {/* Media selector */}
          {(bg.type === "image" || bg.type === "video") && (
            <div className="space-y-1">
              <div className="flex gap-1">
                <select
                  value={bg.src ?? ""}
                  onChange={(e) => updateBackground({ src: e.target.value || undefined })}
                  className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
                >
                  <option value="">-- 선택 --</option>
                  {(bg.type === "image" ? imageItems : videoItems).map((m) => (
                    <option key={m.id} value={m.file_path}>{m.name}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={() => void handleImport(bg.type as "image" | "video")}
                disabled={importing}
                className="w-full py-1.5 text-xs bg-zinc-600 hover:bg-zinc-500 disabled:opacity-50 rounded"
              >
                {importing ? "가져오는 중..." : `+ ${bg.type === "image" ? "이미지" : "영상"} 파일 가져오기`}
              </button>
            </div>
          )}

          {/* Opacity */}
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 w-12">불투명도</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={bg.opacity}
              onChange={(e) => updateBackground({ opacity: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-zinc-500 w-8 text-right">{Math.round(bg.opacity * 100)}%</span>
          </div>

          {/* Video controls */}
          {bg.type === "video" && (
            <div className="space-y-2 border-t border-zinc-700 pt-2">
              <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">영상 컨트롤</p>
              <div className="flex gap-1">
                <button
                  onClick={() => { void ipc.sendVideoControl({ action: isPlaying ? "pause" : "play" }); setIsPlaying((v) => !v); }}
                  className="flex-1 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
                >
                  {isPlaying ? "⏸ 일시정지" : "▶ 재생"}
                </button>
                <button
                  onClick={() => { void ipc.sendVideoControl({ action: "seek", value: 0 }); setCurrentTime(0); }}
                  className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
                  title="처음으로"
                >⏮</button>
              </div>
              {duration > 0 && (
                <>
                  <input
                    type="range" min={0} max={duration} step={0.5} value={currentTime}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setCurrentTime(val);
                      void ipc.sendVideoControl({ action: "seek", value: val });
                    }}
                    className="w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-xs text-zinc-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 w-8 flex-shrink-0">볼륨</span>
                <input
                  type="range" min={0} max={1} step={0.05} value={volume}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setVolume(val);
                    void ipc.sendVideoControl({ action: "volume", value: val });
                  }}
                  className="flex-1 accent-blue-500"
                />
                <span className="text-xs text-zinc-500 w-8 text-right">{Math.round(volume * 100)}%</span>
              </div>
              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bg.loop ?? true}
                  onChange={(e) => {
                    updateBackground({ loop: e.target.checked });
                    void ipc.sendVideoControl({ action: "loop", value: e.target.checked ? 1 : 0 });
                  }}
                  className="accent-blue-500"
                />
                반복 재생
              </label>
            </div>
          )}
        </section>
      )}

      {/* ── 슬라이드 배정 ─────────────────────────────── */}
      <section className="p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">슬라이드 배정</p>
        {currentSlide ? (
          <>
            <div className="text-zinc-400">
              현재 슬라이드:{" "}
              <span className="text-zinc-300">{currentSlide.section} {currentSlide.sectionIndex + 1}</span>
            </div>
            <div className="text-zinc-400">
              배정:{" "}
              {currentSlidePhase
                ? <span className="text-green-400 font-medium">{currentSlidePhase.name}</span>
                : <span className="text-zinc-600">미배정</span>
              }
            </div>
            <div className="flex gap-1">
              <button
                onClick={handleApplyPhase}
                disabled={!selectedPhase}
                className="flex-1 py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded"
              >
                이 슬라이드에 배정
              </button>
              {currentSlidePhaseId && (
                <button
                  onClick={handleUnassign}
                  className="px-2 py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
                  title="배정 해제"
                >✕</button>
              )}
            </div>
          </>
        ) : (
          <p className="text-zinc-600">선택된 슬라이드 없음</p>
        )}
      </section>

      {/* ── 전체 슬라이드 목록 (찬양별 구분) ──────────── */}
      {currentService && currentService.items.some((it) => it.song) && (
        <section className="p-3 space-y-3 border-t border-zinc-700">
          <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">전체 슬라이드 배정</p>
          <p className="text-zinc-600 text-xs">클릭하면 해당 슬라이드로 이동합니다</p>
          {(() => {
            // Pre-compute flat index offset per item for navigation
            let flatOffset = 0;
            return currentService.items.map((item, itemIdx) => {
              if (!item.song) return null;
              const slides = getSlidesInOrder(item.song);
              if (slides.length === 0) return null;
              const itemFlatOffset = flatOffset;
              flatOffset += slides.length;
              return (
              <div key={itemIdx}>
                <p className="text-zinc-500 text-xs mb-1 truncate font-medium">{item.song.title}</p>
                <div className="grid grid-cols-2 gap-1">
                  {slides.map((slide, slideIdx) => {
                    const phaseId = slidePhaseMap[slide.id];
                    const assignedPhase = phases.find((p) => p.id === phaseId);
                    const isCurrentSlide = currentSlide?.id === slide.id;
                    const flatIdx = itemFlatOffset + slideIdx;
                    return (
                      <button
                        key={slide.id}
                        onClick={() => {
                          // Navigate to this slide only — phase is applied via "이 슬라이드에 배정" button
                          setActiveFlatSlide(flatIdx);
                        }}
                        className={`text-left rounded text-xs border transition-colors overflow-hidden ${
                          isCurrentSlide
                            ? "border-blue-500/60 bg-blue-900/30 text-blue-200"
                            : assignedPhase
                              ? "border-zinc-600 bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700"
                              : "border-zinc-700 bg-zinc-800 text-zinc-500 hover:bg-zinc-700 hover:text-zinc-300"
                        }`}
                        title={`${slide.section} ${slide.sectionIndex + 1}${assignedPhase ? ` → ${assignedPhase.name}` : " (미배정)"} | 클릭: 이동`}
                      >
                        {/* 배경 썸네일 */}
                        <div className="w-full h-10 relative overflow-hidden">
                          {assignedPhase?.background.type === "image" && assignedPhase.background.src ? (
                            <img
                              src={toDisplayUrl(assignedPhase.background.src) ?? ""}
                              alt=""
                              className="w-full h-full object-cover"
                            />
                          ) : assignedPhase?.background.type === "video" && assignedPhase.background.src ? (
                            <div className="w-full h-full bg-zinc-700 flex items-center justify-center">
                              <span className="text-[9px] text-zinc-400">▶ 영상</span>
                            </div>
                          ) : assignedPhase?.background.type === "color" ? (
                            <div className="w-full h-full" style={{ backgroundColor: assignedPhase.background.color ?? "#000" }} />
                          ) : (
                            <div className="w-full h-full bg-zinc-900" />
                          )}
                          {/* 가사 미리보기 오버레이 */}
                          {slide.lines.length > 0 && (
                            <div className="absolute inset-0 flex items-center justify-center px-1">
                              <span className="text-[7px] text-white/80 truncate text-center leading-tight drop-shadow">
                                {slide.lines[0]}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="px-1.5 py-0.5">
                          <span className="block truncate text-[10px]">{slide.section} {slide.sectionIndex + 1}</span>
                          <span className={`text-[9px] truncate block ${assignedPhase ? "text-green-400" : "text-zinc-600"}`}>
                            {assignedPhase ? assignedPhase.name : "미배정"}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              );
            });
          })()}
        </section>
      )}
    </div>
  );
}
