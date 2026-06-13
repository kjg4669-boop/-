# 빠른 가사 직접 입력 설계

**날짜**: 2026-06-13
**프로젝트**: worship-projector (Tauri v2 + Next.js 16)

---

## 범위

QueuePanel의 "항목 추가" 패널에 **"직접 입력" 탭**을 추가한다.
예배 중 가사를 텍스트로 붙여넣어 즉시 큐에 추가할 수 있다.

---

## UI

### 탭 구성

기존 `[찬양] [기도·안내] [블랭크]` 탭 옆에 `[직접 입력]` 탭 추가.

### 직접 입력 탭 UI

```
제목: [________________________]  (필수)
아티스트: [_____________________]  (선택)

┌──────────────────────────────────┐
│ 가사를 붙여넣으세요.               │
│ 빈 줄로 슬라이드를 구분합니다.     │
│                                  │
│                                  │
└──────────────────────────────────┘
[+ 큐에 추가]  ← 제목이 있을 때만 활성
```

---

## 가사 파싱 규칙

1. 입력 텍스트를 `\n\n` (빈 줄)으로 분리 → 각 단락이 하나의 `LyricSlide`
2. 각 단락 내 줄바꿈(`\n`)으로 분리 → `lines[]`
3. 빈 줄만 있는 단락 및 빈 줄 제거
4. 모든 슬라이드의 `section = "verse"`, `sectionIndex` = 1, 2, 3...
5. `id = "verse-{sectionIndex}"`

**예시:**

```
입력:
주 예수 보다 더 귀한 것은 없네
세상의 행복 즐거움보다

믿음으로 사는 것이 행복이라
늘 주를 찬양 드리면서

→ LyricSlide[]:
  [0] id="verse-1", lines=["주 예수 보다 더 귀한 것은 없네", "세상의 행복 즐거움보다"]
  [1] id="verse-2", lines=["믿음으로 사는 것이 행복이라", "늘 주를 찬양 드리면서"]
```

---

## 데이터 흐름

1. "큐에 추가" 클릭
2. 입력 파싱 → `LyricSlide[]` 생성
3. `songDb.create(title, artist, lyrics_json)` → `songId` 반환
4. `serviceDb.addItem(currentService.id, { type: "song", song_id: songId, label: title, ... })`
5. `setCurrentService(updated)` → QueuePanel에 즉시 반영
6. 폼 초기화

이후 찬양 탭에서 해당 곡을 클릭하면 SongEditor로 섹션 편집 가능.

---

## 에러 처리

- 제목 없으면 버튼 비활성
- 가사 비어있으면 빈 슬라이드 없이 저장 (songs 테이블에 `lyrics_json = []`)
- DB 오류 시 `addError` 상태로 빨간 메시지 표시

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `components/controller/QueuePanel.tsx` | "직접 입력" 탭 추가, 파싱 로직, songDb.create + serviceDb.addItem 연결 |

---

## 범위 외

- 섹션(절/후렴/다리) 자동 감지
- 가사 미리보기
- 기존 곡 덮어쓰기
