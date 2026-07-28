# PPTX 임포트 설계

**날짜**: 2026-06-13
**프로젝트**: worship-projector (Tauri v2 + Next.js 16)

---

## 범위

LibraryPanel의 찬양 탭에서 `.pptx` 파일을 불러와 슬라이드 텍스트를 `LyricSlide[]`로 변환하고 DB에 저장해 SongEditor로 편집할 수 있게 한다.

---

## UI

### 진입점

찬양 탭 헤더 영역 (검색창 + "새 찬양" 버튼 행):

```
[검색창___________________] [PPTX] [+ 새 찬양]
```

"PPTX" 버튼 클릭 → 숨겨진 `<input type="file" accept=".pptx">` 트리거 → OS 파일 선택 다이얼로그 → 파일 선택 시 임포트 모달 열림.

### 임포트 모달 (PptxImportModal)

```
┌─────────────────────────────────────────┐
│  PPTX 임포트           [filename.pptx]  │
├─────────────────────────────────────────┤
│  제목: [______________________________]  │
│                                         │
│  슬라이드 미리보기 (N장)                │
│  ┌──────────────┐  ┌──────────────┐    │
│  │ 1. 주 예수   │  │ 2. 믿음으로  │    │
│  │ 보다 더...   │  │ 사는 것이... │    │
│  └──────────────┘  └──────────────┘    │
│  ...                                    │
│                                         │
│  빈 슬라이드(N장)는 제외됩니다.         │
│                                         │
│          [취소]   [찬양 라이브러리에 저장] │
└─────────────────────────────────────────┘
```

- 제목 입력 필수 (파일명에서 `.pptx` 제거해 초기값 설정)
- 슬라이드 미리보기: 그리드, 각 카드에 슬라이드 번호 + 첫 2줄
- 빈 슬라이드(텍스트 없음) 제외 후 개수 표시
- "찬양 라이브러리에 저장" 버튼: 제목 있을 때만 활성

---

## PPTX 파싱 규칙

PPTX = ZIP 아카이브. 슬라이드는 `ppt/slides/slide1.xml`, `slide2.xml`, ... 순서.

### 텍스트 추출

1. `file.arrayBuffer()` → JSZip으로 언집
2. `ppt/slides/slide*.xml` 파일 목록을 번호 순 정렬
3. 각 슬라이드 XML을 DOMParser로 파싱
4. `<a:t>` 요소 텍스트를 모아 공백으로 연결 → 해당 슬라이드의 텍스트 블록
5. 같은 `<a:p>` 단락 안의 `<a:t>`는 공백 없이 연결, 단락 간은 줄바꿈(`\n`)

### 슬라이드 → LyricSlide 변환

- 텍스트가 하나도 없는 슬라이드는 건너뜀
- 텍스트 있는 슬라이드 각각이 하나의 `LyricSlide`
- `id = "verse-{sectionIndex}"`, `section = "verse"`, `sectionIndex = 1,2,3,...`
- `lines = [단락1텍스트, 단락2텍스트, ...]` (빈 줄 제거)

**예시:**

```
slide1.xml: "주 예수 보다 더 귀한 것은 없네\n세상의 행복 즐거움보다"
slide2.xml: ""  (빈 슬라이드 → 건너뜀)
slide3.xml: "믿음으로 사는 것이 행복이라\n늘 주를 찬양 드리면서"

→ LyricSlide[]:
  [0] id="verse-1", section="verse", sectionIndex=1,
      lines=["주 예수 보다 더 귀한 것은 없네", "세상의 행복 즐거움보다"]
  [1] id="verse-2", section="verse", sectionIndex=2,
      lines=["믿음으로 사는 것이 행복이라", "늘 주를 찬양 드리면서"]
```

---

## 데이터 흐름

1. "PPTX" 버튼 클릭 → `<input type="file">` 클릭
2. 사용자가 `.pptx` 파일 선택
3. `parsePptx(file)` → `ParsedSlide[]` (각 슬라이드 텍스트 배열)
4. 모달 열림: 제목(파일명 기본값) + 슬라이드 미리보기
5. 사용자가 제목 확인/수정 후 "저장" 클릭
6. `parseLyricsToSlides(slides)` → `LyricSlide[]`
7. `songDb.create({ title, artist: "", lyrics_json })` → `songId`
8. `setSongs(prev => [...prev, newSong])` (낙관적 업데이트)
9. 모달 닫힘 + notice "저장됨"

---

## 에러 처리

- 파일이 PPTX가 아니거나 파싱 실패 → 모달에 "파일을 읽을 수 없습니다" 표시
- 모든 슬라이드가 비어있으면 빈 `lyrics_json: []`로 저장 (경고 메시지 표시)
- DB 저장 실패 → 모달에 에러 표시
- 제목 없으면 저장 버튼 비활성

---

## 기술 결정

- **JSZip**: npm 패키지. Tauri 플러그인 불필요, WebView 내 순수 JS
- **DOMParser**: 브라우저 내장, 서버 렌더링 없음 (`"use client"` 컴포넌트에서만 사용)
- **파일 선택**: `<input type="file" accept=".pptx">` (숨김) + `ref.click()`

---

## 파일 변경 목록

| 파일 | 변경 |
|---|---|
| `package.json` | `jszip` + `@types/jszip` 설치 |
| `lib/pptxParser.ts` | 신규 — `parsePptx(file): Promise<ParsedSlide[]>` |
| `components/controller/PptxImportModal.tsx` | 신규 — 임포트 모달 |
| `components/controller/LibraryPanel.tsx` | "PPTX" 버튼 + 모달 연결 |

---

## 범위 외

- `.ppt` (구형 바이너리 포맷) 지원
- 이미지 슬라이드 추출
- 기존 곡 덮어쓰기
- 슬라이드 선택/제외 기능
