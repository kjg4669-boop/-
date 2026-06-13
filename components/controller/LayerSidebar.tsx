"use client";

import { useEffect, useState, useRef } from "react";
import { mediaDb } from "@/lib/db";
import type { LayerConfig, MediaItem } from "@/lib/types";

export interface LayerSidebarProps {
  layerConfig: LayerConfig;
  activeItemId: number | null;
  onChange: (config: LayerConfig) => void;
  onSaveGlobal: (config: LayerConfig) => void;
  onSaveItem: (itemId: number, config: LayerConfig) => void;
}

const FONT_OPTIONS = ["sans-serif", "serif", "Apple SD Gothic Neo", "Arial", "Georgia"];

export default function LayerSidebar({
  layerConfig,
  activeItemId,
  onChange,
  onSaveGlobal,
  onSaveItem,
}: LayerSidebarProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    mediaDb.list().then(setMediaItems).catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    };
  }, []);

  function showNotice(msg: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setSavedNotice(msg);
    noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 2000);
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
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">배경</p>

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
            <select
              value={bg.src ?? ""}
              onChange={(e) => setBackground({ src: e.target.value || undefined })}
              className="w-full bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
            >
              <option value="">-- 선택 --</option>
              {(bg.type === "image" ? imageItems : videoItems).map((m) => (
                <option key={m.id} value={m.file_path}>{m.name}</option>
              ))}
            </select>
            {(bg.type === "image" ? imageItems : videoItems).length === 0 && (
              <p className="text-zinc-600 text-xs">미디어 없음 (미디어 탭에서 추가)</p>
            )}
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
      </section>

      {/* ── 자막 ─────────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">자막</p>

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
      </section>

      {/* ── 오버레이 ────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">오버레이</p>

        {/* Visible toggle */}
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
            {/* Image selector */}
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

            {/* Position + size */}
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
