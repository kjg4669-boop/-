# 출력 창 구조 및 작동 방식

## 개요

출력 관련 창은 총 3개이며, 각각 다른 대상·목적을 위해 설계되어 있다.

| 창 | 경로 | 대상 | 내용 |
|----|------|------|------|
| **output** | `app/output/page.tsx` | 청중 (프로젝터) | 실제 예배 화면 |
| **preview** | `app/preview/page.tsx` | 운영자 | output과 동일한 화면 미리보기 |
| **stage** | `app/stage/page.tsx` | 발표자/인도자 | 현재 가사 + 다음 슬라이드 + 부가 정보 |

---

## 1. output 창 (`app/output/page.tsx`)

### 역할
프로젝터·빔에 연결된 두 번째 모니터에 띄우는 **실제 청중용 화면**.

### IPC 수신 이벤트
| 이벤트 | 처리 내용 |
|--------|-----------|
| `slide:update` | `layerConfig` 업데이트 (freeze 상태면 무시) |
| `blackout` | 블랙아웃 on/off |
| `alert:show` | 알림 배너 표시 (duration 후 자동 해제) |
| `countdown:update` | 카운트다운 표시 |
| `audio:play` / `audio:stop` | 배킹 트랙 재생/정지 |
| `look:apply` | 레이어 가시성 + 스타일 프리셋 적용 |
| `announcement:show` | 공지 오버레이 표시 |
| `output:scale-mode` | fit / fill / native 스케일 모드 |
| `output:freeze` | 화면 고정 (슬라이드 변경 무시) |

### 렌더링 구조
1920×1080 기준 캔버스를 `transform: scale()` 로 창 크기에 맞게 축소.

```
<div w=scaledW h=scaledH>                 ← 창 크기에 맞춘 컨테이너
  <div 1920×1080 transform:scale(s)>      ← 실제 캔버스 (항상 1920×1080)
    BackgroundLayer    z:10              ← 배경 (색상/이미지/영상)
    SubtitleLayer      z:20              ← 자막 (두 슬롯 crossfade)
    AnnouncementOverlay z:35            ← 공지 오버레이
    OverlayLayer       z:30             ← 오버레이 이미지
    CanvasLayer        z:40             ← 자유 텍스트 블록
    CountdownLayer     z:50             ← 카운트다운
    AlertBanner        z:60             ← 알림 배너
  </div>
</div>
<div 블랙아웃 z:100 />                   ← 전체 화면 블랙아웃
<audio />                                 ← 배킹 트랙
```

### 스케일 모드
- **fit** (기본): 창 안에 16:9 전체가 보임 (레터박스/필러박스)
- **fill**: 창 전체를 채움 (잘릴 수 있음)
- **native**: 1배율 그대로

### 특이사항
- 각 레이어는 별도 컴포넌트 (`BackgroundLayer`, `SubtitleLayer` 등)로 분리됨
- `SubtitleLayer`는 textEntrance 효과 지원 (slide-up/down/zoom-in/@keyframes)
- `CanvasLayer`도 두 슬롯 crossfade 방식 사용
- Esc키 → `close_output_window` Rust 커맨드 호출 (macOS 풀스크린 안전 종료)
- 4초마다 `heartbeat:ping` 전송 → 컨트롤러가 출력창 생존 감지

---

## 2. preview 창 (`app/preview/page.tsx`)

### 역할
운영자가 프로젝터 내용을 **미리 확인**하기 위한 플로팅 창. output과 동일한 시각적 결과를 보여준다.

### IPC 수신 이벤트
| 이벤트 | 처리 내용 |
|--------|-----------|
| `preview:update` | `layerConfig` 업데이트 |
| `blackout` | 블랙아웃 on/off |
| `heartbeat:ping` | `isLive` 상태 갱신 (6초 타임아웃) |

### 렌더링 구조
렌더링을 **전혀 직접 하지 않고** `OutputPreview` 컴포넌트에 위임한다.

```tsx
<OutputPreview
  layerConfig={layerConfig}
  isBlackout={isBlackout}
  isLive={isOutputLive}
  width={scaledW}   // 창 너비 (16:9 강제 유지)
  fullscreen         // 테두리/모서리 없음
/>
```

### OutputPreview 컴포넌트 (`components/controller/OutputPreview.tsx`)
도킹 사이드바와 창모드 **양쪽에서 동일하게** 사용되는 컴포넌트.

| prop | 도킹 사이드바 | 창모드 |
|------|-------------|--------|
| `width` | 232 (기본값) | 창 실제 너비 |
| `fullscreen` | false | true |

내부적으로 `SCALE = width / 1920` 으로 모든 크기를 비례 계산:
- 폰트: `sub.fontSize * SCALE`
- 패딩: `18 * (width/232)` (비례 스케일)
- 스트로크·그림자: `strokeWidth * SCALE`

**배경 crossfade**: CSS `transition: opacity` (두 슬롯 교대)
**자막 crossfade**: CSS `transition: opacity` (두 슬롯 교대)
**캔버스 블록**: outer `opacity transition` + inner `@keyframes` (transform 효과용)

> **⚠️ 주의**: output 창과 달리 `transform: scale()` 부모 없이 실제 픽셀 크기로 렌더링함.
> output 창의 `SubtitleLayer`를 여기에 재사용하면 CSS transition이 깨진다 (WKWebView 버그).

### output vs preview 차이
| | output | preview |
|--|--------|---------|
| 스케일 방식 | `transform: scale()` (항상 1920×1080 기준) | 실제 픽셀 크기 계산 |
| 렌더링 컴포넌트 | BackgroundLayer, SubtitleLayer 등 분리 | OutputPreview 단일 컴포넌트 |
| IPC 이벤트 | `slide:update` | `preview:update` |
| 오디오 | ✅ 있음 | ❌ 없음 |
| Looks 적용 | ✅ 있음 | ❌ 없음 |
| 공지 오버레이 | ✅ 있음 | ❌ 없음 |
| CountdownLayer | ✅ 있음 | ❌ 없음 |
| 16:9 강제 유지 | ❌ (사용자 자유) | ✅ 자동 snap |

---

## 3. stage 창 (`app/stage/page.tsx`)

### 역할
발표자·인도자 모니터에 띄우는 **전용 화면**. 청중에게는 보이지 않는 정보를 포함한다.

### IPC 수신 이벤트
| 이벤트 | 처리 내용 |
|--------|-----------|
| `slide:update` | `layerConfig` + `SlideMeta` 업데이트 |
| `alert:show` | 알림 배너 표시 |
| `stage:message` | 운영자→발표자 비공개 메시지 (노란 오버레이) |
| `countdown:update` | 카운트다운 상단 표시 |

### 화면 레이아웃
```
┌─────────────────────────────────────┐
│ STAGE DISPLAY │ 곡 제목 │ 섹션 │ BPM │ 슬라이드N/M │ 순서N/M │ 시계 │ ✕ │  ← 상단 바 (44px)
├─────────────────────────────────────┤
│                                     │
│   코드 (파란색 모노스페이스)          │
│                                     │
│   현재 가사 (56px, 굵게)             │  ← 현재 슬라이드 (65%)
│   이중언어 번역 (32px, 이탤릭)       │
│                                     │
├─────────────────────────────────────┤
│  다음 슬라이드 미리보기 (26px, 흐리게)│  발표자 메모 (선택적) │  ← 하단 영역 (35%)
└─────────────────────────────────────┘
```

### SlideMeta 데이터 (controller → stage)
`slide:update` 이벤트에 `meta` 필드로 함께 전달됨.

| 필드 | 내용 |
|------|------|
| `songTitle` | 곡 제목 |
| `section` | 현재 섹션 (verse/chorus/bridge 등) |
| `slideIndex` / `totalSlides` | 현재 슬라이드 위치 |
| `itemIndex` / `totalItems` | 서비스 순서 위치 |
| `nextLines` | 다음 슬라이드 가사 |
| `nextSection` | 다음 슬라이드 섹션 |
| `bpm` | BPM (설정된 경우) |
| `chords` | 코드 문자열 |
| `notes` | 발표자 메모 |

### 특이사항
- 배경 렌더링 없음 (항상 다크 테마 `#0f0f1a`)
- 카운트다운은 숫자 텍스트만 표시 (SVG 링 없음)
- 운영자→발표자 비공개 메시지: 노란색 고정 오버레이 (z:200)
- `stage:closed` 이벤트로 컨트롤러에 종료 알림

---

## 수정 시 주의사항

1. **output 수정 시**: `components/layers/` 의 각 레이어 컴포넌트를 수정. 1920×1080 기준 px 사용.

2. **preview 수정 시**: `components/controller/OutputPreview.tsx` 수정. 모든 크기는 `SCALE = width / 1920` 기반.
   - `transform: scale()` 절대 사용 금지 → WKWebView에서 CSS transition 깨짐
   - 도킹(width=232)과 창모드(width=실제창너비) 양쪽 모두 테스트 필요

3. **stage 수정 시**: `app/stage/page.tsx` 직접 수정. SlideMeta 필드 추가 시 `lib/types.ts`의 `SlideMeta` 타입도 함께 수정.

4. **IPC 이벤트 추가 시**: `lib/ipc.ts`에 send/on 함수 추가 + Rust `src-tauri/src/commands/mod.rs`에 대응 커맨드/이벤트 추가.
