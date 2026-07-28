# 예배 순서 편집기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QueuePanel에 예배 생성·편집 모드를 추가해 예배 순서를 앱 안에서 만들고 관리할 수 있게 한다.

**Architecture:** QueuePanel.tsx 단일 파일에 `isEditing` 상태로 보기/편집 모드를 전환. 새 예배 생성, 항목 추가(찬양/기도안내/블랭크), 순서 변경(↑↓), 삭제(✕)를 모두 인라인으로 처리. DB 작업은 기존 `serviceDb` CRUD를 그대로 활용.

**Tech Stack:** Next.js 16 ("use client"), TypeScript, Tailwind CSS v4, Zustand v5, tauri-plugin-sql (SQLite)

> ⚠️ **테스트**: Tauri 데스크탑 앱 — 자동화 테스트 없음. 각 태스크 검증은 `source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev` 실행 후 수동 확인.

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `components/controller/QueuePanel.tsx` | 전면 확장 (편집 모드, 새 예배 폼, 항목 추가 패널) |

---

## 참고: 관련 타입 및 API

```ts
// lib/types.ts
export type ServiceItemType = "song" | "video" | "announcement" | "scripture" | "blank";

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

export interface Song {
  id: number;
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
  created_at: string;
  updated_at: string;
}
```

```ts
// lib/db.ts — serviceDb API
serviceDb.list(): Promise<Service[]>          // items: []
serviceDb.get(id): Promise<Service | null>    // items: 채워짐
serviceDb.create(name, date): Promise<number>
serviceDb.addItem(serviceId, item: Omit<ServiceItem, "id">): Promise<number>
serviceDb.reorderItems(serviceId, orderedIds: number[]): Promise<void>
serviceDb.deleteItem(itemId): Promise<void>

// lib/db.ts — songDb API
songDb.list(): Promise<Song[]>
songDb.search(query): Promise<Song[]>
```

```ts
// stores/queueStore.ts — 사용 가능한 actions
const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();
// updateServiceItems(items: ServiceItem[]): void — 서비스 아이템 로컬 업데이트
```

---

## Task 1: 편집 모드 토글 + 헤더 UI

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

- [ ] **Step 1: 편집 모드 state 및 헤더 버튼 추가**

`components/controller/QueuePanel.tsx`를 아래로 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="flex items-center gap-1">
            <span className="flex-1 text-xs text-zinc-300 truncate">
              {currentService?.name ?? "예배 없음"}
            </span>
            <button
              onClick={() => setIsEditing(false)}
              className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
            >
              ✓ 완료
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => loadService(Number(e.target.value))}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            {currentService && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                편집
              </button>
            )}
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => !isEditing && setActiveItem(i)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                !isEditing && i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
              }`}
            >
              <div className="font-medium text-white">
                {item.song?.title ?? item.label ?? item.type}
              </div>
              {item.song?.artist && (
                <div className="text-zinc-500">{item.song.artist}</div>
              )}
              <div className="text-zinc-600 capitalize">{item.type}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "feat: add edit mode toggle to QueuePanel header"
```

---

## Task 2: 새 예배 생성 폼

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

편집 모드 헤더에 `[새 예배]` 버튼과 인라인 생성 폼을 추가.

- [ ] **Step 1: 새 예배 state 및 생성 로직 추가**

`components/controller/QueuePanel.tsx`를 아래로 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  async function handleCreateService() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await serviceDb.create(newName.trim(), newDate);
      const updated = await serviceDb.list();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) setCurrentService(service);
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      // creation failed silently for now
    } finally {
      setCreating(false);
    }
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => { setShowNewForm((v) => !v); }}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                + 새 예배
              </button>
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {currentService?.name ?? "예배 없음"}
              </span>
              <button
                onClick={() => { setIsEditing(false); setShowNewForm(false); }}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
              >
                ✓ 완료
              </button>
            </div>
            {showNewForm && (
              <div className="space-y-1 pt-1 border-t border-zinc-700">
                <input
                  type="text"
                  placeholder="예배 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateService}
                    disabled={creating || !newName.trim()}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {creating ? "생성 중..." : "만들기"}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 text-xs py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => loadService(Number(e.target.value))}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            {currentService && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                편집
              </button>
            )}
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) => (
            <button
              key={item.id}
              onClick={() => !isEditing && setActiveItem(i)}
              className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                !isEditing && i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
              }`}
            >
              <div className="font-medium text-white">
                {item.song?.title ?? item.label ?? item.type}
              </div>
              {item.song?.artist && (
                <div className="text-zinc-500">{item.song.artist}</div>
              )}
              <div className="text-zinc-600 capitalize">{item.type}</div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "feat: add new service creation form to QueuePanel"
```

---

## Task 3: 편집 모드 항목 목록 (↑↓✕)

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

편집 모드에서 항목에 순서 변경(↑↓)과 삭제(✕) 버튼 표시.

- [ ] **Step 1: 순서 변경 및 삭제 핸들러 + 편집 모드 항목 UI 추가**

`components/controller/QueuePanel.tsx`를 아래로 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  async function handleCreateService() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await serviceDb.create(newName.trim(), newDate);
      const updated = await serviceDb.list();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) setCurrentService(service);
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    if (!currentService) return;
    const items = [...currentService.items];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    const orderedIds = items.map((item) => item.id);
    await serviceDb.reorderItems(currentService.id, orderedIds);
    updateServiceItems(items);
  }

  async function deleteItem(itemId: number) {
    if (!currentService) return;
    await serviceDb.deleteItem(itemId);
    updateServiceItems(currentService.items.filter((i) => i.id !== itemId));
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                + 새 예배
              </button>
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {currentService?.name ?? "예배 없음"}
              </span>
              <button
                onClick={() => { setIsEditing(false); setShowNewForm(false); }}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
              >
                ✓ 완료
              </button>
            </div>
            {showNewForm && (
              <div className="space-y-1 pt-1 border-t border-zinc-700">
                <input
                  type="text"
                  placeholder="예배 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateService}
                    disabled={creating || !newName.trim()}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {creating ? "생성 중..." : "만들기"}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 text-xs py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => loadService(Number(e.target.value))}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            {currentService && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                편집
              </button>
            )}
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) =>
            isEditing ? (
              <div
                key={item.id}
                className="flex items-center px-2 py-1.5 text-xs border-b border-zinc-800 gap-1"
              >
                <span className="flex-1 truncate text-white">
                  {item.song?.title ?? item.label ?? item.type}
                </span>
                <button
                  onClick={() => moveItem(i, "up")}
                  disabled={i === 0}
                  className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveItem(i, "down")}
                  disabled={i === items.length - 1}
                  className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
                >
                  ↓
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="px-1 text-zinc-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                key={item.id}
                onClick={() => setActiveItem(i)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                  i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
                }`}
              >
                <div className="font-medium text-white">
                  {item.song?.title ?? item.label ?? item.type}
                </div>
                {item.song?.artist && (
                  <div className="text-zinc-500">{item.song.artist}</div>
                )}
                <div className="text-zinc-600 capitalize">{item.type}</div>
              </button>
            )
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "feat: add item reorder and delete in edit mode"
```

---

## Task 4: 항목 추가 패널 (찬양/기도안내/블랭크)

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

편집 모드 하단에 `[+ 항목 추가]` 버튼과 추가 패널(3개 탭) 추가.

- [ ] **Step 1: 항목 추가 state, 핸들러, UI 추가**

`components/controller/QueuePanel.tsx`를 아래 최종 버전으로 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useQueueStore } from "@/stores/queueStore";
import { serviceDb, songDb } from "@/lib/db";
import type { Service, Song } from "@/lib/types";

export default function QueuePanel() {
  const [services, setServices] = useState<Service[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  // New service form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("주일예배");
  const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [creating, setCreating] = useState(false);
  // Add panel
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [addTab, setAddTab] = useState<"song" | "announcement" | "blank">("song");
  const [addSearch, setAddSearch] = useState("");
  const [addSongs, setAddSongs] = useState<Song[]>([]);
  const [addLabel, setAddLabel] = useState("");

  const { currentService, activeItemIndex, setCurrentService, setActiveItem, updateServiceItems } = useQueueStore();

  useEffect(() => {
    serviceDb.list().then(setServices).catch(console.error);
  }, []);

  useEffect(() => {
    if (showAddPanel && addTab === "song") {
      songDb.list().then(setAddSongs).catch(console.error);
    }
  }, [showAddPanel, addTab]);

  async function loadService(id: number) {
    const service = await serviceDb.get(id);
    if (service) setCurrentService(service);
  }

  async function handleCreateService() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const id = await serviceDb.create(newName.trim(), newDate);
      const updated = await serviceDb.list();
      setServices(updated);
      const service = await serviceDb.get(id);
      if (service) setCurrentService(service);
      setShowNewForm(false);
      setNewName("주일예배");
      setNewDate(new Date().toISOString().slice(0, 10));
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  }

  async function moveItem(index: number, direction: "up" | "down") {
    if (!currentService) return;
    const items = [...currentService.items];
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= items.length) return;
    [items[index], items[swapIndex]] = [items[swapIndex], items[index]];
    await serviceDb.reorderItems(currentService.id, items.map((i) => i.id));
    updateServiceItems(items);
  }

  async function deleteItem(itemId: number) {
    if (!currentService) return;
    await serviceDb.deleteItem(itemId);
    updateServiceItems(currentService.items.filter((i) => i.id !== itemId));
  }

  async function addSongItem(song: Song) {
    if (!currentService) return;
    const item_order = currentService.items.length;
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order,
      type: "song",
      song_id: song.id,
      media_id: undefined,
      settings_json: {},
      label: song.title,
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) setCurrentService(updated);
  }

  async function addAnnouncementItem() {
    if (!currentService || !addLabel.trim()) return;
    const item_order = currentService.items.length;
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order,
      type: "announcement",
      song_id: undefined,
      media_id: undefined,
      settings_json: {},
      label: addLabel.trim(),
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) setCurrentService(updated);
    setAddLabel("");
  }

  async function addBlankItem() {
    if (!currentService) return;
    const item_order = currentService.items.length;
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order,
      type: "blank",
      song_id: undefined,
      media_id: undefined,
      settings_json: {},
      label: "블랭크",
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) setCurrentService(updated);
  }

  async function handleAddSearch(q: string) {
    setAddSearch(q);
    const results = q ? await songDb.search(q) : await songDb.list();
    setAddSongs(results);
  }

  const items = currentService?.items ?? [];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-2 border-b border-zinc-700">
        {isEditing ? (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowNewForm((v) => !v)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                + 새 예배
              </button>
              <span className="flex-1 text-xs text-zinc-300 truncate">
                {currentService?.name ?? "예배 없음"}
              </span>
              <button
                onClick={() => { setIsEditing(false); setShowNewForm(false); setShowAddPanel(false); }}
                className="text-xs px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded"
              >
                ✓ 완료
              </button>
            </div>
            {showNewForm && (
              <div className="space-y-1 pt-1 border-t border-zinc-700">
                <input
                  type="text"
                  placeholder="예배 이름"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <input
                  type="date"
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-full bg-zinc-900 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                />
                <div className="flex gap-1">
                  <button
                    onClick={handleCreateService}
                    disabled={creating || !newName.trim()}
                    className="flex-1 text-xs py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
                  >
                    {creating ? "생성 중..." : "만들기"}
                  </button>
                  <button
                    onClick={() => setShowNewForm(false)}
                    className="flex-1 text-xs py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <select
              className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
              onChange={(e) => loadService(Number(e.target.value))}
              value={currentService?.id ?? ""}
            >
              <option value="">-- 예배 선택 --</option>
              {services.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.date})</option>
              ))}
            </select>
            {currentService && (
              <button
                onClick={() => setIsEditing(true)}
                className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
              >
                편집
              </button>
            )}
          </div>
        )}
      </div>

      {/* Queue items */}
      <div className="flex-1 overflow-y-auto">
        {items.length === 0 ? (
          <p className="text-xs text-zinc-500 p-3">예배 순서가 없습니다</p>
        ) : (
          items.map((item, i) =>
            isEditing ? (
              <div
                key={item.id}
                className="flex items-center px-2 py-1.5 text-xs border-b border-zinc-800 gap-1"
              >
                <span className="flex-1 truncate text-white">
                  {item.song?.title ?? item.label ?? item.type}
                </span>
                <button
                  onClick={() => moveItem(i, "up")}
                  disabled={i === 0}
                  className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveItem(i, "down")}
                  disabled={i === items.length - 1}
                  className="px-1 text-zinc-400 hover:text-white disabled:opacity-20"
                >
                  ↓
                </button>
                <button
                  onClick={() => deleteItem(item.id)}
                  className="px-1 text-zinc-500 hover:text-red-400"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                key={item.id}
                onClick={() => setActiveItem(i)}
                className={`w-full text-left px-3 py-2 text-xs border-b border-zinc-800 hover:bg-zinc-700 transition-colors ${
                  i === activeItemIndex ? "bg-blue-900 border-l-2 border-l-blue-400" : ""
                }`}
              >
                <div className="font-medium text-white">
                  {item.song?.title ?? item.label ?? item.type}
                </div>
                {item.song?.artist && (
                  <div className="text-zinc-500">{item.song.artist}</div>
                )}
                <div className="text-zinc-600 capitalize">{item.type}</div>
              </button>
            )
          )
        )}
      </div>

      {/* Add panel (edit mode only) */}
      {isEditing && currentService && (
        <div className="border-t border-zinc-700">
          <button
            onClick={() => setShowAddPanel((v) => !v)}
            className="w-full py-1.5 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
          >
            {showAddPanel ? "▲ 닫기" : "+ 항목 추가"}
          </button>

          {showAddPanel && (
            <div className="border-t border-zinc-700 bg-zinc-900">
              {/* Tabs */}
              <div className="flex border-b border-zinc-700">
                {(["song", "announcement", "blank"] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setAddTab(tab)}
                    className={`flex-1 py-1 text-xs ${
                      addTab === tab
                        ? "bg-zinc-700 text-white"
                        : "text-zinc-500 hover:text-white"
                    }`}
                  >
                    {tab === "song" ? "찬양" : tab === "announcement" ? "기도·안내" : "블랭크"}
                  </button>
                ))}
              </div>

              {/* Song tab */}
              {addTab === "song" && (
                <div className="flex flex-col" style={{ maxHeight: 180 }}>
                  <div className="p-1.5">
                    <input
                      type="text"
                      placeholder="찬양 검색..."
                      value={addSearch}
                      onChange={(e) => handleAddSearch(e.target.value)}
                      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                    />
                  </div>
                  <div className="overflow-y-auto flex-1">
                    {addSongs.map((song) => (
                      <button
                        key={song.id}
                        onClick={() => addSongItem(song)}
                        className="w-full text-left px-2 py-1.5 text-xs border-b border-zinc-800 hover:bg-zinc-700"
                      >
                        <div className="text-white truncate">{song.title}</div>
                        {song.artist && (
                          <div className="text-zinc-500 text-xs">{song.artist}</div>
                        )}
                      </button>
                    ))}
                    {addSongs.length === 0 && (
                      <p className="text-xs text-zinc-600 p-2">찬양이 없습니다</p>
                    )}
                  </div>
                </div>
              )}

              {/* Announcement tab */}
              {addTab === "announcement" && (
                <div className="p-1.5 space-y-1">
                  <input
                    type="text"
                    placeholder="항목 이름 (예: 대표기도)"
                    value={addLabel}
                    onChange={(e) => setAddLabel(e.target.value)}
                    className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={addAnnouncementItem}
                    disabled={!addLabel.trim()}
                    className="w-full text-xs py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded"
                  >
                    + 추가
                  </button>
                </div>
              )}

              {/* Blank tab */}
              {addTab === "blank" && (
                <div className="p-1.5">
                  <button
                    onClick={addBlankItem}
                    className="w-full text-xs py-1.5 bg-zinc-700 hover:bg-zinc-600 rounded"
                  >
                    + 블랭크 추가
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 3: Next.js 빌드 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npm run build 2>&1 | tail -15
```

- [ ] **Step 4: 수동 동작 확인**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

**새 예배 생성:**
1. 큐시트 탭 → 예배 선택 없이 `편집` 버튼이 없음 확인
2. 예배 선택 후 `편집` 클릭 → 편집 모드 전환 확인
3. `+ 새 예배` → 이름/날짜 입력 → `만들기` → 드롭다운에 나타나는지 확인

**항목 추가:**
1. 편집 모드에서 `+ 항목 추가` → 패널 열림
2. 찬양 탭 → 찬양 클릭 → 목록에 추가됨
3. 기도·안내 탭 → 이름 입력 → 추가
4. 블랭크 탭 → 추가

**순서 변경/삭제:**
1. ↑↓ 버튼으로 순서 변경 → 목록 재정렬 확인
2. ✕로 항목 삭제 → 목록에서 제거 확인

- [ ] **Step 5: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "feat: add item add panel (song/announcement/blank) to service editor"
```

---

## 완료 기준

- [ ] 예배가 없을 때 `편집` 버튼이 보이지 않음
- [ ] 새 예배 생성 → 드롭다운 반영 + 자동 선택
- [ ] 편집 모드에서 ↑↓로 순서 변경 → DB 반영
- [ ] 편집 모드에서 ✕로 삭제 → DB 반영
- [ ] 찬양/기도안내/블랭크 항목 추가 → 목록 반영
- [ ] 완료 버튼 → 보기 모드 복귀, 항목 클릭으로 슬라이드 송출 정상 작동
- [ ] `npx tsc --noEmit` 에러 없음
- [ ] `npm run build` 성공
