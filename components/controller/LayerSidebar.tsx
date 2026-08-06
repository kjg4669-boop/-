"use client";

import { useEffect, useState, useRef } from "react";
import { mediaDb } from "@/lib/db";
import { importMediaFile } from "@/lib/media";
import type { LayerConfig, MediaItem } from "@/lib/types";
import { FONT_OPTIONS } from "@/lib/constants";
import { ipc } from "@/lib/ipc";

export interface LayerSidebarProps {
  layerConfig: LayerConfig;
  activeItemId: number | null;
  onChange: (config: LayerConfig) => void;
  onSaveGlobal: (config: LayerConfig) => void;
  onSaveItem: (itemId: number, config: LayerConfig) => void;
}

export default function LayerSidebar({
  layerConfig,
  activeItemId,
  onChange,
  onSaveGlobal,
  onSaveItem,
}: LayerSidebarProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [importing, setImporting] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 영상 재생 컨트롤 상태
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    mediaDb.list().then(setMediaItems).catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  // Reset playback state when video source changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setVolume(1);
    if (layerConfig.background.type === "video" && layerConfig.background.src) {
      void ipc.sendVideoControl({ action: "volume", value: 1 });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerConfig.background.src]);

  // playback:status 수신 — 영상 진행 상태 동기화
  useEffect(() => {
    if (layerConfig.background.type !== "video") return;
    const unlistenPromise = ipc.onPlaybackStatus((status) => {
      setCurrentTime(status.currentTime);
      setDuration(status.duration);
      setIsPlaying(status.playing);
    });
    return () => { void unlistenPromise.then((fn) => fn()); };
  }, [layerConfig.background.type]);

  function showNotice(msg: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setSavedNotice(msg);
    noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 2000);
  }

  async function handleImport(type: "image" | "video") {
    setImporting(true);
    try {
      const item = await importMediaFile(type);
      if (item) {
        setMediaItems((prev) => [...prev, item]);
        setBackground({ src: item.file_path });
      }
    } catch (e) {
      console.error("미디어 가져오기 실패:", e);
    } finally {
      setImporting(false);
    }
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function setBackground(patch: Partial<LayerConfig["background"]>) {
    onChange({ ...layerConfig, background: { ...layerConfig.background, ...patch } });
  }

  function setSubtitle(patch: Partial<LayerConfig["subtitle"]>) {
    onChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...patch } });
  }

  function setOverlay(patch: Partial<LayerConfig["overlay"]>) {
    onChange({ ...layerConfig, overlay: { ...layerConfig.overlay, ...patch } });
  }

  const bg = layerConfig.background;
  const sub = layerConfig.subtitle;
  const ov = layerConfig.overlay;

  const imageItems = mediaItems.filter((m) => m.type === "image");
  const videoItems = mediaItems.filter((m) => m.type === "video");

  return (
    <div className="h-full flex flex-col overflow-y-auto text-xs">
      {/* ── 배경 ─────────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">배경</p>

        {/* Type tabs */}
        <div className="flex gap-1">
          {(["color", "image", "video"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setBackground({ type: t })}
              className={`flex-1 py-1 rounded text-xs ${
                (bg.type === t || (t === "color" && bg.type === "none")) ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
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
              onChange={(e) => setBackground({ color: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
            />
            <span className="text-zinc-500">{bg.color ?? "#000000"}</span>
          </div>
        )}

        {/* Media selector for image/video */}
        {(bg.type === "image" || bg.type === "video") && (
          <div className="space-y-1">
            <div className="flex gap-1">
              <select
                value={bg.src ?? ""}
                onChange={(e) => setBackground({ src: e.target.value || undefined })}
                className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
              >
                <option value="">-- 선택 --</option>
                {(bg.type === "image" ? imageItems : videoItems).map((m) => (
                  <option key={m.id} value={m.file_path}>{m.name}</option>
                ))}
              </select>
              <button
                onClick={() => handleImport(bg.type as "image" | "video")}
                disabled={importing}
                className="px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
              >
                {importing ? "..." : "+ 가져오기"}
              </button>
            </div>
          </div>
        )}

        {/* Opacity */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-12">불투명도</span>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={bg.opacity}
            onChange={(e) => setBackground({ opacity: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-zinc-500 w-8 text-right">{Math.round(bg.opacity * 100)}%</span>
        </div>

        {/* 영상 재생 컨트롤 */}
        {bg.type === "video" && (
          <div className="space-y-2 border-t border-zinc-700 pt-2">
            <p className="text-xs text-zinc-400 font-semibold uppercase tracking-wider">영상 컨트롤</p>

            {/* 재생/일시정지 + 처음으로 */}
            <div className="flex gap-1">
              <button
                onClick={() => {
                  void ipc.sendVideoControl({ action: isPlaying ? "pause" : "play" });
                  setIsPlaying((v) => !v);
                }}
                className="flex-1 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
              >
                {isPlaying ? "⏸ 일시정지" : "▶ 재생"}
              </button>
              <button
                onClick={() => { void ipc.sendVideoControl({ action: "seek", value: 0 }); setCurrentTime(0); }}
                className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
                title="처음으로"
              >
                ⏮
              </button>
            </div>

            {/* 진행 바 */}
            {duration > 0 && (
              <>
                <input
                  type="range"
                  min={0}
                  max={duration}
                  step={0.5}
                  value={currentTime}
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

            {/* 볼륨 */}
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

            {/* 루프 */}
            <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
              <input
                type="checkbox"
                checked={bg.loop ?? true}
                onChange={(e) => {
                  setBackground({ loop: e.target.checked });
                  void ipc.sendVideoControl({ action: "loop", value: e.target.checked ? 1 : 0 });
                }}
                className="accent-blue-500"
              />
              반복 재생
            </label>
          </div>
        )}
      </section>

      {/* ── 자막 ─────────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">자막</p>

        {/* Layout presets */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10 text-xs">프리셋</span>
          {([
            { label: "기본", position: "bottom", fontSize: 48, textAlign: "center", fontWeight: "normal" },
            { label: "대형", position: "center", fontSize: 64, textAlign: "center", fontWeight: "bold" },
            { label: "소자막", position: "bottom", fontSize: 32, textAlign: "center", fontWeight: "normal" },
            { label: "상단", position: "top", fontSize: 48, textAlign: "center", fontWeight: "normal" },
          ] as const).map((preset) => (
            <button
              key={preset.label}
              onClick={() => setSubtitle({ position: preset.position, fontSize: preset.fontSize, textAlign: preset.textAlign, fontWeight: preset.fontWeight, layout: "full" })}
              className="flex-1 py-1 rounded text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
              title={`${preset.label}: 위치=${preset.position === "bottom" ? "하단" : preset.position === "center" ? "중앙" : "상단"}, 크기=${preset.fontSize}px`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Layout (split) */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10 text-xs">배치</span>
          {([
            { key: "full", label: "전체" },
            { key: "left-half", label: "좌½" },
            { key: "right-half", label: "우½" },
          ] as const).map((l) => (
            <button
              key={l.key}
              onClick={() => setSubtitle({ layout: l.key })}
              className={`flex-1 py-1 rounded text-xs ${(sub.layout ?? "full") === l.key ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
              title={l.key === "full" ? "전체 화면 자막" : l.key === "left-half" ? "좌측 절반에만 자막 (우측 이미지)" : "우측 절반에만 자막 (좌측 이미지)"}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Position */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">위치</span>
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setSubtitle({ position: pos })}
              className={`flex-1 py-1 rounded ${
                sub.position === pos ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {pos === "top" ? "상단" : pos === "center" ? "중앙" : "하단"}
            </button>
          ))}
        </div>

        {/* Font family + size */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">폰트</span>
          <select
            value={sub.fontFamily}
            onChange={(e) => setSubtitle({ fontFamily: e.target.value })}
            className="flex-1 bg-zinc-800 text-white rounded px-1 py-1 border border-zinc-600 text-xs"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <input
            type="number"
            min={12} max={120}
            value={sub.fontSize}
            onChange={(e) => setSubtitle({ fontSize: Math.max(12, Math.min(120, Number(e.target.value))) })}
            className="w-14 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
          />
          <span className="text-zinc-500">px</span>
        </div>

        {/* Text color */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-10">색상</span>
          <input
            type="color"
            value={sub.color}
            onChange={(e) => setSubtitle({ color: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
          />
          <span className="text-zinc-500">{sub.color}</span>
        </div>

        {/* Text align + weight + style */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">정렬</span>
          {(["left", "center", "right"] as const).map((align) => (
            <button
              key={align}
              onClick={() => setSubtitle({ textAlign: align })}
              className={`flex-1 py-1 rounded text-xs ${
                (sub.textAlign ?? "center") === align ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {align === "left" ? "좌" : align === "center" ? "중" : "우"}
            </button>
          ))}
          <button
            onClick={() => setSubtitle({ fontWeight: sub.fontWeight === "bold" ? "normal" : "bold" })}
            className={`px-2 py-1 rounded text-xs font-bold ${
              sub.fontWeight === "bold" ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
            }`}
            title="굵게"
          >B</button>
          <button
            onClick={() => setSubtitle({ fontStyle: sub.fontStyle === "italic" ? "normal" : "italic" })}
            className={`px-2 py-1 rounded text-xs italic ${
              sub.fontStyle === "italic" ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
            }`}
            title="이탤릭"
          >I</button>
        </div>

        {/* 줄 간격 */}
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 text-xs w-16 shrink-0">줄 간격</label>
          <input
            type="range" min={0.8} max={3.0} step={0.05}
            value={layerConfig.subtitle.lineHeight ?? 1.3}
            onChange={(e) => setSubtitle({ lineHeight: Number(e.target.value) })}
            className="flex-1 accent-blue-500"
          />
          <span className="text-zinc-300 text-xs w-8 text-right">
            {(layerConfig.subtitle.lineHeight ?? 1.3).toFixed(2)}
          </span>
        </div>
        {/* 자간 */}
        <div className="flex items-center gap-2">
          <label className="text-zinc-400 text-xs w-16 shrink-0">자간</label>
          <input
            type="range" min={-5} max={20} step={0.5}
            value={layerConfig.subtitle.letterSpacing ?? 0}
            onChange={(e) => setSubtitle({ letterSpacing: Number(e.target.value) })}
            className="flex-1 accent-blue-500"
          />
          <span className="text-zinc-300 text-xs w-8 text-right">
            {(layerConfig.subtitle.letterSpacing ?? 0).toFixed(1)}px
          </span>
        </div>

        {/* ── 이중언어 ─── */}
        <div className="border-t border-zinc-700 pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-xs font-medium uppercase tracking-wider">이중언어</span>
            <button
              onClick={() => setSubtitle({ bilingualEnabled: !sub.bilingualEnabled })}
              className={`text-xs px-2 py-1 rounded ${sub.bilingualEnabled ? "bg-yellow-600 text-white" : "bg-zinc-700 text-zinc-400"}`}
            >
              {sub.bilingualEnabled ? "켜짐" : "꺼짐"}
            </button>
          </div>
          {sub.bilingualEnabled && (
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <label className="text-zinc-400 text-xs w-14 shrink-0">번역 크기</label>
                <input
                  type="number" min={12} max={80}
                  value={sub.fontSize2 ?? 28}
                  onChange={(e) => setSubtitle({ fontSize2: Number(e.target.value) })}
                  className="w-16 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none"
                />
                <span className="text-zinc-500 text-xs">px</span>
              </div>
              <div className="flex items-center gap-2">
                <label className="text-zinc-400 text-xs w-14 shrink-0">번역 색상</label>
                <input
                  type="color"
                  value={sub.color2 ?? "#cccccc"}
                  onChange={(e) => setSubtitle({ color2: e.target.value })}
                  className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
                />
                <span className="text-zinc-500 text-xs">{sub.color2 ?? "#cccccc"}</span>
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setSubtitle({ fontWeight2: sub.fontWeight2 === "bold" ? "normal" : "bold" })}
                  className={`px-2 py-1 rounded text-xs font-bold ${sub.fontWeight2 === "bold" ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300"}`}
                >B</button>
                <button
                  onClick={() => setSubtitle({ fontStyle2: sub.fontStyle2 === "italic" ? "normal" : "italic" })}
                  className={`px-2 py-1 rounded text-xs italic ${sub.fontStyle2 === "italic" ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300"}`}
                >I</button>
              </div>
            </div>
          )}
        </div>

        {/* Copyright toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.showCopyright ?? true}
            onChange={(e) => setSubtitle({ showCopyright: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300">저작권 표시</span>
        </label>

        {/* Advanced toggle */}
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-xs text-zinc-500 hover:text-zinc-300 text-left"
        >
          {showAdvanced ? "▲ 고급 설정 접기" : "▼ 고급 설정"}
        </button>

        {showAdvanced && (
          <>
            {/* Stroke color + width */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 w-10">외곽선</span>
              <input
                type="color"
                value={sub.strokeColor}
                onChange={(e) => setSubtitle({ strokeColor: e.target.value })}
                className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
              />
              <input
                type="number"
                min={0} max={10}
                value={sub.strokeWidth}
                onChange={(e) => setSubtitle({ strokeWidth: Math.max(0, Math.min(10, Number(e.target.value))) })}
                className="w-12 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
              />
              <span className="text-zinc-500">px</span>
            </div>

            {/* Shadow toggle */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sub.shadowEnabled}
                onChange={(e) => setSubtitle({ shadowEnabled: e.target.checked })}
                className="rounded"
              />
              <span className="text-zinc-300">그림자</span>
            </label>

            {/* Background box */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sub.backgroundBoxVisible}
                onChange={(e) => setSubtitle({ backgroundBoxVisible: e.target.checked })}
                className="rounded"
              />
              <span className="text-zinc-300">배경박스</span>
            </label>
            {sub.backgroundBoxVisible && (
              <div className="flex items-center gap-2 pl-5">
                <span className="text-zinc-400 w-12">불투명도</span>
                <input
                  type="range"
                  min={0} max={1} step={0.05}
                  value={sub.backgroundBoxOpacity}
                  onChange={(e) => setSubtitle({ backgroundBoxOpacity: Number(e.target.value) })}
                  className="flex-1"
                />
                <span className="text-zinc-500 w-8 text-right">{Math.round(sub.backgroundBoxOpacity * 100)}%</span>
              </div>
            )}

            {/* Text entrance animation */}
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 w-12 flex-shrink-0">전환</span>
              <select
                value={sub.textEntrance ?? "fade"}
                onChange={(e) => setSubtitle({ textEntrance: e.target.value as LayerConfig["subtitle"]["textEntrance"] })}
                className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
              >
                <option value="none">없음</option>
                <option value="fade">페이드</option>
                <option value="slide-up">슬라이드 업 ↑</option>
                <option value="slide-down">슬라이드 다운 ↓</option>
                <option value="zoom-in">줌인</option>
              </select>
            </div>

            {/* Overlay */}
            <p className="text-zinc-500 text-xs uppercase tracking-wider pt-1">오버레이</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={ov.visible}
                onChange={(e) => setOverlay({ visible: e.target.checked })}
                className="rounded"
              />
              <span className="text-zinc-300">표시</span>
            </label>
            {ov.visible && (
              <>
                <select
                  value={ov.src ?? ""}
                  onChange={(e) => setOverlay({ src: e.target.value || undefined })}
                  className="w-full bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
                >
                  <option value="">-- 이미지 선택 --</option>
                  {imageItems.map((m) => (
                    <option key={m.id} value={m.file_path}>{m.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-1">
                  {(["x", "y", "width", "height"] as const).map((field) => (
                    <div key={field} className="flex items-center gap-1">
                      <span className="text-zinc-400 w-10">{field}</span>
                      <input
                        type="number"
                        value={ov[field]}
                        onChange={(e) => {
                          const v = Number(e.target.value);
                          const clamped = (field === "width" || field === "height") ? Math.max(1, v) : v;
                          setOverlay({ [field]: clamped });
                        }}
                        className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </section>

      {/* ── 저장 버튼 ────────────────────────────────── */}
      <div className="p-3 space-y-2 mt-auto">
        {savedNotice && (
          <p className="text-xs text-green-400 text-center">{savedNotice}</p>
        )}
        <button
          onClick={() => { onSaveGlobal(layerConfig); showNotice("전역 기본값 저장됨"); }}
          className="w-full py-1.5 text-xs bg-zinc-700 hover:bg-zinc-600 rounded"
        >
          전역 기본값으로 저장
        </button>
        <button
          onClick={() => {
            if (activeItemId !== null) {
              onSaveItem(activeItemId, layerConfig);
              showNotice("항목 설정 적용됨");
            }
          }}
          disabled={activeItemId === null}
          className="w-full py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-40 rounded"
        >
          이 항목에 적용
        </button>
      </div>
    </div>
  );
}
