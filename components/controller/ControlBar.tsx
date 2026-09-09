"use client";

import { useState, useEffect, useRef } from "react";
import { Tv, Monitor, Mic, ChevronDown, Camera, Settings } from "lucide-react";
import type { DisplayInfo } from "@/lib/types";
import type { OutputScaleMode, VideoFit } from "@/stores/settingsStore";
import { ipc } from "@/lib/ipc";

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
  onSendAlert: (yPercent: number, fontSize: number, duration: number) => void;
  onClearAlert: () => void;

  displays: DisplayInfo[];
  selectedDisplayIdx: number;
  onSelectDisplay: (idx: number) => void;
  onOpenPreviewOnly: () => void;
  cameraDevices: MediaDeviceInfo[];
  cameraError: string | null;
  onSelectCamera: (deviceId: string) => void;
  onToggleCameraOutput: (deviceId: string | null) => void;
  onRefreshOutputMenu: () => void;
  onRequestCameraPermission: () => void;
  outputScaleMode: OutputScaleMode;
  onSetScaleMode: (mode: OutputScaleMode) => void;
  isCameraBackground: boolean;
  videoFit: VideoFit;
  onSetVideoFit: (fit: VideoFit) => void;
  cameraMirror: boolean;
  onSetCameraMirror: (v: boolean) => void;
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
  cameraDevices, cameraError, onSelectCamera, onToggleCameraOutput, onRefreshOutputMenu, onRequestCameraPermission,
  outputScaleMode, onSetScaleMode,
  isCameraBackground, videoFit, onSetVideoFit, cameraMirror, onSetCameraMirror,
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

  const [alertYPercent, setAlertYPercent] = useState(90);
  const [alertFontSize, setAlertFontSize] = useState(48);
  const [alertDuration, setAlertDuration] = useState(5000);
  const [showAlertSettings, setShowAlertSettings] = useState(false);
  const [alertSettingsPos, setAlertSettingsPos] = useState({ top: 0, left: 0 });
  const alertSettingsBtnRef = useRef<HTMLButtonElement>(null);
  const alertSettingsRef = useRef<HTMLDivElement>(null);

  const [previewCameraId, setPreviewCameraId] = useState<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);

  // Local getUserMedia preview — only when dropdown is open + camera selected + NOT broadcasting
  useEffect(() => {
    if (!showOutputMenu || !previewCameraId || isCameraBackground) {
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
      return;
    }
    let stream: MediaStream | null = null;
    let cancelled = false;
    navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: previewCameraId } } })
      .catch(() => navigator.mediaDevices.getUserMedia({ video: true }))
      .then((s) => {
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream = s;
        const vid = previewVideoRef.current;
        if (vid) { vid.srcObject = s; void vid.play(); }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      stream?.getTracks().forEach((t) => t.stop());
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
    };
  }, [showOutputMenu, previewCameraId, isCameraBackground]);

  // IPC frame preview — only when dropdown is open + broadcasting
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  useEffect(() => {
    if (!showOutputMenu || !isCameraBackground) { setPreviewFrame(null); return; }
    let unlisten: (() => void) | null = null;
    ipc.onCameraFrame((dataUrl) => setPreviewFrame(dataUrl))
      .then((fn) => { unlisten = fn; })
      .catch(() => {});
    return () => { unlisten?.(); setPreviewFrame(null); };
  }, [showOutputMenu, isCameraBackground]);
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

  useEffect(() => {
    if (!showAlertSettings) return;
    const handler = (e: MouseEvent) => {
      if (
        alertSettingsRef.current && !alertSettingsRef.current.contains(e.target as Node) &&
        alertSettingsBtnRef.current && !alertSettingsBtnRef.current.contains(e.target as Node)
      ) {
        setShowAlertSettings(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAlertSettings]);

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

      <button
        onClick={() => {
          const targetId = isCameraBackground ? null : (previewCameraId || cameraDevices[0]?.deviceId || null);
          onToggleCameraOutput(targetId);
        }}
        title={isCameraBackground ? "카메라 송출 중 — 클릭하여 해제" : "카메라 송출 — 설정된 카메라를 출력에 표시"}
        className={`flex items-center gap-1 px-2 py-1 rounded font-semibold ${isCameraBackground ? "bg-teal-700 hover:bg-teal-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-300"}`}
      >
        <Camera size={13} />
        {isCameraBackground ? "카메라 송출 중" : "카메라 송출"}
      </button>

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
        onKeyDown={(e) => { if (e.key === "Enter" && alertInput.trim()) onSendAlert(alertYPercent, alertFontSize, alertDuration); }}
        className="bg-zinc-700 border border-zinc-600 rounded px-2 py-1 text-white w-24 outline-none focus:border-orange-500" />
      <button onClick={() => { if (alertInput.trim()) onSendAlert(alertYPercent, alertFontSize, alertDuration); }} disabled={!alertInput.trim()}
        className={`px-2 py-1 rounded ${alertActive ? "bg-orange-600 hover:bg-orange-700" : "bg-zinc-700 hover:bg-zinc-600"} text-white disabled:opacity-40`}>
        전송
      </button>
      <div className="relative">
        <button
          ref={alertSettingsBtnRef}
          onClick={() => {
            const rect = alertSettingsBtnRef.current?.getBoundingClientRect();
            if (rect) setAlertSettingsPos({ top: rect.bottom + 4, left: rect.left });
            setShowAlertSettings((v) => !v);
          }}
          title="자막 경보 설정"
          className={`px-1.5 py-1 rounded ${showAlertSettings ? "bg-zinc-600 text-white" : "bg-zinc-700 hover:bg-zinc-600 text-zinc-400"}`}
        >
          <Settings size={13} />
        </button>
        {showAlertSettings && (
          <div
            ref={alertSettingsRef}
            style={{ position: "fixed", top: alertSettingsPos.top, left: alertSettingsPos.left, zIndex: 9999 }}
            className="bg-zinc-800 border border-zinc-600 rounded shadow-xl p-3 space-y-2 min-w-[180px]"
          >
            <p className="text-zinc-400 text-xs uppercase tracking-wider">위치</p>
            <div className="flex gap-1">
              {([["상단", 5], ["중앙", 50], ["하단", 90]] as const).map(([label, y]) => (
                <button key={label}
                  onClick={() => setAlertYPercent(y)}
                  className={`flex-1 py-1 rounded text-xs ${Math.abs(alertYPercent - y) < 20 ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-xs shrink-0 w-8">글자</span>
              <div className="flex-1 flex flex-col gap-0.5">
                <input type="range" min={24} max={96} step={4} value={alertFontSize}
                  onChange={(e) => setAlertFontSize(Number(e.target.value))}
                  className="w-full accent-orange-500" />
                <div className="relative w-full h-1.5">
                  <span className="absolute left-1/2 -translate-x-1/2 w-px h-1.5 bg-zinc-500" />
                </div>
              </div>
              <span className="text-zinc-300 text-xs w-6 text-right">{alertFontSize}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-400 text-xs shrink-0 w-8">시간</span>
              <select value={alertDuration} onChange={(e) => setAlertDuration(Number(e.target.value))}
                className="flex-1 bg-zinc-700 text-white rounded px-1 py-0.5 border border-zinc-600 text-xs">
                <option value={0}>고정</option>
                <option value={3000}>3초</option>
                <option value={5000}>5초</option>
                <option value={10000}>10초</option>
                <option value={30000}>30초</option>
              </select>
            </div>
          </div>
        )}
      </div>
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
            if (!showOutputMenu) onRefreshOutputMenu();
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
            <div className="px-3 pt-2 pb-1 text-zinc-500 text-xs">모니터</div>
            {displays.length === 0 && (
              <div className="px-3 py-2 text-xs text-zinc-600">모니터 정보 없음</div>
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
              <div className="flex items-center justify-between mb-1.5">
                <div className="text-zinc-500 text-xs">카메라 입출력</div>
                <button onClick={onRefreshOutputMenu} className="text-zinc-600 hover:text-zinc-300 text-xs px-1">↺</button>
              </div>
              {cameraError && (
                <div className="mb-1.5">
                  <div className="text-red-400 text-xs mb-1">{cameraError}</div>
                  <button onClick={onRequestCameraPermission} className="w-full py-1 rounded text-xs bg-amber-700 hover:bg-amber-600 text-white font-medium">
                    카메라 권한 허용
                  </button>
                </div>
              )}
              {cameraDevices.length === 0 && !cameraError ? (
                <div className="flex flex-col gap-1 py-0.5">
                  <div className="text-zinc-600 text-xs">카메라 없음 — 권한 허용 후 검색</div>
                  <button onClick={onRequestCameraPermission} className="w-full py-1 rounded text-xs bg-amber-700 hover:bg-amber-600 text-white font-medium">
                    카메라 권한 허용
                  </button>
                </div>
              ) : cameraDevices.length > 0 ? (
                <div className="flex flex-col gap-0.5 mb-2">
                  {/* 없음 */}
                  <button
                    onClick={() => { setPreviewCameraId(null); if (isCameraBackground) onToggleCameraOutput(null); }}
                    className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-700 flex items-center gap-1.5 ${
                      !previewCameraId && !isCameraBackground ? "bg-zinc-600 text-white font-medium" : "text-zinc-400"
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${!previewCameraId && !isCameraBackground ? "bg-white" : "bg-zinc-600"}`} />
                    없음
                  </button>
                  {cameraDevices.slice(0, 3).map((d, i) => (
                    <button key={d.deviceId}
                      onClick={() => setPreviewCameraId(d.deviceId)}
                      className={`w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-700 truncate flex items-center gap-1.5 ${
                        previewCameraId === d.deviceId ? "bg-zinc-600 text-white font-medium" :
                        isCameraBackground && videoSrc === d.deviceId ? "bg-zinc-700 text-blue-400 font-medium" : "text-zinc-300"
                      }`}
                      title={d.label}
                    >
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        previewCameraId === d.deviceId ? "bg-white" :
                        isCameraBackground && videoSrc === d.deviceId ? "bg-blue-400" : "bg-zinc-600"
                      }`} />
                      {d.label || `카메라 ${i + 1}`}
                    </button>
                  ))}
                  {/* 미리보기: 카메라 선택 시 표시 */}
                  {previewCameraId && (
                    <div className="mt-1.5">
                      {isCameraBackground ? (
                        // 송출 중: IPC 프레임
                        previewFrame ? (
                          <img src={previewFrame} alt="" style={{ width: "100%", aspectRatio: "16/9", borderRadius: 6, objectFit: "cover", display: "block" }} />
                        ) : (
                          <div style={{ width: "100%", aspectRatio: "16/9", borderRadius: 6, backgroundColor: "#111", display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span className="text-zinc-500 text-xs">연결 중...</span>
                          </div>
                        )
                      ) : (
                        // 미송출: getUserMedia 로컬 미리보기
                        <>
                          <video
                            ref={previewVideoRef}
                            autoPlay
                            muted
                            playsInline
                            style={{ width: "100%", aspectRatio: "16/9", borderRadius: 6, backgroundColor: "#000", objectFit: "cover", display: "block" }}
                          />
                          <button
                            onClick={() => { onToggleCameraOutput(previewCameraId); }}
                            className="w-full mt-1 py-1 rounded text-xs font-medium bg-teal-700 hover:bg-teal-600 text-white"
                          >
                            카메라 송출 적용
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : null}
              {isCameraBackground && (
                <>
                  <div className="text-zinc-600 text-[10px] mb-1">화면 맞춤</div>
                  <div className="flex gap-1 mb-2">
                    {(["cover", "contain"] as const).map((f) => (
                      <button key={f}
                        onClick={() => onSetVideoFit(f)}
                        className={`flex-1 py-1 rounded text-xs font-medium ${videoFit === f ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
                      >
                        {f === "cover" ? "채우기" : "맞춤"}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => onSetCameraMirror(!cameraMirror)}
                    className={`w-full py-1 rounded text-xs font-medium ${cameraMirror ? "bg-blue-600 text-white" : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"}`}
                  >
                    좌우 반전 {cameraMirror ? "켜짐" : "꺼짐"}
                  </button>
                </>
              )}
            </div>
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

      {/* Stage message quick send — only active when stage monitor is open */}
      <div className="flex gap-1 items-center" title={!isStageOpen ? "발표자 모니터를 먼저 열어주세요" : undefined}>
        <input
          type="text"
          value={stageMsgText}
          onChange={(e) => onSetStageMsgText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && isStageOpen) onSendStageMsg(); }}
          placeholder="발표자에게 메시지..."
          disabled={!isStageOpen}
          className="flex-1 bg-zinc-800 text-white text-xs rounded px-2 py-1 border border-zinc-600 outline-none focus:border-yellow-500 min-w-0 w-28 disabled:opacity-40 disabled:cursor-not-allowed"
        />
        <button
          onClick={stageMsgActive ? onClearStageMsg : onSendStageMsg}
          disabled={!isStageOpen || (!stageMsgActive && !stageMsgText.trim())}
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
