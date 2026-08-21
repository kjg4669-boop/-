"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  DndContext, DragEndEvent, DragStartEvent, DragOverlay,
  PointerSensor, useSensor, useSensors, closestCenter,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye, EyeOff, Lock, Layers, Video, Type, Image as ImageIcon,
  GripVertical, Plus, Trash2, Copy,
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

const TYPE_COLORS: Record<LayerType, string> = {
  text:       "#f59e0b",
  image:      "#10b981",
  video:      "#3b82f6",
  background: "#6b7280",
};

// ── layerConfig → LayerItem[] ─────────────────────────────────────────
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

// ── 레이어 행 콘텐츠 (overlay 공유용) ───────────────────────────────
interface LayerRowContentProps {
  layer: LayerItem;
  isActive: boolean;
  isDragging?: boolean;
  onToggleVisible?: (id: string) => void;
  dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}

function LayerRowContent({
  layer, isActive, isDragging = false, onToggleVisible, dragHandleProps,
}: LayerRowContentProps) {
  const Icon = TYPE_ICONS[layer.type];
  const stripe = TYPE_COLORS[layer.type];

  return (
    <div
      className={`relative flex items-stretch select-none border-b border-zinc-800 last:border-b-0 ${
        isDragging
          ? "shadow-lg ring-1 ring-blue-500/60 bg-[#1a2a40] rounded"
          : isActive
          ? "bg-[#1e3a5f]"
          : "bg-transparent"
      }`}
      style={{ height: 30 }}
    >
      {/* Left color stripe */}
      <div style={{ width: 3, background: stripe, flexShrink: 0 }} />

      {/* Eye */}
      {onToggleVisible ? (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisible(layer.id); }}
          disabled={layer.isLocked}
          title={layer.isVisible ? "숨기기" : "표시"}
          className="w-7 flex items-center justify-center flex-shrink-0 border-r border-zinc-700/50 hover:bg-zinc-600/40 disabled:cursor-default transition-colors"
        >
          {layer.isVisible
            ? <Eye size={11} className="text-zinc-300" />
            : <EyeOff size={11} className="text-zinc-600" />}
        </button>
      ) : (
        <div className="w-7 flex items-center justify-center flex-shrink-0 border-r border-zinc-700/50">
          {layer.isVisible
            ? <Eye size={11} className="text-zinc-300" />
            : <EyeOff size={11} className="text-zinc-600" />}
        </div>
      )}

      {/* Lock */}
      <div className="w-6 flex items-center justify-center flex-shrink-0 border-r border-zinc-700/50">
        {layer.isLocked && <Lock size={10} className="text-zinc-500" />}
      </div>

      {/* Drag handle + icon + name */}
      <div className="flex-1 flex items-center gap-1 px-1 min-w-0">
        {!layer.isLocked ? (
          <div
            {...dragHandleProps}
            className="flex-shrink-0 text-zinc-600 hover:text-zinc-400 cursor-grab active:cursor-grabbing touch-none"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical size={11} />
          </div>
        ) : (
          <div className="w-3 flex-shrink-0" />
        )}

        <Icon size={11} className={`flex-shrink-0 ${isActive ? "text-blue-400" : "text-zinc-500"}`} />

        <span className={`text-xs truncate leading-none ${
          isActive ? "text-white font-medium" : "text-zinc-300"
        } ${!layer.isVisible ? "opacity-40 line-through" : ""}`}>
          {layer.name}
        </span>
      </div>

      {/* Color dot */}
      <div className="w-5 flex items-center justify-center flex-shrink-0">
        <div style={{ width: 7, height: 7, background: stripe, borderRadius: 1 }} className="opacity-60" />
      </div>
    </div>
  );
}

// ── 정렬 가능한 레이어 행 ─────────────────────────────────────────────
interface SortableLayerRowProps {
  layer: LayerItem;
  isActive: boolean;
  isDraggingThis: boolean;
  onSelect: (id: string) => void;
  onToggleVisible: (id: string) => void;
}

const SortableLayerRow = memo(function SortableLayerRow({
  layer, isActive, isDraggingThis, onSelect, onToggleVisible,
}: SortableLayerRowProps) {
  const {
    attributes, listeners, setNodeRef, transform, transition,
  } = useSortable({ id: layer.id, disabled: layer.isLocked });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDraggingThis ? 0 : 1,
      }}
      onClick={() => onSelect(layer.id)}
      className={`cursor-pointer group hover:bg-zinc-700/30 ${isActive ? "bg-[#1e3a5f] hover:bg-[#1e3a5f]" : ""}`}
    >
      <LayerRowContent
        layer={layer}
        isActive={isActive}
        onToggleVisible={onToggleVisible}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
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
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onReorder?: (layerId: string, toArrayIndex: number) => void;
  onAddBlock?: () => void;
  onDuplicateBlock?: (layerId: string) => void;
  onDeleteBlock?: (layerId: string) => void;
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
  onAddBlock,
  onDuplicateBlock,
  onDeleteBlock,
}: SidebarLayerPanelProps) {
  const layers = useMemo(() => deriveLayersFromConfig(layerConfig), [layerConfig]);
  const canvasLayers = useMemo(() => layers.filter((l) => !l.isLocked), [layers]);
  const fixedLayers  = useMemo(() => layers.filter((l) => l.isLocked), [layers]);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const draggingLayer = draggingId ? layers.find((l) => l.id === draggingId) ?? null : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggingId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;

    const ids = canvasLayers.map((l) => l.id);
    const oldPanelIdx = ids.indexOf(active.id as string);
    const newPanelIdx = ids.indexOf(over.id as string);
    if (oldPanelIdx < 0 || newPanelIdx < 0) return;

    const total = canvasLayers.length;
    const toArrayIndex = (total - 1) - newPanelIdx;
    onReorder(active.id as string, toArrayIndex);
  }, [canvasLayers, onReorder]);

  const handleDragCancel = useCallback(() => setDraggingId(null), []);

  const activeLayer = activeLayerId ? layers.find((l) => l.id === activeLayerId) ?? null : null;
  const canDelete = !!activeLayer && !activeLayer.isLocked;
  const canDuplicate = !!activeLayer && !activeLayer.isLocked;

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
          <button onClick={onFloat} title="패널 분리"
            className="px-1.5 py-0.5 text-[0.625rem] text-zinc-500 hover:text-white hover:bg-zinc-700 rounded"
          >↗</button>
        )}
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
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
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
                  isDraggingThis={draggingId === layer.id}
                  onSelect={onSelectLayer}
                  onToggleVisible={onToggleVisible}
                />
              ))}
            </SortableContext>

            {/* 배경 고정 */}
            {fixedLayers.map((layer) => (
              <div
                key={layer.id}
                onClick={() => onSelectLayer(layer.id)}
                className={`cursor-pointer hover:bg-zinc-700/30 ${activeLayerId === layer.id ? "bg-[#1e3a5f] hover:bg-[#1e3a5f]" : ""}`}
              >
                <LayerRowContent
                  layer={layer}
                  isActive={activeLayerId === layer.id}
                  onToggleVisible={onToggleVisible}
                />
              </div>
            ))}

            {/* 드래그 중 고스트 오버레이 */}
            <DragOverlay dropAnimation={{ duration: 150, easing: "ease" }}>
              {draggingLayer && (
                <LayerRowContent
                  layer={draggingLayer}
                  isActive={false}
                  isDragging
                />
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* 하단 액션 툴바 */}
      <div className="border-t border-zinc-700 bg-[#2a2a2a] flex-shrink-0">
        {/* 액션 버튼 (일러스트레이터 하단 툴바) */}
        <div className="flex items-center justify-end gap-0.5 px-1.5 py-1">
          {/* 새 텍스트 블록 */}
          <button
            onClick={onAddBlock}
            disabled={!onAddBlock}
            title="새 텍스트 블록 추가"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-600 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <Plus size={13} />
          </button>

          {/* 복제 */}
          <button
            onClick={() => activeLayerId && onDuplicateBlock?.(activeLayerId)}
            disabled={!canDuplicate || !onDuplicateBlock}
            title="선택 레이어 복제"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-zinc-600 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <Copy size={12} />
          </button>

          {/* 구분선 */}
          <div className="w-px h-4 bg-zinc-600 mx-0.5" />

          {/* 삭제 */}
          <button
            onClick={() => activeLayerId && onDeleteBlock?.(activeLayerId)}
            disabled={!canDelete || !onDeleteBlock}
            title="선택 레이어 삭제"
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-800/60 text-zinc-500 hover:text-red-300 disabled:opacity-30 disabled:cursor-default transition-colors"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
