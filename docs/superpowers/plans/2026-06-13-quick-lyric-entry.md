# 빠른 가사 직접 입력 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QueuePanel의 "항목 추가" 패널에 "직접 입력" 탭을 추가해 예배 중 가사 텍스트를 붙여넣어 즉시 큐에 추가할 수 있게 한다.

**Architecture:** `QueuePanel.tsx` 하나만 수정. 빈 줄 기준 파싱 함수(`parseLyricsToSlides`)로 텍스트 → `LyricSlide[]` 변환, `songDb.create` → `serviceDb.addItem` 순서로 저장 후 큐 갱신.

**Tech Stack:** Next.js 16 ("use client"), TypeScript, Zustand v5, tauri-plugin-sql (SQLite)

> ⚠️ **테스트**: 자동화 테스트 없음. `source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev` 실행 후 수동 확인.

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `components/controller/QueuePanel.tsx` | "직접 입력" 탭 추가 — 상태 3개, 파싱 함수, 핸들러, UI |

---

## 참고: 현재 QueuePanel 상태/타입

```ts
// 현재 addTab 타입 (변경 필요)
const [addTab, setAddTab] = useState<"song" | "announcement" | "blank">("song");

// 추가할 상태
const [addDirectTitle, setAddDirectTitle] = useState("");
const [addDirectArtist, setAddDirectArtist] = useState("");
const [addDirectLyrics, setAddDirectLyrics] = useState("");

// songDb.create 시그니처 (lib/db.ts)
songDb.create(song: {
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
}): Promise<number>

// serviceDb.addItem 시그니처
serviceDb.addItem(serviceId: number, item: {
  service_id: number;
  item_order: number;
  type: ServiceItemType;
  song_id?: number;
  media_id?: number;
  settings_json: ServiceItemSettings;
  label: string;
}): Promise<number>

// LyricSlide 타입 (lib/types.ts)
interface LyricSlide {
  id: string;        // "verse-1", "verse-2", ...
  section: LyricSection;  // "verse" (모두 verse로 고정)
  sectionIndex: number;   // 1, 2, 3, ...
  lines: string[];        // 각 줄
}
```

---

## Task 1: QueuePanel에 직접 입력 탭 추가

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

- [ ] **Step 1: 현재 파일 읽기**

```bash
cat /Volumes/P31/chppt/worship-projector/components/controller/QueuePanel.tsx
```

- [ ] **Step 2: import에 LyricSlide 타입 추가**

파일 상단 import에 `LyricSlide`를 추가한다:

```ts
import type { Service, Song, LyricSlide } from "@/lib/types";
```

- [ ] **Step 3: addTab 타입에 "direct" 추가**

기존:
```ts
const [addTab, setAddTab] = useState<"song" | "announcement" | "blank">("song");
```

변경:
```ts
const [addTab, setAddTab] = useState<"song" | "announcement" | "blank" | "direct">("song");
```

- [ ] **Step 4: 직접 입력 관련 상태 3개 추가**

`addLabel` 상태 선언 바로 아래에 추가:

```ts
const [addDirectTitle, setAddDirectTitle] = useState("");
const [addDirectArtist, setAddDirectArtist] = useState("");
const [addDirectLyrics, setAddDirectLyrics] = useState("");
```

- [ ] **Step 5: parseLyricsToSlides 함수 추가**

`handleAddSearch` 함수 바로 위에 추가:

```ts
function parseLyricsToSlides(text: string): LyricSlide[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return paragraphs.map((para, i) => ({
    id: `verse-${i + 1}`,
    section: "verse" as const,
    sectionIndex: i + 1,
    lines: para.split("\n").map((l) => l.trim()).filter(Boolean),
  }));
}
```

- [ ] **Step 6: addDirectItem 핸들러 추가**

`addBlankItem` 함수 바로 아래에 추가:

```ts
async function addDirectItem() {
  if (!currentService || !addDirectTitle.trim()) return;
  setAddError(null);
  try {
    const lyrics = parseLyricsToSlides(addDirectLyrics);
    const songId = await songDb.create({
      title: addDirectTitle.trim(),
      artist: addDirectArtist.trim(),
      lyrics_json: lyrics,
    });
    const item_order = useQueueStore.getState().currentService?.items.length ?? 0;
    await serviceDb.addItem(currentService.id, {
      service_id: currentService.id,
      item_order,
      type: "song",
      song_id: songId,
      media_id: undefined,
      settings_json: {},
      label: addDirectTitle.trim(),
    });
    const updated = await serviceDb.get(currentService.id);
    if (updated) setCurrentService(updated);
    setAddDirectTitle("");
    setAddDirectArtist("");
    setAddDirectLyrics("");
  } catch (err) {
    console.error("Failed to add direct item:", err);
    setAddError("가사 추가에 실패했습니다.");
  }
}
```

- [ ] **Step 7: 탭 버튼 목록에 "직접 입력" 추가**

탭 버튼을 렌더하는 부분을 찾는다:
```tsx
{([\"song\", \"announcement\", \"blank\"] as const).map((tab) => (
```

아래로 교체:
```tsx
{(["song", "announcement", "blank", "direct"] as const).map((tab) => (
  <button
    key={tab}
    onClick={() => { setAddTab(tab); setAddError(null); }}
    className={`flex-1 py-1 text-xs ${
      addTab === tab
        ? "bg-zinc-700 text-white"
        : "text-zinc-500 hover:text-white"
    }`}
  >
    {tab === "song" ? "찬양" : tab === "announcement" ? "기도·안내" : tab === "blank" ? "블랭크" : "직접 입력"}
  </button>
))}
```

- [ ] **Step 8: 직접 입력 탭 UI 추가**

Blank 탭 UI 블록 (`{addTab === "blank" && ...}`) 바로 아래에 추가:

```tsx
{/* Direct input tab */}
{addTab === "direct" && (
  <div className="p-1.5 space-y-1.5" style={{ maxHeight: 220, overflowY: "auto" }}>
    <input
      type="text"
      placeholder="제목 (필수)"
      value={addDirectTitle}
      onChange={(e) => setAddDirectTitle(e.target.value)}
      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
    />
    <input
      type="text"
      placeholder="아티스트 (선택)"
      value={addDirectArtist}
      onChange={(e) => setAddDirectArtist(e.target.value)}
      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
    />
    <textarea
      placeholder={"가사를 붙여넣으세요.\n빈 줄로 슬라이드를 구분합니다."}
      value={addDirectLyrics}
      onChange={(e) => setAddDirectLyrics(e.target.value)}
      rows={6}
      className="w-full bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500 resize-none"
    />
    <button
      onClick={addDirectItem}
      disabled={!addDirectTitle.trim()}
      className="w-full text-xs py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
    >
      + 큐에 추가
    </button>
  </div>
)}
```

- [ ] **Step 9: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

예상: 에러 없음.

- [ ] **Step 10: 수동 동작 확인**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

확인 항목:
1. 편집 모드에서 "+ 항목 추가" → "직접 입력" 탭 보임
2. 제목 없으면 "+ 큐에 추가" 버튼 비활성
3. 제목 + 가사 입력 후 추가 → 큐에 즉시 추가됨
4. 슬라이드 네비게이션으로 가사 확인
5. 찬양 탭에서 추가된 곡 클릭 → SongEditor에서 편집 가능

- [ ] **Step 11: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "feat: add direct lyric input tab to QueuePanel"
```

---

## 완료 기준

- [ ] "직접 입력" 탭이 항목 추가 패널에 표시됨
- [ ] 제목 필수 검증 (비어있으면 버튼 비활성)
- [ ] 빈 줄 기준 슬라이드 자동 분리
- [ ] 추가 후 큐에 즉시 반영
- [ ] 찬양 탭에서 SongEditor로 편집 가능
- [ ] `npx tsc --noEmit` 에러 없음
