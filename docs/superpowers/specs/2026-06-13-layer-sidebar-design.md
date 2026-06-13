# 레이어 설정 사이드바 설계

**날짜**: 2026-06-13
**프로젝트**: worship-projector (Tauri v2 + Next.js 16)

---

## 범위

오른쪽 사이드바를 읽기 전용에서 완전한 편집 패널로 교체:
- 배경 레이어: 단색 / 이미지 / 영상 선택 + 불투명도
- 자막 레이어: 위치·폰트·색상·외곽선·그림자·배경박스 전체 편집
- 오버레이 레이어: 이미지 선택 + x/y/크기 + 표시 토글
- 전역 기본값 저장 (localStorage)
- 항목별 오버라이드 저장 (service_items.settings_json)

---

## 데이터 구조

### 설정 우선순위

```
effectiveConfig = merge(globalDefaults, activeItem.settings_json)
```

항목이 바뀔 때마다 merge → `outputStore.setLayerConfig` → `ipc.sendSlideUpdate`

### 전역 기본값

`localStorage` 키 `"worship-layer-defaults"`에 `LayerConfig` JSON 저장.
앱 시작 시 로드, 없으면 `DEFAULT_LAYER_CONFIG` 사용.

### 항목별 오버라이드

기존 `service_items.settings_json` 컬럼 활용.
현재 타입: `ServiceItemSettings = Record<string, unknown>` (유연한 JSON).
오버라이드는 `Partial<LayerConfig>`로 저장.

### DB 변경

`lib/db.ts`에 메서드 추가:
```ts
serviceDb.updateItemSettings(itemId: number, settings: Partial<LayerConfig>): Promise<void>
// UPDATE service_items SET settings_json = ? WHERE id = ?
```

---

## UI 구조

### LayerSidebar 컴포넌트

`components/controller/LayerSidebar.tsx` (신규)

Props:
```ts
interface LayerSidebarProps {
  layerConfig: LayerConfig;
  activeItemId: number | null;   // 현재 선택된 서비스 항목 ID
  onChange: (config: LayerConfig) => void;  // 즉시 IPC 반영
  onSaveGlobal: (config: LayerConfig) => void;
  onSaveItem: (itemId: number, config: LayerConfig) => void;
}
```

### 배경 섹션

```
[배경] ────────────────────
타입: [단색] [이미지] [영상]

단색 선택 시:
  색상: [■ #000000]

이미지/영상 선택 시:
  미디어: [-- 선택 --  ▼]  (mediaDb.list()로 목록)

불투명도: [──●──────] 100%
```

### 자막 섹션

```
[자막] ────────────────────
위치:  [상단] [중앙] [하단]
폰트:  [Noto Sans KR  ▼] [36]px
색상:  [■ #ffffff]
외곽선: [■ #000000] [2]px
그림자: [●] ON
배경박스: [ ] OFF
  (ON 시) 불투명도: [──●──] 50%
```

### 오버레이 섹션

```
[오버레이] ────────────────
표시: [ ] OFF
이미지: [-- 선택 --  ▼]
x: [0]  y: [0]  크기: [200]px
```

### 하단 버튼

```
[전역 기본값으로 저장]
[이 항목에 적용]  ← activeItemId가 있을 때만 활성
```

`[이 항목에 적용]` 클릭 시 항목 배지 표시:
```
⚙ 항목 설정 적용됨
```

---

## 데이터 흐름

### 앱 시작 시
1. localStorage에서 `"worship-layer-defaults"` 로드
2. 없으면 `DEFAULT_LAYER_CONFIG` 사용
3. `outputStore.setLayerConfig(globalDefaults)` 호출

### 항목 선택 시 (activeItemIndex 변경)
기존 `controller/page.tsx` useEffect 확장:
```ts
useEffect(() => {
  const item = getActiveItem();
  const slide = getActiveLyricSlide();
  const globalDefaults = loadGlobalDefaults(); // localStorage

  const itemOverrides = item?.settings_json ?? {};
  const merged = deepMerge(globalDefaults, itemOverrides);

  const newConfig: LayerConfig = {
    ...merged,
    subtitle: {
      ...merged.subtitle,
      visible: !!slide,
      lines: slide?.lines ?? [],
    },
  };
  setLayerConfig(newConfig);
  ipc.sendSlideUpdate(newConfig);
}, [activeItemIndex, activeLyricSlideIndex, currentService?.id]);
```

### 사이드바 편집 시
`onChange(newConfig)` → `page.tsx`에서 현재 슬라이드 lines 재주입:
```ts
function handleLayerChange(config: LayerConfig) {
  const slide = useQueueStore.getState().getActiveLyricSlide?.();
  const withLines: LayerConfig = {
    ...config,
    subtitle: {
      ...config.subtitle,
      visible: !!slide,
      lines: slide?.lines ?? [],
    },
  };
  setLayerConfig(withLines);
  ipc.sendSlideUpdate(withLines);
}
```
이렇게 하면 스타일 편집 시 현재 슬라이드 가사가 사라지지 않음.

### 전역 저장
`onSaveGlobal(config)` → `localStorage.setItem("worship-layer-defaults", JSON.stringify(config))`

### 항목 저장
`onSaveItem(itemId, config)` → `serviceDb.updateItemSettings(itemId, config)` → `updateServiceItems(...)` 스토어 갱신

---

## deepMerge 유틸

`lib/utils.ts` (신규):
```ts
export function deepMerge<T extends object>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides) as (keyof T)[]) {
    const baseVal = base[key];
    const overVal = overrides[key];
    if (overVal !== undefined && typeof baseVal === "object" && baseVal !== null
        && typeof overVal === "object" && overVal !== null && !Array.isArray(baseVal)) {
      result[key] = deepMerge(baseVal as object, overVal as Partial<object>) as T[keyof T];
    } else if (overVal !== undefined) {
      result[key] = overVal as T[keyof T];
    }
  }
  return result;
}
```

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `components/controller/LayerSidebar.tsx` | 신규 — 편집 가능한 레이어 설정 패널 |
| `lib/utils.ts` | 신규 — `deepMerge` 유틸 |
| `lib/db.ts` | `serviceDb.updateItemSettings` 추가 |
| `app/controller/page.tsx` | LayerSidebar 연결, 전역 설정 로드/저장, useEffect 확장 |

---

## 범위 외

- 미디어 임포트 UI (B단계)
- 예배 삭제 (C단계)
- 드래그 앤 드롭 (D단계)
- 드롭다운 외 고급 폰트 선택
- 자막 애니메이션 효과
