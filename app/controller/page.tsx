"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SlideThumbnailList from "@/components/controller/SlideThumbnailList";
import SlideCanvas from "@/components/controller/SlideCanvas";
import QueuePanel from "@/components/controller/QueuePanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import LayerSidebar from "@/components/controller/LayerSidebar";
import PreviewPanel from "@/components/controller/PreviewPanel";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { serviceDb, songDb } from "@/lib/db";
import { ipc } from "@/lib/ipc";
import {
  DEFAULT_LAYER_CONFIG,
  type LayerConfig,
  type TextBlock,
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults } from "@/lib/utils";

type RightTab = "queue" | "songs" | "settings" | "preview";

export default function ControllerPage() {
  const { isBlackout, setBlackout, layerConfig, setLayerConfig } = useOutputStore();
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    updateSlideCanvas,
    updateServiceItems,
  } = useQueueStore();

  const [isLive, setIsLive] = useState(true);
  const [showPanel, setShowPanel] = useState(true);
  const [rightTab, setRightTab] = useState<RightTab>("queue");
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [displays, setDisplays] = useState<Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>>([]);
  const [selectedDisplayIdx, setSelectedDisplayIdx] = useState(0);

  // Load displays on mount
  useEffect(() => {
    ipc.getDisplays().then((result) => {
      const list = result as Array<{ id: number; name: string; x: number; y: number; width: number; height: number }>;
      if (list && list.length > 0) {
        setDisplays(list);
        // Default to second display if available
        if (list.length > 1) setSelectedDisplayIdx(1);
      }
    }).catch(() => {
      // Fallback: no display info available
    });
  }, []);

  // Load global defaults once
  useEffect(() => {
    const defaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);
    setLayerConfig(defaults);
    ipc.sendSlideUpdate(defaults);
  }, [setLayerConfig]);

  // IPC sync: rebuild LayerConfig when active slide changes
  useEffect(() => {
    if (!isLive) return;
    const { getActiveItem, getActiveLyricSlide } = useQueueStore.getState();
    const item = getActiveItem();
    const globalDefaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);

    if (!item) {
      const config = deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults) as LayerConfig;
      setLayerConfig(config);
      ipc.sendSlideUpdate(config);
      return;
    }

    const slide = getActiveLyricSlide();
    const itemOverrides = item.settings_json ?? {};
    const merged = deepMerge(
      deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults),
      itemOverrides as Partial<LayerConfig>
    ) as LayerConfig;

    const canvasBlocks = slide?.canvas?.textBlocks ?? [];
    const newConfig: LayerConfig = {
      ...merged,
      subtitle: {
        ...merged.subtitle,
        visible: canvasBlocks.length === 0 && !!slide,
        lines: canvasBlocks.length === 0 ? (slide?.lines ?? []) : [],
      },
      canvas: canvasBlocks.length > 0 ? { textBlocks: canvasBlocks } : undefined,
    };
    setLayerConfig(newConfig);
    ipc.sendSlideUpdate(newConfig);
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, isLive, setLayerConfig]);

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

  // Canvas blocks changed → update store + IPC + debounced DB save
  const handleCanvasChange = useCallback(
    (songId: number, slideId: string, canvas: { textBlocks: TextBlock[] }) => {
      updateSlideCanvas(songId, slideId, canvas);

      if (isLive) {
        const config: LayerConfig = {
          ...layerConfig,
          subtitle: {
            ...layerConfig.subtitle,
            visible: canvas.textBlocks.length === 0,
            lines: [],
          },
          canvas: canvas.textBlocks.length > 0 ? { textBlocks: canvas.textBlocks } : undefined,
        };
        setLayerConfig(config);
        ipc.sendSlideUpdate(config);
      }

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(async () => {
        const song = useQueueStore
          .getState()
          .currentService?.items.find((i) => i.song?.id === songId)?.song;
        if (song) {
          try {
            await songDb.update(songId, { lyrics_json: song.lyrics_json });
          } catch (err) {
            console.error("Failed to save canvas:", err);
          }
        }
      }, 600);
    },
    [isLive, layerConfig, setLayerConfig, updateSlideCanvas]
  );

  const handleLayerChange = useCallback(
    (config: LayerConfig) => {
      const { getActiveLyricSlide } = useQueueStore.getState();
      const slide = getActiveLyricSlide();
      const canvasBlocks = slide?.canvas?.textBlocks ?? [];
      const withContent: LayerConfig = {
        ...config,
        subtitle: {
          ...config.subtitle,
          visible: canvasBlocks.length === 0 && !!slide,
          lines: canvasBlocks.length === 0 ? (slide?.lines ?? []) : [],
        },
        canvas: canvasBlocks.length > 0 ? { textBlocks: canvasBlocks } : undefined,
      };
      setLayerConfig(withContent);
      if (isLive) ipc.sendSlideUpdate(withContent);
    },
    [isLive, setLayerConfig]
  );

  const handleSaveGlobal = useCallback(
    (config: LayerConfig) => {
      saveGlobalDefaults(config);
    },
    []
  );

  const handleSaveItem = useCallback(
    async (itemId: number, config: LayerConfig) => {
      const settings = {
        background: { ...config.background },
        subtitle: (({ visible: _v, lines: _l, ...rest }) => rest)(config.subtitle),
        overlay: { ...config.overlay },
      };
      try {
        await serviceDb.updateItemSettings(itemId, settings);
        const liveItems = useQueueStore.getState().currentService?.items ?? [];
        const updated = liveItems.map((item) =>
          item.id === itemId ? { ...item, settings_json: settings } : item
        );
        updateServiceItems(updated);
      } catch (err) {
        console.error("Failed to save item settings:", err);
      }
    },
    [updateServiceItems]
  );

  const activeItemId = (() => {
    if (!currentService || activeItemIndex < 0) return null;
    return currentService.items[activeItemIndex]?.id ?? null;
  })();

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700 flex-shrink-0">
        {/* Current service name */}
        <span className="text-sm text-zinc-300 truncate max-w-[180px]">
          {currentService ? `${currentService.name} (${currentService.date})` : "예배 없음"}
        </span>

        <div className="flex-1" />

        <button
          onClick={() => setIsLive((v) => !v)}
          className={`px-3 py-1 rounded text-sm font-medium ${
            isLive
              ? "bg-green-600 hover:bg-green-700 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          }`}
        >
          {isLive ? "● 라이브" : "라이브 꺼짐"}
        </button>

        <button
          onClick={() => {
            const next = !isBlackout;
            setBlackout(next);
            ipc.sendBlackout(next);
          }}
          className={`px-3 py-1 rounded text-sm font-bold ${
            isBlackout
              ? "bg-red-600 hover:bg-red-700 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          }`}
        >
          {isBlackout ? "● 블랙아웃" : "블랙아웃 (B)"}
        </button>

        {displays.length > 1 && (
          <select
            value={selectedDisplayIdx}
            onChange={(e) => setSelectedDisplayIdx(Number(e.target.value))}
            className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-white"
          >
            {displays.map((d, i) => (
              <option key={d.id} value={i}>
                {d.name || `모니터 ${i + 1}`}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={() => {
            const d = displays[selectedDisplayIdx];
            if (d) {
              ipc.openOutputWindow(d.x, d.y, d.width, d.height);
            } else {
              ipc.openOutputWindow(1920, 0, 1920, 1080);
            }
          }}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
        >
          출력창 열기
          {displays.length > 1 && (
            <span className="ml-1 text-xs opacity-70">
              ({displays[selectedDisplayIdx]?.name ?? `모니터${selectedDisplayIdx + 1}`})
            </span>
          )}
        </button>

        <button
          onClick={() => ipc.closeOutputWindow().catch(() => {})}
          className="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 rounded text-sm text-zinc-300"
        >
          출력창 닫기
        </button>

        <button
          onClick={() => setShowPanel((v) => !v)}
          className={`px-3 py-1 rounded text-sm ${
            showPanel
              ? "bg-zinc-600 text-white"
              : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
          }`}
          title="관리 패널 열기/닫기"
        >
          {showPanel ? "패널 ◀" : "패널 ▶"}
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Slide thumbnails */}
        <div className="w-40 flex-shrink-0 border-r border-zinc-700 overflow-hidden">
          <SlideThumbnailList />
        </div>

        {/* Center: Canvas editor */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden min-w-0">
          <div className="w-full max-w-4xl flex flex-col gap-3">
            <SlideCanvas onCanvasChange={handleCanvasChange} />
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={prevLyricSlide}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
              >
                ← 이전
              </button>
              <span className="text-xs text-zinc-500">
                더블클릭: 자막 추가 · 드래그: 이동 · 우클릭: 메뉴
              </span>
              <button
                onClick={nextLyricSlide}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>

        {/* Right: Management panel */}
        {showPanel && (
          <div className="w-64 flex-shrink-0 border-l border-zinc-700 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex border-b border-zinc-700 flex-shrink-0">
              <button
                onClick={() => setRightTab("queue")}
                className={`flex-1 py-1.5 text-xs font-medium ${
                  rightTab === "queue"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                예배순서
              </button>
              <button
                onClick={() => setRightTab("songs")}
                className={`flex-1 py-1.5 text-xs font-medium ${
                  rightTab === "songs"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                찬양 라이브러리
              </button>
              <button
                onClick={() => setRightTab("settings")}
                className={`flex-1 py-1.5 text-xs font-medium ${
                  rightTab === "settings"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                설정
              </button>
              <button
                onClick={() => setRightTab("preview")}
                className={`flex-1 py-1.5 text-xs font-medium ${
                  rightTab === "preview"
                    ? "bg-zinc-700 text-white"
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800"
                }`}
              >
                미리보기
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {rightTab === "queue" && <QueuePanel />}
              {rightTab === "songs" && <LibraryPanel mode="songs" />}
              {rightTab === "settings" && (
                <LayerSidebar
                  layerConfig={layerConfig}
                  activeItemId={activeItemId}
                  onChange={handleLayerChange}
                  onSaveGlobal={handleSaveGlobal}
                  onSaveItem={handleSaveItem}
                />
              )}
              {rightTab === "preview" && (
                <div className="p-2 overflow-y-auto h-full">
                  <PreviewPanel />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
