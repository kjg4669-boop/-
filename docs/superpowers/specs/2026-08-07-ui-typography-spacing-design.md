# UI Typography & Spacing Improvement Design

**Date:** 2026-08-07
**Scope:** Visual-only — no layout structure changes
**Goal:** Eliminate unreadably small text and cramped interactive elements across all controller UI components

## Principles

1. **Minimum font size: `text-xs` (12px)** — remove all `text-[8px]`, `text-[9px]`, `text-[10px]` usages except one allowed exception
2. **Exception:** RibbonToolbar icon labels may use `text-[10px]` due to tight horizontal space
3. **Minimum interactive padding:** `py-1` / `px-2` — remove `py-0.5`, `px-1` on clickable elements
4. **Minimum gap between elements:** `gap-1` — remove `gap-0.5` in interactive areas
5. **Contrast floor:** secondary/helper text at `text-zinc-500` minimum; `text-zinc-600` only for purely decorative separators
6. **No structural changes:** panel layout, tab count, component hierarchy unchanged

## Target Components

### RibbonToolbar (`components/controller/RibbonToolbar.tsx`)
- Icon button labels: `text-[8px]` / `text-[9px]` → `text-[10px]` (allowed exception)
- Section group headers inside tabs: `text-[9px]` → `text-xs`
- Tab button text: verify ≥ `text-xs`

### ControlBar (`components/controller/ControlBar.tsx`)
- Status/label text: `text-[10px]` → `text-xs`
- Button padding: `py-0.5` → `py-1`, `px-1` → `px-2` where cramped
- Input placeholder/label sizes: `text-[10px]` → `text-xs`

### LayerSidebar (`components/controller/LayerSidebar.tsx`)
- Slider row labels: `text-[10px]` → `text-xs`
- Helper/unit text (e.g., "px", "초"): `text-zinc-600` → `text-zinc-500`, size → `text-xs`
- Section divider labels: `text-[10px]` → `text-xs`
- Toggle/checkbox labels: verify ≥ `text-xs`

### QueuePanel (`components/controller/QueuePanel.tsx`)
- Slide subtitle / duration text: `text-[10px]` → `text-xs`
- Section header badges: `text-[10px]` → `text-xs`
- Item vertical padding: `py-1.5` → `py-2` if visually cramped

### LibraryPanel (`components/controller/LibraryPanel.tsx`)
- Tag label / metadata text: `text-[10px]`, `text-[11px]` → `text-xs`
- Search result secondary text: verify ≥ `text-xs`

### AnnouncementPanel (`components/controller/AnnouncementPanel.tsx`)
- Status badge: `text-[10px]` → `text-xs`
- Duration display: verify ≥ `text-xs`

## Out of Scope
- Output/Stage display windows (projector-facing, different size requirements)
- SubtitleLayer / BackgroundLayer rendering (user-controlled font sizes)
- Color theme changes beyond contrast floor adjustment
- Any layout restructuring (ControlBar height, panel widths, tab reorganization)

## Acceptance Criteria
- `grep -rn 'text-\[8px\]\|text-\[9px\]\|text-\[10px\]'` returns zero results in `components/controller/` (except RibbonToolbar icon labels which may have `text-[10px]`)
- `grep -rn 'py-0\.5\|px-1[^0-9]'` returns zero results on interactive button elements in `components/controller/`
- Visual inspection: all label text clearly readable at normal viewing distance
- TypeScript: `npm run build` clean (no new errors)
