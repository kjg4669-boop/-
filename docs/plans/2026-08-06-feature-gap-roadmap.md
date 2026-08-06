# worship-projector 기능 갭 분석 & 개발 로드맵 v2

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**작성일:** 2026-08-06
**근거:** ProPresenter 7 · EasyWorship 7 · MediaShout 7 · Proclaim · OpenLP 기능 비교 분석
**현재 상태:** Phase 1~4 완료, 개발자 개선 완료 (TypeScript clean, ESLint 0 errors, 29 tests)

---

## 경쟁사 기능 갭 요약

### ✅ 이미 구현됨 (경쟁사 대비 우위)
| 기능 | 비고 |
|------|------|
| 5-layer 렌더링 시스템 | ProPresenter 8-layer 대비 단순하지만 예배용으로 충분 |
| Stage Display (발표자 모니터) | 현재 가사 크게 + 다음 슬라이드 + 시계 |
| 성경 브라우저 + JSON 임포트 | 저작권 문제 없는 자체 방식 |
| 카운트다운 타이머 (SVG 링) | 모든 경쟁사 공통 기능 |
| PPTX 임포트 | OpenLP 수준 |
| 예배 템플릿 | 기본 커버 |
| 태그 시스템 | **경쟁사에 없는 차별화** |
| 내보내기 (.txt) | **경쟁사에 없는 차별화** |
| 미디어 라이브러리 + 영상 재생 | 기본 커버 |
| 슬라이드 전환 효과 | slide-down, zoom-in |

### ❌ 누락된 핵심 기능 (우선순위별)
| 우선순위 | 기능 | 경쟁사 | 구현 난이도 |
|---------|------|--------|------------|
| 🔴 P0 | CCLI 저작권 자동 표시 | 전체 | 낮음 |
| 🔴 P0 | Alerts 오버레이 (실시간 공지) | OpenLP · MediaShout | 낮음 |
| 🔴 P0 | Verse Order (절/후렴 순서 편집) | 전체 | 중간 |
| 🟡 P1 | 배킹 트랙 (곡에 오디오 연결) | OpenLP · ProPresenter | 낮음~중간 |
| 🟡 P1 | 출력 Looks 프리셋 | ProPresenter | 중간 |
| 🟡 P1 | 공지 루프 레이어 | ProPresenter · Proclaim | 중간 |
| 🟡 P1 | 큐 타이밍/딜레이 설정 | MediaShout · ProPresenter | 중간 |
| 🟢 P2 | 웹 원격 제어 (모바일) | OpenLP · EasyWorship | 높음 |
| 🟢 P2 | NDI 출력 | ProPresenter · EasyWorship | 높음 (Rust FFI) |
| 🟢 P2 | Song Usage Tracking | OpenLP | 중간 |

---

## Phase A — 저작권 & 알림 (난이도: 낮음 / 기간: ~1주)

### A-1. CCLI 저작권 자동 표시

**배경:** 모든 주요 예배 소프트웨어가 슬라이드 하단에 저작권·CCLI 번호 자동 삽입. 법적 라이선스 컴플라이언스를 위해 필수.

**변경 파일:**
- `src-tauri/migrations/007_copyright.sql` (신규)
- `lib/db.ts` — `songs` CRUD에 컬럼 추가
- `lib/types.ts` — `Song` 타입에 필드 추가
- `components/controller/SongEditor.tsx` — CCLI 번호 · 저작권 입력 UI
- `components/layers/SubtitleLayer.tsx` — 저작권 소자막 렌더링
- `stores/settingsStore.ts` — `showCopyright: boolean` 설정
- `src-tauri/src/lib.rs` — migration 등록

**DB 스키마:**
```sql
-- 007_copyright.sql
ALTER TABLE songs ADD COLUMN ccli_number TEXT;
ALTER TABLE songs ADD COLUMN copyright_text TEXT;  -- "© 2020 Hillsong Music"
ALTER TABLE songs ADD COLUMN publisher TEXT;
```

**구현 세부사항:**
- SubtitleLayer에서 `layerConfig.showCopyright === true`이고 현재 슬라이드가 song 타입이면 하단에 소자막 렌더링
- 폰트 크기: 주 자막의 40% 크기, 우하단 정렬
- `settingsStore`에 전역 토글 + 개별 슬라이드 오버라이드 가능

**구현 체크리스트:**
- [ ] `007_copyright.sql` 마이그레이션 작성
- [ ] `lib.rs`에 migration 등록 (include_str! 목록)
- [ ] `lib/types.ts` Song 타입에 `ccliNumber`, `copyrightText`, `publisher` 추가
- [ ] `lib/db.ts` CRUD 함수 업데이트 (getSong, upsertSong)
- [ ] `lib/validators.ts` 업데이트
- [ ] `SongEditor.tsx`에 CCLI 번호 · 저작권 입력 필드 추가
- [ ] `settingsStore.ts`에 `showCopyright: boolean` (기본값 true) 추가
- [ ] `SubtitleLayer.tsx`에 저작권 소자막 렌더링 로직 추가
- [ ] `LayerSidebar.tsx`에 저작권 표시 토글 추가
- [ ] TypeScript 검증: `npm run type-check`

---

### A-2. Alerts 오버레이 (실시간 공지)

**배경:** OpenLP의 가장 인기 기능 중 하나. "차량번호 1234 조명 켜두셨습니다" 같은 공지를 예배 중 슬라이드 위에 오버레이로 표시. 동적 파라미터 지원.

**변경 파일:**
- `components/controller/AlertPanel.tsx` (신규)
- `lib/ipc.ts` — `alert:show`, `alert:hide` 이벤트 추가
- `app/output/page.tsx` — alert 이벤트 리스너
- `components/ErrorToast.tsx` 참고하여 AlertOverlay 컴포넌트 구현

**IPC 이벤트:**
```typescript
// lib/ipc.ts 추가
export type AlertPayload = {
  text: string;
  duration: number; // ms, 0 = 수동 닫기
  position: 'top' | 'bottom' | 'center';
  backgroundColor?: string;
  textColor?: string;
};
```

**UI:**
- Controller 우측 패널 하단에 AlertPanel 추가
- 텍스트 입력 + 표시 시간 설정 + 위치 선택
- "즉시 표시" 버튼
- 저장된 공지 템플릿 목록 (SQLite)

**구현 체크리스트:**
- [ ] `lib/ipc.ts`에 `alert:show`, `alert:hide` 이벤트 타입 추가
- [ ] `app/output/page.tsx`에 alert 리스너 + 오버레이 렌더링 추가
- [ ] `app/stage/page.tsx`에 alert 표시 (Stage도 동일 공지 수신)
- [ ] `components/controller/AlertPanel.tsx` 신규 생성
- [ ] SQLite `alerts` 테이블 (008_alerts.sql) — 자주 쓰는 공지 저장
- [ ] Controller 레이아웃에 AlertPanel 배치
- [ ] TypeScript 검증

---

## Phase B — Verse Order & 섹션 관리 (난이도: 중간 / 기간: ~1주)

**배경:** 모든 예배 소프트웨어의 핵심 기능. 현재 worship-projector는 슬라이드를 수동 나열만 함. OpenLP는 `V1 C1 V2 C1 B1` 형식으로 순서 지정, EasyWorship은 섹션별 색상 구분.

**변경 파일:**
- `src-tauri/migrations/009_verse_order.sql` (신규)
- `lib/types.ts` — `SlideSection` 타입 추가
- `components/controller/SongEditor.tsx` — 섹션 타입 편집 + Verse Order UI
- `components/controller/QueuePanel.tsx` — 섹션 배지 표시
- `lib/db.ts` — 슬라이드 섹션 CRUD

**DB 스키마:**
```sql
-- 009_verse_order.sql
ALTER TABLE song_slides ADD COLUMN section_type TEXT DEFAULT 'verse';
-- section_type: 'intro' | 'verse' | 'pre-chorus' | 'chorus' | 'bridge' | 'ending' | 'other'
ALTER TABLE songs ADD COLUMN verse_order TEXT;
-- verse_order: "V1,C1,V2,C1,B1,C1" (쉼표 구분, 슬라이드 인덱스 기반)
```

**섹션 타입별 색상:**
```
intro: 회색   verse: 파랑   pre-chorus: 보라
chorus: 초록  bridge: 주황  ending: 빨강
```

**구현 체크리스트:**
- [ ] `009_verse_order.sql` 마이그레이션 작성
- [ ] `lib.rs`에 migration 등록
- [ ] `lib/types.ts`에 `SectionType`, `SlideSection` 타입 추가
- [ ] `SongEditor.tsx` 각 슬라이드에 섹션 타입 드롭다운 추가
- [ ] `SongEditor.tsx` Verse Order 편집 UI — 섹션 칩 드래그 재배열 (@dnd-kit 활용)
- [ ] `QueuePanel.tsx` 섹션 배지 색상 표시
- [ ] `lib/db.ts` 슬라이드 섹션 저장/불러오기 업데이트
- [ ] 큐에 song 추가 시 verse_order 순서로 슬라이드 정렬
- [ ] TypeScript 검증

---

## Phase C — 배킹 트랙 (난이도: 낮음~중간 / 기간: ~3일)

**배경:** OpenLP에서 곡마다 오디오 파일을 첨부하면 슬라이드 첫 표시 시 자동 재생. 예배 반주 없는 소교회에 특히 유용.

**변경 파일:**
- `src-tauri/migrations/010_backing_track.sql` (신규)
- `lib/types.ts` — `BackingTrack` 타입
- `components/controller/SongEditor.tsx` — 오디오 파일 선택 UI
- `lib/ipc.ts` — `audio:play`, `audio:stop`, `audio:volume` 이벤트
- `app/output/page.tsx` — 오디오 재생 로직
- `stores/queueStore.ts` — 현재 슬라이드 변경 시 오디오 자동 처리

**DB 스키마:**
```sql
-- 010_backing_track.sql
CREATE TABLE IF NOT EXISTS backing_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id INTEGER NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  repeat INTEGER NOT NULL DEFAULT 0,  -- boolean
  start_paused INTEGER NOT NULL DEFAULT 0  -- boolean
);
```

**구현 체크리스트:**
- [ ] `010_backing_track.sql` 마이그레이션 작성
- [ ] `lib.rs`에 migration 등록
- [ ] `lib/types.ts`에 `BackingTrack` 타입 추가
- [ ] `SongEditor.tsx`에 오디오 파일 선택 + 목록 관리 UI
- [ ] `lib/ipc.ts`에 오디오 IPC 이벤트 추가
- [ ] `app/output/page.tsx`에 `<audio>` 요소 + IPC 리스너 추가
- [ ] 큐에서 song 슬라이드 첫 진입 시 자동 재생 로직
- [ ] 다음 아이템으로 이동 시 자동 정지
- [ ] TypeScript 검증

---

## Phase D — 출력 Looks 프리셋 (난이도: 중간 / 기간: ~3일)

**배경:** ProPresenter의 "Looks" 기능. "예배 찬양 모드"(배경+자막), "말씀 모드"(자막만), "영상 모드"(영상+자막) 같은 레이어 가시성 조합을 저장하고 원클릭 전환.

**변경 파일:**
- `src-tauri/migrations/011_looks.sql` (신규)
- `lib/types.ts` — `Look` 타입
- `components/controller/LooksPanel.tsx` (신규) — 프리셋 관리
- `stores/settingsStore.ts` — 현재 Look 상태
- `components/controller/RibbonToolbar.tsx` — Look 선택 드롭다운

**DB 스키마:**
```sql
-- 011_looks.sql
CREATE TABLE IF NOT EXISTS looks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  show_background INTEGER NOT NULL DEFAULT 1,
  show_subtitle INTEGER NOT NULL DEFAULT 1,
  show_overlay INTEGER NOT NULL DEFAULT 1,
  show_canvas INTEGER NOT NULL DEFAULT 1,
  show_countdown INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- 기본 Look 3개 삽입
INSERT INTO looks (name, show_background, show_subtitle, show_overlay, show_canvas, show_countdown)
VALUES
  ('기본', 1, 1, 1, 0, 0),
  ('말씀 모드', 0, 1, 0, 0, 0),
  ('영상 모드', 1, 0, 0, 0, 0);
```

**구현 체크리스트:**
- [ ] `011_looks.sql` 마이그레이션 작성
- [ ] `lib.rs`에 migration 등록
- [ ] `lib/types.ts`에 `Look` 타입 추가
- [ ] `components/controller/LooksPanel.tsx` 신규 생성 (Look 목록 + 편집)
- [ ] `stores/settingsStore.ts`에 `currentLookId` 추가
- [ ] `lib/ipc.ts`에 `look:apply` 이벤트 추가
- [ ] Output 창에서 Look에 따라 레이어 가시성 제어
- [ ] RibbonToolbar에 Look 선택 드롭다운 추가
- [ ] TypeScript 검증

---

## Phase E — 웹 원격 제어 (난이도: 높음 / 기간: ~2주)

**배경:** OpenLP는 `http://ip:4316`에서 스마트폰 브라우저로 슬라이드 전환 가능. 찬양 인도자가 무선으로 슬라이드 전환, 검색, 성경 구절 직접 표시.

**아키텍처:**
```
[스마트폰 브라우저] ←HTTP/WebSocket→ [Tauri 앱 내 로컬 HTTP 서버]
                                              ↓ Tauri 내부 채널
                                       [Controller 상태 업데이트]
```

**Tauri 구현 방법:**
- `tauri-plugin-localhost` 또는 `axum` HTTP 서버를 Rust 사이드카로 실행
- WebSocket으로 실시간 슬라이드 상태 동기화
- 모바일 최적화 Next.js 페이지 (`app/remote/page.tsx`) 서빙

**구현 체크리스트:**
- [ ] `Cargo.toml`에 `axum` + `tokio` 추가
- [ ] `src-tauri/src/remote.rs` — HTTP + WebSocket 서버 구현
- [ ] Tauri 커맨드: `start_remote_server(port)`, `stop_remote_server()`
- [ ] `app/remote/page.tsx` — 모바일 원격 제어 UI (슬라이드 이동, 검색, Blackout)
- [ ] WebSocket 메시지 프로토콜 정의 (`remote:next`, `remote:prev`, `remote:goto`)
- [ ] Controller에서 원격 명령 처리 훅 추가
- [ ] Settings에 원격 제어 포트 + QR코드 표시 추가
- [ ] TypeScript + Rust 검증

---

## Phase F — NDI 출력 (난이도: 높음 / 기간: ~2주)

**배경:** EasyWorship/ProPresenter 모두 지원. OBS/vMix로 네트워크 전송해 예배 실황 스트리밍. 스트리밍하는 교회에 필수.

**아키텍처:**
```
[Output 창 WebView] → [스크린 캡처 or Offscreen 렌더] → [NDI 라이브러리] → [OBS/vMix]
```

**Rust 구현:**
- `ndi` crate 또는 NDI SDK C FFI 바인딩
- Tauri 커맨드: `start_ndi_output(name)`, `stop_ndi_output()`
- Output 창의 매 프레임을 NDI 프레임으로 전송

**주의사항:**
- NDI SDK는 별도 라이선스 동의 필요 (무료)
- macOS/Windows 빌드 파이프라인에 NDI 라이브러리 포함 필요
- CPU 사용량 증가 → 성능 테스트 필수

**구현 체크리스트:**
- [ ] NDI SDK 다운로드 + 라이선스 확인
- [ ] `Cargo.toml`에 NDI FFI crate 추가
- [ ] `src-tauri/src/ndi.rs` — NDI 소스 생성 + 프레임 전송
- [ ] Tauri 스크린 캡처 API로 Output 창 프레임 획득
- [ ] `lib/ipc.ts`에 NDI 제어 이벤트 추가
- [ ] Settings에 NDI 활성화 토글 + 소스명 설정
- [ ] 성능 테스트 (60fps 유지 가능 여부)
- [ ] Rust + TypeScript 검증

---

## 전체 타임라인

```
Week 1  │ Phase A-1: CCLI 저작권 표시 (2~3일)
        │ Phase A-2: Alerts 오버레이 (2~3일)
─────────┼───────────────────────────────────────
Week 2  │ Phase B: Verse Order (5일)
─────────┼───────────────────────────────────────
Week 3  │ Phase C: 배킹 트랙 (3일)
        │ Phase D: Looks 프리셋 (3~4일)
─────────┼───────────────────────────────────────
Week 4+ │ Phase E: 웹 원격 제어 (2주)
─────────┼───────────────────────────────────────
Month 2 │ Phase F: NDI 출력 (2주)
```

---

## 마이그레이션 등록 체크리스트

`src-tauri/src/lib.rs`의 migration 목록에 순서대로 추가:
- [ ] `007_copyright.sql`
- [ ] `008_alerts.sql`
- [ ] `009_verse_order.sql`
- [ ] `010_backing_track.sql`
- [ ] `011_looks.sql`

---

## 참고 자료 (조사 출처)

| 소프트웨어 | 참고 URL |
|-----------|---------|
| ProPresenter 7 | https://www.renewedvision.com/propresenter/all-features |
| EasyWorship 7 | https://easyworship.com/software/features |
| MediaShout 7 | https://mediashout.com/features/ |
| Proclaim | https://faithlife.com/products/proclaim/features |
| OpenLP | https://manual.openlp.org |
| CCLI 자동 보고 | https://ccli.com/us/en/auto-reporting |
| 기능 비교 분석 | https://ruahcreativehouse.org/blog/church-presentation-software/ |
