"use client";

import { useEffect, useState } from "react";
import type { LayerConfig, MediaItem } from "@/lib/types";
import { ipc } from "@/lib/ipc";

interface Props {
  layerConfig: LayerConfig;
  onChange: (config: LayerConfig) => void;
  mediaItems: MediaItem[];
  importing: boolean;
  onImport: (type: "image" | "video") => void;
}

export default function BackgroundSection({ layerConfig, onChange, mediaItems, importing, onImport }: Props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  const bg = layerConfig.background;
  const imageItems = mediaItems.filter((m) => m.type === "image");
  const videoItems = mediaItems.filter((m) => m.type === "video");

  // Reset playback state when video source changes
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

  // playback:status 수신 — 영상 진행 상태 동기화
  useEffect(() => {
    if (bg.type !== "video") return;
    const unlistenPromise = ipc.onPlaybackStatus((status) => {
      setCurrentTime(status.currentTime);
      setDuration(status.duration);
      setIsPlaying(status.playing);
    });
    return () => { void unlistenPromise.then((fn) => fn()); };
  }, [bg.type]);

  function setBackground(patch: Partial<LayerConfig["background"]>) {
    onChange({ ...layerConfig, background: { ...layerConfig.background, ...patch } });
  }

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  return (
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
              onClick={() => onImport(bg.type as "image" | "video")}
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
  );
}
