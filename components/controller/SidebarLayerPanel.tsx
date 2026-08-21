"use client";

import { memo, useCallback } from "react";
import {
  DndContext, DragEndEvent, PointerSensor, useSensor, useSensors,
  closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye, EyeOff, Lock, Layers, Video, Type, Image as ImageIcon, GripVertical,
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
  arrayIndex: number;
  arrayTotal: number;
}

const TYPE_ICONS: Record<LayerType, React.ComponentType<{ size?: number; className?: string }>> = {
  background: Layers,
  video: Video,
  image: ImageIcon,
  text: Type,
};

// Left stripe color per layer type (Illustrator-style)
const TYPE_COLORS: Record<LayerType, string> = {
  text:       "#f59e0b",
  image:      "#10b981",
  video:      "#3b82f6",
  background: "#6b7280",
};

// ── layerConfig → LayerItem[] ─────────────────────────────────────────
// 반환 순서: 높은 arrayIndex(앞쪽 레이어)가 먼저 오도록 내림차순
export function deriveLayersFromConfig(config: LayerConfig): LayerItem[] {
  const layers: LayerItem[] = [];
  const canvasBlocks = config.canvas?.textBlocks ?? [];

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

  const bg = config.background;
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

// ── 개별 레이어 행 (sortable) ─────────────────────────────────────────
interface LayerRowProps {
  layer: LayerItem;
  isActive: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
}

const SortableLayerRow = memo(function SortableLayerRow({
  layer, isActive, onSelect, onToggleVisible,
}: LayerRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition, isDragging,
  } = useSortable({ id: layer.id, disabled: layer.isLocked });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  const Icon = TYPE_ICONS[layer.type];
  const stripe = TYPE_COLORS[layer.type];

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={() => onSelect(layer.id)}
      className={`relative flex items-stretch select-none cursor-pointer group border-b border-zinc-800 last:border-b-0 ${
        isActive ? "bg-[#1e3a5f]" : "hover:bg-zinc-700/40"
      }`}
    >
      {/* Left color stripe */}
      <div style={{ width: 3, background: stripe, flexShrink: 0 }} />

      {/* Eye / visibility */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
        disabled={layer.isLocked}
        title={layer.isVisible ? "숨기기" : "표시"}
        className="w-7 flex items-center justify-center flex-shrink-0 border-r border-zinc-700/60 hover:bg-zinc-600/40 disabled:cursor-default transition-colors"
      >
        {layer.isVisible
          ? <Eye size={12} className="text-zinc-300" />
          : <EyeOff size={12} className="text-zinc-600" />}
      </button>

      {/* Lock */}
      <div className="w-7 flex items-center justify-center flex-shrink-0 border-r border-zinc-700/60">
        {layer.isLocked
          ? <Lock size={11} className="text-zinc-500" />
          : null}
      </div>

      {/* Drag handle + icon + name */}
      <div className="flex-1 flex items-center gap-1.5 px-1.5 min-w-0">
        {!layer.isLocked ? (
          <div
            {...attributes}
            {...listeners}
            className="flex-shrink-0 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-zinc-400 touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={12} />
          </div>
        ) : (
          <div className="w-3 flex-shrink-0" />
        )}

        <Icon
          size={12}
          className={`flex-shrink-0 ${isActive ? "text-blue-400" : "text-zinc-500"}`}
        />

        <span
          className={`text-xs truncate leading-none ${
            isActive ? "text-white" : "text-zinc-300"
          } ${!layer.isVisible ? "opacity-40 line-through" : ""}`}
        >
          {layer.name}
        </span>
      </div>

      {/* Color dot */}
      <div className="w-6 flex items-center justify-center flex-shrink-0">
        <div
          style={{ width: 8, height: 8, background: stripe, borderRadius: 1 }}
          className="opacity-70"
        />
      </div>
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
  onMoveUp: (id: string) => void;   // kept for compatibility
  onMoveDown: (id: string) => void; // kept for compatibility
  onReorder?: (layerId: string, toArrayIndex: number) => void;
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
  onReorder,
}: SidebarLayerPanelProps) {
  const layers = deriveLayersFromConfig(layerConfig);

  // Canvas blocks only (draggable); background is fixed
  const canvasLayers = layers.filter((l) => !l.isLocked);
  const fixedLayers  = layers.filter((l) => l.isLocked);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const ids = canvasLayers.map((l) => l.id);
    const oldPanelIdx = ids.indexOf(active.id as string);
    const newPanelIdx = ids.indexOf(over.id as string);
    if (oldPanelIdx < 0 || newPanelIdx < 0) return;

    // Panel order is DESCENDING arrayIndex, so convert:
    const total = canvasLayers.length;
    const toArrayIndex = (total - 1) - newPanelIdx;
    onReorder(active.id as string, toArrayIndex);
  }, [canvasLayers, onReorder]);

  return (
    <div className="flex flex-col h-full select-none bg-[#252526]">
      {/* 헤더 */}
      <div
        className={`flex items-center justify-between px-2 py-1.5 border-b border-zinc-700 flex-shrink-0 bg-[#2d2d2d] ${
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

      {/* 컬럼 헤더 */}
      <div className="flex items-center text-[0.5rem] text-zinc-600 uppercase tracking-wider border-b border-zinc-700/60 bg-[#2a2a2a] flex-shrink-0">
        <div style={{ width: 3 }} />
        <div className="w-7 flex justify-center border-r border-zinc-700/40 py-1">👁</div>
        <div className="w-7 flex justify-center border-r border-zinc-700/40 py-1">🔒</div>
        <div className="flex-1 px-3 py-1">레이어</div>
      </div>

      {/* 레이어 목록 */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-zinc-700">
            <Layers size={20} />
            <span className="text-[0.625rem]">레이어 없음</span>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={canvasLayers.map((l) => l.id)}
              strategy={verticalListSortingStrategy}
            >
              {canvasLayers.map((layer) => (
                <SortableLayerRow
                  key={layer.id}
                  layer={layer}
                  isActive={activeLayerId === layer.id}
                  onSelect={onSelectLayer}
                  onToggleVisible={onToggleVisible}
                />
              ))}
            </SortableContext>

            {/* 배경은 항상 하단 고정 */}
            {fixedLayers.map((layer) => (
              <SortableLayerRow
                key={layer.id}
                layer={layer}
                isActive={activeLayerId === layer.id}
                onSelect={onSelectLayer}
                onToggleVisible={onToggleVisible}
              />
            ))}
          </DndContext>
        )}
      </div>

      {/* 하단 — 선택된 레이어 정보 + 레이어 수 */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-zinc-700 bg-[#2a2a2a] flex-shrink-0">
        {activeLayerId ? (() => {
          const active = layers.find((l) => l.id === activeLayerId);
          if (!active) return <span className="text-[0.625rem] text-zinc-600">—</span>;
          const Icon = TYPE_ICONS[active.type];
          return (
            <div className="flex items-center gap-1 min-w-0">
              <Icon size={10} className="text-zinc-500 flex-shrink-0" />
              <span className="text-[0.625rem] text-zinc-400 truncate">{active.name}</span>
            </div>
          );
        })() : (
          <span className="text-[0.625rem] text-zinc-600">선택 없음</span>
        )}
        <span className="text-[0.5625rem] text-zinc-600 flex-shrink-0 ml-2">{layers.length} 레이어</span>
      </div>
    </div>
  );
}
