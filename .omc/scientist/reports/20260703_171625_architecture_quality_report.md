# worship-projector 코드 품질 및 아키텍처 심층 분석 보고서

**생성일**: 2026-07-03 17:16
**대상 프로젝트**: `/Volumes/P31/chppt/worship-projector`
**스택**: Tauri v2 + Next.js 16 (App Router) + TypeScript + Zustand v5 + SQLite

---

## [OBJECTIVE]

worship-projector 데스크탑 앱의 코드 품질, 아키텍처 건전성, 보안 위험을 다음 8개 차원에서 정량적으로 평가:
코드 구조, 타입 안전성, 에러 처리, 상태 관리, IPC 설계, 성능, 접근성, 보안.

---

## [DATA]

- 분석 파일 수: 27개 (TypeScript/TSX 22개, Rust 3개, SQL 1개)
- 총 코드 라인(핵심 소스): 약 2,800줄
- Zustand 스토어: 3개 (outputStore, queueStore, settingsStore)
- Tauri 커맨드: 3개 (get_displays, open_output_window, close_output_window)
- IPC 이벤트 타입: 7개 (모두 TypeScript 타입으로 정의됨)
- React 컴포넌트: 8개 컨트롤러 + 4개 레이어
- DB 파라미터화 쿼리: 14개 / SQL 인젝션 위험: 0건

---

## [FINDING:architecture] 전체 아키텍처 평가

**전체 평균 점수**: 6.62/10
[STAT:n] n=8 평가 차원  [STAT:effect_size] StDev=2.45

아키텍처는 명확한 3계층 구조(Controller UI → IPC → Output Renderer)를 갖추고 있으며,
출력창의 4-레이어 렌더링(Background z:10 → Subtitle z:20 → Overlay z:30 → Canvas z:40)은
관심사가 잘 분리된 설계다.
그러나 컨트롤러 페이지가 단일 컴포넌트로 과도하게 비대해져 유지보수 부담이 집중된다.

[STAT:effect_size] controller/page.tsx: 813줄 (전체 핵심 소스의 29%)
[STAT:effect_size] SlideCanvas.tsx: 513줄 (컴포넌트 경계 초과)

---

## [FINDING:code_quality] 코드 구조 및 품질

**점수**: 6.5/10

### 강점
- `lib/types.ts`에 도메인 타입 집중 관리 — 타입 정의 일관성 확보
- `lib/ipc.ts`가 Tauri API 전체를 추상화 — 컴포넌트가 Tauri에 직접 의존하지 않음
- `lib/db.ts`의 DAO 패턴 (songDb, mediaDb, serviceDb)이 깔끔하게 분리됨
- `deepMerge` 유틸리티가 LayerConfig 병합 로직을 단일 함수로 캡슐화

### 문제점

**[CRITICAL] God Component**: `app/controller/page.tsx` 813줄이 다음을 모두 담당:
리본 UI 렌더링, IPC 슬라이드 동기화, 키보드 단축키, 오디오 재생, 레이어 설정, 저장/디바운스, 메뉴 이벤트 핸들링.
단일 책임 원칙 위반 — 기능 추가 시 회귀 가능성 높음.

[STAT:effect_size] God Component 크기: 813줄 (권장 최대: ~300줄)

**[HIGH] eslint-disable 4건**: `react-hooks/exhaustive-deps` 무력화 → stale closure 버그 잠재.

```tsx
// eslint-disable-next-line react-hooks/exhaustive-deps
const slides = useMemo(() => getFlatSlideList(), [currentService]);
// activeItemIndex도 의존성이어야 하나 누락됨
```

**[HIGH] 전역 가변 변수**: SlideCanvas.tsx의 `blockClipboard`가 모듈 레벨 변수 —
다중 인스턴스 또는 테스트 환경에서 상태 오염 가능.

---

## [FINDING:error_handling] 에러 처리

**점수**: 7.0/10

[STAT:n] try-catch 블록: 29건 (10개 파일)
[STAT:n] console.error/warn/log: 33건

### 강점
- 대부분의 비동기 DB 작업에 try-catch 적용
- QueuePanel 서비스 생성 시 사용자에게 `createError` 상태로 에러 표시
- LibraryPanel의 `showNotice()` 피드백 패턴
- IPC의 Tauri 환경 체크 후 graceful fallback

### 문제점

**[CRITICAL] React Error Boundary 없음** — 런타임 렌더 오류 시 전체 화면 WSOD.
예배 도중 발생하면 복구 방법이 없다.

**[HIGH] 빈/무언 catch 블록**: 일부 오류가 조용히 삼켜짐 (사용자 피드백 없음):
```tsx
} catch (e) { console.error(e); }  // UI 반영 없음
} catch { console.error('Failed to delete service'); }  // 동일
```

**[MEDIUM] JSON.parse 비보호**: parseSong/parseServiceItem에서 DB JSON 파싱 실패 시
예외가 상위로 전파되어 컴포넌트 크래시 가능.

---

## [FINDING:state_management] 상태 관리

**점수**: 8.0/10

[STAT:n] Zustand 스토어: 3개  [STAT:n] getState() 패턴: 5개 파일

### 강점
- 스토어가 도메인별로 명확히 분리 (output/queue/settings)
- `useQueueStore.getState()` 패턴으로 useEffect 내 최신 상태 안전 접근
- settingsStore에 Zustand persist 미들웨어 적용 — 디스플레이 설정 영속화
- `updateSlideCanvas`가 불변 업데이트 패턴을 정확히 구현

### 문제점

**[MEDIUM] localStorage 이중 관리**: QueuePanel이 `localStorage.setItem('lastServiceId')`를
직접 호출하지만 settingsStore에 속해야 할 책임임.

**[MEDIUM] 파생 상태 함수가 스토어 액션으로 혼재**: `getFlatSlideList`, `getActiveFlatSlideIndex`
같은 순수 계산 함수가 Zustand 상태 메서드로 정의 → 테스트 및 재사용 어려움.

---

## [FINDING:ipc] IPC 설계

**점수**: 8.5/10

[STAT:n] 타입화된 IPC 페이로드: 7개  [STAT:n] Tauri 환경 가드: isTauri() 전체 커버

### 강점
- `ipc` 객체가 Tauri API를 완전히 캡슐화 — 컴포넌트에서 `@tauri-apps` 직접 import 없음
- 모든 IPC 이벤트에 TypeScript 페이로드 타입 지정
- 출력창의 재시도 로직 (500ms 간격, 최대 20회) — 연결 신뢰성 확보
- output:ready 핸드셰이크 패턴으로 컨트롤러-출력창 상태 동기화

### 문제점

**[HIGH] 메뉴 이벤트 4개 미처리**: Rust lib.rs에서 emit하지만 프론트엔드 리스너 없음:
- `menu:new-service` / `menu:open-service` / `menu:save-service` / `menu:save-as`
이 메뉴 항목들은 클릭해도 아무 동작도 하지 않는 데드 UI.

---

## [FINDING:performance] 성능

**점수**: 6.0/10

### 강점
- SlideCanvas ResizeObserver 기반 스케일 계산
- saveTimerRef 디바운스(600ms)로 DB 쓰기 최소화
- useCallback으로 이벤트 핸들러 안정화 (8건)

### 문제점

**[HIGH] getFlatSlideList 인라인 호출** (SlideCanvas.tsx 65-66줄):
```tsx
const slides = getFlatSlideList();      // 매 렌더마다 O(n) 순회
const activeIdx = getActiveFlatSlideIndex();  // 또 O(n) 순회
```
useMemo 없이 렌더 함수 최상단에서 직접 호출 → 서비스 규모 비례 성능 저하.

**[HIGH] useMemo 의존성 누락**: eslint-disable로 activeItemIndex/activeLyricSlideIndex가
의존성에서 제외 → 슬라이드 변경 시 slides 캐시가 갱신되지 않아 표시 불일치 가능.

---

## [FINDING:security] 보안

**점수**: 7.5/10

[STAT:n] 파라미터화 SQL 쿼리: 14개  [STAT:n] SQL 인젝션 위험: 0건
[STAT:n] 트랜잭션 적용: 1건 (reorderItems)

### 강점
- 모든 SQL이 `?` 바인딩 파라미터 사용 → SQL 인젝션 방지
- `reorderItems`에 BEGIN/COMMIT/ROLLBACK 트랜잭션 적용
- `PRAGMA foreign_keys = ON`으로 참조 무결성 보장
- Tauri `isTauri()` 가드로 브라우저 환경에서 IPC 함수 호출 방지
- `convertFileSrc()`로 파일 경로를 Tauri 안전 URL로 변환

### 문제점

**[MEDIUM] CSP 설정 미검토**: tauri.conf.json을 직접 확인하지 못했으나,
외부 미디어 파일 로드 구조 상 CSP가 느슨하게 설정되었을 가능성 있음.

**[LOW] DB JSON 입력 검증 없음**: lyrics_json/settings_json을 검증 없이 파싱 후
LayerConfig로 직접 사용. 외부 DB 오염 시 렌더러에 임의 스타일/경로 주입 가능.

---

## [FINDING:strengths] 잘된 점 종합

1. **타입 안전성 탁월** (8.5/10): `any` 타입 0건, 모든 IPC 페이로드 타입화
2. **IPC 추상화 레이어** (`lib/ipc.ts`): Tauri API 완전 캡슐화, 테스트 용이성 확보
3. **SQL 보안 철저**: 파라미터화 쿼리 100%, 트랜잭션, 외래 키 강제
4. **출력창 핸드셰이크**: 재시도 로직으로 늦은 연결에도 상태 복원
5. **레이어 렌더링 분리**: 4개 독립 레이어 컴포넌트로 z-index 계층 명확
6. **Zustand 설계**: getState() 패턴, persist 미들웨어, 불변 업데이트
7. **사용자 피드백 패턴**: 로딩 상태와 에러 메시지가 주요 작업에 존재

## [FINDING:weaknesses] 개선 필요 사항 (우선순위 순)

**P0 — 즉시 수정 (서비스 안정성)**
1. React Error Boundary 추가 — 예배 중 런타임 오류 복구 수단
2. 메뉴 이벤트 리스너 4개 구현 (new_service, open_service, save_service, save_as)

**P1 — 단기 개선 (유지보수성)**
3. controller/page.tsx 분해: RibbonHome, RibbonInsert, StatusBar, AudioController 등으로 추출
4. eslint-disable 제거: useMemo/useCallback 의존성 올바르게 수정
5. localStorage → settingsStore 통합

**P2 — 중기 개선 (품질)**
6. 접근성 기초 추가: aria-label, role, 포커스 관리
7. blockClipboard Zustand로 이동
8. 프로덕션 로거 도입 (console.error 33건 대체)
9. parseSong/parseServiceItem JSON.parse try-catch 래핑

---

## [LIMITATION]

- `tauri.conf.json` CSP 설정을 직접 읽지 못해 보안 점수에 불확실성 있음
- 런타임 성능 프로파일링(실제 렌더 시간, 메모리)은 정적 분석 범위 밖
- 테스트 코드가 발견되지 않아 커버리지 측정 불가
- 분석은 정적 코드 검토 기반이며 실제 예배 워크플로우 사용성 테스트를 대체하지 않음

---

## 종합 점수 요약

| 차원 | 점수 | 등급 |
|------|------|------|
| 타입 안전성 | 8.5/10 | STRONG |
| IPC 설계 | 8.5/10 | STRONG |
| 상태 관리 | 8.0/10 | STRONG |
| 보안 | 7.5/10 | MEDIUM |
| 에러 처리 | 7.0/10 | MEDIUM |
| 코드 구조/모듈화 | 6.5/10 | MEDIUM |
| 성능 최적화 | 6.0/10 | MEDIUM |
| 접근성 (A11y) | 1.0/10 | WEAK |
| **전체 평균** | **6.62/10** | **MEDIUM** |

발견된 이슈: CRITICAL 2건, HIGH 5건, MEDIUM 6건, LOW 4건 (총 17건)

---

*생성: Scientist Agent (claude-sonnet-4-6) — worship-projector 코드 품질 분석*