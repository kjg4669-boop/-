"use client";

import { useState, useEffect, useCallback } from "react";
import QueuePanel from "@/components/controller/QueuePanel";
import PreviewPanel from "@/components/controller/PreviewPanel";
import LibraryPanel from "@/components/controller/LibraryPanel";
import LayerSidebar from "@/components/controller/LayerSidebar";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { serviceDb } from "@/lib/db";
import { ipc } from "@/lib/ipc";
import { DEFAULT_LAYER_CONFIG, type LayerConfig } from "@/lib/types";
import { deepMerge, loadGlobalDefaults, saveGlobalDefaults } from "@/lib/utils";

export default function ControllerPage() {
  const [activeTab, setActiveTab] = useState<"queue" | "library" | "songs">("queue");
  const { isBlackout, setBlackout, layerConfig, setLayerConfig } = useOutputStore();
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    updateServiceItems,
  } = useQueueStore();

  // Load global defaults from localStorage on mount
  useEffect(() => {
    const defaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);
    setLayerConfig(defaults);
    ipc.sendSlideUpdate(defaults);
  }, [setLayerConfig]);

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

  // Sync slide state → outputStore + IPC (includes global defaults + item overrides)
  useEffect(() => {
    const { getActiveItem, getActiveLyricSlide } = useQueueStore.getState();
    const item = getActiveItem();
    const globalDefaults = loadGlobalDefaults(DEFAULT_LAYER_CONFIG);

    if (!item) {
      setLayerConfig(globalDefaults);
      ipc.sendSlideUpdate(globalDefaults);
      return;
    }

    const slide = getActiveLyricSlide();
    const itemOverrides = item.settings_json ?? {};
    const merged = deepMerge(
      deepMerge(DEFAULT_LAYER_CONFIG, globalDefaults),
      itemOverrides as Partial<LayerConfig>
    );
    const newConfig: LayerConfig = {
      ...merged,
      subtitle: {
        ...merged.subtitle,
        visible: !!slide,
        lines: slide?.lines ?? [],
      },
    };
    setLayerConfig(newConfig);
    ipc.sendSlideUpdate(newConfig);
  }, [activeItemIndex, activeLyricSlideIndex, currentService?.id, setLayerConfig]);

  // Called when sidebar edits any layer setting
  const handleLayerChange = useCallback((config: LayerConfig) => {
    const { getActiveLyricSlide } = useQueueStore.getState();
    const slide = getActiveLyricSlide?.();
    const withLines: LayerConfig = {
      ...config,
      subtitle: {
        ...config.subtitle,
        visible: !!slide,
        lines: slide?.lines ?? [],
      },
    };
    setLayerConfig(withLines);
    ipc.sendSlideUpdate(withLines);
  }, [setLayerConfig]);

  // Save global defaults to localStorage
  const handleSaveGlobal = useCallback((config: LayerConfig) => {
    saveGlobalDefaults(config);
  }, []);

  // Save item-specific overrides to DB
  const handleSaveItem = useCallback(async (itemId: number, config: LayerConfig) => {
    const settings = {
      background: { ...config.background },
      subtitle: {
        fontSize: config.subtitle.fontSize,
        fontFamily: config.subtitle.fontFamily,
        color: config.subtitle.color,
        strokeColor: config.subtitle.strokeColor,
        strokeWidth: config.subtitle.strokeWidth,
        shadowEnabled: config.subtitle.shadowEnabled,
        backgroundBoxVisible: config.subtitle.backgroundBoxVisible,
        backgroundBoxOpacity: config.subtitle.backgroundBoxOpacity,
        position: config.subtitle.position,
        opacity: config.subtitle.opacity,
      },
      overlay: { ...config.overlay },
    };
    try {
      await serviceDb.updateItemSettings(itemId, settings);
      // Update local store so next item switch picks up overrides
      const liveItems = useQueueStore.getState().currentService?.items ?? [];
      const updated = liveItems.map((item) =>
        item.id === itemId ? { ...item, settings_json: settings } : item
      );
      updateServiceItems(updated);
    } catch {
      console.error("Failed to save item settings");
    }
  }, [updateServiceItems]);

  // Get active item id for sidebar
  const activeItemId = (() => {
    if (!currentService || activeItemIndex < 0) return null;
    return currentService.items[activeItemIndex]?.id ?? null;
  })();

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

      {/* Right: Layer Settings Sidebar */}
      <div className="w-56 flex-shrink-0 border-l border-zinc-700 overflow-hidden">
        <LayerSidebar
          layerConfig={layerConfig}
          activeItemId={activeItemId}
          onChange={handleLayerChange}
          onSaveGlobal={handleSaveGlobal}
          onSaveItem={handleSaveItem}
        />
      </div>
    </div>
  );
}
