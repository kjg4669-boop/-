"use client";

import { useState, useEffect, useRef } from "react";
import { Tv, Monitor, Mic, ChevronDown } from "lucide-react";
import type { DisplayInfo } from "@/lib/types";
import type { OutputScaleMode } from "@/stores/settingsStore";

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

  displays: DisplayInfo[];
  selectedDisplayIdx: number;
  onSelectDisplay: (idx: number) => void;
  onOpenPreviewOnly: () => void;
  outputScaleMode: OutputScaleMode;
  onSetScaleMode: (mode: OutputScaleMode) => void;
  outputConnected: boolean;
  onOpenOutput: () => void;
  isStageOpen: boolean;
  onToggleStage: () => void;
  stageMsgText: string;
  onSetStageMsgText: (v: string) => void;
  stageMsgActive: boolean;
  onSendStageMsg: () => void;
  onClearStageMsg: () => void;

  countdownMin: number;
  onSetCountdownMin: (n: number) => void;
  countdownActive: boolean;
  countdownRemainingMs: number;
  onToggleCountdown: () => void;
  onResetCountdown: () => void;

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
  displays, selectedDisplayIdx, onSelectDisplay, onOpenPreviewOnly,
  outputScaleMode, onSetScaleMode,
  outputConnected, onOpenOutput,
  isStageOpen, onToggleStage,
  stageMsgText, onSetStageMsgText, stageMsgActive, onSendStageMsg, onClearStageMsg,
  countdownMin, onSetCountdownMin, countdownActive, countdownRemainingMs, onToggleCountdown, onResetCountdown,
  showPanel, onTogglePanel, onShowCheatSheet,
}: Props) {
  const [showOutputMenu, setShowOutputMenu] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });
  const outputBtnRef = useRef<HTMLButtonElement>(null);
  const outputMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!showOutputMenu) return;
    const handler = (e: MouseEvent) => {
      if (
        outputMenuRef.current && !outputMenuRef.current.contains(e.target as Node) &&
        outputBtnRef.current && !outputBtnRef.current.contains(e.target as Node)
      ) {
        setShowOutputMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOutputMenu]);

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
        <span className="text-xs px-1.5 py-1 rounded bg-amber-600 text-amber-100 font-semibold shrink-0">미저장</span>
      )}
      {ctrlNotice && (
        <span
          className={`text-xs px-1.5 py-1 rounded font-semibold shrink-0 cursor-pointer ${ctrlNotice.error ? "bg-red-800 text-red-100" : "bg-green-800 text-green-100"}`}
          onClick={onDismissNotice}
          title="클릭하여 닫기"
        >
          {ctrlNotice.error ? "⚠ " : ""}{ctrlNotice.msg}{ctrlNotice.error ? " ✕" : ""}
        </span>
      )}
      {slideCount > 0 && (
        <span className="text-xs text-zinc-500 shrink-0">{flatIdx + 1}/{slideCount}</span>
      )}
      {nextSlidePreview && (
        <span className="text-xs text-zinc-500 shrink-0 max-w-[180px] truncate hidden md:inline" title={nextSlideFull ?? undefined}>
          다음: <span className="text-zinc-300">{nextSlidePreview}</span>
        </span>
      )}
      <div className="flex-1" />

      <button onClick={onToggleLive} title="송출 (F5) — 켜면 슬라이드 선택이 즉시 출력 화면에 반영됩니다. 끄면 화면이 고정됩니다."
        className={`flex items-center gap-1 px-2 py-1 rounded font-semibold ${isLive ? "bg-red-700 hover:bg-red-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${isLive ? "bg-red-300 animate-pulse" : "bg-zinc-500"}`} />
        {isLive ? "송출 중" : "송출 대기"}
      </button>

      <button onClick={onToggleBlackout} title="블랙아웃 (B) — 출력 화면 전체를 검은 화면으로 전환"
        className={`px-2 py-1 rounded font-semibold ${isBlackout ? "bg-red-700 hover:bg-red-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isBlackout ? "● 블랙" : "블랙"}
      </button>

      <button onClick={onToggleClear} title="자막 숨김 (C) — 자막만 숨기고 배경은 그대로 유지"
        className={`px-2 py-1 rounded font-semibold ${isClear ? "bg-orange-700 hover:bg-orange-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isClear ? "● 자막 숨김" : "자막 숨김"}
      </button>

      <button onClick={onToggleFrozen} title="출력 고정 (F) — 슬라이드를 이동해도 현재 화면 유지 (설교 중 활용)"
        className={`px-2 py-1 rounded font-semibold ${isFrozen ? "bg-purple-700 hover:bg-purple-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        {isFrozen ? "● 고정" : "고정"}
      </button>

      <div className={`flex items-center rounded overflow-hidden border ${autoAdvance ? "border-teal-600" : "border-zinc-600"}`}>
        <button onClick={onToggleAutoAdvance} title="자동 넘기기 (T)"
          className={`px-2 py-1 font-semibold relative overflow-hidden text-xs ${autoAdvance ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
          {autoAdvance ? `⏱ ${Math.max(1, Math.ceil((autoAdvanceMs * (1 - autoProgress / 100)) / 1000))}s` : "자동"}
          {autoAdvance && <div style={{ position: "absolute", bottom: 0, left: 0, height: 2, width: `${autoProgress}%`, backgroundColor: "#2dd4bf" }} />}
        </button>
        <button onClick={(e) => { e.stopPropagation(); onChangeAutoAdvanceMs(Math.max(1000, autoAdvanceMs - 1000)); }}
          className="px-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs" title="1초 감소">−</button>
        <span className="px-1 py-1 bg-zinc-800 text-zinc-400 text-xs min-w-[24px] text-center border-l border-zinc-600">{autoAdvanceMs / 1000}s</span>
        <button onClick={(e) => { e.stopPropagation(); onChangeAutoAdvanceMs(Math.min(30000, autoAdvanceMs + 1000)); }}
          className="px-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs" title="1초 증가">+</button>
      </div>


      <div className="w-px h-5 bg-zinc-600" />

      <input type="text" placeholder="자막 경보..." value={alertInput}
        onChange={(e) => onSetAlertInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && alertInput.trim()) onSendAlert(); }}
        className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white w-24 outline-none focus:border-orange-500" />
      <button onClick={() => { if (alertInput.trim()) onSendAlert(); }} disabled={!alertInput.trim()}
        className={`px-2 py-1 rounded ${alertActive ? "bg-orange-600 hover:bg-orange-700" : "bg-zinc-700 hover:bg-zinc-600"} text-white disabled:opacity-40`}>
        전송
      </button>
      {alertActive && (
        <button onClick={onClearAlert} className="px-1.5 py-1 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-400">✕</button>
      )}

      <div className="w-px h-5 bg-zinc-600" />

      <div className="relative">
        <button
          ref={outputBtnRef}
          onClick={() => {
            const rect = outputBtnRef.current?.getBoundingClientRect();
            if (rect) setMenuPos({ top: rect.bottom + 4, left: rect.left });
            setShowOutputMenu((v) => !v);
          }}
          className={`px-2 py-1 rounded text-white font-medium flex items-center gap-1 ${isLive && !outputConnected ? "bg-orange-600 hover:bg-orange-500 animate-pulse" : "bg-blue-700 hover:bg-blue-600"}`}
          title={isLive && !outputConnected ? "송출 중이지만 출력창이 연결되지 않았습니다!" : "출력창 설정"}
        >
          <Tv size={14} /><span>출력창 설정</span><ChevronDown size={12} />
          <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: outputConnected ? "#4ade80" : "#6b7280", marginLeft: 2, verticalAlign: "middle" }} />
        </button>
        {showOutputMenu && (
          <div ref={outputMenuRef} style={{ position: "fixed", top: menuPos.top, left: menuPos.left, zIndex: 9999 }} className="bg-zinc-800 border border-zinc-600 rounded shadow-xl min-w-[200px]">
            {displays.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-400">모니터 정보 로딩 중...</div>
            )}
            {displays.map((d, i) => (
              <button key={i}
                onClick={() => { onSelectDisplay(i); setShowOutputMenu(false); }}
                className={`w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 flex items-center gap-2 ${selectedDisplayIdx === i ? "text-blue-400 font-semibold" : "text-zinc-200"}`}
              >
                {selectedDisplayIdx === i ? "✓ " : "  "}
                {d.is_primary ? "기본 모니터" : `모니터 ${i + 1}`}
                <span className="text-zinc-500 ml-auto">{d.width}×{d.height}</span>
              </button>
            ))}
            <div className="border-t border-zinc-600 px-3 py-2">
              <div className="text-zinc-500 text-xs mb-1.5">출력 스케일</div>
              <div className="flex gap-1">
                {(["fit", "fill", "native"] as const).map((m) => (
                  <button key={m}
                    onClick={() => { onSetScaleMode(m); setShowOutputMenu(false); }}
                    className={`flex-1 py-1 rounded text-xs font-medium ${outputScaleMode === m ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
                  >
                    {m === "fit" ? "맞춤" : m === "fill" ? "채우기" : "1:1"}
                  </button>
                ))}
              </div>
              <div className="text-zinc-600 text-[10px] mt-1">
                {outputScaleMode === "fit" ? "레터박스 · 전체 표시" : outputScaleMode === "fill" ? "화면 가득 · 일부 잘림" : "실제 픽셀 · 1920×1080"}
              </div>
            </div>
            <div className="border-t border-zinc-600" />
            <button
              onClick={() => { onOpenPreviewOnly(); setShowOutputMenu(false); }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-zinc-700 text-zinc-200 flex items-center gap-2"
            >
              <Monitor size={13} />미리보기 창(기본값)
            </button>
          </div>
        )}
      </div>

      <button onClick={onToggleStage} title="발표자 모니터"
        className={`px-2 py-1 rounded font-medium flex items-center gap-1 ${isStageOpen ? "bg-indigo-700 hover:bg-indigo-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
        <Mic size={14} /><span>발표자 모니터</span>
      </button>

      {/* Stage message quick send */}
      <div className="flex gap-1 items-center">
        <input
          type="text"
          value={stageMsgText}
          onChange={(e) => onSetStageMsgText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") onSendStageMsg(); }}
          placeholder="발표자에게 메시지..."
          className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-yellow-500 min-w-0 w-28"
        />
        <button
          onClick={stageMsgActive ? onClearStageMsg : onSendStageMsg}
          disabled={!stageMsgActive && !stageMsgText.trim()}
          className={`px-2 py-1 text-xs rounded shrink-0 disabled:opacity-40 ${stageMsgActive ? "bg-yellow-600 hover:bg-yellow-500 text-black" : "bg-zinc-700 hover:bg-zinc-600 text-white"}`}
        >
          {stageMsgActive ? "지우기" : "전송"}
        </button>
      </div>

      <div className="w-px h-5 bg-zinc-600" />

      <div className={`flex items-center rounded overflow-hidden border ${countdownActive ? "border-violet-600" : "border-zinc-600"}`}>
        <button onClick={onToggleCountdown} title="카운트다운 시작/정지"
          className={`px-2 py-1 font-semibold text-xs ${countdownActive ? "bg-violet-700 hover:bg-violet-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}>
          {countdownLabel}
        </button>
        <button onClick={(e) => { e.stopPropagation(); if (!countdownActive) onSetCountdownMin(Math.max(1, countdownMin - 1)); }}
          disabled={countdownActive}
          className="px-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">−</button>
        <span className="px-1 py-1 bg-zinc-800 text-zinc-400 text-xs min-w-[24px] text-center border-l border-zinc-600">{countdownMin}m</span>
        <button onClick={(e) => { e.stopPropagation(); if (!countdownActive) onSetCountdownMin(Math.min(60, countdownMin + 1)); }}
          disabled={countdownActive}
          className="px-1 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-white border-l border-zinc-600 text-xs disabled:opacity-40">+</button>
        {(countdownActive || (countdownRemainingMs > 0 && countdownRemainingMs < countdownMin * 60 * 1000)) && (
          <button onClick={(e) => { e.stopPropagation(); onResetCountdown(); }}
            className="px-1.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-500 hover:text-white border-l border-zinc-600 text-xs"
            title="리셋">↺</button>
        )}
      </div>

      <button onClick={onShowCheatSheet} className="px-1.5 py-1 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-700" title="단축키 도움말 (?)">?</button>

      <button onClick={onTogglePanel} title="패널 열기/닫기"
        className={`px-2 py-1 rounded ${showPanel ? "bg-zinc-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}>
        ☰
      </button>
    </div>
    </div>
  );
}
