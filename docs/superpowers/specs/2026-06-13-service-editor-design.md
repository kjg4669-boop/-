# 예배 순서 편집기 설계

**날짜**: 2026-06-13
**프로젝트**: worship-projector (Tauri v2 + Next.js 16)

---

## 범위

QueuePanel에 인라인 편집 모드 추가:
- 새 예배 생성 (이름 + 날짜)
- 예배 항목 추가 (찬양 / 기도·안내 / 블랭크)
- 항목 순서 변경 (↑↓ 버튼)
- 항목 삭제 (✕ 버튼)

---

## UI 구조

### QueuePanel 두 가지 모드

**보기 모드 (기본)**
- 헤더: 예배 드롭다운 선택 + `[편집]` 버튼
- 항목 클릭 → 슬라이드 송출 (기존 동작)

**편집 모드**
- 헤더: `[새 예배]` 버튼 + `[✓ 완료]` 버튼 + 현재 예배명
- 항목 목록: 각 항목에 `[↑][↓][✕]` 버튼
  - 첫 번째 항목: ↑ 비활성
  - 마지막 항목: ↓ 비활성
- 하단 `[+ 항목 추가]` 버튼 → 추가 패널 토글
- 추가 패널: `[찬양]` / `[기도·안내]` / `[블랭크]` 탭
  - 찬양: 검색창 + 목록 (클릭 → 즉시 추가)
  - 기도·안내: 라벨 입력 필드 + 추가 버튼
  - 블랭크: 추가 버튼 하나

**새 예배 생성 폼** (편집 모드 + `[새 예배]` 클릭 시)
- 이름 입력 (기본값: "주일예배")
- 날짜 입력 (기본값: 오늘)
- `[만들기]` / `[취소]` 버튼

---

## 데이터 흐름

### 새 예배 생성
1. `serviceDb.create(name, date)` → 새 service id 반환
2. `serviceDb.get(id)` → 전체 서비스 로드
3. `setCurrentService(service)` + services 목록 갱신

### 찬양 항목 추가
1. `serviceDb.addItem(serviceId, { type: "song", song_id, label: song.title, item_order, settings_json: {} })`
2. `serviceDb.get(serviceId)` → 서비스 리로드
3. `setCurrentService(updated)`

### 기도·안내 항목 추가
1. `serviceDb.addItem(serviceId, { type: "announcement", label, item_order, settings_json: {} })`
2. 서비스 리로드

### 블랭크 항목 추가
1. `serviceDb.addItem(serviceId, { type: "blank", label: "블랭크", item_order, settings_json: {} })`
2. 서비스 리로드

### 순서 변경 (↑↓)
1. 로컬 items 배열에서 swap
2. `serviceDb.reorderItems(serviceId, items.map(i => i.id))`
3. `updateServiceItems(reorderedItems)` (store 업데이트, DB 재조회 불필요)

### 항목 삭제
1. `serviceDb.deleteItem(itemId)`
2. `updateServiceItems(items.filter(i => i.id !== itemId))`

---

## 컴포넌트 구조

모든 편집 로직을 `QueuePanel.tsx` 내부 상태로 처리 (별도 컴포넌트 불필요).

### 추가되는 state
```ts
const [isEditing, setIsEditing] = useState(false);
const [showNewForm, setShowNewForm] = useState(false);
const [newName, setNewName] = useState("주일예배");
const [newDate, setNewDate] = useState(() => new Date().toISOString().slice(0, 10));
const [showAddPanel, setShowAddPanel] = useState(false);
const [addTab, setAddTab] = useState<"song" | "announcement" | "blank">("song");
const [addSearch, setAddSearch] = useState("");
const [addSongs, setAddSongs] = useState<Song[]>([]);
const [addLabel, setAddLabel] = useState("");
```

---

## 범위 외

- 예배 삭제 (별도 단계)
- 항목 설정 편집 (배경/자막 설정 — 레이어 사이드바 단계)
- 드래그 앤 드롭 순서 변경
