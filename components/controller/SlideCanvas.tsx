"use client";

import {
  useEffect, useRef, useState, useCallback, useId,
  forwardRef, useImperativeHandle,
} from "react";
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import { toDisplayUrl } from "@/lib/media";
import type { TextBlock, TextSpan, ShapeBlock } from "@/lib/types";
import { applyFormatToSpans, spansToHtml, htmlToSpans } from "@/lib/spanUtils";

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
  selectBlock: (id: string) => void;
  applyFormatToSelection: (blockId: string, patch: Partial<Omit<TextSpan, "text">>) => boolean;
  syncTextBlocks: (blocks: TextBlock[]) => void;
  applyFormatToShapeText: (shapeId: string, patch: Partial<Omit<TextSpan, "text">>) => boolean;
}

type HandlePos = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

// Top 3 handles become move handles (drag to reposition block)
const MOVE_HANDLES = new Set<HandlePos>(["nw", "n", "ne"]);

interface Props {
  onCanvasChange?: (songId: number, slideId: string, canvas: { textBlocks: TextBlock[]; shapeBlocks?: ShapeBlock[] }) => void;
  onSelectionChange?: (block: TextBlock | null) => void;
  onSelectionFormatChange?: (fmt: Partial<Omit<TextSpan, "text">> | null) => void;
  selectedShapeId?: string | null;
  onSelectShape?: (id: string | null) => void;
  onUpdateShapeById?: (id: string, patch: Partial<ShapeBlock>) => void;
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

/** contentEditable 내 문자 오프셋으로 Selection 복원 */
function setSelectionByOffsets(el: HTMLElement, start: number, end: number) {
  const sel = window.getSelection();
  if (!sel) return;
  let charCount = 0;
  let startNode: Text | null = null, endNode: Text | null = null;
  let startOff = 0, endOff = 0;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_ALL);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = (node as Text).length;
      if (!startNode && charCount + len >= start) { startNode = node as Text; startOff = start - charCount; }
      if (!endNode && charCount + len >= end) { endNode = node as Text; endOff = end - charCount; }
      if (startNode && endNode) break;
      charCount += len;
    } else if (node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName === "BR") {
      charCount += 1;
    }
    node = walker.nextNode();
  }
  if (startNode && endNode) {
    try {
      const range = document.createRange();
      range.setStart(startNode, Math.min(startOff, startNode.length));
      range.setEnd(endNode, Math.min(endOff, endNode.length));
      sel.removeAllRanges();
      sel.addRange(range);
    } catch { /* 복원 실패 무시 */ }
  }
}

const SlideCanvas = forwardRef<SlideCanvasHandle, Props>(
  function SlideCanvas({ onCanvasChange, onSelectionChange, onSelectionFormatChange, selectedShapeId, onSelectShape, onUpdateShapeById }, ref) {
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
    const [editingShapeId, setEditingShapeId] = useState<string | null>(null);
    const editingShapeTextRef = useRef<string>("");
    const slideChangedRef = useRef(false);
    const externalBlockSyncRef = useRef(false);
    const currentSlideRef = useRef<{ songId: number; slideId: string } | null>(null);
    const onCanvasChangeRef = useRef(onCanvasChange);
    useEffect(() => { onCanvasChangeRef.current = onCanvasChange; });
    const fmtPainterRef = useRef<Partial<TextBlock> | null>(null);
    const [fmtPainterActive, setFmtPainterActive] = useState(false);
    const editingSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const didDragRef = useRef(false);
    const editingTextRef = useRef<string>("");
    const contentEditableRef = useRef<HTMLDivElement | null>(null);
    const editInitializedRef = useRef<string | null>(null);
    const lastSelectionRef = useRef<{ blockId: string; start: number; end: number; time: number } | null>(null);
    const shapeContentEditableRef = useRef<HTMLDivElement | null>(null);
    const editingShapeSelectionRef = useRef<{ start: number; end: number } | null>(null);
    const editingShapeInitializedRef = useRef<string | null>(null);
    const lastShapeSelectionRef = useRef<{ shapeId: string; start: number; end: number; time: number } | null>(null);
    const pendingSelectionRestoreRef = useRef<{ blockId: string; start: number; end: number } | null>(null);
    const pendingShapeSelectionRestoreRef = useRef<{ shapeId: string; start: number; end: number } | null>(null);
    const onSelectionFormatChangeRef = useRef(onSelectionFormatChange);
    useEffect(() => { onSelectionFormatChangeRef.current = onSelectionFormatChange; });
    const onSelectShapeRef = useRef(onSelectShape);
    useEffect(() => { onSelectShapeRef.current = onSelectShape; });
    const drawRef = useRef<{ startX: number; startY: number; rect: { x: number; y: number; w: number; h: number } | null } | null>(null);
    const [drawRect, setDrawRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

    // ── Imperative handle ──────────────────────────────────────────────
    const selectedIdsRef = useRef(selectedIds);
    useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);
    const blocksRef = useRef(blocks);
    useEffect(() => { blocksRef.current = blocks; }, [blocks]);

    useImperativeHandle(ref, () => ({
      updateBlock(id, patch) {
        setBlocks((prev) => prev.map((b) => {
          if (b.id !== id) return b;
          const updated = { ...b, ...patch };
          // When setting block-level color, clear per-span colors so block.color takes effect
          if ("color" in patch && updated.spans) {
            updated.spans = updated.spans.map(s => ({ ...s, color: undefined }));
          }
          return updated;
        }));
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
      selectBlock(id) {
        if (blocksRef.current.some((b) => b.id === id)) {
          setSelectedIds([id]);
          setEditingId(null);
        }
      },
      activateFormatPainter(format) {
        fmtPainterRef.current = format;
        setFmtPainterActive(true);
      },
      isFmtPainterActive: () => fmtPainterActive,
      syncTextBlocks(newBlocks) {
        externalBlockSyncRef.current = true;
        setBlocks(newBlocks);
      },
      applyFormatToShapeText(shapeId, patch) {
        // 라이브 선택 우선, 없으면 grace period 저장값 사용
        const liveRange = editingShapeSelectionRef.current;
        const savedRange = lastShapeSelectionRef.current?.shapeId === shapeId &&
          Date.now() - lastShapeSelectionRef.current.time < 30000 ? lastShapeSelectionRef.current : null;
        // 편집 중이 아니어도 grace period 내 저장된 선택 범위 있으면 허용
        if (editingShapeId !== shapeId && !savedRange) return false;
        const selRange = (liveRange && liveRange.start !== liveRange.end) ? liveRange
          : (savedRange && savedRange.start !== savedRange.end) ? savedRange : null;
        if (!selRange) return false;
        const { start, end } = selRange;
        const el = shapeContentEditableRef.current;
        if (el) {
          // DOM에서 직접 읽어 항상 최신 상태 반영
          const { text: currentText, spans: currentSpans } = htmlToSpans(el.innerHTML);
          const newSpans = applyFormatToSpans(currentText, currentSpans, start, end, patch);
          el.innerHTML = spansToHtml(newSpans, currentText);
          el.focus({ preventScroll: true });
          setSelectionByOffsets(el, start, end);
          onUpdateShapeByIdRef.current?.(shapeId, { text: currentText, textSpans: newSpans });
        } else {
          // 폴백: contentEditable 미마운트 시 재진입
          const shape = useOutputStore.getState().layerConfig.canvas?.shapeBlocks?.find(s => s.id === shapeId);
          if (!shape) return false;
          const newSpans = applyFormatToSpans(shape.text ?? "", shape.textSpans, start, end, patch);
          onUpdateShapeByIdRef.current?.(shapeId, { textSpans: newSpans });
          pendingShapeSelectionRestoreRef.current = { shapeId, start, end };
          editingShapeInitializedRef.current = null;
          setEditingShapeId(shapeId);
        }
        return true;
      },
      applyFormatToSelection(blockId, patch) {
        if (editingId !== blockId) return false;
        // 라이브 선택 우선, 없으면 grace period 저장값 사용
        const liveRange = editingSelectionRef.current;
        const savedRange = lastSelectionRef.current?.blockId === blockId &&
          Date.now() - lastSelectionRef.current.time < 30000 ? lastSelectionRef.current : null;
        const selRange = (liveRange && liveRange.start !== liveRange.end) ? liveRange
          : (savedRange && savedRange.start !== savedRange.end) ? savedRange : null;
        if (!selRange) return false;
        const { start, end } = selRange;
        const el = contentEditableRef.current;
        if (el) {
          // DOM에서 직접 읽어 항상 최신 상태 반영
          const { text: currentText, spans: currentSpans } = htmlToSpans(el.innerHTML);
          const newSpans = applyFormatToSpans(currentText, currentSpans, start, end, patch);
          el.innerHTML = spansToHtml(newSpans, currentText);
          el.focus({ preventScroll: true });
          setSelectionByOffsets(el, start, end);
          setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, spans: newSpans, text: currentText } : b)));
        } else {
          // 폴백: contentEditable 미마운트 시 재진입
          const block = blocksRef.current.find((b) => b.id === blockId);
          if (!block) return false;
          const newSpans = applyFormatToSpans(block.text, block.spans, start, end, patch);
          setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, spans: newSpans } : b)));
          pendingSelectionRestoreRef.current = { blockId, start, end };
          editInitializedRef.current = null;
          setEditingId(blockId);
        }
        return true;
      },
    }), [idPrefix, fmtPainterActive, editingId, editingShapeId]);

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
      setEditingShapeId(null);
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
      if (externalBlockSyncRef.current) { externalBlockSyncRef.current = false; return; }
      const info = currentSlideRef.current;
      if (!info) return;
      const existingShapeBlocks = useOutputStore.getState().layerConfig.canvas?.shapeBlocks;
      onCanvasChangeRef.current?.(info.songId, info.slideId, { textBlocks: blocks, shapeBlocks: existingShapeBlocks });
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
    const shapeMoveRef = useRef<{
      shapeId: string; startCX: number; startCY: number; origX: number; origY: number;
    } | null>(null);
    const shapeResizeRef = useRef<{
      shapeId: string; handle: HandlePos;
      startCX: number; startCY: number;
      origX: number; origY: number; origW: number; origH: number;
    } | null>(null);
    const onUpdateShapeByIdRef = useRef(onUpdateShapeById);
    onUpdateShapeByIdRef.current = onUpdateShapeById;

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
      } else if (shapeMoveRef.current) {
        const d = shapeMoveRef.current;
        const dx = (e.clientX - d.startCX) / scale;
        const dy = (e.clientY - d.startCY) / scale;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          didDragRef.current = true;
          onUpdateShapeByIdRef.current?.(d.shapeId, {
            x: Math.round(Math.max(0, d.origX + dx)),
            y: Math.round(Math.max(0, d.origY + dy)),
          });
        }
      } else if (shapeResizeRef.current) {
        const d = shapeResizeRef.current;
        const dx = (e.clientX - d.startCX) / scale;
        const dy = (e.clientY - d.startCY) / scale;
        const minW = 20, minH = 20;
        let x = d.origX, y = d.origY, w = d.origW, h = d.origH;
        const p = d.handle;
        if (p.includes("e")) w = Math.max(minW, d.origW + dx);
        if (p.includes("s")) h = Math.max(minH, d.origH + dy);
        if (p.includes("w")) { w = Math.max(minW, d.origW - dx); x = d.origX + d.origW - w; }
        if (p.includes("n")) { h = Math.max(minH, d.origH - dy); y = d.origY + d.origH - h; }
        didDragRef.current = true;
        onUpdateShapeByIdRef.current?.(d.shapeId, {
          x: Math.round(x), y: Math.round(y),
          width: Math.round(w), height: Math.round(h),
        });
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
      shapeMoveRef.current = null;
      shapeResizeRef.current = null;
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
      if ((e.target as HTMLElement).closest("[data-shape-id]")) return;
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
      if ((e.target as HTMLElement).closest("[data-block-id]") || (e.target as HTMLElement).closest("[data-handle]") || (e.target as HTMLElement).closest("[data-shape-id]")) return;
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
      onSelectShapeRef.current?.(null);
      setEditingId(null);
      setEditingShapeId(null);
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
          !(e.target as HTMLElement).closest("[data-handle]") &&
          !(e.target as HTMLElement).closest("[data-shape-id]")) {
        setSelectedIds([]);
        setEditingId(null);
        setEditingShapeId(null);
        onSelectShapeRef.current?.(null);
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

    // selectionchange 로 선택 범위 추적 (onSelect 보다 신뢰성 높음)
    useEffect(() => {
      if (!editingId) return;
      const updateSel = () => {
        const el = contentEditableRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) { editingSelectionRef.current = null; onSelectionFormatChangeRef.current?.(null); return; }
        if (!el.contains(sel.anchorNode)) { editingSelectionRef.current = null; onSelectionFormatChangeRef.current?.(null); return; }
        const range = sel.getRangeAt(0);
        // BR을 '\n' 1자로 계산하는 오프셋 계산
        const getOffset = (container: Node, offset: number): number => {
          let count = 0;
          const w = document.createTreeWalker(el, NodeFilter.SHOW_ALL);
          let n: Node | null = w.nextNode();
          while (n) {
            if (n === container) return count + (n.nodeType === Node.TEXT_NODE ? offset : 0);
            if (n.nodeType === Node.TEXT_NODE) count += (n as Text).length;
            else if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "BR") count += 1;
            n = w.nextNode();
          }
          return count;
        };
        const rawStart = getOffset(range.startContainer, range.startOffset);
        const rawEnd = getOffset(range.endContainer, range.endOffset);
        const start = Math.min(rawStart, rawEnd);
        const end = Math.max(rawStart, rawEnd);
        if (start !== end) {
          editingSelectionRef.current = { start, end };
          lastSelectionRef.current = { blockId: editingId, start, end, time: Date.now() };
          // 선택 범위 첫 스팬의 서식을 콜백으로 전달 (툴바 활성 상태용)
          const { spans } = htmlToSpans(el.innerHTML);
          let pos = 0, selFmt: Partial<Omit<TextSpan, "text">> | null = null;
          for (const span of spans) {
            if (pos + span.text.length > start) {
              const { text: _t, ...fmt } = span;
              selFmt = Object.keys(fmt).length > 0 ? fmt : null;
              break;
            }
            pos += span.text.length;
          }
          onSelectionFormatChangeRef.current?.(selFmt);
        } else {
          editingSelectionRef.current = null;
          onSelectionFormatChangeRef.current?.(null);
        }
      };
      document.addEventListener("selectionchange", updateSel);
      return () => {
        document.removeEventListener("selectionchange", updateSel);
        onSelectionFormatChangeRef.current?.(null);
      };
    }, [editingId]);

    // selectionchange for shape text editing
    useEffect(() => {
      if (!editingShapeId) return;
      const updateSel = () => {
        const el = shapeContentEditableRef.current;
        if (!el) return;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
          editingShapeSelectionRef.current = null; onSelectionFormatChangeRef.current?.(null); return;
        }
        const range = sel.getRangeAt(0);
        const getOffset = (container: Node, offset: number): number => {
          let count = 0;
          const w = document.createTreeWalker(el, NodeFilter.SHOW_ALL);
          let n: Node | null = w.nextNode();
          while (n) {
            if (n === container) return count + (n.nodeType === Node.TEXT_NODE ? offset : 0);
            if (n.nodeType === Node.TEXT_NODE) count += (n as Text).length;
            else if (n.nodeType === Node.ELEMENT_NODE && (n as Element).tagName === "BR") count += 1;
            n = w.nextNode();
          }
          return count;
        };
        const rawStart = getOffset(range.startContainer, range.startOffset);
        const rawEnd = getOffset(range.endContainer, range.endOffset);
        const start = Math.min(rawStart, rawEnd);
        const end = Math.max(rawStart, rawEnd);
        if (start !== end) {
          editingShapeSelectionRef.current = { start, end };
          lastShapeSelectionRef.current = { shapeId: editingShapeId, start, end, time: Date.now() };
          const { spans } = htmlToSpans(el.innerHTML);
          let pos = 0, selFmt: Partial<Omit<TextSpan, "text">> | null = null;
          for (const span of spans) {
            if (pos + span.text.length > start) { const { text: _t, ...fmt } = span; selFmt = Object.keys(fmt).length > 0 ? fmt : null; break; }
            pos += span.text.length;
          }
          onSelectionFormatChangeRef.current?.(selFmt);
        } else {
          editingShapeSelectionRef.current = null; onSelectionFormatChangeRef.current?.(null);
        }
      };
      document.addEventListener("selectionchange", updateSel);
      return () => { document.removeEventListener("selectionchange", updateSel); onSelectionFormatChangeRef.current?.(null); };
    }, [editingShapeId]);

    // Reset text block init guard when editingId commits to null (same pattern as shapes below)
    useEffect(() => {
      if (!editingId) {
        editInitializedRef.current = null;
      }
    }, [editingId]);

    // Reset shape init guard only after editingShapeId actually commits to null,
    // preventing premature reset during intermediate Zustand-triggered re-renders.
    useEffect(() => {
      if (!editingShapeId) {
        editingShapeInitializedRef.current = null;
      }
    }, [editingShapeId]);

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
            {layerConfig.background.type === "video" ? (() => {
              const url = layerConfig.background.src ? toDisplayUrl(layerConfig.background.src) : null;
              return url ? (
                <video
                  src={url}
                  muted
                  playsInline
                  preload="metadata"
                  style={{
                    position: "absolute", inset: 0, width: "100%", height: "100%",
                    objectFit: "cover", opacity: layerConfig.background.opacity, zIndex: 10,
                  }}
                  onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0.1; }}
                />
              ) : (
                <div style={{ position: "absolute", inset: 0, zIndex: 10, backgroundColor: "#111",
                  display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ color: "#555", fontSize: 48 }}>▶</span>
                </div>
              );
            })() : (
              <BackgroundLayer config={layerConfig.background} skipPlaybackEmit />
            )}

            {/* ── Elements in layer order (text blocks + shapes) ────────── */}
            {(() => {
              const shapeBlocks = layerConfig.canvas?.shapeBlocks ?? [];
              const layerOrder = layerConfig.canvas?.layerOrder;
              const visibleShapes = shapeBlocks.filter((s) => s.visible !== false);
              const knownIds = new Set([...blocks.map((b) => b.id), ...visibleShapes.map((s) => s.id)]);
              const effectiveOrder: string[] = layerOrder
                ? [
                    ...blocks.filter((b) => !layerOrder.includes(b.id)).map((b) => b.id),
                    ...visibleShapes.filter((s) => !layerOrder.includes(s.id)).map((s) => s.id),
                    ...layerOrder.filter((id) => knownIds.has(id)),
                  ]
                : [...blocks.map((b) => b.id), ...visibleShapes.map((s) => s.id)];
              const blocksById = Object.fromEntries(blocks.map((b) => [b.id, b]));
              const shapesById = Object.fromEntries(shapeBlocks.map((s) => [s.id, s]));
              const positionOf = Object.fromEntries(effectiveOrder.map((id, pos) => [id, pos]));

              // Content layers: each element gets z = 10 + position*2
              const contentEls = effectiveOrder.map((id, position) => {
                const contentZ = 10 + position * 2;
                const block = blocksById[id];
                if (block) {
                  return (
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
                        zIndex: contentZ,
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
                        <div
                          style={{
                            display: "flex",
                            width: "100%", height: "100%",
                            alignItems: "flex-start",
                            justifyContent: block.textAlign === "left" ? "flex-start" : block.textAlign === "right" ? "flex-end" : "center",
                            background: "rgba(0,0,0,0.6)",
                            outline: "1px dashed rgba(180,180,180,0.6)",
                            outlineOffset: "-1px",
                            padding: "8px",
                            boxSizing: "border-box",
                          }}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          <div
                            ref={(el) => {
                              contentEditableRef.current = el;
                              if (el && editInitializedRef.current !== block.id) {
                                // 첫 진입 시만 초기화: 스팬 HTML로 렌더, 전체 선택
                                editInitializedRef.current = block.id;
                                el.innerHTML = spansToHtml(block.spans, block.text);
                                editingTextRef.current = el.innerText;
                                el.focus({ preventScroll: true });
                                const pending = pendingSelectionRestoreRef.current;
                                if (pending && pending.blockId === block.id) {
                                  pendingSelectionRestoreRef.current = null;
                                  setSelectionByOffsets(el, pending.start, pending.end);
                                } else {
                                  const sel = window.getSelection();
                                  if (sel) {
                                    const range = document.createRange();
                                    range.selectNodeContents(el);
                                    sel.removeAllRanges();
                                    sel.addRange(range);
                                  }
                                }
                              }
                            }}
                            contentEditable
                            suppressContentEditableWarning
                            onInput={(e) => {
                              editingTextRef.current = (e.currentTarget as HTMLDivElement).innerText;
                            }}
                            onBlur={() => {
                              const el = contentEditableRef.current;
                              if (el) {
                                const { text: rawText, spans: rawSpans } = htmlToSpans(el.innerHTML);
                                // 브라우저가 추가하는 trailing newline 제거
                                const cleanText = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
                                // spans를 cleanText 길이에 맞게 trim
                                let pos = 0;
                                const cleanSpans: TextSpan[] = [];
                                for (const span of rawSpans) {
                                  if (pos >= cleanText.length) break;
                                  const remaining = cleanText.length - pos;
                                  if (span.text.length <= remaining) {
                                    cleanSpans.push(span);
                                    pos += span.text.length;
                                  } else {
                                    cleanSpans.push({ ...span, text: span.text.slice(0, remaining) });
                                    break;
                                  }
                                }
                                setBlocks((prev) =>
                                  prev.map((b) => b.id === block.id ? { ...b, text: cleanText, spans: cleanSpans } : b)
                                );
                              }
                              editingSelectionRef.current = null;
                            }}
                            style={{
                              width: "100%",
                              color: block.color,
                              fontSize: block.fontSize,
                              fontFamily: block.fontFamily,
                              fontWeight: block.fontWeight ?? "normal",
                              fontStyle: block.fontStyle ?? "normal",
                              textDecoration: block.textDecoration ?? "none",
                              textAlign: block.textAlign ?? "center",
                              lineHeight: 1.3,
                              whiteSpace: "pre-wrap",
                              wordBreak: "keep-all",
                              outline: "none",
                              cursor: "text",
                              userSelect: "text",
                            }}
                          />
                        </div>
                      ) : (
                        <div
                          style={{
                            width: "100%", height: "100%",
                            display: "flex", alignItems: "flex-start",
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
                          {block.spans && block.spans.length > 0 ? (
                            block.spans.map((span, i) => (
                              <span
                                key={i}
                                style={{
                                  fontFamily: span.fontFamily,
                                  fontWeight: span.fontWeight ?? (block.fontWeight ?? "normal"),
                                  fontStyle: span.fontStyle ?? (block.fontStyle ?? "normal"),
                                  textDecoration: span.textDecoration ?? (block.textDecoration ?? "none"),
                                  color: span.color ?? block.color,
                                  fontSize: span.fontSize !== undefined ? `${span.fontSize}px` : undefined,
                                }}
                              >
                                {span.text}
                              </span>
                            ))
                          ) : (
                            block.text
                          )}
                        </div>
                      )}
                    </div>
                  );
                }
                const s = shapesById[id];
                if (!s) return null;
                // Build individual shape SVG (rotation now applied via transform attribute)
                const fill = s.fillEnabled ? s.fillColor : "none";
                const fillOpacity = s.fillEnabled ? s.fillOpacity / 100 : 0;
                const stroke = s.strokeEnabled ? s.strokeColor : "none";
                const strokeOpacity = s.strokeEnabled ? s.strokeOpacity / 100 : 0;
                const strokeWidth = s.strokeEnabled ? s.strokeWidth : 0;
                const filterAttr = s.shadowEnabled ? `url(#shadow-${s.id})` : undefined;
                const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
                const x = s.x, y = s.y, w = s.width, h = s.height;
                const transformAttr = s.rotation ? `rotate(${s.rotation} ${cx} ${cy})` : undefined;
                const cp = { fill, fillOpacity, stroke, strokeOpacity, strokeWidth, filter: filterAttr, transform: transformAttr };
                let shapeEl: React.ReactNode = null;
                switch (s.shapeType) {
                  case "rect": shapeEl = <rect x={x} y={y} width={w} height={h} {...cp} />; break;
                  case "rounded-rect": shapeEl = <rect x={x} y={y} width={w} height={h} rx={Math.min(w,h)*0.12} ry={Math.min(w,h)*0.12} {...cp} />; break;
                  case "ellipse": shapeEl = <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} {...cp} />; break;
                  case "triangle": shapeEl = <polygon points={`${cx},${y} ${x+w},${y+h} ${x},${y+h}`} {...cp} />; break;
                  case "diamond": shapeEl = <polygon points={`${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`} {...cp} />; break;
                  case "line": shapeEl = <line x1={x} y1={cy} x2={x+w} y2={cy} stroke={s.strokeEnabled ? s.strokeColor : "#ffffff"} strokeOpacity={strokeOpacity} strokeWidth={s.strokeEnabled ? s.strokeWidth : 4} filter={filterAttr} transform={transformAttr} />; break;
                  case "arrow-right": {
                    const ah = h*0.4, aw = w*0.35;
                    const pts = [`${x},${cy-ah/2}`,`${x+w-aw},${cy-ah/2}`,`${x+w-aw},${y}`,`${x+w},${cy}`,`${x+w-aw},${y+h}`,`${x+w-aw},${cy+ah/2}`,`${x},${cy+ah/2}`].join(" ");
                    shapeEl = <polygon points={pts} {...cp} />; break;
                  }
                  case "star": {
                    const r1 = Math.min(w,h)/2, r2 = r1*0.4;
                    const pts = Array.from({length:10}).map((_,i) => { const a=(Math.PI/5)*i-Math.PI/2; const r=i%2===0?r1:r2; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(" ");
                    shapeEl = <polygon points={pts} {...cp} />; break;
                  }
                  case "pentagon": {
                    const r = Math.min(w,h)/2;
                    const pts = Array.from({length:5}).map((_,i) => { const a=(Math.PI*2/5)*i-Math.PI/2; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(" ");
                    shapeEl = <polygon points={pts} {...cp} />; break;
                  }
                }
                return (
                  <svg
                    key={id}
                    style={{ position: "absolute", top: 0, left: 0, width: OUTPUT_W, height: OUTPUT_H, zIndex: contentZ, pointerEvents: "none", opacity: s.opacity !== undefined ? s.opacity / 100 : 1 }}
                  >
                    {s.shadowEnabled && (
                      <defs>
                        <filter id={`shadow-${s.id}`} x="-50%" y="-50%" width="200%" height="200%">
                          <feDropShadow dx={s.shadowX} dy={s.shadowY} stdDeviation={s.shadowBlur} floodColor={s.shadowColor} floodOpacity={0.7} />
                        </filter>
                      </defs>
                    )}
                    {shapeEl}
                  </svg>
                );
              });

              // Interaction overlays: z = shapeContentZ + 1 so they sit just above their shape SVG
              // Only render overlays for visible shapes (mirrors effectiveOrder which uses visibleShapes)
              const overlayEls = visibleShapes.map((shape) => {
                const pos = positionOf[shape.id] ?? -1;
                const overlayZ = pos >= 0 ? 10 + pos * 2 + 1 : 42;
                const isSelected = selectedShapeId === shape.id;
                const isEditingShape = editingShapeId === shape.id;
                const shapeTextStyle: React.CSSProperties = {
                  position: "absolute", inset: 0,
                  display: "flex", alignItems: "center",
                  justifyContent: shape.textAlign === "left" ? "flex-start" : shape.textAlign === "right" ? "flex-end" : "center",
                  color: shape.textColor ?? "#ffffff",
                  fontSize: shape.textFontSize ?? 60,
                  fontFamily: shape.textFontFamily ?? "sans-serif",
                  fontWeight: shape.textFontWeight ?? "normal",
                  fontStyle: shape.textFontStyle ?? "normal",
                  textDecoration: shape.textDecoration ?? "none",
                  textAlign: shape.textAlign ?? "center",
                  padding: 8, boxSizing: "border-box",
                  whiteSpace: "pre-wrap", wordBreak: "break-word", overflow: "hidden",
                };
                return (
                  <div
                    key={`overlay-${shape.id}`}
                    data-shape-id={shape.id}
                    style={{
                      position: "absolute",
                      left: shape.x, top: shape.y,
                      width: shape.width, height: shape.height,
                      zIndex: overlayZ,
                      cursor: isEditingShape ? "text" : isSelected ? "move" : "pointer",
                      outline: isSelected ? "2px solid #3b82f6" : "none",
                      outlineOffset: isSelected ? 2 : 0,
                      boxSizing: "border-box",
                    }}
                    onPointerDown={(e) => {
                      if (isEditingShape) return;
                      if (e.button !== 0) return;
                      e.stopPropagation();
                      onSelectShape?.(shape.id);
                      setSelectedIds([]);
                      setEditingId(null);
                      setEditingShapeId(null);
                      shapeMoveRef.current = {
                        shapeId: shape.id,
                        startCX: e.clientX, startCY: e.clientY,
                        origX: shape.x, origY: shape.y,
                      };
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      onSelectShape?.(shape.id);
                      editingShapeTextRef.current = shape.text ?? "";
                      setEditingShapeId(shape.id);
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {isEditingShape ? (
                      <div
                        key="shape-editing"
                        contentEditable
                        suppressContentEditableWarning
                        style={{ ...shapeTextStyle, outline: "1px dashed rgba(180,180,180,0.6)", outlineOffset: -1, cursor: "text", userSelect: "text" }}
                        ref={(el) => {
                          shapeContentEditableRef.current = el;
                          if (el && editingShapeInitializedRef.current !== shape.id) {
                            editingShapeInitializedRef.current = shape.id;
                            el.innerHTML = spansToHtml(shape.textSpans, shape.text ?? "");
                            el.focus({ preventScroll: true });
                            const pending = pendingShapeSelectionRestoreRef.current;
                            if (pending && pending.shapeId === shape.id) {
                              pendingShapeSelectionRestoreRef.current = null;
                              setSelectionByOffsets(el, pending.start, pending.end);
                            } else {
                              const sel = window.getSelection();
                              if (sel) { const r = document.createRange(); r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r); }
                            }
                          }
                        }}
                        onBlur={() => {
                          const el = shapeContentEditableRef.current;
                          if (el) {
                            const { text: rawText, spans: rawSpans } = htmlToSpans(el.innerHTML);
                            const cleanText = rawText.endsWith("\n") ? rawText.slice(0, -1) : rawText;
                            let pos = 0;
                            const cleanSpans: TextSpan[] = [];
                            for (const span of rawSpans) {
                              if (pos >= cleanText.length) break;
                              const remaining = cleanText.length - pos;
                              if (span.text.length <= remaining) { cleanSpans.push(span); pos += span.text.length; }
                              else { cleanSpans.push({ ...span, text: span.text.slice(0, remaining) }); break; }
                            }
                            onUpdateShapeByIdRef.current?.(shape.id, { text: cleanText, textSpans: cleanSpans });
                          }
                          editingShapeSelectionRef.current = null;
                        }}
                        onKeyDown={(e) => { if (e.key === "Escape") { setEditingShapeId(null); } }}
                        onPointerDown={(e) => e.stopPropagation()}
                      />
                    ) : shape.text ? (
                      <div style={{ ...shapeTextStyle, pointerEvents: "none" }}>
                        {shape.textSpans && shape.textSpans.length > 0
                          ? shape.textSpans.map((span, i) => (
                              <span key={i} style={{
                                fontFamily: span.fontFamily,
                                fontWeight: span.fontWeight ?? (shape.textFontWeight ?? "normal"),
                                fontStyle: span.fontStyle ?? (shape.textFontStyle ?? "normal"),
                                textDecoration: span.textDecoration ?? (shape.textDecoration ?? "none"),
                                color: span.color ?? shape.textColor ?? "#ffffff",
                                fontSize: span.fontSize !== undefined ? `${span.fontSize}px` : undefined,
                              }}>{span.text}</span>
                            ))
                          : shape.text}
                      </div>
                    ) : null}
                    {isSelected && RESIZE_HANDLES.map(({ pos, left, top }) => (
                      <div
                        key={pos}
                        data-handle={pos}
                        style={{
                          position: "absolute",
                          left, top,
                          width: 8, height: 8,
                          background: "#ffffff",
                          border: "1.5px solid #3b82f6",
                          borderRadius: 1,
                          cursor: handleCursor(pos),
                          zIndex: 43,
                          transform: "translate(-50%, -50%)",
                          flexShrink: 0,
                        }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return;
                          e.stopPropagation();
                          shapeResizeRef.current = {
                            shapeId: shape.id, handle: pos as HandlePos,
                            startCX: e.clientX, startCY: e.clientY,
                            origX: shape.x, origY: shape.y,
                            origW: shape.width, origH: shape.height,
                          };
                        }}
                      />
                    ))}
                  </div>
                );
              });

              return <>{contentEls}{overlayEls}</>;
            })()}
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

              {/* 8 handles: top-3 (nw/n/ne) = move, rest = resize */}
              {RESIZE_HANDLES.map(({ pos, left, top }) => (
                <div
                  key={pos}
                  data-handle={pos}
                  title={MOVE_HANDLES.has(pos) ? "드래그하여 이동" : undefined}
                  style={{
                    position: "absolute", left, top,
                    width: 8, height: 8,
                    borderRadius: MOVE_HANDLES.has(pos) ? "2px" : "50%",
                    background: MOVE_HANDLES.has(pos) ? "#60a5fa" : "white",
                    border: "1.5px solid #3b82f6",
                    cursor: MOVE_HANDLES.has(pos) ? "move" : handleCursor(pos),
                    pointerEvents: "all", zIndex: 30, boxSizing: "border-box",
                  }}
                  onPointerDown={(e) => {
                    e.stopPropagation();
                    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                    if (MOVE_HANDLES.has(pos)) {
                      didDragRef.current = false;
                      const origPositions: Record<string, { x: number; y: number }> = {};
                      for (const blk of blocksRef.current) {
                        if (selectedIdsRef.current.includes(blk.id)) {
                          origPositions[blk.id] = { x: blk.x, y: blk.y };
                        }
                      }
                      moveRef.current = { blockId: b.id, startCX: e.clientX, startCY: e.clientY, origPositions };
                    } else {
                      resizeRef.current = {
                        blockId: b.id, handle: pos,
                        startCX: e.clientX, startCY: e.clientY,
                        origX: b.x, origY: b.y,
                        origW: b.width, origH: b.height ?? DEFAULT_H,
                      };
                    }
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
