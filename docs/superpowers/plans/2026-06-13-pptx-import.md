# PPTX 임포트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LibraryPanel 찬양 탭에 "PPTX" 버튼을 추가해 `.pptx` 파일의 슬라이드 텍스트를 `LyricSlide[]`로 변환, 찬양 DB에 저장하고 SongEditor로 편집할 수 있게 한다.

**Architecture:** JSZip으로 브라우저 내 PPTX(ZIP) 파싱 → `lib/pptxParser.ts`가 슬라이드 XML에서 텍스트 추출 → `PptxImportModal.tsx`에서 제목 입력 + 미리보기 → `songDb.create` → `LibraryPanel` 목록 갱신.

**Tech Stack:** Next.js 16 ("use client"), TypeScript, JSZip, DOMParser (브라우저 내장), tauri-plugin-sql (SQLite)

> ⚠️ **테스트**: 자동화 테스트 없음. `source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev` 실행 후 수동 확인.

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `package.json` | jszip 의존성 추가 |
| `lib/pptxParser.ts` | 신규 — PPTX 파싱 함수 |
| `components/controller/PptxImportModal.tsx` | 신규 — 임포트 모달 컴포넌트 |
| `components/controller/LibraryPanel.tsx` | "PPTX" 버튼 + 모달 연결 |

---

## 참고: 타입 및 시그니처

```ts
// lib/types.ts — 기존
interface LyricSlide {
  id: string;           // "verse-1", "verse-2", ...
  section: LyricSection;  // "verse"
  sectionIndex: number;   // 1, 2, 3, ...
  lines: string[];
}

// songDb.create 시그니처 (lib/db.ts — 기존)
songDb.create(song: {
  title: string;
  artist: string;
  lyrics_json: LyricSlide[];
  media_id?: number;
}): Promise<number>

// songDb.get (lib/db.ts — 기존)
songDb.get(id: number): Promise<Song | null>
```

---

## Task 1: JSZip 설치 + lib/pptxParser.ts

**Files:**
- Modify: `package.json` (npm install로 간접 수정)
- Create: `lib/pptxParser.ts`

- [ ] **Step 1: jszip 설치**

```bash
cd /Volumes/P31/chppt/worship-projector && npm install jszip
```

설치 후 `package.json`의 `dependencies`에 `"jszip"` 항목 확인.

- [ ] **Step 2: lib/pptxParser.ts 생성**

```ts
"use client";

import JSZip from "jszip";
import type { LyricSlide } from "./types";

export interface ParsedSlide {
  slideNumber: number;  // 원본 슬라이드 번호 (1-based)
  lines: string[];      // 단락별 텍스트 (빈 항목 제거됨)
}

/**
 * PPTX 파일에서 슬라이드 텍스트를 추출한다.
 * 텍스트가 없는 슬라이드는 제외된다.
 */
export async function parsePptx(file: File): Promise<ParsedSlide[]> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // ppt/slides/slideN.xml 목록을 번호 순 정렬
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/(\d+)/)?.[1] ?? "0", 10);
      const nb = parseInt(b.match(/(\d+)/)?.[1] ?? "0", 10);
      return na - nb;
    });

  const results: ParsedSlide[] = [];

  for (let i = 0; i < slideEntries.length; i++) {
    const xml = await zip.files[slideEntries[i]].async("string");
    const lines = extractLinesFromSlideXml(xml);
    if (lines.length > 0) {
      results.push({ slideNumber: i + 1, lines });
    }
  }

  return results;
}

/**
 * 슬라이드 XML에서 단락별 텍스트를 추출한다.
 * 각 <a:p> 단락의 <a:t> 텍스트를 이어붙인 것이 하나의 lines 항목이 된다.
 */
function extractLinesFromSlideXml(xml: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "application/xml");
  const paragraphs = Array.from(doc.querySelectorAll("p"));

  const lines: string[] = [];
  for (const para of paragraphs) {
    const runs = Array.from(para.querySelectorAll("t"));
    const text = runs.map((r) => r.textContent ?? "").join("").trim();
    if (text) {
      lines.push(text);
    }
  }
  return lines;
}

/**
 * ParsedSlide[] → LyricSlide[] 변환.
 * 각 ParsedSlide가 하나의 LyricSlide(verse)가 된다.
 */
export function parsedSlidesToLyricSlides(slides: ParsedSlide[]): LyricSlide[] {
  return slides.map((slide, i) => ({
    id: `verse-${i + 1}`,
    section: "verse" as const,
    sectionIndex: i + 1,
    lines: slide.lines,
  }));
}
```

- [ ] **Step 3: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

예상: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add package.json package-lock.json lib/pptxParser.ts
git commit -m "feat: add pptxParser utility with JSZip"
```

---

## Task 2: PptxImportModal 컴포넌트

**Files:**
- Create: `components/controller/PptxImportModal.tsx`

- [ ] **Step 1: 파일 생성**

```tsx
"use client";

import { useState } from "react";
import { songDb } from "@/lib/db";
import { parsedSlidesToLyricSlides } from "@/lib/pptxParser";
import type { ParsedSlide } from "@/lib/pptxParser";
import type { Song } from "@/lib/types";

interface Props {
  fileName: string;
  slides: ParsedSlide[];        // 비어있지 않은 슬라이드만 전달됨
  onSave: (saved: Song) => void;
  onCancel: () => void;
}

export default function PptxImportModal({ fileName, slides, onSave, onCancel }: Props) {
  // 파일명에서 .pptx 제거해 초기 제목으로 사용
  const defaultTitle = fileName.replace(/\.pptx$/i, "");
  const [title, setTitle] = useState(defaultTitle);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!title.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const lyrics = parsedSlidesToLyricSlides(slides);
      const songId = await songDb.create({
        title: title.trim(),
        artist: "",
        lyrics_json: lyrics,
      });
      const saved = await songDb.get(songId);
      if (saved) onSave(saved);
    } catch (err) {
      console.error("PPTX import save failed:", err);
      setError("저장에 실패했습니다. 다시 시도해 주세요.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg w-[480px] max-h-[80vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="px-4 py-3 border-b border-zinc-700 flex items-center justify-between">
          <span className="text-sm font-semibold text-white">PPTX 임포트</span>
          <span className="text-xs text-zinc-500 truncate max-w-[200px]">{fileName}</span>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {/* 제목 입력 */}
          <div>
            <label className="block text-xs text-zinc-400 mb-1">제목 (필수)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-zinc-800 text-white text-sm rounded px-3 py-1.5 border border-zinc-600 outline-none focus:border-blue-500"
              placeholder="찬양 제목을 입력하세요"
              autoFocus
            />
          </div>

          {/* 슬라이드 미리보기 */}
          <div>
            <p className="text-xs text-zinc-400 mb-1.5">
              슬라이드 미리보기 ({slides.length}장)
            </p>
            {slides.length === 0 ? (
              <p className="text-xs text-yellow-400">
                텍스트가 있는 슬라이드가 없습니다. 빈 가사로 저장됩니다.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {slides.map((slide, i) => (
                  <div
                    key={i}
                    className="bg-zinc-800 border border-zinc-700 rounded p-2 text-xs"
                  >
                    <span className="text-zinc-500 text-[10px]">{i + 1}</span>
                    <p className="text-white mt-0.5 line-clamp-3 leading-snug">
                      {slide.lines.join("\n")}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 에러 */}
          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-700 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="text-xs px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-white"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={!title.trim() || saving}
            className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white"
          >
            {saving ? "저장 중..." : "찬양 라이브러리에 저장"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

예상: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/PptxImportModal.tsx
git commit -m "feat: add PptxImportModal component"
```

---

## Task 3: LibraryPanel에 PPTX 버튼 연결

**Files:**
- Modify: `components/controller/LibraryPanel.tsx`

현재 파일 구조 (LibraryPanel.tsx):
- 상단 import 블록
- `songs` 모드의 헤더 영역 (line 150-164): 검색창 + "새 찬양" 버튼
- `handleSongSaved(saved: Song)` 함수 존재

- [ ] **Step 1: 현재 파일 읽기**

```bash
cat /Volumes/P31/chppt/worship-projector/components/controller/LibraryPanel.tsx
```

- [ ] **Step 2: import 추가**

파일 상단 import에 추가:

```ts
import { useRef, useState, useEffect } from "react";  // useRef 이미 있음, 확인 후 중복 제거
import { parsePptx } from "@/lib/pptxParser";
import PptxImportModal from "./PptxImportModal";
import type { ParsedSlide } from "@/lib/pptxParser";
```

기존 `import { useEffect, useState, useRef } from "react";` 라인은 이미 셋 다 있으므로 수정 없이 아래 두 줄만 추가:

```ts
import { parsePptx } from "@/lib/pptxParser";
import PptxImportModal from "./PptxImportModal";
import type { ParsedSlide } from "@/lib/pptxParser";
```

- [ ] **Step 3: 상태 및 ref 추가**

`noticeTimerRef` 선언 바로 아래에 추가:

```ts
const pptxInputRef = useRef<HTMLInputElement | null>(null);
const [pptxModal, setPptxModal] = useState<{ fileName: string; slides: ParsedSlide[] } | null>(null);
const [pptxLoading, setPptxLoading] = useState(false);
```

- [ ] **Step 4: PPTX 파일 처리 핸들러 추가**

`handleEditCancel` 함수 바로 아래에 추가:

```ts
async function handlePptxFile(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0];
  if (!file) return;
  // 동일 파일 재선택 허용을 위해 value 초기화
  e.target.value = "";
  setPptxLoading(true);
  try {
    const slides = await parsePptx(file);
    setPptxModal({ fileName: file.name, slides });
  } catch (err) {
    console.error("PPTX parse failed:", err);
    showNotice("PPTX 파일을 읽을 수 없습니다.");
  } finally {
    setPptxLoading(false);
  }
}

function handlePptxSaved(saved: Song) {
  setPptxModal(null);
  setSongs((prev) =>
    prev.some((s) => s.id === saved.id)
      ? prev.map((s) => (s.id === saved.id ? saved : s))
      : [...prev, saved]
  );
  showNotice(`"${saved.title}" 임포트됨`);
}
```

- [ ] **Step 5: songs 모드 JSX 수정**

헤더 영역 (현재):
```tsx
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
```

아래로 교체:
```tsx
<div className="p-2 border-b border-zinc-700 flex gap-1">
  <input
    type="text"
    placeholder="찬양 검색..."
    value={search}
    onChange={(e) => handleSearch(e.target.value)}
    className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-blue-500"
  />
  {/* 숨겨진 파일 입력 */}
  <input
    ref={pptxInputRef}
    type="file"
    accept=".pptx"
    onChange={handlePptxFile}
    className="hidden"
  />
  <button
    onClick={() => pptxInputRef.current?.click()}
    disabled={pptxLoading}
    className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 rounded whitespace-nowrap"
  >
    {pptxLoading ? "..." : "PPTX"}
  </button>
  <button
    onClick={handleNewSong}
    className="text-xs px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded whitespace-nowrap"
  >
    + 새 찬양
  </button>
</div>
```

- [ ] **Step 6: 모달 렌더링 추가**

songs 모드 `return` 블록의 최상단 `<div className="h-full flex flex-col">` 바로 안쪽, `{notice && ...}` 바로 위에 추가:

```tsx
{/* PPTX 임포트 모달 */}
{pptxModal && (
  <PptxImportModal
    fileName={pptxModal.fileName}
    slides={pptxModal.slides}
    onSave={handlePptxSaved}
    onCancel={() => setPptxModal(null)}
  />
)}
```

- [ ] **Step 7: TypeScript 확인**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```

예상: 에러 없음.

- [ ] **Step 8: 커밋**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/LibraryPanel.tsx
git commit -m "feat: add PPTX import button and modal to LibraryPanel"
```

---

## Task 4: 수동 동작 확인

- [ ] **Step 1: 개발 서버 실행**

```bash
source ~/.cargo/env && cd /Volumes/P31/chppt/worship-projector && npm run tauri:dev
```

- [ ] **Step 2: 확인 항목**

1. 찬양 탭에서 "PPTX" 버튼 표시됨
2. 버튼 클릭 → OS 파일 선택 다이얼로그 열림
3. `.pptx` 파일 선택 → 임포트 모달 열림
4. 슬라이드 미리보기 표시됨
5. 파일명에서 확장자 제거된 제목 자동 입력됨
6. 제목 없으면 "저장" 버튼 비활성
7. 저장 후 찬양 목록에 즉시 추가됨
8. 추가된 곡 클릭 → SongEditor에서 슬라이드 확인 가능
9. 예배에 추가 후 슬라이드 네비게이션으로 가사 확인

---

## 완료 기준

- [ ] "PPTX" 버튼이 찬양 탭 헤더에 표시됨
- [ ] `.pptx` 파일 선택 시 슬라이드 미리보기 모달 열림
- [ ] 빈 슬라이드 자동 제외
- [ ] 저장 후 찬양 라이브러리에 즉시 반영
- [ ] SongEditor로 편집 가능
- [ ] `npx tsc --noEmit` 에러 없음
