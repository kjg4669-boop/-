# Urgent Fixes Design — worship-projector

**Date:** 2026-07-03
**Scope:** P0 신뢰성 수정 (Error Boundary + 파일 메뉴/서비스 저장)

---

## 1. Error Boundary

### 목표
예배 중 React 런타임 오류로 인한 흰 화면(WSOD) 방지.

### 구현

**`components/ErrorBoundary.tsx`** — React class component 신규 생성

Props:
- `children: ReactNode`
- `fallback?: 'blackout' | 'message'` (default: `'message'`)

동작:
- `fallback='message'` (Controller): "오류가 발생했습니다" 메시지 + "새로고침" 버튼
- `fallback='blackout'` (Output): 검은 화면 유지 (예배 화면 노출 방지)

적용:
- `app/controller/page.tsx` → 최상단 `<ErrorBoundary>` 래핑
- `app/output/page.tsx` → `<ErrorBoundary fallback="blackout">` 래핑

---

## 2. 파일 메뉴 + 서비스 저장/불러오기

### 저장 방식
SQLite DB (`services`, `service_items` 테이블) — 기존 스키마 활용, DB 변경 없음.

### DB 함수 (`lib/serviceDb.ts` 신규)

```ts
listServices(): Promise<{ id: number; name: string; updatedAt: string }[]>
loadService(id: number): Promise<{ service: Service; items: QueueItem[] }>
saveService(name: string, items: QueueItem[], id?: number): Promise<number>
deleteService(id: number): Promise<void>
```

### 상태 추가 (`stores/queueStore.ts`)

```ts
currentServiceDbId: number | null
currentServiceName: string | null
isDirty: boolean
```

`isDirty`는 큐 변경 시 `true`, 저장 성공 시 `false`.

### IPC 리스너 (`controller/page.tsx`)

| 이벤트 | 동작 |
|--------|------|
| `menu:new-service` | isDirty 확인 → 확인 다이얼로그 → 큐 초기화 |
| `menu:open-service` | `ServiceListModal` 열기 |
| `menu:save-service` | currentServiceDbId 있으면 덮어쓰기, 없으면 `SaveServiceModal` |
| `menu:save-as` | 항상 `SaveServiceModal` 열기 |

### 신규 컴포넌트

**`components/controller/ServiceListModal.tsx`**
- 저장된 서비스 목록 표시
- "불러오기" 버튼 → `loadService` → 큐 교체
- "삭제" 버튼

**`components/controller/SaveServiceModal.tsx`**
- 서비스 이름 입력 필드
- "저장" 버튼 → `saveService` → `isDirty = false`

### UI 피드백
- 리본 상단에 `currentServiceName` + `isDirty` 시 `*` 표시 (예: `찬양예배 2부 *`)
- 저장 성공 시 토스트 메시지

---

## 범위 외 (다음 작업)

- `controller/page.tsx` God Component 분해
- 접근성 (ARIA)
- 성능 최적화
