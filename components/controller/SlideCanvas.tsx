"use client";

import {
  useEffect, useRef, useState, useCallback, useId,
  forwardRef, useImperativeHandle,
} from "react";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;
const DEFAULT_H = 200;

export interface SlideCanvasHandle {
  updateBlock: (id: string, patch: Partial<TextBlock>) => void;
  addBlock: () => void;
  copyBlock: () => void;
  cutBlock: () => void;
  pasteBlock: () => void;
  hasClipboard: () => boolean;
  hasSelection: () => boolean;
  activateFormatPainter: (format: Partial<TextBlock>) => void;
  isFmtPainterActive: () => boolean;
}

type HandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface Props {
  onCanvasChange?: (songId: number, slideId: string, canvas: { textBlocks: TextBlock[] }) => void;
  onSelectionChange?: (block: TextBlock | null) => void;
}

// Module-level clipboard for text blocks
let blockClipboard: TextBlock | null = null;

const RESIZE_HANDLES: { pos: HandlePos; left: string; top: string }[] = [
  { pos: "nw", left: "-4px",            top: "-4px" },
  { pos: "n",  left: "calc(50% - 4px)", top: "-4px" },
  { pos: "ne", left: "calc(100% - 4px)",top: "-4px" },
  { pos: "e",  left: "calc(100% - 4px)",top: "calc(50% - 4px)" },
  { pos: "se", left: "calc(100% - 4px)",top: "calc(100% - 4px)" },
  { pos: "s",  left: "calc(50% - 4px)", top: "calc(100% - 4px)" },
  { pos: "sw", left: "-4px",            top: "calc(100% - 4px)" },
  { pos: "w",  left: "-4px",            top: "calc(50% - 4px)" },
];

function handleCursor(pos: HandlePos): string {
  if (pos === "nw" || pos === "se") return "nwse-resize";
  if (pos === "ne" || pos === "sw") return "nesw-resize";
  if (pos === "n"  || pos === "s")  return "ns-resize";
  return "ew-resize";
}

const SlideCanvas = forwardRef<SlideCanvasHandle, Props>(
  function SlideCanvas({ onCanvasChange, onSelectionChange }, ref) {
    const activeIdx = useQueueStore((s) => s.getActiveFlatSlideIndex());
    const slides = useQueueStore((s) => s.getFlatSlideList());
    const { layerConfig } = useOutputStore();
    const containerRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);
    const idPrefix = useId();
    const nextNum = useRef(1);

    const activeEntry = activeIdx >= 0 ? slides[activeIdx] : null;
    const activeSlide = activeEntry?.slide ?? null;

    const [blocks, setBlocks] = useState<TextBlock[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const slideChangedRef = useRef(false);
    const currentSlideRef = useRef<{ songId: number; slideId: string } | null>(null);
    const onCanvasChangeRef = useRef(onCanvasChange);
    useEffect(() => { onCanvasChangeRef.current = onCanvasChange; });
    const fmtPainterRef = useRef<Partial<TextBlock> | null>(null);
    const [fmtPainterActive, setFmtPainterActive] = useState(false);
    const didDragRef = useRef(false);
    const drawRef = useRef<{ startX: number; startY: number; rect: { x: number; y: number; w: number; h: number } | null } | null>(null);
    const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    // ── Imperative handle ──────────────────────────────────────────────
    const selectedIdsRef = useRef(selectedIds);
    useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
    const blocksRef = useRef(blocks);
    useEffect(() => { blocksRef.current = blocks; }, [blocks]);

    useImperativeHandle(ref, () => ({
      updateBlock(id, patch) {
        setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
      },
      addBlock() {
        const id = `${idPrefix}-${Date.now()}-${nextNum.current++}`;
        const nb: TextBlock = {
          id, x: 560, y: 440, width: 800, height: DEFAULT_H,
          text: "텍스트를 입력하세요",
          fontSize: 60, color: "#ffffff", fontFamily: "sans-serif",
          textAlign: "center",
        };
        setBlocks((prev) => [...prev, nb]);
        setSelectedIds([id]);
        setEditingId(id);
      },
      copyBlock() {
        const b = blocksRef.current.find((x) => x.id === selectedIdsRef.current[0]);
        if (b) blockClipboard = { ...b };
      },
      cutBlock() {
        const ids = selectedIdsRef.current;
        const first = blocksRef.current.find((x) => x.id === ids[0]);
        if (first) {
          blockClipboard = { ...first };
          setBlocks((prev) => prev.filter((x) => !ids.includes(x.id)));
          setSelectedIds([]);
        }
      },
      pasteBlock() {
        if (!blockClipboard) return;
        const id = `${idPrefix}-${Date.now()}-${nextNum.current++}`;
        const nb: TextBlock = {
          ...blockClipboard,
          id,
          x: Math.min(blockClipboard.x + 50, OUTPUT_W - blockClipboard.width),
          y: Math.min((blockClipboard.y ?? 0) + 50, OUTPUT_H - (blockClipboard.height ?? DEFAULT_H)),
        };
        setBlocks((prev) => [...prev, nb]);
        setSelectedIds([id]);
      },
      hasClipboard: () => blockClipboard !== null,
      hasSelection: () => selectedIdsRef.current.length > 0,
      activateFormatPainter(format) {
        fmtPainterRef.current = format;
        setFmtPainterActive(true);
      },
      isFmtPainterActive: () => fmtPainterActive,
    }), [idPrefix, fmtPainterActive]);

    // Notify parent when selection changes
    const onSelectionRef = useRef(onSelectionChange);
    useEffect(() => { onSelectionRef.current = onSelectionChange; }, [onSelectionChange]);
    useEffect(() => {
      const block = selectedIds[0] ? (blocks.find((b) => b.id === selectedIds[0]) ?? null) : null;
      onSelectionRef.current?.(block);
    }, [selectedIds, blocks]);

    // Sync blocks from active slide
    useEffect(() => {
      slideChangedRef.current = true;
      currentSlideRef.current = activeEntry
        ? { songId: activeEntry.songId, slideId: activeEntry.slide.id }
        : null;

      const existingBlocks = activeSlide?.canvas?.textBlocks ?? [];

      if (existingBlocks.length === 0 && activeSlide && activeSlide.lines.length > 0) {
        // Auto-create a draggable canvas block from slide lines (memory only — not saved until user edits)
        const autoBlock: TextBlock = {
          id: `${activeSlide.id}-lyric`,
          x: 160, y: 290, width: 1600, height: 500,
          text: activeSlide.lines.join("\n"),
          fontSize: 60, color: "#ffffff",
          fontFamily: "sans-serif", textAlign: "center",
        };
        setBlocks([autoBlock]);
        // slideChangedRef stays true → blocks effect will suppress DB write for this auto-block
      } else {
        // Migrate legacy black text (old default was #000000, now #ffffff)
        setBlocks(existingBlocks.map((b) => b.color === "#000000" ? { ...b, color: "#ffffff" } : b));
      }

      setSelectedIds([]);
      setEditingId(null);
    }, [activeIdx, activeSlide?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    // Scale via ResizeObserver
    useEffect(() => {
      const el = containerRef.current;
      if (!el) return;
      const ro = new ResizeObserver(() => setScale(el.offsetWidth / OUTPUT_W));
      ro.observe(el);
      setScale(el.offsetWidth / OUTPUT_W);
      return () => ro.disconnect();
    }, []);

    // Notify parent on block change
    useEffect(() => {
      if (slideChangedRef.current) { slideChangedRef.current = false; return; }
      const info = currentSlideRef.current;
      if (!info) return;
      onCanvasChangeRef.current?.(info.songId, info.slideId, { textBlocks: blocks });
    }, [blocks]);

    // ── Drag refs ─────────────────────────────────────────────────────
    const moveRef = useRef<{
      blockId: string; startCX: number; startCY: number;
      origPositions: Record<string, { x: number; y: number }>;
    } | null>(null);
    const resizeRef = useRef<{
      blockId: string; handle: HandlePos;
      startCX: number; startCY: number;
      origX: number; origY: number; origW: number; origH: number;
    } | null>(null);
    const rotateRef = useRef<{
      blockId: string; cxClient: number; cyClient: number;
      startAngle: number; origRotation: number;
    } | null>(null);

    const handlePointerMove = useCallback((e: React.PointerEvent) => {
      if (moveRef.current) {
        const d = moveRef.current;
        const dx = (e.clientX - d.startCX) / scale;
        const dy = (e.clientY - d.startCY) / scale;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          didDragRef.current = true;
          setBlocks((prev) =>
            prev.map((b) => {
              const orig = d.origPositions[b.id];
              if (!orig) return b;
              return {
                ...b,
                x: Math.round(Math.max(0, Math.min(orig.x + dx, OUTPUT_W - b.width))),
                y: Math.round(Math.max(0, Math.min(orig.y + dy, OUTPUT_H - (b.height ?? DEFAULT_H)))),
              };
            })
          );
        }
      } else if (resizeRef.current) {
        const d = resizeRef.current;
        const dx = (e.clientX - d.startCX) / scale;
        const dy = (e.clientY - d.startCY) / scale;
        const minW = 80, minH = 40;
        setBlocks((prev) =>
          prev.map((b) => {
            if (b.id !== d.blockId) return b;
            let x = d.origX, y = d.origY, w = d.origW, h = d.origH;
            const p = d.handle;
            if (p.includes("e")) w = Math.max(minW, d.origW + dx);
            if (p.includes("s")) h = Math.max(minH, d.origH + dy);
            if (p.includes("w")) { w = Math.max(minW, d.origW - dx); x = d.origX + d.origW - w; }
            if (p.includes("n")) { h = Math.max(minH, d.origH - dy); y = d.origY + d.origH - h; }
            return { ...b, x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) };
          })
        );
      } else if (rotateRef.current) {
        const d = rotateRef.current;
        const angle = Math.atan2(e.clientY - d.cyClient, e.clientX - d.cxClient) * 180 / Math.PI;
        const rotation = Math.round(d.origRotation + (angle - d.startAngle));
        setBlocks((prev) =>
          prev.map((b) => (b.id === d.blockId ? { ...b, rotation } : b))
        );
      } else if (drawRef.current) {
        const d = drawRef.current;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const curX = (e.clientX - rect.left) / scale;
        const curY = (e.clientY - rect.top) / scale;
        const x = Math.min(d.startX, curX);
        const y = Math.min(d.startY, curY);
        const w = Math.abs(curX - d.startX);
        const h = Math.abs(curY - d.startY);
        const newRect = { x, y, w, h };
        drawRef.current.rect = newRect;
        setDrawRect(newRect);
      }
    }, [scale]);

    const handlePointerUp = useCallback(() => {
      moveRef.current = null;
      resizeRef.current = null;
      rotateRef.current = null;
      if (drawRef.current) {
        const r = drawRef.current.rect;
        drawRef.current = null;
        setDrawRect(null);
        if (r && r.w > 5 && r.h > 5) {
          const overlapping = blocksRef.current.filter((b) => {
            const bh = b.height ?? DEFAULT_H;
            return !(b.x + b.width < r.x || b.x > r.x + r.w || b.y + bh < r.y || b.y > r.y + r.h);
          });
          setSelectedIds(overlapping.map((b) => b.id));
        }
      }
    }, []);

    const handleCanvasDblClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("[data-block-id]")) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const cx = Math.round((e.clientX - rect.left) / scale);
      const cy = Math.round((e.clientY - rect.top) / scale);
      const id = `${idPrefix}-${Date.now()}-${nextNum.current++}`;
      const nb: TextBlock = {
        id,
        x: Math.max(0, Math.min(cx - 400, OUTPUT_W - 800)),
        y: Math.max(0, Math.min(cy - 50, OUTPUT_H - DEFAULT_H)),
        width: 800, height: DEFAULT_H,
        text: "텍스트를 입력하세요",
        fontSize: 60, color: "#ffffff", fontFamily: "sans-serif", textAlign: "center",
      };
      setBlocks((prev) => [...prev, nb]);
      setSelectedIds([id]);
      setEditingId(id);
    }, [scale, idPrefix]);

    const handleCanvasPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      if ((e.target as HTMLElement).closest("[data-block-id]") || (e.target as HTMLElement).closest("[data-handle]")) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const startX = (e.clientX - rect.left) / scale;
      const startY = (e.clientY - rect.top) / scale;
      drawRef.current = { startX, startY, rect: null };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }, [scale]);

    const handleBlockPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>, block: TextBlock) => {
      if (editingId === block.id) return;
      e.stopPropagation();
      // Format painter mode: apply stored format to clicked block
      if (fmtPainterRef.current) {
        const fmt = fmtPainterRef.current;
        fmtPainterRef.current = null;
        setFmtPainterActive(false);
        setBlocks((prev) => prev.map((b) => b.id === block.id ? { ...b, ...fmt } : b));
        setSelectedIds([block.id]);
        return;
      }
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      didDragRef.current = false;
      // If block not in current selection, start fresh single selection; otherwise keep group
      const currentIds = selectedIdsRef.current;
      const inSelection = currentIds.includes(block.id);
      if (!inSelection) setSelectedIds([block.id]);
      const ids = inSelection ? currentIds : [block.id];
      const origPositions: Record<string, { x: number; y: number }> = {};
      for (const b of blocksRef.current) {
        if (ids.includes(b.id)) origPositions[b.id] = { x: b.x, y: b.y };
      }
      moveRef.current = { blockId: block.id, startCX: e.clientX, startCY: e.clientY, origPositions };
    }, [editingId]);

    const handleBlockDblClick = useCallback((e: React.MouseEvent, blockId: string) => {
      e.stopPropagation();
      setSelectedIds([blockId]);
      setEditingId(blockId);
    }, []);

    const handleTextChange = useCallback((id: string, text: string) => {
      setBlocks((prev) => prev.map((b) => (b.id === id ? { ...b, text } : b)));
    }, []);

    const handleCanvasClick = useCallback((e: React.MouseEvent) => {
      if (!(e.target as HTMLElement).closest("[data-block-id]") &&
          !(e.target as HTMLElement).closest("[data-handle]")) {
        setSelectedIds([]);
        setEditingId(null);
      }
    }, []);

    // Delete key
    useEffect(() => {
      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
        if ((e.key === "Delete" || e.key === "Backspace") && selectedIdsRef.current.length > 0 && !editingId) {
          e.preventDefault();
          const ids = selectedIdsRef.current;
          setBlocks((prev) => prev.filter((b) => !ids.includes(b.id)));
          setSelectedIds([]);
        }
        if (e.key === "Escape" && editingId) setEditingId(null);
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [editingId]);

    // ── Selected block (first in selection) ──────────────────────────
    const primaryId = selectedIds[0] ?? null;
    const selectedBlock = primaryId ? blocks.find((b) => b.id === primaryId) : null;

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
      <div
        className="relative w-full"
        style={{ aspectRatio: "16/9" }}
        onClick={handleCanvasClick}
        onPointerDown={handleCanvasPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        {/* ── Virtual canvas (scaled) ──────────────────────────────── */}
        <div
          ref={containerRef}
          className="absolute inset-0 rounded-lg overflow-hidden border border-zinc-600"
          style={{ cursor: "crosshair" }}
          onDoubleClick={handleCanvasDblClick}
        >
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: OUTPUT_W, height: OUTPUT_H,
              transform: `scale(${scale})`, transformOrigin: "top left",
            }}
          >
            <BackgroundLayer config={layerConfig.background} />

            {blocks.map((block) => (
              <div
                key={block.id}
                data-block-id={block.id}
                style={{
                  position: "absolute",
                  left: block.x, top: block.y,
                  width: block.width, height: block.height ?? DEFAULT_H,
                  transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
                  cursor: editingId === block.id ? "text" : "move",
                  userSelect: "none",
                  zIndex: 11,
                }}
                onPointerDown={(e) => handleBlockPointerDown(e, block)}
                onDoubleClick={(e) => handleBlockDblClick(e, block.id)}
                onClick={(e) => {
                  e.stopPropagation();
                  if (selectedIds.includes(block.id) && selectedIds.length === 1 && !didDragRef.current) {
                    setEditingId(block.id);
                  }
                }}
              >
                {editingId === block.id ? (
                  <textarea
                    ref={(el) => el?.focus({ preventScroll: true })}
                    value={block.text}
                    onChange={(e) => handleTextChange(block.id, e.target.value)}
                    onBlur={() => setEditingId(null)}
                    onPointerDown={(e) => e.stopPropagation()}
                    style={{
                      display: "block", width: "100%", height: "100%",
                      background: "rgba(0,0,0,0.6)",
                      color: block.color, fontSize: block.fontSize,
                      fontFamily: block.fontFamily,
                      fontWeight: block.fontWeight ?? "normal",
                      fontStyle: block.fontStyle ?? "normal",
                      textDecoration: block.textDecoration ?? "none",
                      textAlign: block.textAlign ?? "center",
                      border: "none", outline: "none", resize: "none",
                      lineHeight: 1.3, padding: "8px", boxSizing: "border-box",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: "100%", height: "100%",
                      display: "flex", alignItems: "center",
                      justifyContent:
                        block.textAlign === "left" ? "flex-start"
                        : block.textAlign === "right" ? "flex-end" : "center",
                      fontSize: block.fontSize, color: block.color,
                      fontFamily: block.fontFamily,
                      fontWeight: block.fontWeight ?? "normal",
                      fontStyle: block.fontStyle ?? "normal",
                      textDecoration: block.textDecoration ?? "none",
                      textAlign: block.textAlign ?? "center",
                      lineHeight: 1.3, whiteSpace: "pre-wrap",
                      wordBreak: "keep-all", padding: "8px",
                      // Show outline only when selected
                      outline: selectedIds.includes(block.id) ? "1px dashed rgba(180,180,180,0.6)" : "none",
                      outlineOffset: "-1px",
                    }}
                  >
                    {block.text}
                  </div>
                )}
              </div>
            ))}
          </div>

          {blocks.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-zinc-500 text-sm bg-black/40 px-3 py-1 rounded">
                더블클릭 — 블록 추가 · 드래그 — 다중 선택
              </span>
            </div>
          )}
        </div>

        {/* ── Draw rect overlay ─────────────────────────────────────── */}
        {drawRect && drawRect.w > 5 && drawRect.h > 5 && (
          <div
            style={{
              position: "absolute",
              left: drawRect.x * scale,
              top: drawRect.y * scale,
              width: drawRect.w * scale,
              height: drawRect.h * scale,
              border: "1.5px dashed #60a5fa",
              background: "rgba(59,130,246,0.07)",
              pointerEvents: "none",
              zIndex: 15,
            }}
          />
        )}

        {/* ── Multi-select borders ──────────────────────────────────── */}
        {selectedIds.length > 1 && blocks.filter((b) => selectedIds.includes(b.id)).map((b) => (
          <div key={b.id + "-ms"} style={{
            position: "absolute",
            left: b.x * scale, top: b.y * scale,
            width: b.width * scale, height: (b.height ?? DEFAULT_H) * scale,
            transform: b.rotation ? `rotate(${b.rotation}deg)` : undefined,
            border: "1.5px solid #3b82f6", borderRadius: 2,
            pointerEvents: "none", zIndex: 20,
          }} />
        ))}

        {/* ── Selection overlay (DOM coords, not scaled) ─────────────── */}
        {selectedIds.length === 1 && selectedBlock && (() => {
          const b = selectedBlock;
          const sl = b.x * scale;
          const st = b.y * scale;
          const sw = b.width * scale;
          const sh = (b.height ?? DEFAULT_H) * scale;
          const rotation = b.rotation ?? 0;

          return (
            <div
              style={{
                position: "absolute",
                left: sl, top: st, width: sw, height: sh,
                transform: rotation ? `rotate(${rotation}deg)` : undefined,
                transformOrigin: "center",
                pointerEvents: "none",
                zIndex: 20,
              }}
            >
              {/* Border */}
              <div style={{
                position: "absolute", inset: 0,
                border: "1px solid #3b82f6", borderRadius: 2,
                pointerEvents: "none",
              }} />

              {/* Rotation stem */}
              <div style={{
                position: "absolute", left: "50%", top: -24,
                width: 1, height: 24, background: "#3b82f6",
                transform: "translateX(-50%)", pointerEvents: "none",
              }} />

              {/* Rotation handle */}
              <div
                data-handle="rotate"
                style={{
                  position: "absolute",
                  left: "calc(50% - 4px)", top: -28,
                  width: 8, height: 8,
                  borderRadius: "50%", background: "white",
                  border: "1.5px solid #3b82f6", cursor: "crosshair",
                  pointerEvents: "all", zIndex: 30, boxSizing: "border-box",
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  const cRect = containerRef.current?.getBoundingClientRect();
                  if (!cRect) return;
                  const cxClient = cRect.left + sl + sw / 2;
                  const cyClient = cRect.top + st + sh / 2;
                  const startAngle = Math.atan2(e.clientY - cyClient, e.clientX - cxClient) * 180 / Math.PI;
                  rotateRef.current = {
                    blockId: b.id, cxClient, cyClient,
                    startAngle, origRotation: rotation,
                  };
                }}
              />

              {/* 8 Resize handles */}
              {RESIZE_HANDLES.map(({ pos, left, top }) => (
                <div
                  key={pos}
                  data-handle={pos}
                  style={{
                    position: "absolute", left, top,
                    width: 8, height: 8,
                    borderRadius: "50%", background: "white",
                    border: "1.5px solid #3b82f6",
                    cursor: handleCursor(pos),
                    pointerEvents: "all", zIndex: 30, boxSizing: "border-box",
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    resizeRef.current = {
                      blockId: b.id, handle: pos,
                      startCX: e.clientX, startCY: e.clientY,
                      origX: b.x, origY: b.y,
                      origW: b.width, origH: b.height ?? DEFAULT_H,
                    };
                  }}
                />
              ))}
            </div>
          );
        })()}
      </div>
    );
  }
);

export default SlideCanvas;
