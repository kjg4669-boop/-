# IPC Fix + 찬양 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 슬라이드 이동 시 출력창이 반응하도록 IPC 버그를 수정하고, 찬양 생성/편집 UI와 서비스 추가 기능을 구현한다.

**Architecture:** Controller page가 Zustand 슬라이드 상태 변화를 감지해 IPC를 중앙에서 발송하도록 변경. 찬양 편집은 LibraryPanel 내부 상태로 edit/list 모드를 전환하는 방식으로 구현. 새로운 SongEditor 컴포넌트가 블록 구조 가사 입력을 담당.

**Tech Stack:** Next.js 16 (App Router, `"use client"`), TypeScript, Tailwind CSS v4, Zustand v5, tauri-plugin-sql (SQLite)

> ⚠️ **테스트 환경**: 이 앱은 Tauri 데스크탑 앱으로 자동화 테스트 프레임워크가 없음. 각 태스크의 검증 단계는 `npm run tauri:dev` 실행 후 수동 확인으로 대체함.
> Dev 실행 명령: `source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev`

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `app/controller/page.tsx` | IPC 중앙화 useEffect 추가, 의존성 import 추가 |
| `components/controller/QueuePanel.tsx` | `selectItem`에서 IPC/layerConfig 로직 제거 |
| `components/controller/SongEditor.tsx` | **신규** - 찬양 편집 컴포넌트 |
| `components/controller/LibraryPanel.tsx` | edit/list 모드 상태, 더블클릭 핸들러, SongEditor 연결 |

---

## Task 1: IPC 버그 수정 — QueuePanel에서 IPC 로직 분리

**Files:**
- Modify: `components/controller/QueuePanel.tsx` (lines 25-41)

현재 `selectItem()`이 `setLayerConfig` + `ipc.sendSlideUpdate`를 직접 호출한다.
이 로직을 controller로 이전하기 위해 먼저 QueuePanel에서 제거한다.

- [ ] **Step 1: QueuePanel의 selectItem 단순화**

`components/controller/QueuePanel.tsx`에서 `selectItem` 함수를 아래와 같이 교체:

```tsx
// 변경 전 (lines 13-41 참고)
// const { ..., getActiveLyricSlide } = useQueueStore();
// const { setLayerConfig, layerConfig } = useOutputStore();

// 변경 후: useOutputStore import 제거, getActiveLyricSlide 제거
```

파일 상단 import를 아래로 교체 (`useOutputStore`, `ipc`, `DEFAULT_LAYER_CONFIG` 제거):
```tsx
import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";
```

`selectItem` 함수를:

```tsx
function selectItem(index: number) {
  setActiveItem(index);
}
```

상단 hook 선언도 수정:
```tsx
const { currentService, activeItemIndex, activeLyricSlideIndex, setCurrentService, setActiveItem } = useQueueStore();
```

(`getActiveLyricSlide`, `setLayerConfig`, `layerConfig` 제거)

또한 파일에서 불필요해진 import 정리:
```tsx
// 제거할 것들:
// import { useOutputStore } from "@/stores/outputStore";
// DEFAULT_LAYER_CONFIG (selectItem에서 더 이상 사용 안 함)
// ipc (selectItem에서 더 이상 사용 안 함)
```

단, `ipc`와 `DEFAULT_LAYER_CONFIG`는 QueuePanel에서 완전히 제거 (controller로 이전됨).

- [ ] **Step 2: TypeScript 에러 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

에러 없으면 다음 단계 진행.

---

## Task 2: IPC 중앙화 — controller에 슬라이드 변화 감지 useEffect 추가

**Files:**
- Modify: `app/controller/page.tsx`

- [ ] **Step 1: controller/page.tsx 상단 import 및 hook 확장**

기존:
```tsx
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { ipc } from "@/lib/ipc";
import type { LayerConfig } from "@/lib/types";
```

아래로 교체:
```tsx
import { useQueueStore } from "@/stores/queueStore";
import { useOutputStore } from "@/stores/outputStore";
import { ipc } from "@/lib/ipc";
import { DEFAULT_LAYER_CONFIG, type LayerConfig } from "@/lib/types";
```

- [ ] **Step 2: hook 선언 확장**

기존:
```tsx
const { isBlackout, setBlackout, layerConfig } = useOutputStore();
const { nextLyricSlide, prevLyricSlide } = useQueueStore();
```

아래로 교체:
```tsx
const { isBlackout, setBlackout, layerConfig, setLayerConfig } = useOutputStore();
const {
  nextLyricSlide,
  prevLyricSlide,
  activeItemIndex,
  activeLyricSlideIndex,
  getActiveLyricSlide,
  getActiveItem,
} = useQueueStore();
```

- [ ] **Step 3: 슬라이드 상태 변화 감지 useEffect 추가**

`ControllerPage` 컴포넌트 내부, 기존 keyboard shortcut `useEffect` 아래에 추가:

```tsx
// Sync slide state → outputStore + IPC
useEffect(() => {
  const item = getActiveItem();
  if (!item) return;
  const slide = getActiveLyricSlide();
  const newConfig: LayerConfig = {
    ...DEFAULT_LAYER_CONFIG,
    subtitle: {
      ...DEFAULT_LAYER_CONFIG.subtitle,
      visible: !!slide,
      lines: slide?.lines ?? [],
    },
  };
  setLayerConfig(newConfig);
  ipc.sendSlideUpdate(newConfig);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeItemIndex, activeLyricSlideIndex]);
```

> 주의: `getActiveItem`/`getActiveLyricSlide`는 Zustand getter 함수로 deps에 포함하지 않아도 안전. 린터 경고는 eslint-disable 주석으로 억제.

- [ ] **Step 4: TypeScript 빌드 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

에러 없어야 함.

- [ ] **Step 5: 수동 동작 확인**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

1. 앱 실행 → 출력창 열기
2. 예배를 선택하고 찬양 항목 클릭
3. Space / → 키로 슬라이드 이동
4. **기대**: 출력창 자막이 슬라이드마다 업데이트됨
5. ← 키로 이전 슬라이드 이동 확인

- [ ] **Step 6: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add app/controller/page.tsx components/controller/QueuePanel.tsx
git commit -m "fix: centralize IPC slide updates in controller

Keyboard navigation (Space/Arrow) now properly updates output window.
Removed duplicate IPC logic from QueuePanel.selectItem."
```

---

## Task 3: SongEditor 컴포넌트 생성

**Files:**
- Create: `components/controller/SongEditor.tsx`

- [ ] **Step 1: SongEditor 파일 생성**

`components/controller/SongEditor.tsx` 파일 생성:

```tsx
"use client";

import { useState, useEffect } from "react";
import { songDb } from "@/lib/db";
import type { Song, LyricSection, LyricSlide } from "@/lib/types";

const SECTION_LABELS: Record<LyricSection, string> = {
  intro: "인트로",
  verse: "절",
  "pre-chorus": "프리코러스",
  chorus: "코러스",
  bridge: "브릿지",
  outro: "아웃트로",
};

const SECTION_OPTIONS: LyricSection[] = [
  "intro", "verse", "pre-chorus", "chorus", "bridge", "outro",
];

interface BlockInput {
  section: LyricSection;
  text: string;
}

interface Props {
  song: Song | null; // null = 신규
  onSave: (song: Song) => void;
  onCancel: () => void;
}

function parseBlocksToSlides(blocks: BlockInput[]): LyricSlide[] {
  const counts: Partial<Record<LyricSection, number>> = {};
  return blocks
    .filter((b) => b.text.trim())
    .map((block) => {
      counts[block.section] = (counts[block.section] ?? 0) + 1;
      const idx = counts[block.section]!;
      return {
        id: `${block.section}-${idx}`,
        section: block.section,
        sectionIndex: idx,
        lines: block.text.split("\n").filter((l) => l.trim()),
      };
    });
}

export default function SongEditor({ song, onSave, onCancel }: Props) {
  const [title, setTitle] = useState(song?.title ?? "");
  const [artist, setArtist] = useState(song?.artist ?? "");
  const [blocks, setBlocks] = useState<BlockInput[]>([
    { section: "verse", text: "" },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setTitle(song?.title ?? "");
    setArtist(song?.artist ?? "");
    if (song && song.lyrics_json.length > 0) {
      setBlocks(
        song.lyrics_json.map((slide) => ({
          section: slide.section,
          text: slide.lines.join("\n"),
        }))
      );
    } else {
      setBlocks([{ section: "verse", text: "" }]);
    }
  }, [song?.id]);

  function addBlock() {
    setBlocks((prev) => [...prev, { section: "verse", text: "" }]);
  }

  function removeBlock(i: number) {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateBlock(i: number, field: keyof BlockInput, value: string) {
    setBlocks((prev) =>
      prev.map((b, idx) =>
        idx === i ? { ...b, [field]: value } : b
      )
    );
  }

  async function handleSave() {
    if (!title.trim()) return;
    setSaving(true);
    try {
      const lyrics_json = parseBlocksToSlides(blocks);
      if (song) {
        await songDb.update(song.id, { title: title.trim(), artist: artist.trim(), lyrics_json });
        onSave({ ...song, title: title.trim(), artist: artist.trim(), lyrics_json });
      } else {
        const id = await songDb.create({
          title: title.trim(),
          artist: artist.trim(),
          lyrics_json,
        });
        onSave({
          id,
          title: title.trim(),
          artist: artist.trim(),
          lyrics_json,
          created_at: "",
          updated_at: "",
        });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700 flex items-center gap-2">
        <button
          onClick={onCancel}
          className="text-zinc-400 hover:text-white text-xs px-2 py-1 rounded hover:bg-zinc-700"
        >
          ← 목록
        </button>
        <span className="flex-1 text-xs text-zinc-400 truncate">
          {song ? song.title : "새 찬양"}
        </span>
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="text-xs px-3 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded"
        >
          {saving ? "저장 중..." : "저장"}
        </button>
      </div>

      {/* Fields */}
      <div className="p-2 border-b border-zinc-700 space-y-1">
        <input
          type="text"
          placeholder="제목 *"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
        <input
          type="text"
          placeholder="아티스트"
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
        />
      </div>

      {/* Blocks */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {blocks.map((block, i) => (
          <div key={i} className="border border-zinc-700 rounded p-2 space-y-1">
            <div className="flex items-center gap-1">
              <select
                value={block.section}
                onChange={(e) =>
                  updateBlock(i, "section", e.target.value as LyricSection)
                }
                className="bg-zinc-800 text-white text-xs rounded px-1 py-0.5 border border-zinc-600 outline-none"
              >
                {SECTION_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {SECTION_LABELS[s]}
                  </option>
                ))}
              </select>
              <span className="flex-1 text-xs text-zinc-500">블록 {i + 1}</span>
              {blocks.length > 1 && (
                <button
                  onClick={() => removeBlock(i)}
                  className="text-zinc-500 hover:text-red-400 text-xs px-1"
                >
                  ✕
                </button>
              )}
            </div>
            <textarea
              value={block.text}
              onChange={(e) => updateBlock(i, "text", e.target.value)}
              placeholder="가사를 입력하세요&#10;(Enter로 줄 구분)"
              rows={3}
              className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-700 outline-none focus:border-blue-500 resize-none"
            />
          </div>
        ))}

        <button
          onClick={addBlock}
          className="w-full py-1.5 text-xs text-zinc-400 border border-dashed border-zinc-600 rounded hover:border-zinc-400 hover:text-white transition-colors"
        >
          + 섹션 추가
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

에러 없어야 함.

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/SongEditor.tsx
git commit -m "feat: add SongEditor component with block-based lyrics input"
```

---

## Task 4: LibraryPanel — 편집 모드 + 더블클릭 서비스 추가

**Files:**
- Modify: `components/controller/LibraryPanel.tsx`

- [ ] **Step 1: LibraryPanel 전체 교체**

`components/controller/LibraryPanel.tsx`를 아래로 교체:

```tsx
"use client";

import { useEffect, useState, useRef } from "react";
import { songDb, mediaDb, serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";
import type { Song, MediaItem } from "@/lib/types";
import SongEditor from "./SongEditor";

interface Props {
  mode?: "media" | "songs";
}

export default function LibraryPanel({ mode = "media" }: Props) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [search, setSearch] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editSong, setEditSong] = useState<Song | null>(null); // null = 신규
  const [notice, setNotice] = useState("");

  const { currentService, setCurrentService } = useQueueStore();
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSongRef = useRef<Song | null>(null);

  useEffect(() => {
    if (mode === "songs") {
      songDb.list().then(setSongs).catch(console.error);
    } else {
      mediaDb.list().then(setMedia).catch(console.error);
    }
  }, [mode]);

  async function handleSearch(q: string) {
    setSearch(q);
    if (mode === "songs") {
      const results = q ? await songDb.search(q) : await songDb.list();
      setSongs(results);
    }
  }

  async function handleAddToService(song: Song) {
    if (!currentService) {
      setNotice("예배를 먼저 선택해주세요");
      setTimeout(() => setNotice(""), 1500);
      return;
    }
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order: currentService.items.length,
      type: "song",
      song_id: song.id,
      media_id: undefined,
      settings_json: {},
      label: song.title,
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) setCurrentService(updated);
    setNotice(`"${song.title}" 추가됨`);
    setTimeout(() => setNotice(""), 1500);
  }

  function handleSongClick(song: Song) {
    if (clickTimerRef.current !== null) {
      // Second click within 300ms → double click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      pendingSongRef.current = null;
      handleAddToService(song);
    } else {
      // First click — wait to see if double click follows
      pendingSongRef.current = song;
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        const s = pendingSongRef.current;
        pendingSongRef.current = null;
        if (s) {
          setEditSong(s);
          setEditMode(true);
        }
      }, 300);
    }
  }

  function handleNewSong() {
    setEditSong(null);
    setEditMode(true);
  }

  function handleSongSaved(saved: Song) {
    setEditMode(false);
    setEditSong(null);
    // Refresh list
    songDb.list().then(setSongs).catch(console.error);
  }

  function handleEditCancel() {
    setEditMode(false);
    setEditSong(null);
  }

  // Song edit mode
  if (mode === "songs" && editMode) {
    return (
      <SongEditor
        song={editSong}
        onSave={handleSongSaved}
        onCancel={handleEditCancel}
      />
    );
  }

  if (mode === "songs") {
    return (
      <div className="h-full flex flex-col">
        {/* Notice */}
        {notice && (
          <div className="px-3 py-1.5 bg-blue-900 text-blue-200 text-xs text-center">
            {notice}
          </div>
        )}
        <div className="p-2 border-b border-zinc-700 flex gap-1">
          <input
            type="text"
            placeholder="찬양 검색..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
          />
          <button
            onClick={handleNewSong}
            className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
          >
            + 새 찬양
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {songs.map((song) => (
            <div
              key={song.id}
              onClick={() => handleSongClick(song)}
              className="px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer select-none"
            >
              <div className="font-medium text-white">{song.title}</div>
              {song.artist && <div className="text-zinc-500">{song.artist}</div>}
              <div className="text-zinc-600">{song.lyrics_json.length}절</div>
            </div>
          ))}
          {songs.length === 0 && (
            <p className="text-xs text-zinc-500 p-3">찬양이 없습니다</p>
          )}
        </div>
        <div className="p-2 border-t border-zinc-800">
          <p className="text-xs text-zinc-600">클릭: 편집 · 더블클릭: 예배 추가</p>
        </div>
      </div>
    );
  }

  // Media mode (unchanged)
  return (
    <div className="h-full flex flex-col">
      <div className="p-2 border-b border-zinc-700">
        <p className="text-xs text-zinc-500">미디어 파일</p>
      </div>
      <div className="flex-1 overflow-y-auto">
        {media.map((item) => (
          <div
            key={item.id}
            className="px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer"
          >
            <div className="font-medium text-white">{item.name}</div>
            <div className="text-zinc-500 capitalize">{item.type}</div>
          </div>
        ))}
        {media.length === 0 && (
          <p className="text-xs text-zinc-500 p-3">미디어 파일이 없습니다</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 에러 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -30
```

에러 없어야 함.

- [ ] **Step 3: Next.js 빌드 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npm run build 2>&1 | tail -20
```

빌드 성공해야 함.

- [ ] **Step 4: 수동 동작 확인**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

**찬양 추가 확인:**
1. 찬양 탭 → "새 찬양" 버튼 클릭
2. 제목 "테스트 찬양", 가사 입력 → 저장
3. 목록에 나타나는지 확인

**편집 확인:**
1. 목록의 찬양 단일 클릭 → 편집 모드 진입 확인
2. 가사 수정 → 저장 → 목록으로 돌아오는지 확인

**서비스 추가 확인:**
1. 큐시트 탭에서 예배 선택
2. 찬양 탭으로 이동 → 찬양 더블클릭
3. 큐시트 탭에 항목이 추가되는지 확인
4. 예배 없을 때 더블클릭 → "예배를 먼저 선택해주세요" 알림 확인

- [ ] **Step 5: 최종 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/LibraryPanel.tsx
git commit -m "feat: add song library edit mode and double-click to add to service

- Single click opens SongEditor in panel
- Double click adds song to current service
- Inline notice for feedback (added / no service selected)"
```

---

## 완료 기준

- [ ] Space/화살표 키로 슬라이드 이동 시 출력창 자막 업데이트됨
- [ ] 새 찬양 생성 (제목 + 가사 블록) → DB 저장 → 목록 반영
- [ ] 기존 찬양 편집 → 저장 → 목록 반영
- [ ] 더블클릭으로 현재 예배에 찬양 추가됨
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm run build` 성공
