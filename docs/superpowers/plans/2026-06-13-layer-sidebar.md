# 레이어 설정 사이드바 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 읽기 전용 오른쪽 사이드바를 인터랙티브한 레이어 설정 패널로 교체 — 배경·자막·오버레이를 실시간 편집하고 전역/항목별 설정을 저장한다.

**Architecture:** `LayerSidebar.tsx` 컴포넌트가 `LayerConfig`를 props로 받아 배경·자막·오버레이 섹션을 편집 가능하게 제공. 변경 즉시 IPC 전송. 전역 기본값은 `localStorage["worship-layer-defaults"]`, 항목 오버라이드는 `service_items.settings_json`에 저장. `deepMerge` 유틸로 항목 선택 시 두 설정을 합산.

**Tech Stack:** Next.js 16 ("use client"), TypeScript, Tailwind CSS v4, Zustand v5, tauri-plugin-sql (SQLite)

> ⚠️ **테스트**: Tauri 데스크탑 앱 — 자동화 테스트 없음. 각 태스크 검증은 `source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev` 실행 후 수동 확인.

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `lib/types.ts` | `LayerConfig.subtitle`에 `strokeWidth`, `shadowEnabled`, `backgroundBoxVisible`, `backgroundBoxOpacity` 추가; `ServiceItemSettings` 타입을 `DeepPartial<LayerConfig>`로 교체 |
| `components/layers/SubtitleLayer.tsx` | 새 subtitle 필드(`strokeWidth`, `shadowEnabled`, `backgroundBoxVisible/Opacity`) 적용 |
| `lib/utils.ts` | 신규 — `deepMerge` 유틸 |
| `lib/db.ts` | `serviceDb.updateItemSettings` 메서드 추가 |
| `components/controller/LayerSidebar.tsx` | 신규 — 배경·자막·오버레이 편집 패널 |
| `app/controller/page.tsx` | LayerSidebar 통합, localStorage 전역 설정 로드/저장, `handleLayerChange`, useEffect 업데이트 |

---

## 참고: 현재 타입 구조

```ts
// lib/types.ts 현재 LayerConfig
export interface LayerConfig {
  background: {
    type: MediaType | "none";
    src?: string;
    color?: string;
    loop?: boolean;
    opacity: number;
  };
  subtitle: {
    visible: boolean;
    lines: string[];
    fontSize: number;
    fontFamily: string;
    color: string;
    strokeColor: string;
    position: "top" | "center" | "bottom";
    opacity: number;
    // ← strokeWidth, shadowEnabled, backgroundBoxVisible, backgroundBoxOpacity 추가 필요
  };
  overlay: {
    visible: boolean;
    src?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
  };
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  background: { type: "color", color: "#000000", loop: true, opacity: 1 },
  subtitle: {
    visible: false, lines: [],
    fontSize: 48, fontFamily: "sans-serif",
    color: "#ffffff", strokeColor: "#000000",
    position: "bottom", opacity: 1,
    // ← 새 필드 기본값 추가 필요
  },
  overlay: { visible: false, x: 0, y: 0, width: 320, height: 180, opacity: 1 },
};
```

```ts
// lib/db.ts 현재 serviceDb (관련 부분)
// addItem, reorderItems, deleteItem 있음
// updateItemSettings 없음 ← 추가 필요
```

---

## Task 1: 타입 확장 + deepMerge + DB 메서드 + SubtitleLayer

**Files:**
- Modify: `lib/types.ts`
- Modify: `components/layers/SubtitleLayer.tsx`
- Create: `lib/utils.ts`
- Modify: `lib/db.ts`

- [ ] **Step 1: lib/types.ts 업데이트**

`lib/types.ts` 전체를 아래로 교체:

```ts
// Media types
export type MediaType = "video" | "image" | "color";

export interface MediaItem {
  id: number;
  type: MediaType;
  file_path: string;
  thumbnail_path?: string;
  name: string;
  created_at: string;
}

// Song / Lyrics types
export type LyricSection = "verse" | "chorus" | "bridge" | "pre-chorus" | "outro" | "intro";

export interface LyricSlide {
  id: string;
  section: LyricSection;
  sectionIndex: number;
  lines: string[];
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
  created_at: string;
  updated_at: string;
}

// Service / Queue types
export type ServiceItemType = "song" | "video" | "announcement" | "scripture" | "blank";

// Layer configuration (sent via IPC to output window)
export interface LayerConfig {
  background: {
    type: MediaType | "none";
    src?: string;
    color?: string;
    loop?: boolean;
    opacity: number;
  };
  subtitle: {
    visible: boolean;
    lines: string[];
    fontSize: number;
    fontFamily: string;
    color: string;
    strokeColor: string;
    strokeWidth: number;
    shadowEnabled: boolean;
    backgroundBoxVisible: boolean;
    backgroundBoxOpacity: number;
    position: "top" | "center" | "bottom";
    opacity: number;
  };
  overlay: {
    visible: boolean;
    src?: string;
    x: number;
    y: number;
    width: number;
    height: number;
    opacity: number;
  };
}

// ServiceItemSettings: partial LayerConfig for per-item overrides
export interface ServiceItemSettings {
  background?: Partial<LayerConfig["background"]>;
  subtitle?: Partial<LayerConfig["subtitle"]>;
  overlay?: Partial<LayerConfig["overlay"]>;
}

export interface ServiceItem {
  id: number;
  service_id: number;
  item_order: number;
  type: ServiceItemType;
  song_id?: number;
  media_id?: number;
  settings_json: ServiceItemSettings;
  label: string;
  song?: Song;
  media?: MediaItem;
}

export interface Service {
  id: number;
  date: string;
  name: string;
  items: ServiceItem[];
}

export const DEFAULT_LAYER_CONFIG: LayerConfig = {
  background: { type: "color", color: "#000000", loop: true, opacity: 1 },
  subtitle: {
    visible: false,
    lines: [],
    fontSize: 48,
    fontFamily: "sans-serif",
    color: "#ffffff",
    strokeColor: "#000000",
    strokeWidth: 2,
    shadowEnabled: true,
    backgroundBoxVisible: false,
    backgroundBoxOpacity: 0.5,
    position: "bottom",
    opacity: 1,
  },
  overlay: { visible: false, x: 0, y: 0, width: 320, height: 180, opacity: 1 },
};

// IPC event types
export type IpcEventName =
  | "slide:update"
  | "subtitle:next"
  | "subtitle:prev"
  | "blackout:toggle"
  | "overlay:toggle"
  | "output:ready"
  | "playback:status";

export interface BlackoutTogglePayload { active: boolean; }
export interface SlideUpdatePayload { layerConfig: LayerConfig; }
export interface OverlayTogglePayload { id: string; visible: boolean; }
export interface PlaybackStatusPayload { currentTime: number; duration: number; }
```

- [ ] **Step 2: SubtitleLayer.tsx 업데이트**

`components/layers/SubtitleLayer.tsx` 전체를 아래로 교체:

```tsx
"use client";

import type { LayerConfig } from "@/lib/types";

interface Props {
  config: LayerConfig["subtitle"];
}

const positionMap = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
} as const;

export default function SubtitleLayer({ config }: Props) {
  if (!config.visible || config.lines.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: positionMap[config.position],
        padding: "48px 64px",
        opacity: config.opacity,
        transition: "opacity 200ms ease",
        willChange: "opacity",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          textAlign: "center",
          ...(config.backgroundBoxVisible
            ? {
                backgroundColor: `rgba(0,0,0,${config.backgroundBoxOpacity})`,
                borderRadius: 4,
                padding: "8px 24px",
              }
            : {}),
        }}
      >
        {config.lines.map((line, i) => (
          <p
            key={i}
            style={{
              margin: "4px 0",
              fontSize: `${config.fontSize}px`,
              fontFamily: config.fontFamily,
              color: config.color,
              WebkitTextStroke: `${config.strokeWidth}px ${config.strokeColor}`,
              paintOrder: "stroke fill",
              filter: config.shadowEnabled
                ? `drop-shadow(0 2px 8px ${config.strokeColor}80)`
                : undefined,
              lineHeight: 1.3,
              whiteSpace: "pre-wrap",
              wordBreak: "keep-all",
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: lib/utils.ts 생성**

```ts
/**
 * Recursively merges overrides into base (1 level deep for objects, not arrays).
 * Returns a new object — does not mutate base.
 */
export function deepMerge<T extends object>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (
      overVal !== undefined &&
      typeof baseVal === "object" && baseVal !== null && !Array.isArray(baseVal) &&
      typeof overVal === "object" && overVal !== null && !Array.isArray(overVal)
    ) {
      result[key] = { ...baseVal, ...(overVal as object) } as T[keyof T];
    } else if (overVal !== undefined) {
      result[key] = overVal as T[keyof T];
    }
  }
  return result;
}

export const GLOBAL_SETTINGS_KEY = "worship-layer-defaults";

export function loadGlobalDefaults(fallback: import("./types").LayerConfig): import("./types").LayerConfig {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(GLOBAL_SETTINGS_KEY);
    if (!raw) return fallback;
    return deepMerge(fallback, JSON.parse(raw));
  } catch {
    return fallback;
  }
}

export function saveGlobalDefaults(config: import("./types").LayerConfig): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(GLOBAL_SETTINGS_KEY, JSON.stringify(config));
}
```

- [ ] **Step 4: lib/db.ts에 updateItemSettings 추가**

`lib/db.ts`의 `serviceDb` 객체 마지막에 메서드 추가 (`deleteItem` 다음):

```ts
  async updateItemSettings(itemId: number, settings: import("./types").ServiceItemSettings): Promise<void> {
    const conn = await getDb();
    await conn.execute(
      "UPDATE service_items SET settings_json = ? WHERE id = ?",
      [JSON.stringify(settings), itemId]
    );
  },
```

- [ ] **Step 5: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

예상: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add lib/types.ts components/layers/SubtitleLayer.tsx lib/utils.ts lib/db.ts
git commit -m "feat: extend LayerConfig subtitle fields, add deepMerge util and updateItemSettings"
```

---

## Task 2: LayerSidebar 컴포넌트 — 배경 + 자막 섹션

**Files:**
- Create: `components/controller/LayerSidebar.tsx`

- [ ] **Step 1: LayerSidebar.tsx 생성 (배경 + 자막 섹션)**

`components/controller/LayerSidebar.tsx` 신규 생성:

```tsx
"use client";

import { useEffect, useState } from "react";
import { mediaDb } from "@/lib/db";
import type { LayerConfig, MediaItem } from "@/lib/types";

export interface LayerSidebarProps {
  layerConfig: LayerConfig;
  activeItemId: number | null;
  onChange: (config: LayerConfig) => void;
  onSaveGlobal: (config: LayerConfig) => void;
  onSaveItem: (itemId: number, config: LayerConfig) => void;
}

const FONT_OPTIONS = ["sans-serif", "serif", "Apple SD Gothic Neo", "Arial", "Georgia"];

export default function LayerSidebar({
  layerConfig,
  activeItemId,
  onChange,
  onSaveGlobal,
  onSaveItem,
}: LayerSidebarProps) {
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const noticeTimerRef = { current: null as ReturnType<typeof setTimeout> | null };

  useEffect(() => {
    mediaDb.list().then(setMediaItems).catch(console.error);
  }, []);

  function showNotice(msg: string) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setSavedNotice(msg);
    noticeTimerRef.current = setTimeout(() => setSavedNotice(null), 2000);
  }

  function setBackground(patch: Partial<LayerConfig["background"]>) {
    onChange({ ...layerConfig, background: { ...layerConfig.background, ...patch } });
  }

  function setSubtitle(patch: Partial<LayerConfig["subtitle"]>) {
    onChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...patch } });
  }

  function setOverlay(patch: Partial<LayerConfig["overlay"]>) {
    onChange({ ...layerConfig, overlay: { ...layerConfig.overlay, ...patch } });
  }

  const bg = layerConfig.background;
  const sub = layerConfig.subtitle;
  const ov = layerConfig.overlay;

  const imageItems = mediaItems.filter((m) => m.type === "image");
  const videoItems = mediaItems.filter((m) => m.type === "video");

  return (
    <div className="h-full flex flex-col overflow-y-auto text-xs">
      {/* ── 배경 ─────────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">배경</p>

        {/* Type tabs */}
        <div className="flex gap-1">
          {(["color", "image", "video"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setBackground({ type: t })}
              className={`flex-1 py-1 rounded text-xs ${
                bg.type === t ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {t === "color" ? "단색" : t === "image" ? "이미지" : "영상"}
            </button>
          ))}
        </div>

        {/* Color picker */}
        {bg.type === "color" && (
          <div className="flex items-center gap-2">
            <span className="text-zinc-400">색상</span>
            <input
              type="color"
              value={bg.color ?? "#000000"}
              onChange={(e) => setBackground({ color: e.target.value })}
              className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
            />
            <span className="text-zinc-500">{bg.color ?? "#000000"}</span>
          </div>
        )}

        {/* Media selector for image/video */}
        {(bg.type === "image" || bg.type === "video") && (
          <div className="space-y-1">
            <select
              value={bg.src ?? ""}
              onChange={(e) => setBackground({ src: e.target.value || undefined })}
              className="w-full bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
            >
              <option value="">-- 선택 --</option>
              {(bg.type === "image" ? imageItems : videoItems).map((m) => (
                <option key={m.id} value={m.file_path}>{m.name}</option>
              ))}
            </select>
            {(bg.type === "image" ? imageItems : videoItems).length === 0 && (
              <p className="text-zinc-600 text-xs">미디어 없음 (미디어 탭에서 추가)</p>
            )}
          </div>
        )}

        {/* Opacity */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-12">불투명도</span>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={bg.opacity}
            onChange={(e) => setBackground({ opacity: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-zinc-500 w-8 text-right">{Math.round(bg.opacity * 100)}%</span>
        </div>
      </section>

      {/* ── 자막 ─────────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">자막</p>

        {/* Position */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">위치</span>
          {(["top", "center", "bottom"] as const).map((pos) => (
            <button
              key={pos}
              onClick={() => setSubtitle({ position: pos })}
              className={`flex-1 py-1 rounded ${
                sub.position === pos ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
            >
              {pos === "top" ? "상단" : pos === "center" ? "중앙" : "하단"}
            </button>
          ))}
        </div>

        {/* Font family + size */}
        <div className="flex items-center gap-1">
          <span className="text-zinc-400 w-10">폰트</span>
          <select
            value={sub.fontFamily}
            onChange={(e) => setSubtitle({ fontFamily: e.target.value })}
            className="flex-1 bg-zinc-800 text-white rounded px-1 py-1 border border-zinc-600 text-xs"
          >
            {FONT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <input
            type="number"
            min={12} max={120}
            value={sub.fontSize}
            onChange={(e) => setSubtitle({ fontSize: Number(e.target.value) })}
            className="w-14 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
          />
          <span className="text-zinc-500">px</span>
        </div>

        {/* Text color */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-10">색상</span>
          <input
            type="color"
            value={sub.color}
            onChange={(e) => setSubtitle({ color: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
          />
          <span className="text-zinc-500">{sub.color}</span>
        </div>

        {/* Stroke color + width */}
        <div className="flex items-center gap-2">
          <span className="text-zinc-400 w-10">외곽선</span>
          <input
            type="color"
            value={sub.strokeColor}
            onChange={(e) => setSubtitle({ strokeColor: e.target.value })}
            className="w-8 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent"
          />
          <input
            type="number"
            min={0} max={10}
            value={sub.strokeWidth}
            onChange={(e) => setSubtitle({ strokeWidth: Number(e.target.value) })}
            className="w-12 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
          />
          <span className="text-zinc-500">px</span>
        </div>

        {/* Shadow toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.shadowEnabled}
            onChange={(e) => setSubtitle({ shadowEnabled: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300">그림자</span>
        </label>

        {/* Background box */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={sub.backgroundBoxVisible}
            onChange={(e) => setSubtitle({ backgroundBoxVisible: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300">배경박스</span>
        </label>
        {sub.backgroundBoxVisible && (
          <div className="flex items-center gap-2 pl-5">
            <span className="text-zinc-400 w-12">불투명도</span>
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={sub.backgroundBoxOpacity}
              onChange={(e) => setSubtitle({ backgroundBoxOpacity: Number(e.target.value) })}
              className="flex-1"
            />
            <span className="text-zinc-500 w-8 text-right">{Math.round(sub.backgroundBoxOpacity * 100)}%</span>
          </div>
        )}
      </section>

      {/* ── 오버레이 ────────────────────────────────── */}
      <section className="border-b border-zinc-700 p-3 space-y-2">
        <p className="text-zinc-400 font-medium uppercase tracking-wider text-[10px]">오버레이</p>

        {/* Visible toggle */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={ov.visible}
            onChange={(e) => setOverlay({ visible: e.target.checked })}
            className="rounded"
          />
          <span className="text-zinc-300">표시</span>
        </label>

        {ov.visible && (
          <>
            {/* Image selector */}
            <select
              value={ov.src ?? ""}
              onChange={(e) => setOverlay({ src: e.target.value || undefined })}
              className="w-full bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs"
            >
              <option value="">-- 이미지 선택 --</option>
              {imageItems.map((m) => (
                <option key={m.id} value={m.file_path}>{m.name}</option>
              ))}
            </select>

            {/* Position + size */}
            <div className="grid grid-cols-2 gap-1">
              {(["x", "y", "width", "height"] as const).map((field) => (
                <div key={field} className="flex items-center gap-1">
                  <span className="text-zinc-400 w-10">{field}</span>
                  <input
                    type="number"
                    value={ov[field]}
                    onChange={(e) => setOverlay({ [field]: Number(e.target.value) })}
                    className="flex-1 bg-zinc-800 text-white rounded px-2 py-1 border border-zinc-600 text-xs text-center"
                  />
                </div>
              ))}
            </div>
          </>
        )}
      </section>

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
              showNotice("⚙ 항목 설정 적용됨");
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
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

예상: 에러 없음. (아직 page.tsx에 연결 안 됐으므로 import 에러는 없음)

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/LayerSidebar.tsx
git commit -m "feat: create LayerSidebar component with background/subtitle/overlay sections"
```

---

## Task 3: controller/page.tsx 통합

**Files:**
- Modify: `app/controller/page.tsx`

이 태스크에서 읽기 전용 사이드바를 `LayerSidebar`로 교체하고, 전역 설정 로드/저장, `handleLayerChange`, useEffect 업데이트를 연결한다.

- [ ] **Step 1: controller/page.tsx 업데이트**

`app/controller/page.tsx` 전체를 아래로 교체:

```tsx
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
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

예상: 에러 없음.

- [ ] **Step 3: Next.js 빌드 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npm run build 2>&1 | tail -15
```

예상: 4개 라우트 모두 static.

- [ ] **Step 4: 수동 동작 확인**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

**확인 항목:**
1. 오른쪽 사이드바에 배경/자막/오버레이 섹션이 보임
2. 배경 → 단색 → 색상 피커로 색 변경 → 출력창 즉시 반영
3. 자막 → 폰트크기 변경 → 출력창 자막 크기 변경 (슬라이드 가사가 있을 때)
4. 자막 위치 상단/중앙/하단 → 출력창 자막 위치 변경
5. `[전역 기본값으로 저장]` → 앱 재시작 후에도 설정 유지
6. 서비스 항목 선택 → `[이 항목에 적용]` 활성화

- [ ] **Step 5: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add app/controller/page.tsx
git commit -m "feat: integrate LayerSidebar with global/item settings persistence"
```

---

## 완료 기준

- [ ] 배경 단색/이미지/영상 타입 선택 → 출력창 즉시 반영
- [ ] 자막 위치·폰트크기·색상·외곽선·그림자·배경박스 편집 → 즉시 반영
- [ ] 오버레이 이미지·위치·크기 편집 → 즉시 반영
- [ ] `[전역 기본값으로 저장]` → localStorage 저장 → 앱 재시작 후 유지
- [ ] `[이 항목에 적용]` → DB 저장 → 항목 전환 시 설정 복원
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm run build` 성공
