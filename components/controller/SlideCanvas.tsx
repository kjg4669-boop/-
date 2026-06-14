"use client";

import { useEffect, useRef, useState, useCallback, useId } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  onCanvasChange?: (
    songId: number,
    slideId: string,
    canvas: { textBlocks: TextBlock[] }
  ) => void;
}

export default function SlideCanvas({ onCanvasChange }: Props) {
  const { getFlatSlideList, getActiveFlatSlideIndex } = useQueueStore();
  const { layerConfig } = useOutputStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const idPrefix = useId();
  const nextBlockNum = useRef(1);

  const slides = getFlatSlideList();
  const activeIdx = getActiveFlatSlideIndex();
  const activeEntry = activeIdx >= 0 ? slides[activeIdx] : null;
  const activeSlide = activeEntry?.slide ?? null;

  const [blocks, setBlocks] = useState<TextBlock[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [rightClickedBlockId, setRightClickedBlockId] = useState<string | null>(null);

  // Sync blocks when active slide changes
  useEffect(() => {
    setBlocks(activeSlide?.canvas?.textBlocks ?? []);
    setEditingId(null);
  }, [activeIdx]); // intentionally only on index change

  // ResizeObserver for scale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.offsetWidth / OUTPUT_W));
    ro.observe(el);
    setScale(el.offsetWidth / OUTPUT_W);
    return () => ro.disconnect();
  }, []);

  // Notify parent whenever blocks change (skip initial sync)
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    if (!activeEntry || !onCanvasChange) return;
    onCanvasChange(activeEntry.songId, activeEntry.slide.id, { textBlocks: blocks });
  }, [blocks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset first-render flag when slide changes
  useEffect(() => { isFirstRender.current = true; }, [activeIdx]);

  const toCanvasCoords = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: Math.round((clientX - rect.left) / scale),
        y: Math.round((clientY - rect.top) / scale),
      };
    },
    [scale]
  );

  // Double-click blank canvas → add new text block
  const handleCanvasDblClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).dataset.blockId) return;
      const { x, y } = toCanvasCoords(e.clientX, e.clientY);
      const id = `${idPrefix}-${Date.now()}-${nextBlockNum.current++}`;
      const newBlock: TextBlock = {
        id,
        x: Math.max(0, Math.min(x - 200, OUTPUT_W - 800)),
        y: Math.max(0, Math.min(y - 30, OUTPUT_H - 100)),
        width: 800,
        text: "텍스트를 입력하세요",
        fontSize: 60,
        color: "#ffffff",
        fontFamily: "sans-serif",
      };
      setBlocks((prev) => [...prev, newBlock]);
      setEditingId(id);
    },
    [toCanvasCoords, idPrefix]
  );

  // Drag via pointer capture
  const dragRef = useRef<{
    blockId: string;
    startClientX: number;
    startClientY: number;
    origX: number;
    origY: number;
  } | null>(null);

  const handleBlockPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, block: TextBlock) => {
      if (editingId === block.id) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragRef.current = {
        blockId: block.id,
        startClientX: e.clientX,
        startClientY: e.clientY,
        origX: block.x,
        origY: block.y,
      };
      e.stopPropagation();
    },
    [editingId]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = (e.clientX - d.startClientX) / scale;
      const dy = (e.clientY - d.startClientY) / scale;
      setBlocks((prev) =>
        prev.map((b) =>
          b.id === d.blockId
            ? {
                ...b,
                x: Math.round(Math.max(0, Math.min(d.origX + dx, OUTPUT_W - b.width))),
                y: Math.round(Math.max(0, Math.min(d.origY + dy, OUTPUT_H - b.fontSize * 2))),
              }
            : b
        )
      );
    },
    [scale]
  );

  const handlePointerUp = useCallback(() => {
    dragRef.current = null;
  }, []);

  const handleBlockDblClick = useCallback(
    (e: React.MouseEvent, blockId: string) => {
      e.stopPropagation();
      setEditingId(blockId);
    },
    []
  );

  const handleTextChange = useCallback((id: string, text: string) => {
    setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setRightClickedBlockId(null);
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
    setRightClickedBlockId(null);
  }, []);

  const addBlockAtCenter = useCallback(() => {
    const id = `${idPrefix}-${Date.now()}-${nextBlockNum.current++}`;
    const newBlock: TextBlock = {
      id,
      x: 560,
      y: 460,
      width: 800,
      text: "텍스트를 입력하세요",
      fontSize: 60,
      color: "#ffffff",
      fontFamily: "sans-serif",
    };
    setBlocks((prev) => [...prev, newBlock]);
    setEditingId(id);
    closeContextMenu();
  }, [idPrefix, closeContextMenu]);

  if (!activeSlide) {
    return (
      <div
        ref={containerRef}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 flex items-center justify-center text-zinc-500 text-sm"
        style={{ aspectRatio: "16/9" }}
      >
        슬라이드를 선택하세요
      </div>
    );
  }

  return (
    <div className="relative w-full" onClick={closeContextMenu}>
      {/* Canvas outer container */}
      <div
        ref={containerRef}
        className="relative w-full rounded-lg overflow-hidden border border-zinc-600"
        style={{ aspectRatio: "16/9", cursor: "crosshair" }}
        onDoubleClick={handleCanvasDblClick}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onContextMenu={handleContextMenu}
      >
        {/* 1920×1080 virtual canvas scaled down */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: OUTPUT_W,
            height: OUTPUT_H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
          }}
        >
          <BackgroundLayer config={layerConfig.background} />

          {blocks.map((block) => (
            <div
              key={block.id}
              data-block-id={block.id}
              style={{
                position: "absolute",
                left: block.x,
                top: block.y,
                width: block.width,
                cursor: editingId === block.id ? "text" : "move",
                outline:
                  editingId === block.id
                    ? "2px solid rgba(59,130,246,1)"
                    : "2px dashed rgba(59,130,246,0.6)",
                borderRadius: 4,
                minHeight: block.fontSize * 1.5,
              }}
              onPointerDown={(e) => handleBlockPointerDown(e, block)}
              onDoubleClick={(e) => handleBlockDblClick(e, block.id)}
              onContextMenu={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setRightClickedBlockId(block.id);
                setContextMenu({ x: e.clientX, y: e.clientY });
              }}
            >
              {editingId === block.id ? (
                <textarea
                  autoFocus
                  value={block.text}
                  onChange={(e) => handleTextChange(block.id, e.target.value)}
                  onBlur={() => setEditingId(null)}
                  onPointerDown={(e) => e.stopPropagation()}
                  style={{
                    display: "block",
                    width: "100%",
                    minHeight: block.fontSize * 2,
                    background: "rgba(0,0,0,0.75)",
                    color: block.color,
                    fontSize: block.fontSize,
                    fontFamily: block.fontFamily,
                    border: "none",
                    outline: "none",
                    resize: "both",
                    lineHeight: 1.3,
                    padding: 4,
                    boxSizing: "border-box",
                  }}
                />
              ) : (
                <div
                  style={{
                    fontSize: block.fontSize,
                    color: block.color,
                    fontFamily: block.fontFamily,
                    WebkitTextStroke: "2px rgba(0,0,0,0.8)",
                    paintOrder: "stroke fill",
                    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
                    lineHeight: 1.3,
                    whiteSpace: "pre-wrap",
                    wordBreak: "keep-all",
                    padding: 4,
                    userSelect: "none",
                  }}
                >
                  {block.text}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Hint when no blocks */}
      {blocks.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-zinc-500 text-sm bg-black/40 px-3 py-1 rounded">
            더블클릭하여 텍스트 블록 추가
          </span>
        </div>
      )}

      {/* Context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-zinc-800 border border-zinc-600 rounded shadow-xl py-1 text-sm min-w-40"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="block w-full text-left px-3 py-1.5 hover:bg-zinc-700"
            onClick={addBlockAtCenter}
          >
            + 텍스트 블록 추가
          </button>
          {rightClickedBlockId && (
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-zinc-700 text-red-400"
              onClick={() => {
                setBlocks((prev) => prev.filter((b) => b.id !== rightClickedBlockId));
                setRightClickedBlockId(null);
                closeContextMenu();
              }}
            >
              ✕ 이 블록 삭제
            </button>
          )}
          {rightClickedBlockId && blocks.length > 0 && (
            <div className="border-t border-zinc-700 my-1" />
          )}
          {blocks.length > 0 && (
            <button
              className="block w-full text-left px-3 py-1.5 hover:bg-zinc-700 text-red-400"
              onClick={() => {
                setBlocks([]);
                closeContextMenu();
              }}
            >
              ✕ 전체 블록 삭제
            </button>
          )}
        </div>
      )}
    </div>
  );
}
