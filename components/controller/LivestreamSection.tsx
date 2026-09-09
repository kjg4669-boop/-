"use client";

import type { LayerConfig } from "@/lib/types";
import { Monitor, Copy, Check } from "lucide-react";
import { useState } from "react";

interface Props {
  layerConfig: LayerConfig;          // livestream LayerConfig
  onChange: (config: LayerConfig) => void;
  onOpenWindow: () => void;
  obsPort: number;
}

export default function LivestreamSection({ layerConfig, onChange, onOpenWindow, obsPort }: Props) {
  const [copied, setCopied] = useState(false);
  const sub = layerConfig.subtitle;
  const bg = layerConfig.background;

  function setSub(patch: Partial<LayerConfig["subtitle"]>) {
    onChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...patch } });
  }

  function copyObsUrl() {
    navigator.clipboard.writeText(`http://localhost:${obsPort}/livestream`).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <section className="p-3 space-y-3">
      <p className="text-zinc-400 font-medium uppercase tracking-wider text-xs">방송 출력</p>

      {/* Window control */}
      <div className="flex gap-2">
        <button
          onClick={onOpenWindow}
          className="flex items-center gap-1.5 flex-1 px-2 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs"
        >
          <Monitor size={13} />
          방송창 열기
        </button>
        <button
          onClick={copyObsUrl}
          className="flex items-center gap-1.5 px-2 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs"
          title={`OBS 브라우저 소스 URL 복사 (포트 ${obsPort})`}
        >
          {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
          OBS URL
        </button>
      </div>

      {/* Background mode */}
      <div className="space-y-1">
        <p className="text-zinc-500 text-xs uppercase tracking-wider">배경</p>
        <div className="flex gap-1">
          {([
            { label: "투명", type: "transparent" },
            { label: "크로마키", type: "color" },
          ] as const).map(({ label, type }) => (
            <button
              key={type}
              onClick={() => onChange({
                ...layerConfig,
                background: {
                  ...layerConfig.background,
                  type,
                  color: type === "color" ? "#00ff00" : layerConfig.background.color,
                },
              })}
              className={`flex-1 py-1 rounded text-xs ${bg.type === type ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        {bg.type === "color" && (
          <div className="flex items-center gap-2 pl-1">
            <span className="text-zinc-500 text-xs">색상</span>
            <input
              type="color"
              value={bg.color ?? "#00ff00"}
              onChange={(e) => onChange({ ...layerConfig, background: { ...layerConfig.background, color: e.target.value } })}
              className="w-7 h-5 rounded cursor-pointer border border-zinc-600 bg-transparent"
            />
            <span className="text-zinc-500 text-xs">{bg.color ?? "#00ff00"}</span>
          </div>
        )}
      </div>

      {/* Subtitle position */}
      <div className="space-y-1">
        <p className="text-zinc-500 text-xs uppercase tracking-wider">자막 위치</p>
        <div className="flex gap-1">
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setSub({ position: pos })}
              className={`flex-1 py-1 rounded text-xs ${sub.position === pos ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
            >
              {pos === "top" ? "상단" : pos === "center" ? "중앙" : "하단"}
            </button>
          ))}
        </div>
      </div>

      {/* Font size + color */}
      <div className="space-y-1">
        <p className="text-zinc-500 text-xs uppercase tracking-wider">자막 스타일</p>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs w-10">크기</span>
          <input
            type="number" min={12} max={100}
            value={sub.fontSize}
            onChange={(e) => setSub({ fontSize: Math.max(12, Math.min(100, Number(e.target.value))) })}
            className="w-14 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
          />
          <span className="text-zinc-500 text-xs">px</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs w-10">색상</span>
          <input
            type="color" value={sub.color}
            onChange={(e) => setSub({ color: e.target.value })}
            className="w-7 h-5 rounded cursor-pointer border border-zinc-600 bg-transparent"
          />
          <span className="text-zinc-500 text-xs">{sub.color}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs w-10">굵기</span>
          <button
            onClick={() => setSub({ fontWeight: sub.fontWeight === "bold" ? "normal" : "bold" })}
            className={`px-2 py-0.5 rounded text-xs font-bold ${sub.fontWeight === "bold" ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300"}`}
          >B</button>
        </div>
      </div>

      {/* Readability */}
      <div className="space-y-1">
        <p className="text-zinc-500 text-xs uppercase tracking-wider">가독성</p>
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 text-xs w-10">외곽선</span>
          <input
            type="number" min={0} max={8}
            value={sub.strokeWidth}
            onChange={(e) => setSub({ strokeWidth: Number(e.target.value) })}
            className="w-12 bg-zinc-800 text-white rounded px-2 py-0.5 border border-zinc-600 text-xs text-center"
          />
          <input
            type="color" value={sub.strokeColor}
            onChange={(e) => setSub({ strokeColor: e.target.value })}
            className="w-7 h-5 rounded cursor-pointer border border-zinc-600 bg-transparent"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.backgroundBoxVisible}
            onChange={(e) => setSub({ backgroundBoxVisible: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300 text-xs">배경 박스</span>
        </label>
        {sub.backgroundBoxVisible && (
          <div className="flex items-center gap-2 pl-5">
            <span className="text-zinc-400 text-xs w-14">불투명도</span>
            <input
              type="range" min={0} max={1} step={0.05}
              value={sub.backgroundBoxOpacity}
              onChange={(e) => setSub({ backgroundBoxOpacity: Number(e.target.value) })}
              className="flex-1 accent-blue-500"
            />
            <span className="text-zinc-500 text-xs w-8 text-right">{Math.round(sub.backgroundBoxOpacity * 100)}%</span>
          </div>
        )}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.shadowEnabled}
            onChange={(e) => setSub({ shadowEnabled: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300 text-xs">그림자</span>
        </label>
      </div>
    </section>
  );
}
