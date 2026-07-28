# Canvas Slide Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current panel-based controller UI with a canvas-based slide editor where text blocks can be freely placed, dragged, and edited on a 16:9 interactive canvas.

**Architecture:** Left panel shows a flat thumbnail list of all slides from all service items. Center shows an interactive 16:9 canvas editor (CSS transform scale). Top bar holds service selector, live toggle, blackout, output controls. Canvas text blocks are stored in `LyricSlide.canvas.textBlocks` (inside the existing `lyrics_json` JSON column — no DB schema change). A new `CanvasLayer` renders them in the output window. The existing `SubtitleLayer` is kept as fallback for slides without canvas data.

**Tech Stack:** React pointer events for drag (no new deps), CSS transform scale + ResizeObserver for canvas sizing, Zustand for state, tauri-plugin-sql for debounced DB persistence.

---

### Task 1: Add TextBlock type + canvas fields to types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add `TextBlock` interface after the `LyricSection` type (around line 14)**

The new type goes between `LyricSection` and `LyricSlide`:

```ts
export interface TextBlock {
  id: string;
  x: number;        // px within 1920×1080 virtual canvas
  y: number;
  width: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
}
```

- [ ] **Step 2: Extend `LyricSlide` with optional `canvas` field**

Change the existing `LyricSlide` interface from:
```ts
export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
}
```
to:
```ts
export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
  canvas?: {
    textBlocks: TextBlock[];
  };
}
```

- [ ] **Step 3: Add `canvas` field to `LayerConfig`**

In the `LayerConfig` interface, after the `overlay` block, add:
```ts
canvas?: {
  textBlocks: TextBlock[];
};
```

- [ ] **Step 4: Add `FlatSlide` interface after `LayerConfig`**

```ts
export interface FlatSlide {
  slide: LyricSlide;
  songId: number;
  songTitle: string;
  serviceItemIndex: number; // index into currentService.items
  slideIndex: number;       // index into that item's song.lyrics_json
}
```

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts
git commit -m "feat: add TextBlock, FlatSlide types and canvas fields to LyricSlide + LayerConfig"
```

---

### Task 2: CanvasLayer component — renders free-positioned text blocks in output window

**Files:**
- Create: `components/layers/CanvasLayer.tsx`
- Modify: `app/output/page.tsx` (add CanvasLayer import + JSX)
- Modify: `components/controller/PreviewPanel.tsx` (add CanvasLayer import + JSX)

- [ ] **Step 1: Create `components/layers/CanvasLayer.tsx`**

```tsx
"use client";

import type { TextBlock } from "@/lib/types";

interface Props {
  blocks: TextBlock[];
}

export default function CanvasLayer({ blocks }: Props) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 25,
        pointerEvents: "none",
      }}
    >
      {blocks.map((block) => (
        <div
          key={block.id}
          style={{
            position: "absolute",
            left: block.x,
            top: block.y,
            width: block.width,
            fontSize: block.fontSize,
            color: block.color,
            fontFamily: block.fontFamily,
            WebkitTextStroke: "2px rgba(0,0,0,0.8)",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
            lineHeight: 1.3,
            whiteSpace: "pre-wrap",
            wordBreak: "keep-all",
          }}
        >
          {block.text}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add CanvasLayer to `app/output/page.tsx`**

At the top, add the import:
```tsx
import CanvasLayer from "@/components/layers/CanvasLayer";
```

In the JSX, add after `<OverlayLayer config={layerConfig.overlay} />` and before the blackout div:
```tsx
<CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />
```

- [ ] **Step 3: Add CanvasLayer to `components/controller/PreviewPanel.tsx`**

At the top, add the import:
```tsx
import CanvasLayer from "@/components/layers/CanvasLayer";
```

In the JSX, add after `<OverlayLayer config={layerConfig.overlay} />`:
```tsx
<CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />
```

- [ ] **Step 4: Commit**

```bash
git add components/layers/CanvasLayer.tsx app/output/page.tsx components/controller/PreviewPanel.tsx
git commit -m "feat: add CanvasLayer to output and preview for free-position text blocks"
```

---

### Task 3: Flat slide helpers + canvas update action in queueStore

**Files:**
- Modify: `stores/queueStore.ts`

Add to the store:
- `getFlatSlideList()` — all slides from all service items, flattened in order
- `getActiveFlatSlideIndex()` — maps current (activeItemIndex, activeLyricSlideIndex) → flat index
- `setActiveFlatSlide(flatIndex)` — maps flat index back to (activeItemIndex, activeLyricSlideIndex) and sets both
- `updateSlideCanvas(songId, slideId, canvas)` — patches canvas data in-memory; controller page handles DB save

- [ ] **Step 1: Add new methods to the `QueueState` interface**

Add these to the interface (after `getTotalLyricSlides`):
```ts
getFlatSlideList: () => import("@/lib/types").FlatSlide[];
getActiveFlatSlideIndex: () => number;
setActiveFlatSlide: (flatIndex: number) => void;
updateSlideCanvas: (
  songId: number,
  slideId: string,
  canvas: import("@/lib/types").LyricSlide["canvas"]
) => void;
```

- [ ] **Step 2: Implement `getFlatSlideList` (add after `getTotalLyricSlides` implementation)**

```ts
getFlatSlideList: () => {
  const { currentService } = get();
  if (!currentService) return [];
  const result: import("@/lib/types").FlatSlide[] = [];
  currentService.items.forEach((item, serviceItemIndex) => {
    if (!item.song) return;
    item.song.lyrics_json.forEach((slide, slideIndex) => {
      result.push({
        slide,
        songId: item.song!.id,
        songTitle: item.song!.title,
        serviceItemIndex,
        slideIndex,
      });
    });
  });
  return result;
},
```

- [ ] **Step 3: Implement `getActiveFlatSlideIndex`**

```ts
getActiveFlatSlideIndex: () => {
  const { currentService, activeItemIndex, activeLyricSlideIndex } = get();
  if (!currentService || activeItemIndex < 0) return -1;
  let flatIdx = 0;
  for (let i = 0; i < currentService.items.length; i++) {
    const slides = currentService.items[i].song?.lyrics_json ?? [];
    if (i === activeItemIndex) return flatIdx + activeLyricSlideIndex;
    flatIdx += slides.length;
  }
  return -1;
},
```

- [ ] **Step 4: Implement `setActiveFlatSlide`**

```ts
setActiveFlatSlide: (flatIndex: number) => {
  const list = get().getFlatSlideList();
  const entry = list[flatIndex];
  if (!entry) return;
  set({ activeItemIndex: entry.serviceItemIndex, activeLyricSlideIndex: entry.slideIndex });
},
```

- [ ] **Step 5: Implement `updateSlideCanvas`**

```ts
updateSlideCanvas: (songId, slideId, canvas) => {
  const { currentService } = get();
  if (!currentService) return;
  const newItems = currentService.items.map((item) => {
    if (!item.song || item.song.id !== songId) return item;
    const newSlides = item.song.lyrics_json.map((s) =>
      s.id === slideId ? { ...s, canvas } : s
    );
    return { ...item, song: { ...item.song, lyrics_json: newSlides } };
  });
  set({ currentService: { ...currentService, items: newItems } });
},
```

- [ ] **Step 6: Commit**

```bash
git add stores/queueStore.ts
git commit -m "feat: add flat slide list helpers and canvas update action to queueStore"
```

---

### Task 4: SlideThumbnailList component

**Files:**
- Create: `components/controller/SlideThumbnailList.tsx`

Left panel: scrollable list grouped by song title. Each slide shows a mini 16:9 thumbnail with its text preview. Clicking activates the slide.

- [ ] **Step 1: Create `components/controller/SlideThumbnailList.tsx`**

```tsx
"use client";

import { useQueueStore } from "@/stores/queueStore";

export default function SlideThumbnailList() {
  const { getFlatSlideList, getActiveFlatSlideIndex, setActiveFlatSlide } = useQueueStore();
  const slides = getFlatSlideList();
  const activeIdx = getActiveFlatSlideIndex();

  if (slides.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-zinc-500 text-xs p-4 text-center">
        서비스를 선택하거나
        <br />
        곡을 추가하세요
      </div>
    );
  }

  let lastSongId = -1;

  return (
    <div className="h-full overflow-y-auto p-2 flex flex-col gap-1">
      {slides.map((entry, flatIdx) => {
        const showSongHeader = entry.songId !== lastSongId;
        lastSongId = entry.songId;
        const isActive = flatIdx === activeIdx;
        const previewLines =
          entry.slide.canvas?.textBlocks.map((b) => b.text) ?? entry.slide.lines;

        return (
          <div key={`${entry.songId}-${entry.slideIndex}`}>
            {showSongHeader && (
              <div className="text-xs text-zinc-400 font-medium px-1 pt-2 pb-1 uppercase tracking-wide truncate">
                {entry.songTitle}
              </div>
            )}
            <button
              onClick={() => setActiveFlatSlide(flatIdx)}
              className={`w-full rounded border text-left transition-colors ${
                isActive
                  ? "border-blue-500 bg-blue-950"
                  : "border-zinc-700 bg-zinc-800 hover:border-zinc-500 hover:bg-zinc-750"
              }`}
            >
              {/* 16:9 mini thumbnail */}
              <div
                style={{ aspectRatio: "16/9", position: "relative", overflow: "hidden" }}
                className="rounded-t"
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundColor: "#000",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "4px 6px",
                    gap: 2,
                  }}
                >
                  {previewLines.slice(0, 4).map((line, i) => (
                    <div
                      key={i}
                      style={{
                        fontSize: 6,
                        color: "#fff",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        maxWidth: "100%",
                        textOverflow: "ellipsis",
                        lineHeight: 1.4,
                      }}
                    >
                      {line}
                    </div>
                  ))}
                  {previewLines.length === 0 && (
                    <div style={{ fontSize: 6, color: "#555" }}>빈 슬라이드</div>
                  )}
                </div>
              </div>
              {/* Label */}
              <div className="px-1 py-0.5 text-[9px] text-zinc-400 truncate">
                {entry.slide.section} {entry.slide.sectionIndex + 1}
              </div>
            </button>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/controller/SlideThumbnailList.tsx
git commit -m "feat: add SlideThumbnailList left panel with song grouping and thumbnails"
```

---

### Task 5: SlideCanvas interactive editor

**Files:**
- Create: `components/controller/SlideCanvas.tsx`

16:9 canvas with:
- CSS transform scale using ResizeObserver (same technique as PreviewPanel)
- Background rendered via `BackgroundLayer` from `layerConfig.background`
- Text blocks from the active slide's `canvas.textBlocks`
- **Double-click blank space** → add new text block at that canvas position, start editing
- **Double-click existing block** → switch to inline textarea for editing
- **Pointer drag on block** → reposition (pointer capture for smooth drag)
- **Right-click on canvas** → context menu: add block, delete all blocks
- Coordinate conversion: screen pos → canvas pos = divide by scale

- [ ] **Step 1: Create `components/controller/SlideCanvas.tsx`**

```tsx
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

  // Sync blocks when active slide changes
  useEffect(() => {
    setBlocks(activeSlide?.canvas?.textBlocks ?? []);
    setEditingId(null);
  }, [activeIdx]); // intentionally only on index change, not object identity

  // ResizeObserver for scale
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.offsetWidth / OUTPUT_W));
    ro.observe(el);
    setScale(el.offsetWidth / OUTPUT_W);
    return () => ro.disconnect();
  }, []);

  // Notify parent whenever blocks change (after initial sync)
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

  // Double-click on blank canvas → add new text block
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

  // Drag handling via pointer capture
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
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  const closeContextMenu = useCallback(() => setContextMenu(null), []);

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
          {/* Background layer */}
          <BackgroundLayer config={layerConfig.background} />

          {/* Text blocks */}
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
```

- [ ] **Step 2: Commit**

```bash
git add components/controller/SlideCanvas.tsx
git commit -m "feat: add interactive SlideCanvas editor with drag/dblclick-edit/context-menu"
```

---

### Task 6: Rewrite controller page with new canvas layout

**Files:**
- Modify: `app/controller/page.tsx`

New layout (replaces current queue+preview+sidebar layout):
- **Top bar**: service dropdown, live toggle, blackout button, output window button
- **Left panel (w-48)**: `SlideThumbnailList`
- **Center**: `SlideCanvas` + prev/next buttons below

IPC sync logic:
- When active slide changes (`activeItemIndex`, `activeLyricSlideIndex`, `currentService?.id`): build LayerConfig. If slide has canvas blocks → put them in `layerConfig.canvas` and hide subtitle. Otherwise → keep subtitle approach. Send via IPC if live.
- `handleCanvasChange`: called by `SlideCanvas` whenever blocks change → call `updateSlideCanvas` in store → immediately re-send IPC if live → debounce DB save via `songDb.update`.

Service loading:
- On mount, call `serviceDb.list()` → set `services` state → auto-load the most recent service via `serviceDb.get(list[0].id)`.

- [ ] **Step 1: Rewrite `app/controller/page.tsx` entirely**

```tsx
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
      // Update in-memory store
      updateSlideCanvas(songId, slideId, canvas);

      // Send IPC immediately if live
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

      // Debounced DB save (600ms)
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

  // Service selector change
  const handleServiceChange = useCallback(
    async (serviceId: number) => {
      const full = await serviceDb.get(serviceId);
      if (full) setCurrentService(full);
    },
    [setCurrentService]
  );

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
```

- [ ] **Step 2: Verify TypeScript is clean**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero errors. If there are errors, fix them before committing.

- [ ] **Step 3: Commit**

```bash
git add app/controller/page.tsx
git commit -m "feat: rewrite controller page with canvas-based slide editor layout"
```

---

## Post-implementation verification

Run both checks:

```bash
cd /Volumes/P31/chppt/worship-projector
npx tsc --noEmit
npm run build
```

Expected:
- Zero TypeScript errors
- All 4 routes build successfully (`/`, `/controller`, `/output`, `/_not-found`)

**Manual test checklist:**
- [ ] Service loads on startup, slides appear in left panel
- [ ] Clicking a slide thumbnail activates it; canvas shows the slide
- [ ] Double-clicking blank canvas area adds a text block with inline edit
- [ ] Double-clicking existing block enables editing
- [ ] Dragging a block repositions it
- [ ] Right-click shows context menu with add/delete options
- [ ] Live toggle: when on, activating a slide sends it to output
- [ ] Blackout button and B key work
- [ ] Output window opens and renders canvas blocks correctly
- [ ] Space / Arrow keys advance slides
- [ ] Canvas edits are saved to DB (verify by reloading service)
