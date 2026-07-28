# worship-projector 전면 업그레이드 스펙

## 프로젝트 컨텍스트

- **스택**: Tauri v2 + Next.js 16 (App Router, static export) + TypeScript + Zustand v5 + SQLite
- **현재 점수**: 6.62/10 (2026-07-03 분석)
- **참고 레퍼런스**: EasyWorship (직관적 교회용 UI)
- **작업 디렉토리**: `/Volumes/P31/chppt/worship-projector`

---

## 작업 범위

### P0: 버그/안정성 수정 (즉시)

#### P0-1: 메뉴 Dead UI 수정
- **문제**: `src-tauri/src/lib.rs`에서 Rust 메뉴가 emit하는 4개 이벤트에 프론트엔드 리스너 없음
  - `menu:new-service` → 새 예배 생성 폼 열기
  - `menu:open-service` → 서비스 목록 모달 열기
  - `menu:save-service` → 현재 서비스 저장
  - `menu:save-as` → 다른 이름으로 저장 (이름 변경 폼 열기)
- **수정**: `app/controller/page.tsx`의 useEffect에 Tauri 메뉴 이벤트 리스너 추가
- **IPC**: `lib/ipc.ts`에 `onMenuEvent(name, cb)` 메서드 추가

#### P0-2: useMemo 의존성 수정
- **문제**: `eslint-disable-next-line react-hooks/exhaustive-deps` 4건
  - `SlideCanvas.tsx`: `slides` useMemo가 `activeItemIndex`, `activeLyricSlideIndex` 누락
  - `controller/page.tsx`: 유사 패턴
- **수정**: 올바른 의존성 배열로 수정, eslint-disable 제거

#### P0-3: getFlatSlideList 성능 수정
- **문제**: `SlideCanvas.tsx` 65-66줄에서 매 렌더마다 O(n) 순회 2회
- **수정**: `useMemo`로 래핑, 올바른 의존성 지정

---

### P1: EasyWorship UX 개선

#### P1-1: QueuePanel 슬라이드 썸네일 미리보기
- **현재**: 서비스 아이템이 텍스트 목록으로만 표시
- **목표**: 아이템 클릭 시 해당 찬양의 슬라이드 목록을 텍스트 기반 썸네일로 표시
- **구현**: QueuePanel에서 activeItem의 song.lyrics_json을 인라인으로 펼쳐 보여줌
  - 각 슬라이드: 섹션명 뱃지 + 첫 2줄 텍스트 미리보기
  - 클릭 시 해당 슬라이드로 바로 이동 (setActiveItem + setActiveLyricSlide)
- **위치**: 서비스 아이템 목록 하단에 접이식 슬라이드 패널

#### P1-2: LibraryPanel 검색 개선
- **현재**: 검색 시 DB 쿼리
- **목표**: 디바운스(300ms) 적용, 검색 중 로딩 표시, 결과 없음 메시지 개선
- **구현**: `useRef` + `setTimeout` 디바운스

---

### P2: Stage Display (발표자 모니터)

#### 개요
EasyWorship의 핵심 기능 중 하나. 발표자가 별도 모니터에서 현재/다음 슬라이드를 볼 수 있음.

#### Rust 커맨드 (src-tauri/src/lib.rs)
```rust
#[tauri::command]
async fn open_stage_display(app: tauri::AppHandle) -> Result<(), String> {
    // WebviewWindow 생성, label: "stage"
    // URL: /stage, 크기: 1280x720, 타이틀: "Stage Display"
}

#[tauri::command]
async fn close_stage_display(app: tauri::AppHandle) -> Result<(), String> {
    // "stage" 창 닫기
}
```

#### 새 라우트 (app/stage/page.tsx)
- **레이아웃**: 상단 70% = 현재 슬라이드 (가사 크게), 하단 30% = 다음 슬라이드 + 서비스 정보
- **배경**: 어두운 테마 (#1a1a2e)
- **정보 표시**:
  - 현재 찬양 제목 + 섹션 (예: "주님 한 분만으로 - Chorus 1")
  - 현재 슬라이드 가사 (큰 폰트, 흰색)
  - 다음 슬라이드 가사 미리보기 (작은 폰트, 회색)
  - 서비스 진행 위치 (예: "2/5번째 찬양, 3/4번째 슬라이드")
  - 현재 시각 표시

#### IPC
- `slide:update` 이벤트를 stage 창도 수신 (기존 이벤트 재사용)
- `ipc.ts`에 stage창 전용 헬퍼 불필요 (broadcast 이벤트이므로)
- 컨트롤러에 "Stage Display 열기/닫기" 버튼 추가 (상단 툴바)

#### 타입 확장 (lib/types.ts)
```typescript
// IPC 이벤트에 stage 메타 추가
export interface SlideUpdatePayload {
  layerConfig: LayerConfig;
  meta?: {
    songTitle: string;
    section: string;
    slideIndex: number;
    totalSlides: number;
    itemIndex: number;
    totalItems: number;
    nextLines?: string[];
    nextSection?: string;
  };
}
```

---

### P3: 카운트다운 타이머

#### 개요
예배 시작 전 카운트다운을 출력창에 오버레이로 표시.

#### 타입 추가 (lib/types.ts)
```typescript
export interface CountdownPayload {
  active: boolean;
  remainingMs: number;  // 남은 밀리초
  totalMs: number;      // 전체 밀리초
}
```

#### IPC 추가 (lib/ipc.ts)
- `sendCountdown(payload: CountdownPayload)` — 컨트롤러 → 출력창
- `onCountdown(cb)` — 출력창 리스너
- IPC 이벤트명: `countdown:update`

#### 컨트롤러 UI
- 위치: LayerSidebar 하단 또는 상단 툴바 드롭다운
- 컨트롤: 분 선택(1~30분), 시작/정지/리셋 버튼
- 상태: 로컬 state + useInterval로 1초마다 감소 + sendCountdown IPC

#### 출력창 (app/output/page.tsx)
- `CountdownLayer` 컴포넌트 추가 (z-index: 50, blackout 아래)
- 표시 형식: MM:SS (큰 폰트 가운데), 반투명 오버레이
- 0:00 도달 시 3초 후 자동 숨김
- `ipc.onCountdown()` 리스너 추가

#### 상태 (outputStore)
- `countdown: CountdownPayload | null` 추가

---

## 아키텍처 제약

- Next.js static export 유지 (`output: "export"`)
- Tauri v2 API 사용 (`@tauri-apps/api/webviewWindow`)
- 모든 IPC 이벤트는 `lib/ipc.ts`를 통해서만 접근
- TypeScript strict 유지, `any` 타입 사용 금지
- 새 Tauri 창은 `tauri.conf.json`의 `windows` 배열에 등록 또는 런타임 생성

## 파일 변경 목록

### 수정 파일
- `src-tauri/src/lib.rs` — open_stage_display, close_stage_display 커맨드 추가
- `lib/types.ts` — SlideUpdatePayload meta, CountdownPayload 추가
- `lib/ipc.ts` — onMenuEvent, sendCountdown, onCountdown, sendSlideUpdate 메타 확장
- `stores/outputStore.ts` — countdown 상태 추가
- `app/controller/page.tsx` — 메뉴 이벤트 리스너 + Stage Display 버튼 + 카운트다운 컨트롤
- `app/output/page.tsx` — CountdownLayer 추가
- `components/controller/QueuePanel.tsx` — 슬라이드 썸네일 패널
- `components/controller/LibraryPanel.tsx` — 검색 디바운스
- `components/controller/SlideCanvas.tsx` — useMemo 수정

### 신규 파일
- `app/stage/page.tsx` — Stage Display 라우트
- `components/layers/CountdownLayer.tsx` — 카운트다운 오버레이 컴포넌트
