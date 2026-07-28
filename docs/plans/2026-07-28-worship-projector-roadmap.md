# worship-projector 개발 로드맵

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미디어 관리, 성경 브라우저, 영상 재생 컨트롤, 출력 모니터 선택 UI를 추가하여 실제 교회 예배 현장에서 운영 가능한 수준으로 완성한다.

**Architecture:**
- Phase 1 (미디어): 기존 `importMediaFile` + `mediaDb` 기반 위에 LibraryPanel UI 레이어만 추가. 썸네일은 이미지는 직접 표시, 영상은 `<video>` + Canvas API로 첫 프레임 캡처.
- Phase 2 (성경): 새 migration 003 + `lib/bibleDb.ts` + `BibleBrowser` 컴포넌트. 성경 데이터는 사용자가 JSON 파일로 임포트(저작권 이슈 회피).
- Phase 3 (영상 컨트롤): 새 IPC 이벤트 `video:control` 추가. `BackgroundLayer`에 `ref` 부착, `LayerSidebar`에 재생/일시정지/볼륨 UI.
- Phase 4 (모니터 선택): 기존 Rust `get_displays` 커맨드 활용. `settingsStore`에 `outputMonitorId` 추가, Controller 상단 설정 바에 드롭다운 노출.

**Tech Stack:** Next.js 16 (App Router, static export), Tauri v2, TypeScript, Tailwind CSS v4, Zustand v5, SQLite (tauri-plugin-sql), tauri-plugin-fs, tauri-plugin-dialog

---

## 현재 파일 구조 맵

```
worship-projector/
├── app/
│   ├── controller/page.tsx    # 메인 컨트롤러 (~1200줄) — Phase 3·4에서 수정
│   ├── output/page.tsx        # 출력 창 — Phase 3에서 수정
│   └── stage/page.tsx         # Stage Display
├── components/
│   ├── controller/
│   │   ├── QueuePanel.tsx          # 예배 큐 — 변경 없음
│   │   ├── LibraryPanel.tsx        # 찬양/미디어 — Phase 1에서 대폭 수정
│   │   ├── AddItemPanel.tsx        # 아이템 추가 — Phase 2에서 수정
│   │   ├── LayerSidebar.tsx        # 레이어 설정 — Phase 3에서 수정
│   │   └── [BibleBrowser.tsx]      # ✨ Phase 2에서 신규 생성
│   └── layers/
│       └── BackgroundLayer.tsx     # 배경 레이어 — Phase 3에서 수정
├── lib/
│   ├── types.ts               # 타입 — Phase 3에서 IPC 타입 추가
│   ├── db.ts                  # DB 레이어 — 변경 없음
│   ├── ipc.ts                 # IPC — Phase 3에서 video:control 추가
│   ├── media.ts               # 미디어 — Phase 1에서 썸네일 함수 추가
│   └── [bibleDb.ts]           # ✨ Phase 2에서 신규 생성
├── stores/
│   └── settingsStore.ts       # 설정 — Phase 4에서 outputMonitorId 추가
└── src-tauri/
    └── migrations/
        └── [003_bible.sql]    # ✨ Phase 2에서 신규 생성
```

---

## Phase 1: 미디어 관리 완성

### Task 1: LibraryPanel 미디어 탭 UI 완성

미디어 탭에 이미지/영상 임포트 버튼, 썸네일 그리드, 삭제 기능을 추가한다.

**Files:**
- Modify: `components/controller/LibraryPanel.tsx`
- Modify: `lib/media.ts` (썸네일 생성 함수 추가)

- [ ] **Step 1: `lib/media.ts`에 영상 썸네일 생성 함수 추가**

`lib/media.ts`의 마지막에 추가:
```typescript
/**
 * 영상 파일에서 첫 프레임을 추출하여 data URL로 반환합니다.
 * 실패 시 null 반환 (썸네일 없이 플레이스홀더로 대체).
 */
export async function captureVideoThumbnail(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.currentTime = 0.5; // 0.5초 지점 캡처
    video.muted = true;

    const cleanup = () => {
      video.src = "";
      video.load();
    };

    video.onloadeddata = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        if (!ctx) { cleanup(); resolve(null); return; }
        ctx.drawImage(video, 0, 0, 160, 90);
        resolve(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        resolve(null);
      } finally {
        cleanup();
      }
    };

    video.onerror = () => { cleanup(); resolve(null); };
    video.load();
  });
}
```

- [ ] **Step 2: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 3: `LibraryPanel.tsx` 미디어 모드 전면 교체**

`LibraryPanel.tsx`의 `// Media mode (unchanged)` 섹션 (302번 줄부터 끝까지)을 아래로 교체:

```tsx
// Media mode
const [importing, setImporting] = useState<"image" | "video" | null>(null);
const [deletingMediaId, setDeletingMediaId] = useState<number | null>(null);
const deleteMediaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const [videoThumbs, setVideoThumbs] = useState<Record<number, string | null>>({});
```

> **주의**: 위 state 선언은 컴포넌트 최상단 (다른 useState들 옆)으로 이동. 여기서는 미디어 모드 섹션 렌더 부분만 아래로 교체:

```tsx
// Media mode
return (
  <div className="h-full flex flex-col">
    {notice && (
      <div className="px-3 py-1.5 bg-blue-900 text-blue-200 text-xs text-center">{notice}</div>
    )}
    {/* 툴바 */}
    <div className="p-2 border-b border-zinc-700 flex gap-1">
      <button
        disabled={importing !== null}
        onClick={async () => {
          setImporting("image");
          try {
            const item = await importMediaFile("image");
            if (item) {
              const url = toDisplayUrl(item.file_path);
              setMedia((prev) => [...prev, item]);
              showNotice(`"${item.name}" 추가됨`);
              // 이미지는 썸네일 불필요 (직접 표시)
              _ = url;
            }
          } catch { showNotice("이미지 추가 실패"); }
          finally { setImporting(null); }
        }}
        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
      >
        {importing === "image" ? "..." : "+ 이미지"}
      </button>
      <button
        disabled={importing !== null}
        onClick={async () => {
          setImporting("video");
          try {
            const item = await importMediaFile("video");
            if (item) {
              setMedia((prev) => [...prev, item]);
              showNotice(`"${item.name}" 추가됨`);
              // 영상 썸네일 비동기 캡처
              const url = toDisplayUrl(item.file_path);
              if (url) {
                captureVideoThumbnail(url).then((thumb) =>
                  setVideoThumbs((prev) => ({ ...prev, [item.id]: thumb }))
                );
              }
            }
          } catch { showNotice("영상 추가 실패"); }
          finally { setImporting(null); }
        }}
        className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
      >
        {importing === "video" ? "..." : "+ 영상"}
      </button>
    </div>

    {/* 미디어 그리드 */}
    <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
      {media.map((item) => {
        const thumbSrc =
          item.type === "image"
            ? toDisplayUrl(item.file_path)
            : (videoThumbs[item.id] ?? null);
        const isDeleting = deletingMediaId === item.id;

        return (
          <div
            key={item.id}
            className="relative group rounded overflow-hidden border border-zinc-700 hover:border-zinc-500 cursor-pointer bg-zinc-800"
            onClick={() => handleAddMediaToService(item)}
          >
            {/* 썸네일 */}
            <div className="aspect-video bg-zinc-900 flex items-center justify-center">
              {thumbSrc ? (
                <img src={thumbSrc} alt={item.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl text-zinc-600">
                  {item.type === "video" ? "▶" : "🖼"}
                </span>
              )}
            </div>

            {/* 파일명 */}
            <div className="px-1.5 py-1 text-[10px] text-zinc-400 truncate">{item.name}</div>

            {/* 삭제 버튼 */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (isDeleting) {
                  // 두 번째 클릭: 삭제 확정
                  mediaDb.delete(item.id)
                    .then(() => {
                      setMedia((prev) => prev.filter((m) => m.id !== item.id));
                      setDeletingMediaId(null);
                    })
                    .catch(() => showNotice("삭제 실패"));
                } else {
                  setDeletingMediaId(item.id);
                  if (deleteMediaTimerRef.current) clearTimeout(deleteMediaTimerRef.current);
                  deleteMediaTimerRef.current = setTimeout(() => {
                    deleteMediaTimerRef.current = null;
                    setDeletingMediaId((prev) => (prev === item.id ? null : prev));
                  }, 3000);
                }
              }}
              className={`absolute top-1 right-1 px-1.5 py-0.5 rounded text-[10px] transition-opacity
                ${isDeleting
                  ? "bg-red-600 text-white opacity-100"
                  : "bg-zinc-900/80 text-zinc-400 hover:text-red-400 opacity-0 group-hover:opacity-100"
                }`}
            >
              {isDeleting ? "확인?" : "✕"}
            </button>
          </div>
        );
      })}
      {media.length === 0 && (
        <div className="col-span-2 p-4 text-center text-xs text-zinc-500 space-y-1">
          <p>미디어 파일이 없습니다</p>
          <p className="text-[11px] text-zinc-600">위 버튼으로 이미지·영상을 추가하세요</p>
        </div>
      )}
    </div>
  </div>
);
```

- [ ] **Step 4: LibraryPanel.tsx 상단에 import 추가**

기존 import 줄에 추가:
```typescript
import { importMediaFile, toDisplayUrl, captureVideoThumbnail } from "@/lib/media";
import { mediaDb } from "@/lib/db";
```
그리고 `handleAddMediaToService` 함수 추가 (미디어를 서비스에 추가 — Task 2에서 구현, 여기선 stub):
```typescript
async function handleAddMediaToService(item: MediaItem) {
  // Task 2에서 구현
  showNotice("서비스 큐 추가 기능 — 곧 추가됩니다");
}
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: 수동 검증**

`npm run tauri:dev` 실행 후:
1. 라이브러리 패널 미디어 탭 이동
2. "+ 이미지" 클릭 → 파일 선택 → 썸네일 그리드에 나타나는지 확인
3. "+ 영상" 클릭 → mp4 선택 → 첫 프레임 썸네일 표시 확인
4. 항목 hover → "✕" 버튼 → 두 번 클릭 → 삭제 확인

- [ ] **Step 7: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add lib/media.ts components/controller/LibraryPanel.tsx
git commit -m "feat: 미디어 라이브러리 UI 완성 — 이미지/영상 임포트, 썸네일 그리드, 삭제"
```

---

### Task 2: 미디어 → 서비스 큐 추가 및 컨트롤러 활성화

미디어 아이템을 서비스 큐에 추가하고, 활성화 시 배경으로 자동 적용한다.

**Files:**
- Modify: `components/controller/LibraryPanel.tsx` (handleAddMediaToService 구현)
- Modify: `app/controller/page.tsx` (media 타입 아이템 활성화 처리)
- Modify: `lib/db.ts` (serviceDb.get에서 media JOIN 추가)

- [ ] **Step 1: `lib/db.ts` — serviceDb.get에서 media 정보 JOIN**

`ServiceItemRow` 인터페이스에 필드 추가:
```typescript
interface ServiceItemRow {
  // ... 기존 필드 유지 ...
  // media 조인 필드 추가:
  media_type: string | null;
  media_file_path: string | null;
  media_name: string | null;
  media_thumbnail_path: string | null;
}
```

`serviceDb.get` 내 SELECT 쿼리 수정:
```typescript
const items = await conn.select<ServiceItemRow[]>(
  `SELECT si.*,
     s.title as song_title, s.artist, s.lyrics_json,
     s.created_at as song_created_at, s.updated_at as song_updated_at,
     m.type as media_type, m.file_path as media_file_path,
     m.name as media_name, m.thumbnail_path as media_thumbnail_path
   FROM service_items si
   LEFT JOIN songs s ON si.song_id = s.id
   LEFT JOIN media m ON si.media_id = m.id
   WHERE si.service_id = ?
   ORDER BY si.item_order ASC`,
  [id]
);
```

`parseServiceItem` 함수 수정 — media 정보 채우기:
```typescript
function parseServiceItem(row: ServiceItemRow): ServiceItem {
  const item: ServiceItem = {
    id: row.id,
    service_id: row.service_id,
    item_order: row.item_order,
    type: row.type as ServiceItem["type"],
    song_id: row.song_id ?? undefined,
    media_id: row.media_id ?? undefined,
    settings_json: (() => {
      try { return typeof row.settings_json === "string" ? JSON.parse(row.settings_json) : (row.settings_json ?? {}); }
      catch { return {}; }
    })(),
    label: row.label ?? "",
  };
  if (row.song_title && row.song_id != null) {
    item.song = {
      id: row.song_id,
      title: row.song_title,
      artist: row.artist ?? "",
      lyrics_json: (() => { try { return typeof row.lyrics_json === "string" ? JSON.parse(row.lyrics_json) : []; } catch { return []; } })(),
      created_at: row.song_created_at ?? "",
      updated_at: row.song_updated_at ?? "",
    };
  }
  // media 조인 정보
  if (row.media_id != null && row.media_file_path) {
    item.media = {
      id: row.media_id,
      type: (row.media_type ?? "image") as import("./types").MediaType,
      file_path: row.media_file_path,
      thumbnail_path: row.media_thumbnail_path ?? undefined,
      name: row.media_name ?? "",
      created_at: "",
    };
  }
  return item;
}
```

- [ ] **Step 2: `LibraryPanel.tsx` — handleAddMediaToService 구현**

Task 1의 stub 함수를 아래로 교체:
```typescript
async function handleAddMediaToService(item: MediaItem) {
  if (!currentService) {
    showNotice("예배를 먼저 선택해주세요");
    return;
  }
  try {
    const settings: import("@/lib/types").ServiceItemSettings = {
      background: {
        type: item.type,
        src: item.file_path, // convertFileSrc는 controller에서 처리
        loop: true,
        opacity: 1,
      },
    };
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order: currentService.items.length,
      type: item.type === "video" ? "video" : "announcement",
      song_id: undefined,
      media_id: item.id,
      settings_json: settings,
      label: item.name,
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) {
      useQueueStore.getState().setCurrentService(updated);
      useQueueStore.getState().setActiveItem(updated.items.length - 1);
    }
    showNotice(`"${item.name}" 큐에 추가됨`);
  } catch {
    showNotice("추가 실패");
  }
}
```

- [ ] **Step 3: `app/controller/page.tsx` — media 아이템 활성화 처리**

controller/page.tsx에서 활성 아이템이 변경될 때 슬라이드를 업데이트하는 로직 탐색 (슬라이드 전환 useEffect).
media 타입 아이템이 활성화되면 background를 자동 적용하는 분기 추가:

```typescript
// 기존 useEffect (activeItemIndex, activeLyricSlideIndex 의존) 내부에 추가할 분기
const activeItem = getActiveItem();
if (activeItem && activeItem.type !== "song" && activeItem.media) {
  const mediaUrl = toDisplayUrl(activeItem.media.file_path);
  const newConfig: LayerConfig = {
    ...layerConfig,
    background: {
      type: activeItem.media.type,
      src: mediaUrl,
      loop: activeItem.settings_json.background?.loop ?? true,
      opacity: activeItem.settings_json.background?.opacity ?? 1,
    },
    subtitle: { ...layerConfig.subtitle, visible: false },
  };
  setLayerConfig(newConfig);
  ipc.sendSlideUpdate(newConfig, undefined);
  return; // song 로직 건너뜀
}
```

> **주의**: `toDisplayUrl`을 controller/page.tsx에 import 추가:
> `import { toDisplayUrl } from "@/lib/media";`

- [ ] **Step 4: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: 수동 검증**

1. 미디어 탭에서 이미지 선택 → 큐에 추가 확인
2. 큐에서 해당 아이템 클릭 → Output 창에 이미지 배경 표시 확인
3. 다시 찬양 아이템 클릭 → 정상 전환 확인

- [ ] **Step 6: 커밋**

```bash
git add lib/db.ts components/controller/LibraryPanel.tsx app/controller/page.tsx
git commit -m "feat: 미디어 아이템 서비스 큐 추가 및 배경 자동 적용"
```

---

### Task 3: 영상 재생 컨트롤 (IPC + BackgroundLayer + UI)

Output 창의 영상 배경을 Controller에서 재생/일시정지/볼륨 조절할 수 있게 한다.

**Files:**
- Modify: `lib/types.ts` (VideoControlPayload 추가)
- Modify: `lib/ipc.ts` (video:control 이벤트 추가)
- Modify: `components/layers/BackgroundLayer.tsx` (ref + listen)
- Modify: `components/controller/LayerSidebar.tsx` (영상 컨트롤 UI)

- [ ] **Step 1: `lib/types.ts`에 IPC 타입 추가**

```typescript
// 기존 IpcEventName union에 추가:
export type IpcEventName =
  | "slide:update"
  | "subtitle:next"
  | "subtitle:prev"
  | "blackout:toggle"
  | "output:ready"
  | "playback:status"
  | "countdown:update"
  | "stage:closed"
  | "alert:show"
  | "freeze:toggle"
  | "heartbeat:ping"
  | "video:control";   // ← 추가

// 새 payload 타입 추가:
export interface VideoControlPayload {
  action: "play" | "pause" | "seek" | "volume" | "loop";
  value?: number; // seek: seconds, volume: 0-1, loop: 0|1
}
```

- [ ] **Step 2: `lib/ipc.ts`에 sendVideoControl 추가**

```typescript
// ipc 객체 내에 추가:
sendVideoControl(payload: import("./types").VideoControlPayload) {
  emitEvent("video:control", payload);
},
```

- [ ] **Step 3: `components/layers/BackgroundLayer.tsx`에 video ref + 컨트롤 리스너 추가**

BackgroundLayer의 `<video>` 요소에 ref 추가:
```typescript
const videoRef = useRef<HTMLVideoElement | null>(null);
```

`<video>` 태그에:
```tsx
<video ref={videoRef} ... />
```

video:control 이벤트 리스너 useEffect 추가:
```typescript
useEffect(() => {
  const unlisten = ipc.listen("video:control", (payload: import("@/lib/types").VideoControlPayload) => {
    const vid = videoRef.current;
    if (!vid) return;
    switch (payload.action) {
      case "play": vid.play().catch(() => {}); break;
      case "pause": vid.pause(); break;
      case "seek": if (payload.value !== undefined) vid.currentTime = payload.value; break;
      case "volume": if (payload.value !== undefined) vid.volume = Math.max(0, Math.min(1, payload.value)); break;
      case "loop": vid.loop = payload.value === 1; break;
    }
  });
  return () => { unlisten.then((fn) => fn()); };
}, []);
```

`playback:status` 이벤트도 주기적으로 emit하여 Controller가 재생 위치를 알 수 있게:
```typescript
useEffect(() => {
  const vid = videoRef.current;
  if (!vid) return;
  const interval = setInterval(() => {
    if (!vid.paused && vid.duration) {
      ipc.emit("playback:status", {
        currentTime: vid.currentTime,
        duration: vid.duration,
      } satisfies import("@/lib/types").PlaybackStatusPayload);
    }
  }, 500);
  return () => clearInterval(interval);
}, [config.src]); // src 변경 시 재시작
```

- [ ] **Step 4: `components/controller/LayerSidebar.tsx`에 영상 컨트롤 UI 추가**

배경 타입이 `"video"`일 때 표시되는 영상 컨트롤 섹션 추가:

```typescript
// LayerSidebar 컴포넌트 내부 상태 추가:
const [isPlaying, setIsPlaying] = useState(false);
const [currentTime, setCurrentTime] = useState(0);
const [duration, setDuration] = useState(0);
const [volume, setVolume] = useState(1);

// playback:status 리스너:
useEffect(() => {
  const unlisten = ipc.listen("playback:status", (p: import("@/lib/types").PlaybackStatusPayload) => {
    setCurrentTime(p.currentTime);
    setDuration(p.duration);
    setIsPlaying(true); // 이벤트 받고 있으면 재생 중
  });
  return () => { unlisten.then((fn) => fn()); };
}, []);
```

JSX — 배경 설정 섹션 하단에 조건부 렌더링:
```tsx
{config.background.type === "video" && (
  <div className="space-y-2 border-t border-zinc-700 pt-2">
    <p className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider">영상 컨트롤</p>

    {/* 재생/일시정지 */}
    <div className="flex gap-2">
      <button
        onClick={() => {
          ipc.sendVideoControl({ action: isPlaying ? "pause" : "play" });
          setIsPlaying((v) => !v);
        }}
        className="flex-1 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
      >
        {isPlaying ? "⏸ 일시정지" : "▶ 재생"}
      </button>
      <button
        onClick={() => { ipc.sendVideoControl({ action: "seek", value: 0 }); setCurrentTime(0); }}
        className="px-2 py-1 text-xs rounded bg-zinc-700 hover:bg-zinc-600"
        title="처음으로"
      >
        ⏮
      </button>
    </div>

    {/* 진행 바 */}
    {duration > 0 && (
      <input
        type="range"
        min={0}
        max={duration}
        step={0.5}
        value={currentTime}
        onChange={(e) => {
          const val = Number(e.target.value);
          setCurrentTime(val);
          ipc.sendVideoControl({ action: "seek", value: val });
        }}
        className="w-full accent-blue-500"
      />
    )}
    {duration > 0 && (
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    )}

    {/* 볼륨 */}
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-zinc-400 w-8">볼륨</span>
      <input
        type="range" min={0} max={1} step={0.05} value={volume}
        onChange={(e) => {
          const val = Number(e.target.value);
          setVolume(val);
          ipc.sendVideoControl({ action: "volume", value: val });
        }}
        className="flex-1 accent-blue-500"
      />
      <span className="text-[10px] text-zinc-500 w-8 text-right">{Math.round(volume * 100)}%</span>
    </div>

    {/* 루프 */}
    <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
      <input
        type="checkbox"
        checked={config.background.loop ?? true}
        onChange={(e) => {
          onConfigChange({ background: { ...config.background, loop: e.target.checked } });
          ipc.sendVideoControl({ action: "loop", value: e.target.checked ? 1 : 0 });
        }}
        className="accent-blue-500"
      />
      반복 재생
    </label>
  </div>
)}
```

`formatTime` 헬퍼 함수 (LayerSidebar.tsx 내부):
```typescript
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: 수동 검증**

1. 영상 미디어 아이템을 큐에서 활성화
2. LayerSidebar에 "영상 컨트롤" 섹션 표시 확인
3. ▶/⏸ 버튼으로 재생/일시정지 동작 확인
4. 볼륨 슬라이더 조작 확인
5. 루프 체크박스 on/off 확인

- [ ] **Step 7: 커밋**

```bash
git add lib/types.ts lib/ipc.ts components/layers/BackgroundLayer.tsx components/controller/LayerSidebar.tsx
git commit -m "feat: 영상 재생 컨트롤 — IPC video:control + BackgroundLayer ref + LayerSidebar UI"
```

---

## Phase 2: 성경 구절 브라우저

### Task 4: 성경 DB 마이그레이션 + bibleDb.ts

성경 데이터를 SQLite에 저장하고 검색·조회할 수 있는 DB 레이어를 만든다.
성경 데이터는 사용자가 JSON 파일로 임포트한다 (저작권 이슈 회피).

**예상 JSON 포맷 (사용자 제공):**
```json
{
  "version": "개역개정",
  "books": [
    {
      "name": "창세기",
      "abbr": "창",
      "chapters": [
        {
          "verses": [
            "태초에 하나님이 천지를 창조하시니라",
            "땅이 혼돈하고 공허하며..."
          ]
        }
      ]
    }
  ]
}
```

**Files:**
- Create: `src-tauri/migrations/003_bible.sql`
- Create: `lib/bibleDb.ts`
- Modify: `src-tauri/src/lib.rs` (migration 3 등록)

- [ ] **Step 1: `src-tauri/migrations/003_bible.sql` 생성**

```sql
CREATE TABLE IF NOT EXISTS bible_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,        -- "개역개정", "새번역" 등
  imported_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bible_books (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id INTEGER NOT NULL REFERENCES bible_versions(id) ON DELETE CASCADE,
  book_index INTEGER NOT NULL,      -- 0-based, 창세기=0
  name TEXT NOT NULL,               -- "창세기"
  abbr TEXT NOT NULL                -- "창"
);

CREATE TABLE IF NOT EXISTS bible_verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id INTEGER NOT NULL REFERENCES bible_books(id) ON DELETE CASCADE,
  chapter INTEGER NOT NULL,         -- 1-based
  verse INTEGER NOT NULL,           -- 1-based
  text TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bible_verses_book ON bible_verses(book_id, chapter, verse);
CREATE INDEX IF NOT EXISTS idx_bible_verses_text ON bible_verses(text);
```

- [ ] **Step 2: `src-tauri/src/lib.rs`에 migration 3 등록**

lib.rs에서 migration builder에 version 3 추가:
```rust
.add_migrations("sqlite:worship.db", vec![
    Migration {
        version: 1,
        description: "initial schema",
        sql: include_str!("../migrations/001_initial.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 2,
        description: "fix fk constraints",
        sql: include_str!("../migrations/002_fix_fk.sql"),
        kind: MigrationKind::Up,
    },
    Migration {
        version: 3,
        description: "bible tables",
        sql: include_str!("../migrations/003_bible.sql"),
        kind: MigrationKind::Up,
    },
])
```

- [ ] **Step 3: `cargo check` 실행**

```bash
cd /Volumes/P31/chppt/worship-projector/src-tauri && source ~/.cargo/env && cargo check
```
Expected: `Finished` with 0 errors

- [ ] **Step 4: `lib/bibleDb.ts` 생성**

```typescript
"use client";

// ─── 타입 ─────────────────────────────────────────────────────────────────

export interface BibleVersion {
  id: number;
  name: string;
  imported_at: string;
}

export interface BibleBook {
  id: number;
  version_id: number;
  book_index: number;
  name: string;
  abbr: string;
}

export interface BibleVerse {
  id: number;
  book_id: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface BibleSearchResult extends BibleVerse {
  book_name: string;
  book_abbr: string;
}

// ─── JSON 임포트용 타입 ────────────────────────────────────────────────────

interface BibleJsonBook {
  name: string;
  abbr: string;
  chapters: Array<{ verses: string[] }>;
}

interface BibleJson {
  version: string;
  books: BibleJsonBook[];
}

// ─── DB 레이어 ────────────────────────────────────────────────────────────

async function getDb() {
  const { default: Database } = await import("@tauri-apps/plugin-sql");
  const conn = await Database.load("sqlite:worship.db");
  await conn.execute("PRAGMA foreign_keys = ON");
  return conn;
}

export const bibleDb = {
  /** 등록된 성경 버전 목록 */
  async listVersions(): Promise<BibleVersion[]> {
    const conn = await getDb();
    return conn.select<BibleVersion[]>("SELECT * FROM bible_versions ORDER BY id ASC");
  },

  /** 특정 버전의 책 목록 */
  async listBooks(versionId: number): Promise<BibleBook[]> {
    const conn = await getDb();
    return conn.select<BibleBook[]>(
      "SELECT * FROM bible_books WHERE version_id = ? ORDER BY book_index ASC",
      [versionId]
    );
  },

  /** 특정 책의 장별 절 수 */
  async getChapterCounts(bookId: number): Promise<number[]> {
    const conn = await getDb();
    const rows = await conn.select<Array<{ chapter: number; cnt: number }>>(
      "SELECT chapter, COUNT(*) as cnt FROM bible_verses WHERE book_id = ? GROUP BY chapter ORDER BY chapter ASC",
      [bookId]
    );
    return rows.map((r) => r.cnt);
  },

  /** 특정 장의 모든 절 */
  async getVerses(bookId: number, chapter: number): Promise<BibleVerse[]> {
    const conn = await getDb();
    return conn.select<BibleVerse[]>(
      "SELECT * FROM bible_verses WHERE book_id = ? AND chapter = ? ORDER BY verse ASC",
      [bookId, chapter]
    );
  },

  /** 구절 텍스트 검색 (최대 50건) */
  async searchVerses(versionId: number, query: string): Promise<BibleSearchResult[]> {
    const conn = await getDb();
    const escaped = query.replace(/[%_\\]/g, "\\$&");
    return conn.select<BibleSearchResult[]>(
      `SELECT bv.*, bb.name as book_name, bb.abbr as book_abbr
       FROM bible_verses bv
       JOIN bible_books bb ON bv.book_id = bb.id
       WHERE bb.version_id = ? AND bv.text LIKE ? ESCAPE '\\'
       LIMIT 50`,
      [versionId, `%${escaped}%`]
    );
  },

  /**
   * JSON 파일 데이터를 DB에 임포트.
   * 동일 version name이 이미 있으면 덮어씀(DELETE + 재삽입).
   */
  async importFromJson(json: BibleJson): Promise<void> {
    const conn = await getDb();
    await conn.execute("BEGIN");
    try {
      // 기존 버전 삭제 (CASCADE로 books/verses도 삭제)
      await conn.execute("DELETE FROM bible_versions WHERE name = ?", [json.version]);

      const vResult = await conn.execute(
        "INSERT INTO bible_versions (name) VALUES (?)",
        [json.version]
      );
      const versionId = vResult.lastInsertId;
      if (versionId == null) throw new Error("version insert failed");

      for (let bi = 0; bi < json.books.length; bi++) {
        const book = json.books[bi];
        const bResult = await conn.execute(
          "INSERT INTO bible_books (version_id, book_index, name, abbr) VALUES (?, ?, ?, ?)",
          [versionId, bi, book.name, book.abbr]
        );
        const bookId = bResult.lastInsertId;
        if (bookId == null) throw new Error("book insert failed");

        for (let ci = 0; ci < book.chapters.length; ci++) {
          const chapter = book.chapters[ci];
          for (let vi = 0; vi < chapter.verses.length; vi++) {
            await conn.execute(
              "INSERT INTO bible_verses (book_id, chapter, verse, text) VALUES (?, ?, ?, ?)",
              [bookId, ci + 1, vi + 1, chapter.verses[vi]]
            );
          }
        }
      }
      await conn.execute("COMMIT");
    } catch (err) {
      await conn.execute("ROLLBACK");
      throw err;
    }
  },
};
```

- [ ] **Step 5: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 6: 커밋**

```bash
git add src-tauri/migrations/003_bible.sql src-tauri/src/lib.rs lib/bibleDb.ts
git commit -m "feat: 성경 DB 마이그레이션 + bibleDb.ts (JSON 임포트, 검색, 절 조회)"
```

---

### Task 5: BibleBrowser 컴포넌트 + AddItemPanel 연동

성경 검색 UI와 구절 선택 → 서비스 큐 추가 기능을 구현한다.

**Files:**
- Create: `components/controller/BibleBrowser.tsx`
- Modify: `components/controller/AddItemPanel.tsx` (scripture 탭에 BibleBrowser 마운트)
- Modify: `lib/types.ts` (ScriptureSettings 구조 확인/확장)

- [ ] **Step 1: `components/controller/BibleBrowser.tsx` 생성**

```tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { bibleDb, type BibleVersion, type BibleBook, type BibleVerse, type BibleSearchResult } from "@/lib/bibleDb";
import { serviceDb } from "@/lib/db";
import { useQueueStore } from "@/stores/queueStore";
import type { ScriptureSettings } from "@/lib/types";

// 슬라이드당 최대 절 수 (한 화면에 보여줄 절)
const VERSES_PER_SLIDE = 2;

export default function BibleBrowser() {
  const [versions, setVersions] = useState<BibleVersion[]>([]);
  const [selectedVersion, setSelectedVersion] = useState<BibleVersion | null>(null);
  const [books, setBooks] = useState<BibleBook[]>([]);
  const [selectedBook, setSelectedBook] = useState<BibleBook | null>(null);
  const [chapterCount, setChapterCount] = useState(0);
  const [selectedChapter, setSelectedChapter] = useState(1);
  const [verses, setVerses] = useState<BibleVerse[]>([]);
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set()); // verse numbers
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<BibleSearchResult[]>([]);
  const [mode, setMode] = useState<"browse" | "search">("browse");
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { currentService } = useQueueStore();

  function showNotice(msg: string) {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => { setNotice(""); noticeTimerRef.current = null; }, 2000);
  }

  useEffect(() => {
    bibleDb.listVersions().then((vs) => {
      setVersions(vs);
      if (vs[0]) setSelectedVersion(vs[0]);
    });
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!selectedVersion) return;
    bibleDb.listBooks(selectedVersion.id).then((bs) => {
      setBooks(bs);
      if (bs[0]) setSelectedBook(bs[0]);
    });
  }, [selectedVersion]);

  useEffect(() => {
    if (!selectedBook) return;
    bibleDb.getChapterCounts(selectedBook.id).then((counts) => {
      setChapterCount(counts.length);
      setSelectedChapter(1);
    });
  }, [selectedBook]);

  useEffect(() => {
    if (!selectedBook) return;
    bibleDb.getVerses(selectedBook.id, selectedChapter).then(setVerses);
    setSelectedVerses(new Set());
  }, [selectedBook, selectedChapter]);

  function handleSearch(q: string) {
    setSearchQuery(q);
    if (!selectedVersion) return;
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimerRef.current = setTimeout(async () => {
      const results = await bibleDb.searchVerses(selectedVersion.id, q.trim());
      setSearchResults(results);
    }, 300);
  }

  function toggleVerse(verseNum: number) {
    setSelectedVerses((prev) => {
      const next = new Set(prev);
      if (next.has(verseNum)) next.delete(verseNum);
      else next.add(verseNum);
      return next;
    });
  }

  async function handleAddToService() {
    if (!currentService) { showNotice("예배를 먼저 선택해주세요"); return; }
    if (selectedVerses.size === 0) { showNotice("절을 선택해주세요"); return; }
    if (!selectedBook) return;

    // 선택된 절들을 VERSES_PER_SLIDE 단위로 슬라이드로 분할
    const sorted = [...selectedVerses].sort((a, b) => a - b);
    const slides: Array<{ lines: string[] }> = [];
    for (let i = 0; i < sorted.length; i += VERSES_PER_SLIDE) {
      const chunk = sorted.slice(i, i + VERSES_PER_SLIDE);
      const lines = chunk.map((vNum) => {
        const v = verses.find((vv) => vv.verse === vNum);
        return v ? `${vNum} ${v.text}` : "";
      }).filter(Boolean);
      slides.push({ lines });
    }

    const verseRange = sorted.length === 1
      ? `${sorted[0]}`
      : `${sorted[0]}-${sorted[sorted.length - 1]}`;
    const label = `${selectedBook.abbr} ${selectedChapter}:${verseRange}`;

    const scripture: ScriptureSettings = {
      book: selectedBook.name,
      reference: label,
      slides,
    };

    try {
      await serviceDb.addItem(currentService.id, {
        service_id: currentService.id,
        item_order: currentService.items.length,
        type: "scripture",
        song_id: undefined,
        media_id: undefined,
        settings_json: { scripture },
        label,
      });
      const updated = await serviceDb.get(currentService.id);
      if (updated) {
        useQueueStore.getState().setCurrentService(updated);
        useQueueStore.getState().setActiveItem(updated.items.length - 1);
      }
      showNotice(`"${label}" 추가됨`);
      setSelectedVerses(new Set());
    } catch {
      showNotice("추가 실패");
    }
  }

  async function handleImportJson() {
    setImporting(true);
    try {
      const path = await open({ filters: [{ name: "성경 JSON", extensions: ["json"] }], multiple: false });
      if (!path || typeof path !== "string") return;
      const raw = await readTextFile(path);
      const json = JSON.parse(raw);
      await bibleDb.importFromJson(json);
      const vs = await bibleDb.listVersions();
      setVersions(vs);
      const imported = vs.find((v) => v.name === json.version);
      if (imported) setSelectedVersion(imported);
      showNotice(`"${json.version}" 성경 임포트 완료`);
    } catch (err) {
      showNotice("임포트 실패: JSON 형식을 확인하세요");
      console.error(err);
    } finally {
      setImporting(false);
    }
  }

  // 성경 데이터 없음
  if (versions.length === 0) {
    return (
      <div className="p-3 space-y-2 text-xs text-zinc-400">
        <p className="font-medium text-zinc-200">성경 데이터 없음</p>
        <p className="text-zinc-500 leading-relaxed text-[11px]">
          성경 JSON 파일을 임포트하면 구절 검색·삽입을 사용할 수 있습니다.
        </p>
        <button
          onClick={handleImportJson}
          disabled={importing}
          className="w-full py-1.5 text-xs bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded"
        >
          {importing ? "임포트 중..." : "JSON 성경 데이터 임포트"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-xs">
      {notice && (
        <div className="px-2 py-1 bg-blue-900 text-blue-200 text-[11px] text-center">{notice}</div>
      )}

      {/* 버전 선택 + 임포트 */}
      <div className="flex gap-1 p-1.5 border-b border-zinc-700">
        <select
          value={selectedVersion?.id ?? ""}
          onChange={(e) => {
            const v = versions.find((vv) => vv.id === Number(e.target.value));
            if (v) setSelectedVersion(v);
          }}
          className="flex-1 bg-zinc-800 text-white text-[11px] rounded px-1 py-0.5 border border-zinc-600"
        >
          {versions.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button
          onClick={handleImportJson}
          disabled={importing}
          className="px-2 py-0.5 text-[11px] bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded"
        >
          {importing ? "..." : "+ 임포트"}
        </button>
      </div>

      {/* 검색 / 브라우즈 탭 */}
      <div className="flex border-b border-zinc-700">
        {(["browse", "search"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`flex-1 py-1 text-[11px] ${mode === m ? "bg-zinc-700 text-white" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {m === "browse" ? "📖 브라우즈" : "🔍 검색"}
          </button>
        ))}
      </div>

      {mode === "search" ? (
        /* 검색 모드 */
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-1.5">
            <input
              autoFocus
              type="text"
              placeholder="구절 검색..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full bg-zinc-800 text-white text-[11px] rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {searchResults.map((r) => (
              <div
                key={r.id}
                className="px-2 py-1.5 border-b border-zinc-800 hover:bg-zinc-700 cursor-pointer"
                onClick={async () => {
                  // 해당 책/장으로 이동하여 절 선택
                  if (!selectedVersion) return;
                  const book = books.find((b) => b.name === r.book_name);
                  if (book) {
                    setSelectedBook(book);
                    setSelectedChapter(r.chapter);
                    setMode("browse");
                    setSelectedVerses(new Set([r.verse]));
                  }
                }}
              >
                <span className="text-blue-400 font-medium">{r.book_abbr} {r.chapter}:{r.verse}</span>
                {" "}
                <span className="text-zinc-300">{r.text}</span>
              </div>
            ))}
            {searchQuery && searchResults.length === 0 && (
              <p className="p-2 text-zinc-500 text-[11px]">검색 결과 없음</p>
            )}
          </div>
        </div>
      ) : (
        /* 브라우즈 모드 */
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* 책 + 장 선택 */}
          <div className="flex gap-1 p-1.5 border-b border-zinc-700">
            <select
              value={selectedBook?.id ?? ""}
              onChange={(e) => {
                const b = books.find((bb) => bb.id === Number(e.target.value));
                if (b) setSelectedBook(b);
              }}
              className="flex-1 bg-zinc-800 text-white text-[11px] rounded px-1 py-0.5 border border-zinc-600"
            >
              {books.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select
              value={selectedChapter}
              onChange={(e) => setSelectedChapter(Number(e.target.value))}
              className="w-14 bg-zinc-800 text-white text-[11px] rounded px-1 py-0.5 border border-zinc-600"
            >
              {Array.from({ length: chapterCount }, (_, i) => (
                <option key={i + 1} value={i + 1}>{i + 1}장</option>
              ))}
            </select>
          </div>

          {/* 절 목록 */}
          <div className="flex-1 overflow-y-auto">
            {verses.map((v) => {
              const isSelected = selectedVerses.has(v.verse);
              return (
                <div
                  key={v.id}
                  onClick={() => toggleVerse(v.verse)}
                  className={`flex gap-2 px-2 py-1 border-b border-zinc-800 cursor-pointer text-[11px] transition-colors ${
                    isSelected ? "bg-blue-900 text-white" : "hover:bg-zinc-700 text-zinc-300"
                  }`}
                >
                  <span className={`flex-shrink-0 font-semibold w-5 text-right ${isSelected ? "text-blue-300" : "text-zinc-500"}`}>
                    {v.verse}
                  </span>
                  <span className="leading-relaxed">{v.text}</span>
                </div>
              );
            })}
          </div>

          {/* 추가 버튼 */}
          <div className="p-1.5 border-t border-zinc-700">
            <button
              onClick={handleAddToService}
              disabled={selectedVerses.size === 0}
              className="w-full py-1.5 text-[11px] bg-blue-700 hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded"
            >
              {selectedVerses.size > 0
                ? `선택된 ${selectedVerses.size}절 큐에 추가`
                : "절을 클릭하여 선택"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `components/controller/AddItemPanel.tsx`의 scripture 탭에 BibleBrowser 마운트**

AddItemPanel.tsx에서 scripture 탭 섹션 탐색 후 교체:
```tsx
// 기존 scripture 탭 내용 (빈 placeholder)을 아래로 교체:
import BibleBrowser from "./BibleBrowser";

// ...탭 컨텐츠 렌더링 부분에서:
{activeTab === "scripture" && (
  <BibleBrowser />
)}
```

- [ ] **Step 3: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 4: Tauri capability에 readTextFile 권한 확인**

`src-tauri/capabilities/main.json`에 `fs:allow-read-text-file` 또는 `fs:default`가 있는지 확인.
없으면 추가:
```json
{
  "permissions": [
    ...,
    "fs:allow-read-text-file"
  ]
}
```

- [ ] **Step 5: 수동 검증**

1. 예배 큐 → "+ 항목 추가" → scripture 탭
2. "JSON 성경 데이터 임포트" → 파일 선택
3. 책/장 선택 → 절 클릭 (파란색 선택) → "큐에 추가"
4. QueuePanel에 성경 아이템 추가 확인
5. 해당 아이템 활성화 → Output에 성경 구절 표시 확인
6. 검색 탭 → 키워드 입력 → 결과 클릭 → 브라우즈로 이동 확인

- [ ] **Step 6: 커밋**

```bash
git add src-tauri/migrations/003_bible.sql src-tauri/src/lib.rs lib/bibleDb.ts \
        components/controller/BibleBrowser.tsx components/controller/AddItemPanel.tsx \
        src-tauri/capabilities/main.json
git commit -m "feat: 성경 구절 브라우저 — JSON 임포트, 책/장/절 브라우즈, 검색, 큐 추가"
```

---

## Phase 3: 출력 모니터 선택 UI

### Task 6: 모니터 선택 드롭다운 + settingsStore 확장

현재는 두 번째 모니터에 자동으로 Output을 열지만, 사용자가 원하는 모니터를 직접 선택할 수 있게 한다.

**Files:**
- Modify: `stores/settingsStore.ts` (`outputMonitorId` 추가)
- Modify: `app/controller/page.tsx` (모니터 선택 UI + open_output_window 호출 수정)

- [ ] **Step 1: `stores/settingsStore.ts` 확인 후 `outputMonitorId` 추가**

현재 settingsStore.ts를 읽고 기존 패턴에 맞게 추가:
```typescript
// settingsStore의 상태 인터페이스에 추가:
outputMonitorId: number | null;
setOutputMonitorId: (id: number | null) => void;

// 초기값:
outputMonitorId: null,
setOutputMonitorId: (id) => set({ outputMonitorId: id }),
```

persist 미들웨어가 있다면 `outputMonitorId`를 persist 대상에 포함.

- [ ] **Step 2: `app/controller/page.tsx`의 모니터 열기 로직 확인 및 수정**

controller/page.tsx에서 `open_output_window` 호출 부분을 찾아 수정:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type { DisplayInfo } from "@/lib/types"; // 아래 타입 추가 필요

// DisplayInfo 타입을 lib/types.ts에 추가 (Rust display.rs와 일치):
// export interface DisplayInfo {
//   id: number; name: string; x: number; y: number;
//   width: number; height: number; is_primary: boolean;
// }
```

기존 "Output 열기" 버튼 근처에 모니터 선택 UI 추가:
```tsx
// 상태 추가:
const [displays, setDisplays] = useState<DisplayInfo[]>([]);
const { outputMonitorId, setOutputMonitorId } = useSettingsStore();

// 마운트 시 모니터 목록 조회:
useEffect(() => {
  invoke<DisplayInfo[]>("get_displays").then(setDisplays).catch(console.error);
}, []);

// Output 열기 버튼 근처에 드롭다운 추가:
<select
  value={outputMonitorId ?? ""}
  onChange={(e) => setOutputMonitorId(e.target.value ? Number(e.target.value) : null)}
  className="bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600"
>
  <option value="">모니터 자동 선택</option>
  {displays.map((d) => (
    <option key={d.id} value={d.id}>
      {d.is_primary ? "주 모니터" : `모니터 ${d.id + 1}`} ({d.width}×{d.height})
    </option>
  ))}
</select>
```

Output 열기 함수에서 선택된 모니터 좌표 사용:
```typescript
async function handleOpenOutput() {
  const target = outputMonitorId !== null
    ? displays.find((d) => d.id === outputMonitorId)
    : displays.find((d) => !d.is_primary) ?? displays[displays.length - 1];

  if (!target) { showNotice("연결된 모니터가 없습니다"); return; }

  await invoke("open_output_window", {
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
  });
}
```

- [ ] **Step 3: `lib/types.ts`에 DisplayInfo 타입 추가**

```typescript
// src-tauri/src/display.rs의 DisplayInfo와 일치:
export interface DisplayInfo {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  is_primary: boolean;
}
```

- [ ] **Step 4: TypeScript 타입 체크**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
```
Expected: 0 errors

- [ ] **Step 5: 수동 검증**

1. 단일 모니터 환경: 드롭다운에 "주 모니터 (1920×1080)" 표시, Output이 같은 화면에 열림
2. 듀얼 모니터 환경: 드롭다운에 두 모니터 표시, 선택한 모니터에 Output 창 열림
3. 앱 재시작 후 선택한 모니터 유지 (persist) 확인

- [ ] **Step 6: 커밋**

```bash
git add stores/settingsStore.ts app/controller/page.tsx lib/types.ts
git commit -m "feat: 출력 모니터 선택 UI — get_displays + settingsStore outputMonitorId"
```

---

## Phase 4: 슬라이드 전환 효과 확장 (선택적)

### Task 7: 추가 전환 효과 옵션

현재 SubtitleLayer의 `textEntrance`가 `"none" | "fade" | "slide-up"` 3가지뿐이다.
`"slide-down"`, `"zoom-in"` 2가지를 추가한다.

**Files:**
- Modify: `lib/types.ts` (textEntrance 유니온 확장)
- Modify: `components/layers/SubtitleLayer.tsx` (새 애니메이션 처리)
- Modify: `components/controller/LayerSidebar.tsx` (드롭다운 옵션 추가)

- [ ] **Step 1: `lib/types.ts`의 textEntrance 타입 확장**

```typescript
// 기존:
textEntrance?: "none" | "fade" | "slide-up";
// 변경:
textEntrance?: "none" | "fade" | "slide-up" | "slide-down" | "zoom-in";
```

- [ ] **Step 2: `SubtitleLayer.tsx`에 새 애니메이션 로직 추가**

기존 `slide-up` 분기 옆에 추가:
```typescript
case "slide-down":
  setSlideY(-15); // 위에서 아래로
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (rafSeqRef.current !== seq) return;
    setFaded(false);
    requestAnimationFrame(() => { if (rafSeqRef.current === seq) setSlideY(0); });
  }));
  break;
case "zoom-in":
  setScale(0.9);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (rafSeqRef.current !== seq) return;
    setFaded(false);
    requestAnimationFrame(() => { if (rafSeqRef.current === seq) setScale(1); });
  }));
  break;
```

`scale` 상태 추가:
```typescript
const [scale, setScale] = useState(1);
```

style 적용:
```typescript
transform: [
  config.textEntrance === "slide-up" || config.textEntrance === "slide-down"
    ? `translateY(${slideY}px)` : "",
  config.textEntrance === "zoom-in" ? `scale(${scale})` : "",
].filter(Boolean).join(" ") || undefined,
transition: `opacity ${FADE_MS}ms ease${
  config.textEntrance === "slide-up" || config.textEntrance === "slide-down"
    ? `, transform ${FADE_MS}ms ease` : ""
}${config.textEntrance === "zoom-in" ? `, transform ${FADE_MS}ms ease` : ""}`,
```

- [ ] **Step 3: `LayerSidebar.tsx`의 드롭다운 옵션 추가**

```tsx
<option value="none">없음</option>
<option value="fade">페이드</option>
<option value="slide-up">슬라이드 업 ↑</option>
<option value="slide-down">슬라이드 다운 ↓</option>
<option value="zoom-in">줌인 🔍</option>
```

- [ ] **Step 4: TypeScript 타입 체크 + 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit
git add lib/types.ts components/layers/SubtitleLayer.tsx components/controller/LayerSidebar.tsx
git commit -m "feat: 슬라이드 전환 효과 추가 — slide-down, zoom-in"
```

---

## 구현 우선순위 요약

| Phase | 기능 | 체감 임팩트 | 구현 난이도 |
|-------|------|------------|------------|
| 1-A | 미디어 라이브러리 UI | ★★★★★ | 중 |
| 1-B | 미디어 → 큐 추가 | ★★★★★ | 중 |
| 1-C | 영상 재생 컨트롤 | ★★★★☆ | 중상 |
| 2-A | 성경 DB | ★★★★★ | 중 |
| 2-B | 성경 브라우저 UI | ★★★★★ | 중상 |
| 3 | 모니터 선택 UI | ★★★☆☆ | 하 |
| 4 | 전환 효과 확장 | ★★☆☆☆ | 하 |

Phase 1 → Phase 2 → Phase 3 → Phase 4 순으로 구현 권장.
각 Phase는 독립적으로 완료 가능하며, Phase 간 의존성 없음.

## 검증 명령어

```bash
# TypeScript 타입 체크
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit

# Rust 체크
cd /Volumes/P31/chppt/worship-projector/src-tauri && source ~/.cargo/env && cargo check

# 개발 서버 실행
cd /Volumes/P31/chppt/worship-projector && source ~/.cargo/env && npm run tauri:dev
```
