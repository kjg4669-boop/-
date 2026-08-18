"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { mediaDb } from "@/lib/db";
import type { LayerConfig, MediaItem } from "@/lib/types";
import SubtitleSection from "./SubtitleSection";

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
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestConfigRef = useRef<LayerConfig>(layerConfig);
  const activeItemIdRef = useRef<number | null>(activeItemId);
  latestConfigRef.current = layerConfig;
  activeItemIdRef.current = activeItemId;

  useEffect(() => {
    mediaDb.list().then(setMediaItems).catch(console.error);
  }, []);

  useEffect(() => {
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const handleChange = useCallback((config: LayerConfig) => {
    onChange(config);
    latestConfigRef.current = config;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      const id = activeItemIdRef.current;
      if (id !== null) {
        onSaveItem(id, latestConfigRef.current);
      } else {
        onSaveGlobal(latestConfigRef.current);
      }
    }, 600);
  }, [onChange, onSaveItem, onSaveGlobal]);

  function showNotice(msg: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setSavedNotice(msg);
    noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 2000);
  }

  const imageItems = mediaItems.filter((m) => m.type === "image");

  return (
    <div className="h-full flex flex-col overflow-y-auto text-xs">
      <SubtitleSection
        layerConfig={layerConfig}
        onChange={handleChange}
        imageItems={imageItems}
      />

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
