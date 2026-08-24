# UI Typography & Spacing Improvement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise minimum font size to text-xs (12px) and minimum interactive padding to py-1/px-2 across all controller UI components, with no structural changes.

**Architecture:** Visual-only diff — search-and-replace small Tailwind size classes in 5 controller components. No logic, no layout, no component hierarchy changes. Each task is one file.

**Tech Stack:** Next.js 16, Tailwind CSS v4, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-07-ui-typography-spacing-design.md`

---

### Task 1: RibbonToolbar — icon labels & helper text

**Files:**
- Modify: `components/controller/RibbonToolbar.tsx`

**Changes:**
- `text-[8px]` → `text-[10px]` (icon labels — only allowed exception to xs rule due to space)
- `text-[9px]` → `text-[10px]` (other small labels)
- `text-[10px]` on non-icon-label elements → `text-xs` (Look label, 테마 label, 전환속도 label, 텍스트 입장 label, helper descriptions)
- `text-[11px]` Look dropdown select → `text-xs`
- `px-1 py-0` on cut/copy/paste buttons → `px-2 py-0.5`

**Exact replacements in `components/controller/RibbonToolbar.tsx`:**

```
Line 150,155,160,169,174,184,189,195,204: "text-[8px]" → "text-[10px]"
Line 332: "text-[8px] text-zinc-400" → "text-[10px] text-zinc-400"
Line 378,383,388: "text-[9px]" → "text-[10px]"
Line 208,210,212: "px-1 py-0" → "px-2 py-0.5"
Line 266: "text-[10px] mr-1" → "text-xs mr-1"   (Look 라벨)
Line 274: "text-[11px]" → "text-xs"              (Look select)
Line 307: "text-[10px] mr-1" → "text-xs mr-1"   (테마 라벨)
Line 325: "text-[8px]" → "text-[10px]"           (테마 라벨)
Line 338: "text-[10px] mr-1" → "text-xs mr-1"   (전환 속도 라벨)
Line 346,365: "text-[10px]" → "text-xs"          (전환속도/입장 버튼)
Line 351,370: "text-zinc-500 text-[10px]" → "text-zinc-500 text-xs"  (헬퍼)
Line 356: "text-[10px] mr-1" → "text-xs mr-1"
Line 393,397: "text-[10px]" → "text-xs"
```

- [ ] **Step 1: Apply replacements**

Open `components/controller/RibbonToolbar.tsx` and make the following changes (use Edit tool for each distinct pattern):

Replace all `text-[8px]` → `text-[10px]` (replace_all):
```
old: text-[8px]
new: text-[10px]
```

Replace all `text-[9px]` → `text-[10px]` (replace_all):
```
old: text-[9px]
new: text-[10px]
```

Replace all `text-[11px]` → `text-xs` (replace_all):
```
old: text-[11px]
new: text-xs
```

For `text-[10px]` occurrences that are NOT icon labels (i.e., the Look/테마/전환/입장 labels and helper text), replace each individually:

Line 266 area — Look 라벨:
```
old: <span className="text-zinc-400 text-[10px] mr-1">Look</span>
new: <span className="text-zinc-400 text-xs mr-1">Look</span>
```

Line 307 area — 테마 라벨:
```
old: <span className="text-zinc-400 text-[10px] mr-1">테마</span>
new: <span className="text-zinc-400 text-xs mr-1">테마</span>
```

Line 338 area — 전환 속도 라벨:
```
old: <span className="text-zinc-400 text-[10px] mr-1">전환 속도</span>
new: <span className="text-zinc-400 text-xs mr-1">전환 속도</span>
```

Line 351 area — 전환속도 헬퍼:
```
old: <span className="text-zinc-500 text-[10px]">슬라이드 간 페이드 전환 속도</span>
new: <span className="text-zinc-500 text-xs">슬라이드 간 페이드 전환 속도</span>
```

Line 356 area — 텍스트 입장 라벨:
```
old: <span className="text-zinc-400 text-[10px] mr-1">텍스트 입장</span>
new: <span className="text-zinc-400 text-xs mr-1">텍스트 입장</span>
```

Line 370 area — 입장 헬퍼:
```
old: <span className="text-zinc-500 text-[10px]">새 슬라이드 표시 시 텍스트 효과</span>
new: <span className="text-zinc-500 text-xs">새 슬라이드 표시 시 텍스트 효과</span>
```

Lines 346, 365 — 전환속도/입장 버튼 text:
```
old: rounded text-[10px] ${(layerConfig.transitionMs
new: rounded text-xs ${(layerConfig.transitionMs
```
```
old: rounded text-[10px] ${(layerConfig.subtitle.textEntrance
new: rounded text-xs ${(layerConfig.subtitle.textEntrance
```

Lines 393, 397 — 루프/블랙아웃 버튼:
```
old: rounded text-[10px] ${isLoop
new: rounded text-xs ${isLoop
```
```
old: rounded text-[10px] ${isBlackout
new: rounded text-xs ${isBlackout
```

Cut/copy/paste buttons `px-1 py-0` → `px-2 py-0.5`:
```
old: className="px-1 py-0 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">✂ 잘라내기
new: className="px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">✂ 잘라내기
```
```
old: className="px-1 py-0 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">📄 복사하기
new: className="px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400 text-[10px]">📄 복사하기
```
(Note: the text-[10px] on cut/copy/paste is the button text for icon+label buttons — leave as [10px] per exception rule)

디자인 패널 버튼 label:
```
old: <span className="text-[9px] mt-0.5">디자인 패널</span>
new: <span className="text-[10px] mt-0.5">디자인 패널</span>
```
(Already covered by text-[9px] → text-[10px] replace_all above)

- [ ] **Step 2: Verify no text-[8px] or text-[9px] remain**

```bash
grep -n 'text-\[8px\]\|text-\[9px\]' components/controller/RibbonToolbar.tsx
```
Expected: empty output

- [ ] **Step 3: Verify no text-[11px] remain**

```bash
grep -n 'text-\[11px\]' components/controller/RibbonToolbar.tsx
```
Expected: empty output

- [ ] **Step 4: TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 5: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/RibbonToolbar.tsx
git commit -m "style: RibbonToolbar 아이콘 라벨/헬퍼 텍스트 크기 개선"
```

---

### Task 2: ControlBar — font sizes & button padding

**Files:**
- Modify: `components/controller/ControlBar.tsx`

**Changes:**
- `text-[10px]` → `text-xs` throughout (status badge, slide counter, next slide preview, auto-advance display, video source text, countdown display, clock)
- `text-[11px]` → `text-xs` (clock)
- `py-0.5` on buttons → `py-1` (Live, Blackout, Clear, Frozen, auto-advance ±, output, stage, countdown ±, alert buttons)

- [ ] **Step 1: Replace text-[10px] → text-xs (replace_all)**

In `components/controller/ControlBar.tsx`, replace all occurrences:
```
old: text-[10px]
new: text-xs
```

- [ ] **Step 2: Replace text-[11px] → text-xs (replace_all)**

```
old: text-[11px]
new: text-xs
```

- [ ] **Step 3: Replace py-0.5 → py-1 on buttons (replace_all)**

```
old: py-0.5
new: py-1
```

Note: This affects all `py-0.5` in the file. Verify visually that this is appropriate for all elements (badges should be fine with py-1).

- [ ] **Step 4: Verify**

```bash
grep -n 'text-\[10px\]\|text-\[11px\]\|text-\[9px\]\|text-\[8px\]' components/controller/ControlBar.tsx
```
Expected: empty output

- [ ] **Step 5: TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/ControlBar.tsx
git commit -m "style: ControlBar 텍스트 크기 및 버튼 패딩 개선"
```

---

### Task 3: LayerSidebar — section labels & bilingual controls

**Files:**
- Modify: `components/controller/LayerSidebar.tsx`

**Changes:**
- `text-[10px]` → `text-xs` (섹션 헤더들: 배경, 영상 컨트롤, 자막, 오버레이; 볼륨 라벨; 프리셋/배치 버튼; 타임코드 표시)
- `text-[11px]` → `text-xs` (줄간격, 자간, 이중언어 라벨, 번역크기/색상 라벨, px 단위)
- `py-0.5` on preset/layout toggle buttons → `py-1`
- `text-zinc-500` on playback time display stays (already readable)

- [ ] **Step 1: Replace text-[10px] → text-xs (replace_all)**

In `components/controller/LayerSidebar.tsx`:
```
old: text-[10px]
new: text-xs
```

- [ ] **Step 2: Replace text-[11px] → text-xs (replace_all)**

```
old: text-[11px]
new: text-xs
```

- [ ] **Step 3: Replace py-0.5 on toggle buttons → py-1**

Target the preset and layout button rows:
```
old: className="flex-1 py-0.5 rounded text-[10px] bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
new: className="flex-1 py-1 rounded text-xs bg-zinc-700 text-zinc-300 hover:bg-zinc-600 hover:text-white transition-colors"
```

(The text-[10px] → text-xs is already handled by step 1; this step catches the py-0.5.)

Also the bilingual toggle button:
```
old: className={`text-[11px] px-2 py-0.5 rounded ${sub.bilingualEnabled
new: className={`text-xs px-2 py-1 rounded ${sub.bilingualEnabled
```

- [ ] **Step 4: Verify**

```bash
grep -n 'text-\[10px\]\|text-\[11px\]\|text-\[9px\]\|text-\[8px\]' components/controller/LayerSidebar.tsx
```
Expected: empty output

- [ ] **Step 5: TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/LayerSidebar.tsx
git commit -m "style: LayerSidebar 섹션 라벨 및 컨트롤 텍스트 크기 개선"
```

---

### Task 4: QueuePanel — slide metadata & slide list text

**Files:**
- Modify: `components/controller/QueuePanel.tsx`

**Changes:**
- `text-[10px]` → `text-xs` (아이콘 타입 표시, 아티스트 텍스트, "새 예배 만들기", 슬라이드 목록 라인, 메모 라벨/입력)
- `text-[9px]` → `text-xs` (발표자 메모 라벨)
- `text-zinc-600` (아티스트, 삭제 버튼) → `text-zinc-500` for better contrast

- [ ] **Step 1: Replace text-[10px] → text-xs (replace_all)**

In `components/controller/QueuePanel.tsx`:
```
old: text-[10px]
new: text-xs
```

- [ ] **Step 2: Replace text-[9px] → text-xs (replace_all)**

```
old: text-[9px]
new: text-xs
```

- [ ] **Step 3: Improve contrast — text-zinc-600 → text-zinc-500 (replace_all)**

```
old: text-zinc-600
new: text-zinc-500
```

- [ ] **Step 4: Verify**

```bash
grep -n 'text-\[10px\]\|text-\[11px\]\|text-\[9px\]\|text-\[8px\]' components/controller/QueuePanel.tsx
```
Expected: empty output

- [ ] **Step 5: TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/QueuePanel.tsx
git commit -m "style: QueuePanel 슬라이드 메타데이터 텍스트 크기 및 대비 개선"
```

---

### Task 5: LibraryPanel — tag filters, song metadata, media grid

**Files:**
- Modify: `components/controller/LibraryPanel.tsx`

**Changes:**
- `text-[10px]` → `text-xs` (태그 필터 버튼, 곡 목록 헬퍼/미리보기 텍스트, 미디어 파일명, 비디오 뱃지, 빈슬라이드 텍스트, 섹션 라벨)
- `text-[11px]` → `text-xs` (CCLI 리포트 버튼, 안내문)
- `py-0.5` on tag filter buttons → `py-1`
- `text-zinc-600` → `text-zinc-500` (빈슬라이드 italic, 절 수, 아이콘)

- [ ] **Step 1: Replace text-[10px] → text-xs (replace_all)**

In `components/controller/LibraryPanel.tsx`:
```
old: text-[10px]
new: text-xs
```

- [ ] **Step 2: Replace text-[11px] → text-xs (replace_all)**

```
old: text-[11px]
new: text-xs
```

- [ ] **Step 3: Replace py-0.5 on tag filter buttons → py-1**

```
old: px-2 py-0.5 rounded-full text-[10px] border transition-all
new: px-2 py-1 rounded-full text-xs border transition-all
```

(text-[10px] is already handled by step 1; the py-0.5 part is the important fix here)

Also the second tag button pattern:
```
old: className="px-2 py-0.5 rounded-full text-[10px] border transition-all"
new: className="px-2 py-1 rounded-full text-xs border transition-all"
```

- [ ] **Step 4: Improve contrast — text-zinc-600 → text-zinc-500 (replace_all)**

```
old: text-zinc-600
new: text-zinc-500
```

- [ ] **Step 5: Verify**

```bash
grep -n 'text-\[10px\]\|text-\[11px\]\|text-\[9px\]\|text-\[8px\]' components/controller/LibraryPanel.tsx
```
Expected: empty output

- [ ] **Step 6: TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/LibraryPanel.tsx
git commit -m "style: LibraryPanel 태그/미디어 텍스트 크기 및 대비 개선"
```

---

### Task 6: AnnouncementPanel & final sweep

**Files:**
- Modify: `components/controller/AnnouncementPanel.tsx`
- Verify: all other controller components

**Changes:**
- AnnouncementPanel: `text-[10px]` status badge → `text-xs`
- Final global sweep to catch any missed occurrences

- [ ] **Step 1: Fix AnnouncementPanel badge**

In `components/controller/AnnouncementPanel.tsx`:
```
old: text-[10px]
new: text-xs
```

- [ ] **Step 2: Global sweep — verify zero violations in components/controller/**

```bash
grep -rn 'text-\[8px\]\|text-\[9px\]\|text-\[10px\]\|text-\[11px\]' /Volumes/P31/chppt/worship-projector/components/controller/
```
Expected: only RibbonToolbar matches for `text-[10px]` (icon labels — allowed exception). Zero matches in all other files.

- [ ] **Step 3: Final TypeScript check**

```bash
cd /Volumes/P31/chppt/worship-projector && npx tsc --noEmit 2>&1
```
Expected: no output (zero errors)

- [ ] **Step 4: Commit**

```bash
cd /Volumes/P31/chppt/worship-projector
git add components/controller/AnnouncementPanel.tsx
git commit -m "style: AnnouncementPanel 뱃지 텍스트 크기 개선 + 전체 타이포그래피 정리 완료"
```
