"use client";

import type { LayerConfig, Look } from "@/lib/types";
import { FONT_OPTIONS } from "@/lib/constants";

type RibbonTab = "home" | "insert" | "design" | "transition" | "animation" | "slideshow" | "review" | "view";

type FmtPatch = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: "normal" | "bold";
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline" | "line-through";
  color?: string;
  textAlign?: "left" | "center" | "right";
};

interface Props {
  ribbonTab: RibbonTab;
  onSetRibbonTab: (tab: RibbonTab) => void;

  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  hasService: boolean;
  serviceItemCount: number;
  onSaveTemplate: () => void;
  onExportService: () => void;
  onOpenTemplateModal: () => void;

  onPasteBlock: () => void;
  onCutBlock: () => void;
  onCopyBlock: () => void;
  onActivateFmtPainter: () => void;
  fmtPainterOn: boolean;
  hasSelectedBlock: boolean;

  fmt: Required<FmtPatch>;
  onFormat: (patch: FmtPatch) => void;

  layerConfig: LayerConfig;
  onLayerChange: (config: LayerConfig) => void;

  onNewService: () => void;
  onOpenService: () => void;
  onSave: () => void;
  onBackupDb: () => void;
  onRestoreDb: () => void;

  isLoop: boolean;
  onToggleLoop: () => void;

  isBlackout: boolean;
  onToggleBlackout: () => void;
  isClear: boolean;
  onToggleClear: () => void;
  onOpenOutput: () => void;
  onFromStart: () => void;
  onCloseOutput: () => void;
  onOpenDesignPanel: () => void;

  serviceNotes: string;
  onServiceNotesChange: (notes: string) => void;

  zoom: number;
  onSetZoom: (z: number) => void;
  showPanel: boolean;
  onTogglePanel: () => void;
  onOpenPreview: () => void;

  hasSlides: boolean;
  onNewSlide: () => void;
  onDupSlide: () => void;
  onAddBlock: () => void;
  onAddSong: () => void;
  onAddScripture: () => void;
  onInsertImage: () => void;
  onInsertVideo: () => void;
  soundName: string | null;
  soundPlaying: boolean;
  onToggleSound: () => void;
  onInsertSound: () => void;
  onShowAbout: () => void;

  looks: Look[];
  currentLookId: number | null;
  onApplyLook: (look: Look | null) => void;
}

const TAB_LABELS: Record<RibbonTab, string> = {
  home: "홈", insert: "삽입", design: "디자인", transition: "전환",
  animation: "애니메이션", slideshow: "슬라이드 쇼", review: "검토", view: "보기",
};

export default function RibbonToolbar({
  ribbonTab, onSetRibbonTab,
  canUndo, canRedo, onUndo, onRedo,
  hasService, serviceItemCount, onSaveTemplate, onExportService, onOpenTemplateModal,
  onPasteBlock, onCutBlock, onCopyBlock, onActivateFmtPainter, fmtPainterOn, hasSelectedBlock,
  fmt, onFormat,
  layerConfig, onLayerChange,
  onNewService, onOpenService, onSave, onBackupDb, onRestoreDb,
  isLoop, onToggleLoop,
  isBlackout, onToggleBlackout, isClear, onToggleClear, onOpenOutput, onFromStart, onCloseOutput,
  serviceNotes, onServiceNotesChange,
  zoom, onSetZoom, showPanel, onTogglePanel, onOpenPreview,
  hasSlides, onNewSlide, onDupSlide, onAddBlock, onAddSong, onAddScripture, onInsertImage, onInsertVideo,
  soundName, soundPlaying, onToggleSound, onInsertSound,
  onOpenDesignPanel, onShowAbout,
  looks, currentLookId, onApplyLook,
}: Props) {
  function setSubtitle(patch: Partial<LayerConfig["subtitle"]>) {
    onLayerChange({ ...layerConfig, subtitle: { ...layerConfig.subtitle, ...patch } });
  }

  return (
    <>
      {/* Row 2: 탭 바 */}
      <div className="h-7 flex items-end px-1 bg-[#2b2b2b] flex-shrink-0 text-xs border-b border-zinc-700">
        {(Object.keys(TAB_LABELS) as RibbonTab[]).map((tab) => (
          <button key={tab} onClick={() => onSetRibbonTab(tab)}
            className={`px-3 h-full text-xs transition-colors ${
              ribbonTab === tab
                ? "text-white border-b-2 border-blue-500 bg-[#2d2d2d]"
                : "text-zinc-400 hover:text-zinc-200"
            }`}>
            {TAB_LABELS[tab]}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onShowAbout}
          title="Worship Projector 정보"
          className="px-2 h-full text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
        >
          ℹ
        </button>
      </div>

      {/* Row 3: 탭 콘텐츠 */}
      <div className="h-9 flex items-center gap-0.5 px-2 border-b border-zinc-700 bg-[#2d2d2d] flex-shrink-0 text-xs overflow-x-auto">

        {ribbonTab === "home" && (<>
          {/* 파일 작업 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <button onClick={onNewService} title="새 예배 (⌘N)"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">📄</span>
              <span className="text-[10px] mt-0.5">새 예배</span>
            </button>
            <button onClick={onOpenService} title="예배 열기 (⌘O)"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">📂</span>
              <span className="text-[10px] mt-0.5">열기</span>
            </button>
            <button onClick={onSave} disabled={!hasService} title="저장 (⌘S)"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="text-base leading-none">💾</span>
              <span className="text-[10px] mt-0.5">저장</span>
            </button>
          </div>

          {/* 실행 취소 / 다시 실행 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <button onClick={onUndo} disabled={!canUndo} title="실행 취소 (⌘Z)"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="text-base leading-none">↩</span>
              <span className="text-[10px] mt-0.5">취소</span>
            </button>
            <button onClick={onRedo} disabled={!canRedo} title="다시 실행 (⌘⇧Z)"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="text-base leading-none">↪</span>
              <span className="text-[10px] mt-0.5">복원</span>
            </button>
          </div>

          {/* 템플릿 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <button onClick={onSaveTemplate} disabled={!hasService || serviceItemCount === 0}
              title="현재 예배를 템플릿으로 저장"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="text-base leading-none">📑</span>
              <span className="text-[10px] mt-0.5">템플릿저장</span>
            </button>
            <button onClick={onOpenTemplateModal} title="템플릿에서 새 예배 만들기"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">📋</span>
              <span className="text-[10px] mt-0.5">템플릿</span>
            </button>
            <button onClick={onExportService} disabled={!hasService}
              title="현재 예배를 텍스트 파일로 내보내기"
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed">
              <span className="text-base leading-none">📤</span>
              <span className="text-[10px] mt-0.5">내보내기</span>
            </button>
          </div>

          {/* 클립보드 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <button onClick={onPasteBlock}
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">📋</span>
              <span className="text-[10px] mt-0.5">붙여넣기</span>
            </button>
            <div className="flex flex-col gap-0.5">
              <button onClick={onCutBlock}
                className="px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400 text-xs">✂ 잘라내기</button>
              <button onClick={onCopyBlock}
                className="px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400 text-xs">📄 복사하기</button>
              <button onClick={onActivateFmtPainter} disabled={!hasSelectedBlock}
                className={`px-2 py-0.5 rounded text-xs disabled:text-zinc-600 disabled:cursor-default ${fmtPainterOn ? "bg-orange-600 text-white" : "hover:bg-zinc-700 text-zinc-400"}`}
                title="선택한 블록의 서식을 다른 블록에 적용">
                🖌 서식복사
              </button>
            </div>
          </div>

          {/* 글꼴 */}
          <select value={fmt.fontFamily} onChange={(e) => onFormat({ fontFamily: e.target.value })}
            className="bg-[#3c3c3c] border border-zinc-600 rounded px-1.5 py-0.5 text-white outline-none hover:border-zinc-400 w-28">
            {FONT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <input type="number" min={12} max={200} value={fmt.fontSize}
            onChange={(e) => onFormat({ fontSize: Math.max(12, Math.min(200, Number(e.target.value))) })}
            className="w-11 bg-[#3c3c3c] border border-zinc-600 rounded px-1 py-0.5 text-white outline-none text-center hover:border-zinc-400" />

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          <button onClick={() => onFormat({ fontWeight: fmt.fontWeight === "bold" ? "normal" : "bold" })}
            className={`w-6 h-6 rounded font-bold ${fmt.fontWeight === "bold" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>B</button>
          <button onClick={() => onFormat({ fontStyle: fmt.fontStyle === "italic" ? "normal" : "italic" })}
            className={`w-6 h-6 rounded italic ${fmt.fontStyle === "italic" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>I</button>
          <button onClick={() => onFormat({ textDecoration: fmt.textDecoration === "underline" ? "none" : "underline" })}
            className={`w-6 h-6 rounded underline ${fmt.textDecoration === "underline" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>U</button>
          <button onClick={() => onFormat({ textDecoration: fmt.textDecoration === "line-through" ? "none" : "line-through" })}
            className={`w-6 h-6 rounded line-through ${fmt.textDecoration === "line-through" ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>S</button>

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          <input type="color" value={fmt.color} onChange={(e) => onFormat({ color: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border border-zinc-600 bg-transparent p-0" title="글자 색상" />

          <div className="w-px h-5 bg-zinc-600 mx-0.5" />

          {(["left", "center", "right"] as const).map((align) => (
            <button key={align} onClick={() => onFormat({ textAlign: align })}
              className={`w-6 h-6 rounded ${fmt.textAlign === align ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}
              title={align === "left" ? "왼쪽" : align === "center" ? "가운데" : "오른쪽"}>
              {align === "left" ? "⫷" : align === "center" ? "☰" : "⫸"}
            </button>
          ))}

          {!hasSelectedBlock && (<>
            <div className="w-px h-5 bg-zinc-600 mx-0.5" />
            {(["top", "center", "bottom"] as const).map((pos) => (
              <button key={pos} onClick={() => setSubtitle({ position: pos })}
                className={`px-1.5 h-6 rounded ${layerConfig.subtitle.position === pos ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {pos === "top" ? "상▲" : pos === "center" ? "중" : "하▼"}
              </button>
            ))}
          </>)}

          {/* Looks 프리셋 */}
          <div className="flex items-center gap-0.5 border-r border-zinc-600 pr-2 mr-1">
            <span className="text-zinc-400 text-xs mr-1">Look</span>
            <select
              value={currentLookId ?? ""}
              onChange={(e) => {
                const id = e.target.value === "" ? null : Number(e.target.value);
                const look = id === null ? null : looks.find((l) => l.id === id) ?? null;
                onApplyLook(look);
              }}
              className="bg-[#3c3c3c] border border-zinc-600 rounded px-1.5 py-0.5 text-white outline-none hover:border-zinc-400 text-xs max-w-[110px]"
            >
              <option value="">기본 (전체 표시)</option>
              {looks.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>

          <div className="flex-1" />

          {/* 데이터 */}
          <div className="flex items-center gap-0.5 border-l border-zinc-600 pl-2 ml-1">
            <button onClick={onBackupDb} title="데이터베이스 백업..."
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-400">
              <span className="text-base leading-none">🗄</span>
              <span className="text-[10px] mt-0.5">백업</span>
            </button>
            <button onClick={onRestoreDb} title="데이터베이스 복원..."
              className="flex flex-col items-center px-1.5 py-0.5 rounded hover:bg-zinc-700 text-zinc-400">
              <span className="text-base leading-none">⬆️</span>
              <span className="text-[10px] mt-0.5">복원</span>
            </button>
          </div>

          <button onClick={onToggleLoop}
            className={`px-2 h-6 rounded ${isLoop ? "bg-yellow-700 text-yellow-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
            ↺ {isLoop ? "루프 ON" : "루프"}
          </button>
        </>)}

        {ribbonTab === "design" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-xs mr-1">테마</span>
            {([
              { label: "어두운", bg: "#000000", text: "#ffffff" },
              { label: "밝은",   bg: "#ffffff", text: "#000000" },
              { label: "파랑",   bg: "#001040", text: "#ffffff" },
              { label: "붉은",   bg: "#1a0000", text: "#ff9090" },
              { label: "남색",   bg: "#0a0a1e", text: "#e0e0ff" },
            ] as const).map(({ label, bg, text }) => (
              <button key={label} title={label}
                onClick={() => onLayerChange({
                  ...layerConfig,
                  background: { ...layerConfig.background, type: "color", color: bg },
                  subtitle: { ...layerConfig.subtitle, color: text },
                })}
                className="flex flex-col items-center gap-0.5 px-1 py-0.5 rounded hover:bg-zinc-700">
                <div className="w-8 h-5 rounded border border-zinc-600 flex items-center justify-center" style={{ background: bg }}>
                  <span style={{ fontSize: 7, color: text, fontWeight: "bold" }}>Aa</span>
                </div>
                <span className="text-xs text-zinc-400">{label}</span>
              </button>
            ))}
          </div>
          <button onClick={onOpenDesignPanel}
            className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
            <span className="text-base leading-none">🎨</span>
            <span className="text-[10px] mt-0.5">디자인 패널</span>
          </button>
        </>)}

        {ribbonTab === "transition" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-xs mr-1">전환 속도</span>
            {([
              { label: "빠름", ms: 300 },
              { label: "보통", ms: 600 },
              { label: "느림", ms: 1200 },
            ] as const).map(({ label, ms }) => (
              <button key={ms} onClick={() => onLayerChange({ ...layerConfig, transitionMs: ms })}
                className={`px-2 h-6 rounded text-xs ${(layerConfig.transitionMs ?? 600) === ms ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-zinc-500 text-xs">슬라이드 간 페이드 전환 속도</span>
        </>)}

        {ribbonTab === "animation" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-xs mr-1">텍스트 입장</span>
            {([
              { label: "없음",    val: "none"       as const },
              { label: "페이드인", val: "fade"       as const },
              { label: "위로↑",   val: "slide-up"   as const },
              { label: "아래로↓", val: "slide-down" as const },
              { label: "줌인",    val: "zoom-in"    as const },
            ]).map(({ label, val }) => (
              <button key={val} onClick={() => setSubtitle({ textEntrance: val })}
                className={`px-2 h-6 rounded text-xs ${(layerConfig.subtitle.textEntrance ?? "fade") === val ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {label}
              </button>
            ))}
          </div>
          <span className="text-zinc-500 text-xs ml-2">새 슬라이드 표시 시 텍스트 효과</span>
        </>)}

        {ribbonTab === "slideshow" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-2">
            <button onClick={onFromStart}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">⏮</span>
              <span className="text-[10px] mt-0.5">처음부터</span>
            </button>
            <button onClick={onOpenOutput}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">▶</span>
              <span className="text-[10px] mt-0.5">현재부터</span>
            </button>
            <button onClick={onCloseOutput}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-400">
              <span className="text-base leading-none">⏹</span>
              <span className="text-[10px] mt-0.5">종료</span>
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onToggleLoop}
              className={`px-2 h-6 rounded text-xs ${isLoop ? "bg-yellow-700 text-yellow-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              ↺ 루프
            </button>
            <button onClick={onToggleBlackout}
              className={`px-2 h-6 rounded text-xs ${isBlackout ? "bg-red-700 text-red-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              ● 블랙
            </button>
            <button onClick={onToggleClear}
              className={`px-2 h-6 rounded text-xs ${isClear ? "bg-orange-700 text-orange-200" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-400"}`}>
              자막 숨김
            </button>
          </div>
        </>)}

        {ribbonTab === "review" && (<>
          <div className="flex items-center gap-2">
            <span className="text-zinc-400 text-xs">예배 메모</span>
            <input type="text" placeholder="운영 메모..." value={serviceNotes}
              onChange={(e) => onServiceNotesChange(e.target.value)}
              className="bg-[#3c3c3c] border border-zinc-600 rounded px-2 py-0.5 text-white w-72 text-xs outline-none focus:border-blue-500" />
            <span className="text-zinc-600 text-xs">* 투사 화면에 표시되지 않음</span>
          </div>
        </>)}

        {ribbonTab === "view" && (<>
          <div className="flex items-center gap-1 border-r border-zinc-600 pr-3 mr-1">
            <span className="text-zinc-400 text-xs mr-1">줌</span>
            <input type="range" min={25} max={200} step={5} value={zoom}
              onChange={(e) => onSetZoom(Number(e.target.value))}
              className="w-20 accent-zinc-400" />
            <span className="text-zinc-300 text-xs w-8 tabular-nums">{zoom}%</span>
            {([50, 85, 100, 150] as const).map((z) => (
              <button key={z} onClick={() => onSetZoom(z)}
                className={`px-1.5 h-6 rounded text-xs ${zoom === z ? "bg-blue-600 text-white" : "bg-[#3c3c3c] hover:bg-zinc-600 text-zinc-300"}`}>
                {z}%
              </button>
            ))}
          </div>
          <button onClick={onTogglePanel}
            className={`flex flex-col items-center px-2 py-0.5 rounded ${showPanel ? "bg-zinc-600 text-white" : "hover:bg-zinc-700 text-zinc-300"}`}>
            <span className="text-base leading-none">☰</span>
            <span className="text-[10px] mt-0.5">패널</span>
          </button>
          <button onClick={onOpenPreview}
            className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
            <span className="text-base leading-none">🖥</span>
            <span className="text-[10px] mt-0.5">출력 미리보기</span>
          </button>
        </>)}

        {ribbonTab === "insert" && (<>
          <div className="border-r border-zinc-600 pr-3 mr-1 flex items-center gap-1">
            <button onClick={onNewSlide} disabled={!hasService}
              title={!hasService ? "순서 탭에서 예배를 먼저 선택하세요" : "새 슬라이드 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!hasService ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base leading-none">🗒</span>
              <span className="text-[10px] mt-0.5">새 슬라이드</span>
            </button>
            <button onClick={onDupSlide} disabled={!hasSlides}
              title={!hasSlides ? "슬라이드가 없습니다" : "현재 슬라이드 복제"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!hasSlides ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base leading-none">⧉</span>
              <span className="text-[10px] mt-0.5">복제</span>
            </button>
          </div>
          <div className="border-r border-zinc-600 pr-3 mr-1 flex items-center gap-1">
            <button onClick={onAddSong} disabled={!hasService}
              title={!hasService ? "순서 탭에서 예배를 먼저 선택하세요" : "찬양 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!hasService ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base leading-none">🎵</span>
              <span className="text-[10px] mt-0.5">찬양</span>
            </button>
            <button onClick={onAddScripture} disabled={!hasService}
              title={!hasService ? "순서 탭에서 예배를 먼저 선택하세요" : "성경 구절 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!hasService ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base leading-none">📖</span>
              <span className="text-[10px] mt-0.5">성경</span>
            </button>
          </div>
          <div className="border-r border-zinc-600 pr-3 mr-1 flex flex-col items-center">
            <button onClick={onAddBlock} disabled={!hasSlides}
              title={!hasSlides ? "순서 탭에서 예배와 찬양을 먼저 추가하세요" : "텍스트 상자 추가"}
              className={`flex flex-col items-center px-2 py-0.5 rounded ${!hasSlides ? "opacity-40 cursor-not-allowed" : "hover:bg-zinc-700 text-zinc-300"}`}>
              <span className="text-base font-bold leading-none">T</span>
              <span className="text-[10px] mt-0.5">텍스트 상자</span>
            </button>
          </div>
          <div className="flex gap-1">
            <button onClick={onInsertImage}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">🖼</span>
              <span className="text-[10px] mt-0.5">이미지</span>
            </button>
            <button onClick={onInsertVideo}
              className="flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 text-zinc-300">
              <span className="text-base leading-none">🎬</span>
              <span className="text-[10px] mt-0.5">비디오</span>
            </button>
            <button onClick={soundName ? onToggleSound : onInsertSound}
              className={`flex flex-col items-center px-2 py-0.5 rounded hover:bg-zinc-700 ${soundPlaying ? "text-green-400" : "text-zinc-300"}`}
              title={soundName ? `${soundName} — 클릭하여 ${soundPlaying ? "일시정지" : "재생"}` : "오디오 파일 열기"}>
              <span className="text-base leading-none">🔊</span>
              <span className="text-[10px] mt-0.5">{soundName ? (soundPlaying ? "▶ 재생중" : "⏸ 정지") : "사운드"}</span>
            </button>
            {soundName && (
              <button onClick={onInsertSound}
                className="flex flex-col items-center px-1 py-0.5 rounded hover:bg-zinc-700 text-zinc-500" title="다른 파일 열기">
                <span className="text-xs">📂</span>
              </button>
            )}
          </div>
        </>)}


      </div>
    </>
  );
}
