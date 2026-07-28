# IPC Bug Fix + 찬양 편집기 설계

**날짜**: 2026-06-13
**프로젝트**: worship-projector (Tauri v2 + Next.js 16)

---

## 범위

1. IPC 버그 수정 — 슬라이드 이동 시 출력창 미업데이트
2. 찬양 편집기 — 찬양 생성/수정 UI (사이드 패널 확장 방식)
3. 서비스 추가 — 라이브러리에서 더블클릭으로 현재 서비스에 추가

---

## 1. IPC 버그 수정

### 문제

`queueStore.nextLyricSlide()` / `prevLyricSlide()` 는 `activeLyricSlideIndex`만 변경하고,
`outputStore.layerConfig` 업데이트와 `ipc.sendSlideUpdate()` 호출을 하지 않는다.

결과: Space/화살표 키로 슬라이드를 넘겨도 출력창은 변하지 않는다.

### 해결책

`app/controller/page.tsx`에 `useEffect`를 추가해 슬라이드 상태 변화를 감지하고 IPC를 발송한다.

```ts
useEffect(() => {
  const slide = getActiveLyricSlide();
  const item = getActiveItem();
  if (!item) return;

  // DEFAULT_LAYER_CONFIG 기반으로 새 config 구성 (stale closure 방지)
  const newConfig: LayerConfig = {
    ...DEFAULT_LAYER_CONFIG,
    subtitle: {
      ...DEFAULT_LAYER_CONFIG.subtitle,
      visible: !!slide,
      lines: slide?.lines ?? [],
    },
  };
  setLayerConfig(newConfig);
  ipc.sendSlideUpdate(newConfig);
}, [activeItemIndex, activeLyricSlideIndex]);
```

의존성: `activeItemIndex`, `activeLyricSlideIndex` — 두 값 중 하나가 바뀔 때마다 실행.

---

## 2. 찬양 편집기

### UI 구조

"찬양" 탭에서 두 가지 모드:

**목록 모드 (기본)**
- 상단: 검색창 + "새 찬양" 버튼
- 목록 항목:
  - 단일 클릭 → 편집 모드 진입
  - 더블클릭 → 현재 서비스에 추가

**편집 모드**
- 상단 바: `← 목록` 버튼 + 찬양 제목 + `저장` 버튼
- 제목 / 아티스트 입력 필드
- 섹션 블록 목록 (스크롤 가능)
- `+ 섹션 추가` 버튼

### 섹션 블록 구조

```
[타입 드롭다운 ▼]  섹션 레이블    [✕ 삭제]
┌────────────────────────────────┐
│ 가사 라인 1                    │
│ 가사 라인 2                    │
└────────────────────────────────┘
```

- **타입**: `verse` / `chorus` / `bridge` / `pre-chorus` / `intro` / `outro`
- **가사**: 줄바꿈(Enter)으로 라인 구분
- **sectionIndex**: 같은 타입이 여러 개면 자동 증가 (verse 1, verse 2, ...)

### 데이터 변환

저장 시 textarea 텍스트 → `LyricSlide[]` 변환:

```ts
function parseBlocks(blocks: BlockInput[]): LyricSlide[] {
  const sectionCounts: Record<string, number> = {};
  return blocks.map(block => {
    sectionCounts[block.section] = (sectionCounts[block.section] ?? 0) + 1;
    return {
      id: `${block.section}-${sectionCounts[block.section]}`,
      section: block.section,
      sectionIndex: sectionCounts[block.section],
      lines: block.text.split('\n').filter(l => l.trim()),
    };
  });
}
```

### 컴포넌트

- `components/controller/SongEditor.tsx` — 신규 파일
- `LibraryPanel.tsx` — 편집 모드 상태 추가, 더블클릭 핸들러 추가

---

## 3. 더블클릭으로 서비스 추가

### 동작

1. 찬양 목록에서 항목 더블클릭
2. `currentService`가 없으면 → 화면 상단에 인라인 경고 "예배를 먼저 선택해주세요" 표시 (1.5초)
3. `currentService`가 있으면:
   - `serviceDb.addItem()` 호출
   - `serviceDb.get(currentService.id)` 로 서비스 리로드
   - `setCurrentService()` 로 큐 업데이트

### item_order

새 항목은 `currentService.items.length` 값을 `item_order`로 사용 (마지막에 추가).

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `app/controller/page.tsx` | IPC 버그 수정 useEffect 추가 |
| `components/controller/LibraryPanel.tsx` | 편집 모드 상태, 더블클릭, SongEditor 연결 |
| `components/controller/SongEditor.tsx` | 신규 — 찬양 편집 컴포넌트 |
| `lib/db.ts` | 변경 없음 (기존 CRUD 활용) |

---

## 범위 외

- 예배 순서 편집기 (다음 단계)
- 미디어 임포트 (다음 단계)
- 레이어 설정 사이드바 (다음 단계)
