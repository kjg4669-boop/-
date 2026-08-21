# 코드 검사 기록 (4차 — 2026-08-10)

## 검사 범위

| 파일 | 상태 |
|------|------|
| `lib/types.ts` | ✅ 이상 없음 |
| `lib/ipc.ts` | ✅ 이상 없음 |
| `lib/db.ts` | ✅ 수정 완료 |
| `lib/validators.ts` | ✅ 수정 완료 (CRITICAL) |
| `lib/looksDb.ts` | ✅ 이상 없음 |
| `lib/backingTrackDb.ts` | ✅ 이상 없음 |
| `lib/songUsageDb.ts` | ✅ 이상 없음 |
| `lib/utils.ts` | ✅ 이전 세션 수정 완료 |
| `stores/queueStore.ts` | ✅ 수정 완료 |
| `hooks/useKeyboardShortcuts.ts` | ✅ 이상 없음 |
| `hooks/useCountdown.ts` | ✅ 이상 없음 |
| `hooks/useMenuEvents.ts` | ✅ 이상 없음 |
| `hooks/useAutoSave.ts` | ✅ 이상 없음 |
| `components/controller/SongEditor.tsx` | ✅ 수정 완료 |
| `components/controller/QueuePanel.tsx` | ✅ 수정 완료 |
| `components/controller/LooksPanel.tsx` | ✅ 이전 세션 수정 완료 |
| `components/controller/AlertPanel.tsx` | ✅ 이전 세션 수정 완료 |
| `components/controller/AnnouncementPanel.tsx` | ✅ 이전 세션 수정 완료 |
| `components/controller/LayerSidebar.tsx` | ✅ 이전 세션 수정 완료 |
| `components/controller/ControlBar.tsx` | ✅ 이전 세션 수정 완료 |
| `components/controller/LibraryPanel.tsx` | ✅ 수정 완료 |
| `app/output/page.tsx` | ✅ 수정 완료 |
| `app/stage/page.tsx` | ✅ 이상 없음 |
| `components/layers/SubtitleLayer.tsx` | ✅ 이상 없음 |
| `stores/outputStore.ts` | ✅ 이상 없음 |
| `hooks/useAutoSave.ts` | ✅ 이상 없음 (설계상 name+notes만 저장) |

---

## 4차 발견 및 수정 사항

### 🟠 HIGH

#### 6. `app/output/page.tsx` — Alert 타이머가 색상 변경 시 리셋됨
- **문제**: `alertDismissTimer` useEffect 의존성 배열에 `alertPosition`, `alertBgColor`, `alertTextColor` 포함 — AlertPanel에서 경보 색상을 수정하면 effect 재실행으로 타이머가 초기값으로 리셋됨. 5초 경보가 색상 변경마다 다시 5초로 됨.
- **수정**: 세 값을 ref로 분리 (`alertPositionRef` 등), setTimeout 콜백 내에서 ref를 읽도록 변경, 의존성 배열에서 제거.

### 🟡 MEDIUM

#### 7. `components/controller/LibraryPanel.tsx` — CCLI CSV 쌍따옴표 미이스케이프
- **문제**: CSV 생성 시 `"${r.title}"` 패턴 사용 — 곡 제목에 `"` 문자가 포함되면 CSV 형식이 깨짐 (Excel에서 오작동).
- **수정**: `esc()` 헬퍼 추가 (`replace(/"/g, '""')`) — RFC 4180 표준 CSV 이스케이프 적용.

---

## 3차 발견 및 수정 사항

### 🔴 CRITICAL

#### 1. `lib/validators.ts` — `parseLyricSlide`: `lines2`, `chords` 무조건 소실
- **문제**: `parseLyricSlide`가 `LyricSlide`를 재구성할 때 `lines2`(이중언어 가사)와 `chords`(코드 차트)를 포함하지 않음. DB에서 곡을 로드할 때마다 이중언어·코드 데이터가 메모리에서 사라짐.
- **영향**: 이중언어 자막(Phase G) 및 코드 차트(Phase L) 전체가 저장은 되지만 로드 후 즉시 사라짐 — 사실상 미동작 상태.
- **수정**: `lines2` 배열과 `chords` 문자열을 조건부로 보존하는 코드 추가.

### 🟠 HIGH

#### 2. `stores/queueStore.ts` — `updateCurrentServiceNotes` `isDirty` 누락
- **문제**: 서비스 메모(notes) 편집 시 `isDirty: true`가 설정되지 않아 "미저장" 표시기가 나타나지 않음.
- **영향**: 사용자가 서비스 메모 편집 후 저장 없이 창을 닫아도 경고가 없음.
- **수정**: `set({ ..., isDirty: true })` 추가.

### 🟡 MEDIUM

#### 3. `lib/db.ts` — `parseSong`: `verse_order`에 raw `JSON.parse` 사용
- **문제**: `row.verse_order`를 파싱할 때 `JSON.parse` 직접 사용 — 손상된 JSON이면 예외 발생.
- **수정**: 기존 `safeJsonParse<string[]>` 유틸로 교체.

#### 4. `components/controller/SongEditor.tsx` — 배킹 트랙 인라인 핸들러 try/catch 누락
- **문제**: 트랙 삭제, 볼륨, 반복 체크박스의 onChange/onClick이 모두 `await` 포함 async 함수지만 try/catch 없음. DB 오류 시 unhandled rejection.
- **수정**: 세 핸들러 모두 `try { … } catch { /* ignore */ }` 래핑.

#### 5. `components/controller/QueuePanel.tsx` — `loadService` try/catch 누락
- **문제**: 서비스 선택 드롭다운 onChange 시 호출되는 `loadService`에 에러 처리 없음. DB 실패 시 예배 목록이 빈 상태로 남음.
- **수정**: try/catch 추가 + `showOpNotice("예배를 불러오지 못했습니다", true)`.

---

## 1·2차 수정 사항 (이전 세션 요약)

| 파일 | 수정 내용 | 심각도 |
|------|-----------|--------|
| `lib/db.ts` ×3 | `saveItems`/`duplicate`/`addItem`에 `notes` 컬럼 누락 → 저장 시 발표자 메모 소실 | CRITICAL |
| `lib/utils.ts` | `saveGlobalDefaults`에서 `lines2` 미제거 → 이중언어 가사가 전역 기본값에 오염 | HIGH |
| `ControlBar.tsx` | 라이브→송출 레이블/tooltip 일관성 | LOW |
| `LayerSidebar.tsx` | 미디어 임포트 실패 시 사용자 피드백 없음 | MEDIUM |
| `AnnouncementPanel.tsx` | `handleSave`/`handleDelete` try/catch 누락 | MEDIUM |
| `AlertPanel.tsx` | `handleSaveTemplate`/`handleDeleteTemplate` try/catch 누락 | MEDIUM |
| `LooksPanel.tsx` | `handleSaveEdit`/`handleSaveNew`/`handleDelete` try/catch 누락 | MEDIUM |

---

## TypeScript 상태
- 4차 검사 후: **0 errors, 0 warnings** ✅
