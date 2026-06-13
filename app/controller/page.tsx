"use client";

import { useState, useEffect } from "react";
import QueuePanel from "@/components/controller/QueuePanel";
import PreviewPanel from "@/components/controller/PreviewPanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { ipc } from "@/lib/ipc";
import { DEFAULT_LAYER_CONFIG, type LayerConfig } from "@/lib/types";

export default function ControllerPage() {
  const [activeTab, setActiveTab] = useState<"queue" | "library" | "songs">("queue");
  const { isBlackout, setBlackout, layerConfig, setLayerConfig } = useOutputStore();
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
  } = useQueueStore();

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      switch (e.key) {
        case " ":
          e.preventDefault();
          nextLyricSlide();
          break;
        case "ArrowRight":
          nextLyricSlide();
          break;
        case "ArrowLeft":
          prevLyricSlide();
          break;
        case "b":
        case "B": {
          const next = !isBlackout;
          setBlackout(next);
          ipc.sendBlackout(next);
          break;
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isBlackout, nextLyricSlide, prevLyricSlide, setBlackout]);

  // Sync slide state → outputStore + IPC
  useEffect(() => {
    const { getActiveItem, getActiveLyricSlide } = useQueueStore.getState();
    const item = getActiveItem();
    if (!item) return;
    const slide = getActiveLyricSlide();
    const newConfig: LayerConfig = {
      ...DEFAULT_LAYER_CONFIG,
      subtitle: {
        ...DEFAULT_LAYER_CONFIG.subtitle,
        visible: !!slide,
        lines: slide?.lines ?? [],
      },
    };
    setLayerConfig(newConfig);
    ipc.sendSlideUpdate(newConfig);
  }, [activeItemIndex, activeLyricSlideIndex, setLayerConfig]);

  return (
    <div className="flex h-screen bg-zinc-900 text-white select-none">
      {/* Left: Queue Panel */}
      <div className="w-64 flex-shrink-0 border-r border-zinc-700 flex flex-col">
        <div className="p-3 border-b border-zinc-700">
          <div className="flex gap-1">
            {(["queue", "library", "songs"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1 text-xs rounded capitalize ${
                  activeTab === tab
                    ? "bg-blue-600 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-700"
                }`}
              >
                {tab === "queue" ? "큐시트" : tab === "library" ? "미디어" : "찬양"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-hidden">
          {activeTab === "queue" && <QueuePanel />}
          {activeTab === "library" && <LibraryPanel />}
          {activeTab === "songs" && <LibraryPanel mode="songs" />}
        </div>
      </div>

      {/* Center: Preview */}
      <div className="flex-1 flex flex-col">
        <div className="flex-1 flex items-center justify-center p-4">
          <PreviewPanel />
        </div>

        {/* Control bar */}
        <div className="p-3 border-t border-zinc-700 flex items-center gap-3">
          <button
            onClick={() => { prevLyricSlide(); }}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          >
            ← 이전
          </button>
          <button
            onClick={() => { nextLyricSlide(); }}
            className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          >
            다음 →
          </button>
          <div className="flex-1" />
          <button
            onClick={() => {
              const next = !isBlackout;
              setBlackout(next);
              ipc.sendBlackout(next);
            }}
            className={`px-4 py-2 rounded text-sm font-bold ${
              isBlackout ? "bg-red-600 hover:bg-red-700" : "bg-zinc-700 hover:bg-zinc-600"
            }`}
          >
            {isBlackout ? "● 블랙아웃" : "블랙아웃 (B)"}
          </button>
          <button
            onClick={() => ipc.openOutputWindow(1920, 0, 1920, 1080)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm"
          >
            출력창 열기
          </button>
        </div>
      </div>

      {/* Right: Settings sidebar placeholder */}
      <div className="w-56 flex-shrink-0 border-l border-zinc-700 p-3">
        <p className="text-xs text-zinc-500 mb-2">레이어 설정</p>
        <div className="text-xs text-zinc-400 space-y-1">
          <div>배경: {layerConfig.background.type}</div>
          <div>자막: {layerConfig.subtitle.visible ? "표시" : "숨김"}</div>
          <div>오버레이: {layerConfig.overlay.visible ? "표시" : "숨김"}</div>
        </div>
      </div>
    </div>
  );
}
