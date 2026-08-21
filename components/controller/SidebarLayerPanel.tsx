"use client";

import { memo, useCallback } from "react";
import {
  Eye, EyeOff, Lock, Layers, Video, Type, Image as ImageIcon,
  ChevronUp, ChevronDown,
} from "lucide-react";
import type { LayerConfig } from "@/lib/types";

// ── 레이어 타입 ────────────────────────────────────────────────────────
export type LayerType = "video" | "text" | "image" | "background";

export interface LayerItem {
  id: string;
  name: string;
  type: LayerType;
  isVisible: boolean;
  isLocked: boolean;
  /** 캔버스 블록의 배열 인덱스 (배경/-1, 캔버스블록=실제 인덱스) */
  arrayIndex: number;
  /** 캔버스 블록 총 개수 */
  arrayTotal: number;
}

const TYPE_ICONS: Record<LayerType, React.ComponentType<{ size?: number; className?: string }>> = {
  background: Layers,
  video: Video,
  image: ImageIcon,
  text: Type,
};

// ── layerConfig → LayerItem[] 변환 ────────────────────────────────────
// 반환 순서: 높은 arrayIndex(앞쪽 레이어)가 먼저 오도록 내림차순
export function deriveLayersFromConfig(config: LayerConfig): LayerItem[] {
  const layers: LayerItem[] = [];
  const bg = config.background;
  const canvasBlocks = config.canvas?.textBlocks ?? [];

  // 캔버스 텍스트 블록 — 배열 인덱스 높은 것이 위쪽(앞)에 표시
  for (let i = canvasBlocks.length - 1; i >= 0; i--) {
    const block = canvasBlocks[i];
    layers.push({
      id: `canvas:${block.id}`,
      name: block.text.trim() || `텍스트 블록 ${i + 1}`,
      type: "text",
      isVisible: block.visible !== false,
      isLocked: false,
      arrayIndex: i,
      arrayTotal: canvasBlocks.length,
    });
  }

  // 배경 — 항상 맨 아래 고정
  layers.push({
    id: "background",
    name: bg.type === "video" ? "배경 영상" : bg.type === "image" ? "배경 이미지" : "배경",
    type: bg.type === "video" ? "video" : bg.type === "image" ? "image" : "background",
    isVisible: true,
    isLocked: true,
    arrayIndex: -1,
    arrayTotal: 0,
  });

  return layers;
}

// ── 개별 레이어 행 ─────────────────────────────────────────────────────
interface LayerItemRowProps {
  layer: LayerItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

const LayerItemRow = memo(function LayerItemRow({
  layer, isActive, onSelect, onToggleVisible, onMoveUp, onMoveDown,
}: LayerItemRowProps) {
  const Icon = TYPE_ICONS[layer.type];
  const canMoveUp = layer.arrayIndex >= 0 && layer.arrayIndex < layer.arrayTotal - 1;
  const canMoveDown = layer.arrayIndex > 0;

  return (
    <div
      onClick={() => onSelect(layer.id)}
      className={`flex items-center gap-1 px-1.5 py-1 rounded-sm select-none cursor-pointer transition-colors group ${
        isActive
          ? "bg-blue-600/25 border border-blue-500/50"
          : "hover:bg-zinc-700/60 border border-transparent"
      }`}
    >
      <Icon size={13} className={isActive ? "text-blue-400 flex-shrink-0" : "text-zinc-500 flex-shrink-0"} />

      <span className={`flex-1 text-xs truncate ${isActive ? "text-white" : "text-zinc-300"} ${!layer.isVisible ? "opacity-40" : ""}`}>
        {layer.name}
      </span>

      {/* 위/아래 이동 버튼 (캔버스 블록만) */}
      {!layer.isLocked && (
        <div className="flex flex-col gap-0 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); onMoveUp(layer.id); }}
            disabled={!canMoveUp}
            title="위로 (앞으로)"
            className="p-0.5 rounded hover:bg-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronUp size={10} className="text-zinc-400" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onMoveDown(layer.id); }}
            disabled={!canMoveDown}
            title="아래로 (뒤로)"
            className="p-0.5 rounded hover:bg-zinc-600 disabled:opacity-20 disabled:cursor-not-allowed"
          >
            <ChevronDown size={10} className="text-zinc-400" />
          </button>
        </div>
      )}

      {/* 가시성 토글 */}
      {layer.isLocked ? (
        <Lock size={11} className="text-zinc-700 flex-shrink-0" />
      ) : (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
          title={layer.isVisible ? "숨기기" : "표시"}
          className={`p-0.5 rounded hover:bg-zinc-600 transition-colors flex-shrink-0 ${
            layer.isVisible ? "text-zinc-300" : "text-zinc-600"
          }`}
        >
          {layer.isVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
      )}
    </div>
  );
});

// ── SidebarLayerPanel Props ────────────────────────────────────────────
export interface SidebarLayerPanelProps {
  layerConfig: LayerConfig;
  activeLayerId: string | null;
  isFloating: boolean;
  onFloat: () => void;
  onDock: () => void;
  onDragHandleMouseDown: (e: React.MouseEvent) => void;
  onSelectLayer: (id: string) => void;
  onToggleVisible: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────
export default function SidebarLayerPanel({
  layerConfig,
  activeLayerId,
  isFloating,
  onFloat,
  onDock,
  onDragHandleMouseDown,
  onSelectLayer,
  onToggleVisible,
  onMoveUp,
  onMoveDown,
}: SidebarLayerPanelProps) {
  const layers = deriveLayersFromConfig(layerConfig);

  return (
    <div className="flex flex-col h-full select-none bg-[#1e1e1e]">
      {/* 헤더 / 드래그 핸들 */}
      <div
        className={`flex items-center justify-between px-2 py-1.5 border-b border-zinc-700 flex-shrink-0 bg-zinc-800/60 ${
          isFloating ? "cursor-grab active:cursor-grabbing" : ""
        }`}
        onMouseDown={isFloating ? onDragHandleMouseDown : undefined}
      >
        <div className="flex items-center gap-1.5">
          <Layers size={11} className="text-zinc-500" />
          <span className="text-[0.625rem] text-zinc-400 uppercase tracking-wider font-medium">레이어</span>
          <span className="text-[0.5625rem] text-zinc-600 bg-zinc-700 px-1 rounded">{layers.length}</span>
        </div>
        {isFloating ? (
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={onDock}
            title="도킹"
            className="px-1.5 py-0.5 text-[0.625rem] text-zinc-400 hover:text-white hover:bg-zinc-700 rounded"
          >⊟ 도킹</button>
        ) : (
          <button
            onClick={onFloat}
            title="패널 분리"
            className="px-1.5 py-0.5 text-[0.625rem] text-zinc-500 hover:text-white hover:bg-zinc-700 rounded"
          >↗</button>
        )}
      </div>

      {/* 레이어 목록 */}
      <div className="flex-1 overflow-y-auto p-1 space-y-0.5 min-h-0">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-700">
            <Layers size={20} />
            <span className="text-[0.625rem]">레이어 없음</span>
          </div>
        ) : (
          layers.map((layer) => (
            <LayerItemRow
              key={layer.id}
              layer={layer}
              isActive={activeLayerId === layer.id}
              onSelect={onSelectLayer}
              onToggleVisible={onToggleVisible}
              onMoveUp={onMoveUp}
              onMoveDown={onMoveDown}
            />
          ))
        )}
      </div>

      {/* 선택된 레이어 푸터 */}
      {activeLayerId && (() => {
        const active = layers.find((l) => l.id === activeLayerId);
        if (!active) return null;
        const Icon = TYPE_ICONS[active.type];
        return (
          <div className="flex items-center gap-1.5 px-2 py-1 border-t border-zinc-700 bg-zinc-800/30 flex-shrink-0">
            <Icon size={10} className="text-zinc-500 flex-shrink-0" />
            <span className="text-[0.625rem] text-zinc-400 flex-1 truncate">{active.name}</span>
          </div>
        );
      })()}
    </div>
  );
}
