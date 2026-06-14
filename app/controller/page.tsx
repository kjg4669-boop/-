"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import SlideThumbnailList from "@/components/controller/SlideThumbnailList";
import SlideCanvas from "@/components/controller/SlideCanvas";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { serviceDb, songDb } from "@/lib/db";
import { ipc } from "@/lib/ipc";
import {
  DEFAULT_LAYER_CONFIG,
  type LayerConfig,
  type TextBlock,
  type Service,
} from "@/lib/types";
import { deepMerge, loadGlobalDefaults } from "@/lib/utils";

export default function ControllerPage() {
  const { isBlackout, setBlackout, layerConfig, setLayerConfig } = useOutputStore();
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    setCurrentService,
    updateSlideCanvas,
    getFlatSlideList,
    getActiveFlatSlideIndex,
  } = useQueueStore();

  const [services, setServices] = useState<Service[]>([]);
  const [isLive, setIsLive] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load services list on mount; auto-select most recent
  useEffect(() => {
    serviceDb.list().then(async (list) => {
      setServices(list);
      if (list.length > 0) {
        const full = await serviceDb.get(list[0].id);
        if (full) setCurrentService(full);
      }
    });
  }, [setCurrentService]);

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

  const handleServiceChange = useCallback(
    async (serviceId: number) => {
      const full = await serviceDb.get(serviceId);
      if (full) setCurrentService(full);
    },
    [setCurrentService]
  );

  // Suppress unused variable warnings for store helpers used by child components
  void getFlatSlideList;
  void getActiveFlatSlideIndex;

  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white select-none">
      {/* Top bar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-zinc-700 flex-shrink-0">
        <select
          className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-sm text-white max-w-xs"
          value={currentService?.id ?? ""}
          onChange={(e) => handleServiceChange(Number(e.target.value))}
        >
          {services.length === 0 && <option value="">서비스 없음</option>}
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.date})
            </option>
          ))}
        </select>

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

        <button
          onClick={() => ipc.openOutputWindow(1920, 0, 1920, 1080)}
          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-sm text-white"
        >
          출력창 열기
        </button>
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Slide thumbnails */}
        <div className="w-48 flex-shrink-0 border-r border-zinc-700 overflow-hidden">
          <SlideThumbnailList />
        </div>

        {/* Center: Canvas editor */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
          <div className="w-full max-w-4xl flex flex-col gap-3">
            <SlideCanvas onCanvasChange={handleCanvasChange} />
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={prevLyricSlide}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
              >
                ← 이전
              </button>
              <button
                onClick={nextLyricSlide}
                className="px-4 py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
              >
                다음 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
