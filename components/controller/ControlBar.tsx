"use client";

interface Props {
  serviceName: string | null;
  isDirty: boolean;
  ctrlNotice: { msg: string; error?: boolean } | null;
  onDismissNotice: () => void;
  slideCount: number;
  flatIdx: number;
  nextSlidePreview: string | null;
  nextSlideFull: string | null;

  isLive: boolean;
  onToggleLive: () => void;
  isBlackout: boolean;
  onToggleBlackout: () => void;
  isClear: boolean;
  onToggleClear: () => void;
  isFrozen: boolean;
  onToggleFrozen: () => void;

  autoAdvance: boolean;
  onToggleAutoAdvance: () => void;
  autoAdvanceMs: number;
  onChangeAutoAdvanceMs: (ms: number) => void;
  autoProgress: number;

  isVideoBackground: boolean;
  videoSrc: string;
  videoPlaying: boolean;
  onToggleVideoPlay: () => void;

  alertInput: string;
  onSetAlertInput: (v: string) => void;
  alertActive: boolean;
  onSendAlert: () => void;
  onClearAlert: () => void;

  outputConnected: boolean;
  onOpenOutput: () => void;
  isStageOpen: boolean;
  onToggleStage: () => void;

  countdownMin: number;
  onSetCountdownMin: (n: number) => void;
  countdownActive: boolean;
  countdownRemainingMs: number;
  onToggleCountdown: () => void;
  onResetCountdown: () => void;

  clock: string;
  showPanel: boolean;
  onTogglePanel: () => void;
  onShowCheatSheet: () => void;
}

export default function ControlBar({
  serviceName, isDirty, ctrlNotice, onDismissNotice, slideCount, flatIdx, nextSlidePreview, nextSlideFull,
  isLive, onToggleLive,
  isBlackout, onToggleBlackout,
  isClear, onToggleClear,
  isFrozen, onToggleFrozen,
  autoAdvance, onToggleAutoAdvance, autoAdvanceMs, onChangeAutoAdvanceMs, autoProgress,
  isVideoBackground, videoSrc, videoPlaying, onToggleVideoPlay,
  alertInput, onSetAlertInput, alertActive, onSendAlert, onClearAlert,
  outputConnected, onOpenOutput,
  isStageOpen, onToggleStage,
  countdownMin, onSetCountdownMin, countdownActive, countdownRemainingMs, onToggleCountdown, onResetCountdown,
  clock, showPanel, onTogglePanel, onShowCheatSheet,
}: Props) {
  const countdownLabel = countdownActive
    ? countdownRemainingMs > 0
      ? `⏳ ${Math.floor(countdownRemainingMs / 60000)}:${String(Math.floor((countdownRemainingMs % 60000) / 1000)).padStart(2, "0")}`
      : "⏳ 0:00"
    : "카운트";

  return (
    <div data-help-id="controlbar" className="h-9 border-b border-zinc-700 bg-[#3c3c3c] flex-shrink-0 text-xs overflow-x-auto">
    <div className="flex items-center gap-1.5 px-3 h-full min-w-max">
      <span className="font-bold text-zinc-200 tracking-wide mr-1">✝ Worship</span>
      <div className="w-px h-5 bg-zinc-600" />
      <span className="text-zinc-400 truncate max-w-[120px]">{serviceName ?? "예배 없음"}</span>
      {isDirty && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-600 text-amber-100 font-semibold shrink-0">미저장</span>
      )}
      {ctrlNotice && (
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 cursor-pointer ${ctrlNotice.error ? "bg-red-800 text-red-100" : "bg-green-800 text-green-100"}`}
          onClick={onDismissNotice}
          title="클릭하여 닫기"
        >
          {ctrlNotice.error ? "⚠ " : ""}{ctrlNotice.msg}{ctrlNotice.error ? " ✕" : ""}
        </span>
      )}
      {slideCount > 0 && (
        <span className="text-[10px] text-zinc-500 shrink-0">{flatIdx + 1}/{slideCount}</span>
      )}
      {nextSlidePreview && (
        <span className="text-[10px] text-zinc-500 shrink-0 max-w-[180px] truncate hidden md:inline" title={nextSlideFull ?? undefined}>
          다음: <span className="text-zinc-300">{nextSlidePreview}</span>
        </span>
      )}
      <div className="flex-1" />

      <button onClick={onToggleLive} title="라이브 (F5) — 켜면 슬라이드 선택이 즉시 출력 화면에 반영됩니다. 끄면 화면이 고정됩니다."
        className={`flex items-center gap-1 px-2 py-0.5 rounded font-semibold ${isLive ? "bg-green-700 hover:bg-green-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-green-300" : "bg-zinc-500"}`} />
        {isLive ? "라이브" : "대기"}
      </button>

      <button onClick={onToggleBlackout} title="블랙아웃 (B) — 출력 화면 전체를 검은 화면으로 전환"
        className={`px-2 py-0.5 rounded font-semibold ${isBlackout ? "bg-red-700 hover:bg-red-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isBlackout ? "● 블랙" : "블랙"}
      </button>

      <button onClick={onToggleClear} title="자막 숨김 (C) — 자막만 숨기고 배경은 그대로 유지"
        className={`px-2 py-0.5 rounded font-semibold ${isClear ? "bg-orange-700 hover:bg-orange-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isClear ? "● 자막 숨김" : "자막 숨김"}
      </button>

      <button onClick={onToggleFrozen} title="출력 고정 (F) — 슬라이드를 이동해도 현재 화면 유지 (설교 중 활용)"
        className={`px-2 py-0.5 rounded font-semibold ${isFrozen ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isFrozen ? "● 고정" : "고정"}
      </button>

      <div className={`flex items-center rounded overflow-hidden border ${autoAdvance ? "border-teal-600" : "border-zinc-600"}`}>
        <button onClick={onToggleAutoAdvance} title="자동 넘기기 (T)"
          className={`px-2 py-0.5 font-semibold relative overflow-hidden text-xs ${autoAdvance ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
          {autoAdvance ? `⏱ ${Math.max(1, Math.ceil((autoAdvanceMs * (1 - autoProgress / 100)) / 1000))}s` : "자동"}
          {autoAdvance && <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${autoProgress}%`, backgroundColor: "#2dd4bf" }} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onChangeAutoAdvanceMs(Math.max(1000, autoAdvanceMs - 1000)); }}
          className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs" title="1초 감소">−</button>
        <span className="px-1 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] min-w-[24px] text-center border-l border-zinc-600">{autoAdvanceMs / 1000}s</span>
        <button onClick={(e) => { e.stopPropagation(); onChangeAutoAdvanceMs(Math.min(30000, autoAdvanceMs + 1000)); }}
          className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs" title="1초 증가">+</button>
      </div>

      {isVideoBackground && (
        <>
          <div className="w-px h-5 bg-zinc-600" />
          <div className="flex items-center gap-1 px-1 bg-zinc-700 rounded">
            <button
              onClick={onToggleVideoPlay}
              className="text-xs px-1.5 py-0.5 text-zinc-200 hover:text-white"
              title={videoPlaying ? "영상 일시정지" : "영상 재생"}
            >
              {videoPlaying ? "⏸" : "▶"}
            </button>
            <span className="text-[10px] text-zinc-400 max-w-[80px] truncate" title={videoSrc}>
              {videoSrc.replace(/\\/g, "/").split("/").pop() ?? "영상"}
            </span>
          </div>
        </>
      )}

      <div className="w-px h-5 bg-zinc-600" />

      <input type="text" placeholder="자막 경보..." value={alertInput}
        onChange={(e) => onSetAlertInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && alertInput.trim()) onSendAlert(); }}
        className="bg-zinc-700 border border-zinc-600 rounded px-2 py-0.5 text-white w-24 outline-none focus:border-orange-500" />
      <button onClick={() => { if (alertInput.trim()) onSendAlert(); }} disabled={!alertInput.trim()}
        className={`px-2 py-0.5 rounded ${alertActive ? "bg-orange-600 hover:bg-orange-700" : "bg-zinc-700 hover:bg-zinc-600"} text-white disabled:opacity-40`}>
        전송
      </button>
      {alertActive && (
        <button onClick={onClearAlert} className="px-1.5 py-0.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400">✕</button>
      )}

      <div className="w-px h-5 bg-zinc-600" />

      <button
        onClick={onOpenOutput}
        className={`px-2 py-0.5 rounded text-white font-medium ${isLive && !outputConnected ? "bg-orange-600 hover:bg-orange-500 animate-pulse" : "bg-blue-700 hover:bg-blue-600"}`}
        title={isLive && !outputConnected ? "라이브 중이지만 출력창이 연결되지 않았습니다!" : "출력창 열기"}
      >
        📺 {isLive && !outputConnected ? "⚠ 연결 안됨!" : "출력창"}{" "}
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: outputConnected ? "#4ade80" : "#6b7280", marginLeft: 2, verticalAlign: "middle" }}
          title={outputConnected ? "연결됨" : "연결 안됨"} />
      </button>

      <button onClick={onToggleStage} title="Stage Display 발표자 모니터"
        className={`px-2 py-0.5 rounded font-medium ${isStageOpen ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        🎤 Stage
      </button>

      <div className="w-px h-5 bg-zinc-600" />

      <div className={`flex items-center rounded overflow-hidden border ${countdownActive ? "border-violet-600" : "border-zinc-600"}`}>
        <button onClick={onToggleCountdown} title="카운트다운 시작/정지"
          className={`px-2 py-0.5 font-semibold text-xs ${countdownActive ? "bg-violet-700 hover:bg-violet-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
          {countdownLabel}
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (!countdownActive) onSetCountdownMin(Math.max(1, countdownMin - 1)); }}
          disabled={countdownActive}
          className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">−</button>
        <span className="px-1 py-0.5 bg-zinc-800 text-zinc-400 text-[10px] min-w-[24px] text-center border-l border-zinc-600">{countdownMin}m</span>
        <button onClick={(e) => { e.stopPropagation(); if (!countdownActive) onSetCountdownMin(Math.min(60, countdownMin + 1)); }}
          disabled={countdownActive}
          className="px-1 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">+</button>
        {(countdownActive || (countdownRemainingMs > 0 && countdownRemainingMs < countdownMin * 60 * 1000)) && (
          <button onClick={(e) => { e.stopPropagation(); onResetCountdown(); }}
            className="px-1.5 py-0.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-white border-l border-zinc-600 text-xs"
            title="리셋">↺</button>
        )}
      </div>

      {clock && <span className="text-[11px] text-zinc-400 tabular-nums shrink-0 font-mono">{clock}</span>}

      <button onClick={onShowCheatSheet} className="px-1.5 py-0.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700" title="단축키 도움말 (?)">?</button>

      <button onClick={onTogglePanel} title="패널 열기/닫기"
        className={`px-2 py-0.5 rounded ${showPanel ? "bg-zinc-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}>
        ☰
      </button>
    </div>
    </div>
  );
}
