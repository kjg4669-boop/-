# Urgent Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Error Boundary로 WSOD(흰 화면) 방지 + 파일 메뉴 4개 활성화 + 서비스 저장/불러오기 구현

**Architecture:** React class 기반 ErrorBoundary로 Controller/Output 창 보호. queueStore에 `isDirty` 상태 추가 → 메뉴 IPC 리스너가 ServiceListModal/SaveServiceModal을 열고 serviceDb를 통해 SQLite에 저장/로드. 저장되지 않은 서비스는 `id: -1` 임시 상태로 표현.

**Tech Stack:** React 19 (class component for ErrorBoundary), Zustand 5, tauri-plugin-sql (SQLite), Tailwind CSS v4

---

## File Map

| 작업 | 파일 |
|------|------|
| 생성 | `components/ErrorBoundary.tsx` |
| 수정 | `app/controller/page.tsx` |
| 수정 | `app/output/page.tsx` |
| 수정 | `stores/queueStore.ts` |
| 수정 | `lib/db.ts` |
| 생성 | `components/controller/ServiceListModal.tsx` |
| 생성 | `components/controller/SaveServiceModal.tsx` |

---

## Task 1: ErrorBoundary 컴포넌트 생성

**Files:**
- Create: `components/ErrorBoundary.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: "blackout" | "message";
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (this.props.fallback === "blackout") {
      return <div className="w-full h-full bg-black" />;
    }

    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 text-white gap-4">
        <p className="text-xl font-semibold text-red-400">오류가 발생했습니다</p>
        <p className="text-sm text-zinc-500 max-w-sm text-center">
          {this.state.error?.message ?? "알 수 없는 오류"}
        </p>
        <button
          className="px-4 py-2 bg-zinc-700 hover:bg-zinc-600 rounded text-sm"
          onClick={() => window.location.reload()}
        >
          새로고침
        </button>
      </div>
    );
  }
}
```

- [ ] **Step 2: TypeScript 오류 없는지 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

Expected: 오류 없음 (또는 기존 오류만 출력)

---

## Task 2: Controller 페이지에 ErrorBoundary 적용

**Files:**
- Modify: `app/controller/page.tsx`

- [ ] **Step 1: import 추가 (파일 상단 import 블록 안)**

`app/controller/page.tsx` 의 line 1 (`"use client";`) 바로 다음, 기존 import 목록에 추가:

```tsx
import ErrorBoundary from "@/components/ErrorBoundary";
```

- [ ] **Step 2: return 문 전체를 ErrorBoundary로 감싸기**

`app/controller/page.tsx`의 `return (` 부분을 찾아서:

기존:
```tsx
  return (
    <div className="flex flex-col h-screen bg-zinc-900 text-white select-none overflow-hidden">
```

변경:
```tsx
  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen bg-zinc-900 text-white select-none overflow-hidden">
```

그리고 파일 맨 끝 닫는 태그 직전에 `</ErrorBoundary>` 추가:

기존 (파일 마지막 줄):
```tsx
}
```

변경 — 파일의 마지막 `</div>` 바로 다음:
```tsx
    </div>
    </ErrorBoundary>
  );
}
```

- [ ] **Step 3: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

---

## Task 3: Output 페이지에 ErrorBoundary 적용

**Files:**
- Modify: `app/output/page.tsx`

- [ ] **Step 1: import 추가**

`app/output/page.tsx` 상단 import 목록에:

```tsx
import ErrorBoundary from "@/components/ErrorBoundary";
```

- [ ] **Step 2: return 문 감싸기**

`app/output/page.tsx`의 `return (` 를 찾아서 전체 JSX를 감쌈:

기존:
```tsx
  return (
    <div
```

변경:
```tsx
  return (
    <ErrorBoundary fallback="blackout">
    <div
```

파일 맨 끝 닫는 `</div>` 다음:
```tsx
    </div>
    </ErrorBoundary>
  );
}
```

---

## Task 4: queueStore에 isDirty 상태 추가

**Files:**
- Modify: `stores/queueStore.ts`

- [ ] **Step 1: QueueState interface에 필드 추가**

`stores/queueStore.ts` line 15의 `interface QueueState {` 블록에 다음 3개 필드 추가:

기존:
```ts
interface QueueState {
  currentService: Service | null;
  activeItemIndex: number;
  activeLyricSlideIndex: number;
  setCurrentService: (service: Service | null) => void;
```

변경:
```ts
interface QueueState {
  currentService: Service | null;
  activeItemIndex: number;
  activeLyricSlideIndex: number;
  isDirty: boolean;
  setCurrentService: (service: Service | null) => void;
  setIsDirty: (v: boolean) => void;
  updateCurrentServiceMeta: (updates: Partial<Pick<Service, "id" | "name" | "date">>) => void;
```

- [ ] **Step 2: 초기값 및 구현 추가**

`stores/queueStore.ts` line 40의 `export const useQueueStore = create<QueueState>((set, get) => ({` 블록 내:

기존:
```ts
  currentService: null,
  activeItemIndex: -1,
  activeLyricSlideIndex: 0,

  setCurrentService: (service) => set({ currentService: service, activeItemIndex: -1, activeLyricSlideIndex: 0 }),
```

변경:
```ts
  currentService: null,
  activeItemIndex: -1,
  activeLyricSlideIndex: 0,
  isDirty: false,

  setCurrentService: (service) => set({ currentService: service, activeItemIndex: -1, activeLyricSlideIndex: 0, isDirty: false }),

  setIsDirty: (v) => set({ isDirty: v }),

  updateCurrentServiceMeta: (updates) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, ...updates }, isDirty: false });
    }
  },
```

- [ ] **Step 3: updateServiceItems가 isDirty를 true로 설정하도록 수정**

기존:
```ts
  updateServiceItems: (items) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items } });
    }
  },
```

변경:
```ts
  updateServiceItems: (items) => {
    const { currentService } = get();
    if (currentService) {
      set({ currentService: { ...currentService, items }, isDirty: true });
    }
  },
```

- [ ] **Step 4: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

---

## Task 5: serviceDb에 saveItems, rename 추가

**Files:**
- Modify: `lib/db.ts`

- [ ] **Step 1: saveItems 메서드 추가**

`lib/db.ts` line 238의 `async delete(id: number)` 메서드 바로 앞에 삽입:

```ts
  async saveItems(serviceId: number, items: ServiceItem[]): Promise<void> {
    const conn = await getDb();
    await conn.execute("BEGIN");
    try {
      await conn.execute("DELETE FROM service_items WHERE service_id = ?", [serviceId]);
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        await conn.execute(
          "INSERT INTO service_items (service_id, item_order, type, song_id, media_id, settings_json, label) VALUES (?, ?, ?, ?, ?, ?, ?)",
          [serviceId, i, item.type, item.song_id ?? null, item.media_id ?? null, JSON.stringify(item.settings_json), item.label]
        );
      }
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
  },

  async rename(id: number, name: string): Promise<void> {
    const conn = await getDb();
    await conn.execute("UPDATE services SET name = ? WHERE id = ?", [name, id]);
  },
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

---

## Task 6: ServiceListModal 생성

**Files:**
- Create: `components/controller/ServiceListModal.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { serviceDb } from "@/lib/db";
import type { Service } from "@/lib/types";

interface Props {
  onLoad: (service: Service) => void;
  onClose: () => void;
}

export default function ServiceListModal({ onLoad, onClose }: Props) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingId, setLoadingId] = useState<number | null>(null);

  useEffect(() => {
    serviceDb.list().then((list) => {
      setServices(list);
      setLoading(false);
    });
  }, []);

  async function handleLoad(id: number) {
    setLoadingId(id);
    try {
      const service = await serviceDb.get(id);
      if (service) onLoad(service);
    } finally {
      setLoadingId(null);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!confirm(`"${name}" 예배를 삭제하시겠습니까?`)) return;
    await serviceDb.delete(id);
    setServices((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg w-96 max-h-[70vh] flex flex-col shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="font-semibold text-white text-sm">예배 불러오기</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading && <p className="text-zinc-400 text-sm p-4">불러오는 중...</p>}
          {!loading && services.length === 0 && (
            <p className="text-zinc-400 text-sm p-4 text-center">저장된 예배가 없습니다.</p>
          )}
          {services.map((s) => (
            <div
              key={s.id}
              className="flex items-center gap-2 px-4 py-2.5 hover:bg-zinc-700/50 border-b border-zinc-700/40"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{s.name}</p>
                <p className="text-xs text-zinc-400">{s.date}</p>
              </div>
              <button
                onClick={() => handleLoad(s.id)}
                disabled={loadingId === s.id}
                className="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white shrink-0"
              >
                {loadingId === s.id ? "..." : "불러오기"}
              </button>
              <button
                onClick={() => handleDelete(s.id, s.name)}
                className="px-2 py-1 text-xs bg-zinc-600 hover:bg-red-700 rounded text-zinc-300 shrink-0"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

---

## Task 7: SaveServiceModal 생성

**Files:**
- Create: `components/controller/SaveServiceModal.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useState } from "react";

interface Props {
  initialName?: string;
  onSave: (name: string) => void;
  onClose: () => void;
}

export default function SaveServiceModal({ initialName = "", onSave, onClose }: Props) {
  const [name, setName] = useState(initialName);
  const trimmed = name.trim();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!trimmed) return;
    onSave(trimmed);
  }

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-zinc-800 rounded-lg w-80 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700">
          <h2 className="font-semibold text-white text-sm">예배 저장</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-white text-lg leading-none">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-4 flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-zinc-400">예배 이름</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              placeholder="주일예배 2부"
              className="px-3 py-2 rounded bg-zinc-700 text-white text-sm border border-zinc-600 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-sm bg-zinc-700 hover:bg-zinc-600 rounded text-zinc-300"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={!trimmed}
              className="px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-white"
            >
              저장
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

---

## Task 8: Controller 페이지에 메뉴 리스너 + 저장/로드 연결

**Files:**
- Modify: `app/controller/page.tsx`

- [ ] **Step 1: import 추가**

파일 상단 import 블록에 추가 (ErrorBoundary import 다음):

```tsx
import ServiceListModal from "@/components/controller/ServiceListModal";
import SaveServiceModal from "@/components/controller/SaveServiceModal";
```

- [ ] **Step 2: useQueueStore destructuring에 isDirty, setIsDirty, updateCurrentServiceMeta 추가**

기존 (line 29 근처):
```tsx
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    updateSlideCanvas,
    updateServiceItems,
    getFlatSlideList,
    getActiveFlatSlideIndex,
  } = useQueueStore();
```

변경:
```tsx
  const {
    nextLyricSlide,
    prevLyricSlide,
    activeItemIndex,
    activeLyricSlideIndex,
    currentService,
    isDirty,
    updateSlideCanvas,
    updateServiceItems,
    getFlatSlideList,
    getActiveFlatSlideIndex,
  } = useQueueStore();
```

- [ ] **Step 3: 모달 state 추가**

`const [pendingAddBlockRef...]` 선언 근처, 기존 useState 블록 끝에 추가:

```tsx
  const [showServiceList, setShowServiceList] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
```

- [ ] **Step 4: 저장/로드 핸들러 함수 추가**

기존 `openOutput` 함수 정의 바로 다음에 삽입:

```tsx
  const handleSave = useCallback(async () => {
    const store = useQueueStore.getState();
    const svc = store.currentService;
    if (!svc) return;
    if (svc.id === -1) {
      // 한 번도 저장 안 된 상태 → 이름 입력 모달
      setShowSaveModal(true);
      return;
    }
    try {
      await serviceDb.saveItems(svc.id, svc.items);
      store.setIsDirty(false);
    } catch (e) {
      console.error("[save]", e);
    }
  }, []);

  const handleSaveAs = useCallback(async (name: string) => {
    const store = useQueueStore.getState();
    const svc = store.currentService;
    const date = new Date().toISOString().slice(0, 10);
    try {
      const newId = await serviceDb.create(name, date);
      const items = svc?.items ?? [];
      await serviceDb.saveItems(newId, items);
      store.updateCurrentServiceMeta({ id: newId, name, date });
      setShowSaveModal(false);
    } catch (e) {
      console.error("[saveAs]", e);
    }
  }, []);

  const handleLoadService = useCallback((service: import("@/lib/types").Service) => {
    useQueueStore.getState().setCurrentService(service);
    setShowServiceList(false);
  }, []);

  const handleNewService = useCallback(() => {
    const store = useQueueStore.getState();
    if (store.isDirty) {
      if (!confirm("저장되지 않은 변경사항이 있습니다. 새 예배를 시작하시겠습니까?")) return;
    }
    const date = new Date().toISOString().slice(0, 10);
    store.setCurrentService({ id: -1, name: "새 예배", date, items: [] });
  }, []);
```

- [ ] **Step 5: 메뉴 리스너 useEffect에 4개 리스너 추가**

기존 (line 407~428):
```tsx
  useEffect(() => {
    let unlistens: Array<() => void> = [];
    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistens = await Promise.all([
          listen("menu:open-output",      () => openOutputRef.current()),
          listen("menu:close-output",     () => ipc.closeOutputWindow().catch(() => {})),
          listen("menu:show-from-start",  () => {
            useQueueStore.getState().setActiveFlatSlide(0);
            openOutputRef.current();
          }),
          listen("menu:show-from-current", () => openOutputRef.current()),
          listen("menu:hide-slide",        () => setIsClear((v) => !v)),
          listen("menu:add-song",          () => { setShowPanel(true); setRightTab("songs"); }),
        ]);
      } catch (e) { console.error("[menu setup]", e); }
    }
    setup();
    return () => { unlistens.forEach((fn) => fn()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

변경:
```tsx
  useEffect(() => {
    let unlistens: Array<() => void> = [];
    async function setup() {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlistens = await Promise.all([
          listen("menu:open-output",      () => openOutputRef.current()),
          listen("menu:close-output",     () => ipc.closeOutputWindow().catch(() => {})),
          listen("menu:show-from-start",  () => {
            useQueueStore.getState().setActiveFlatSlide(0);
            openOutputRef.current();
          }),
          listen("menu:show-from-current", () => openOutputRef.current()),
          listen("menu:hide-slide",        () => setIsClear((v) => !v)),
          listen("menu:add-song",          () => { setShowPanel(true); setRightTab("songs"); }),
          listen("menu:new-service",       () => handleNewService()),
          listen("menu:open-service",      () => setShowServiceList(true)),
          listen("menu:save-service",      () => handleSave()),
          listen("menu:save-as",           () => setShowSaveModal(true)),
        ]);
      } catch (e) { console.error("[menu setup]", e); }
    }
    setup();
    return () => { unlistens.forEach((fn) => fn()); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

- [ ] **Step 6: 리본 서비스 이름 표시에 isDirty 인디케이터 추가**

기존 (line 450 근처):
```tsx
        <span className="text-zinc-400 truncate max-w-[140px]">{currentService?.name ?? "예배 없음"}</span>
```

변경:
```tsx
        <span className="text-zinc-400 truncate max-w-[140px]">
          {currentService?.name ?? "예배 없음"}{isDirty ? " *" : ""}
        </span>
```

- [ ] **Step 7: JSX 최하단 (</ErrorBoundary> 바로 위)에 모달 렌더링 추가**

파일 맨 끝 `</ErrorBoundary>` 바로 위에:

```tsx
      {showServiceList && (
        <ServiceListModal
          onLoad={handleLoadService}
          onClose={() => setShowServiceList(false)}
        />
      )}
      {showSaveModal && (
        <SaveServiceModal
          initialName={currentService?.name !== "새 예배" ? (currentService?.name ?? "") : ""}
          onSave={handleSaveAs}
          onClose={() => setShowSaveModal(false)}
        />
      )}
```

- [ ] **Step 8: 최종 TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1
```

Expected: 오류 없음

- [ ] **Step 9: 빌드 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npm run build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` 또는 `Route (app)` 테이블 출력
