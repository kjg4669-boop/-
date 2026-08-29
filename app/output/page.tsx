"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useOutputStore } from "@/stores/outputStore";
import { ipc, isTauri } from "@/lib/ipc";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import OverlayLayer from "@/components/layers/OverlayLayer";
import CanvasLayer from "@/components/layers/CanvasLayer";
import CountdownLayer from "@/components/layers/CountdownLayer";
import type { LayerConfig, LookApplyPayload, AnnouncementShowPayload } from "@/lib/types";
import ErrorBoundary from "@/components/ErrorBoundary";
import AlertBanner from "@/components/AlertBanner";

async function closeWindow() {
  if (!isTauri()) return;
  // Use the Rust-side command to close output window safely
  // (getCurrentWindow().close() can terminate the app on macOS fullscreen)
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("close_output_window").catch(() => {});
}

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function OutputPage() {
  const { layerConfig, isBlackout, alertText, alertVisible, alertDuration, alertPosition, alertBgColor, alertTextColor, countdown, setLayerConfig, patchLayerConfig, setBlackout, setOutputReady, setAlert, setCountdown } = useOutputStore();
  const unlistenRefs = useRef<Array<() => void>>([]);
  // Stable refs so alert dismiss callback doesn't restart timer on color/position changes
  const alertPositionRef = useRef(alertPosition);
  const alertBgColorRef = useRef(alertBgColor);
  const alertTextColorRef = useRef(alertTextColor);
  alertPositionRef.current = alertPosition;
  alertBgColorRef.current = alertBgColor;
  alertTextColorRef.current = alertTextColor;
  const [showControls, setShowControls] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: CANVAS_W, h: CANVAS_H });
  const [scaleMode, setScaleMode] = useState<"fit" | "fill" | "native">("fit");
  const [lookVis, setLookVis] = useState({
    background: true, subtitle: true, overlay: true, canvas: true, countdown: true,
  });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track window size for letterbox/pillarbox centering
  useEffect(() => {
    const update = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const isFrozenRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementShowPayload>({ visible: false, title: "", body: "" });
  const [copyright, setCopyright] = useState("");

  useEffect(() => {
    let mounted = true;
    let retryTimer: ReturnType<typeof setInterval> | null = null;

    async function setup() {
      let receivedSlide = false;

      const unlistenFreeze = await ipc.onFreeze((active: boolean) => {
        if (mounted) isFrozenRef.current = active;
      });
      if (!mounted) { unlistenFreeze(); return; }
      unlistenRefs.current.push(unlistenFreeze);

      const unlistenSlide = await ipc.onSlideUpdateFull((config: LayerConfig, meta) => {
        if (!mounted) return;
        if (!isFrozenRef.current) setLayerConfig(config);
        setCopyright(meta?.copyright ?? "");
        receivedSlide = true;
        if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
      });
      const unlistenBlackout = await ipc.onBlackout((active: boolean) => {
        if (mounted) setBlackout(active);
      });
      const unlistenAlert = await ipc.onAlert((p) => {
        if (mounted) setAlert(p.text, p.visible, p.duration, p.position, p.backgroundColor, p.textColor);
      });

      const unlistenCountdown = await ipc.onCountdown((payload) => {
        if (mounted) setCountdown(payload);
      });

      if (!mounted) {
        unlistenSlide(); unlistenBlackout(); unlistenAlert(); unlistenCountdown();
        return;
      }
      const unlistenAudioPlay = await ipc.onAudioPlay(async (payload) => {
        if (!mounted || !audioRef.current) return;
        try {
          const { convertFileSrc } = await import("@tauri-apps/api/core");
          audioRef.current.src = convertFileSrc(payload.filePath);
          audioRef.current.volume = payload.volume;
          audioRef.current.loop = payload.repeat;
          await audioRef.current.play();
        } catch { /* user hasn't interacted yet or file missing */ }
      });
      const unlistenAudioStop = await ipc.onAudioStop(() => {
        if (!mounted || !audioRef.current) return;
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      });

      const unlistenLook = await ipc.onLookApply((payload: LookApplyPayload) => {
        if (!mounted) return;
        setLookVis({
          background: payload.showBackground,
          subtitle: payload.showSubtitle,
          overlay: payload.showOverlay,
          canvas: payload.showCanvas,
          countdown: payload.showCountdown,
        });
        if (payload.subtitleSnapshot || payload.backgroundSnapshot) {
          patchLayerConfig(payload.subtitleSnapshot, payload.backgroundSnapshot);
        }
      });

      const unlistenAnnouncement = await ipc.onAnnouncementShow((p) => {
        if (mounted) setAnnouncement({ visible: p.visible, title: p.title, body: p.body, bgColor: p.bgColor, textColor: p.textColor });
      });

      const unlistenScaleMode = await ipc.onScaleMode((mode) => {
        if (mounted) setScaleMode(mode);
      });

      unlistenRefs.current.push(unlistenSlide, unlistenBlackout, unlistenAlert, unlistenCountdown, unlistenAudioPlay, unlistenAudioStop, unlistenLook, unlistenAnnouncement, unlistenScaleMode);

      await ipc.sendOutputReady();
      if (mounted) setOutputReady(true);

      // Heartbeat every 4s so controller can detect this window is alive
      if (mounted) {
        const heartbeatInterval = setInterval(() => {
          if (mounted) void ipc.sendHeartbeat();
        }, 4000);
        unlistenRefs.current.push(() => clearInterval(heartbeatInterval));
      }

      // Retry every 500ms until controller responds with slide:update (max 20회 = 10초)
      if (mounted) {
        let retryCount = 0;
        retryTimer = setInterval(async () => {
          if (!mounted || receivedSlide || retryCount >= 20) {
            if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
            return;
          }
          retryCount++;
          await ipc.sendOutputReady();
        }, 500);
        unlistenRefs.current.push(() => { if (retryTimer) { clearInterval(retryTimer); retryTimer = null; } });
      }
    }

    void setup();

    return () => {
      mounted = false;
      if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, [setLayerConfig, patchLayerConfig, setBlackout, setOutputReady, setAlert, setCountdown]);


  // Esc key closes the output window; arrow keys send subtitle:next/prev to controller
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { void closeWindow(); return; }
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        void ipc.sendSubtitleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        void ipc.sendSubtitlePrev();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Cleanup hide timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    };
  }, []);

  // Auto-dismiss alert after alertDuration ms
  const alertDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (alertDismissTimerRef.current !== null) {
      clearTimeout(alertDismissTimerRef.current);
      alertDismissTimerRef.current = null;
    }
    if (alertVisible && alertDuration > 0) {
      alertDismissTimerRef.current = setTimeout(() => {
        alertDismissTimerRef.current = null;
        setAlert("", false, 0, alertPositionRef.current, alertBgColorRef.current, alertTextColorRef.current);
      }, alertDuration);
    }
    return () => {
      if (alertDismissTimerRef.current !== null) {
        clearTimeout(alertDismissTimerRef.current);
        alertDismissTimerRef.current = null;
      }
    };
  }, [alertVisible, alertDuration, setAlert]); // alertPosition/bgColor/textColor intentionally omitted — use refs to avoid restarting timer on color changes

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setShowControls(false);
    }, 2000);
  }, []);

  const scale =
    scaleMode === "fill" ? Math.max(windowSize.w / CANVAS_W, windowSize.h / CANVAS_H)
    : scaleMode === "native" ? 1
    : Math.min(windowSize.w / CANVAS_W, windowSize.h / CANVAS_H);
  const scaledW = scaleMode === "fill" ? windowSize.w : CANVAS_W * scale;
  const scaledH = scaleMode === "fill" ? windowSize.h : CANVAS_H * scale;
  // For fill mode, offset the canvas to center it within the container
  const canvasLeft = scaleMode === "fill" ? -(CANVAS_W * scale - windowSize.w) / 2 : 0;
  const canvasTop = scaleMode === "fill" ? -(CANVAS_H * scale - windowSize.h) / 2 : 0;

  return (
    <ErrorBoundary fallback="blackout">
    <div
      className="w-screen h-screen bg-black overflow-hidden"
      style={{ cursor: showControls ? "default" : "none", display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseMove={handleMouseMove}
    >
      {/* Scaled 1920×1080 canvas — centered with letterbox/pillarbox */}
      <div style={{ width: scaledW, height: scaledH, position: "relative", flexShrink: 0, overflow: "hidden" }}>
        <div
          style={{
            position: "absolute", top: canvasTop, left: canvasLeft,
            width: CANVAS_W, height: CANVAS_H,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          {/* Layer 1: Background */}
          {lookVis.background && <BackgroundLayer config={layerConfig.background} />}

          {/* Layer 2: Subtitle */}
          {lookVis.subtitle && <SubtitleLayer config={layerConfig.subtitle} transitionMs={layerConfig.transitionMs} copyright={copyright} />}

          {/* Announcement Overlay */}
          {announcement.visible && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 35,
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              pointerEvents: "none",
            }}>
              <div style={{
                backgroundColor: announcement.bgColor ?? "rgba(0,0,0,0.75)",
                borderRadius: 12, padding: "40px 80px",
                textAlign: "center", maxWidth: "80%",
              }}>
                <p style={{ fontSize: 52, fontWeight: "bold", color: announcement.textColor ?? "#ffffff", margin: 0, lineHeight: 1.3 }}>
                  {announcement.title}
                </p>
                {announcement.body && (
                  <p style={{ fontSize: 32, color: announcement.textColor ? `${announcement.textColor}cc` : "#cccccc", margin: "16px 0 0", lineHeight: 1.4 }}>
                    {announcement.body}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Layer 3: Overlay */}
          {lookVis.overlay && <OverlayLayer config={layerConfig.overlay} />}

          {/* Layer 4: Canvas (free-position text blocks + shapes) */}
          {lookVis.canvas && (
            <CanvasLayer
              blocks={layerConfig.canvas?.textBlocks ?? []}
              shapeBlocks={layerConfig.canvas?.shapeBlocks ?? []}
              nonce={layerConfig.canvas?.nonce}
              transitionMs={layerConfig.subtitle?.textEntrance === "none" ? 0 : (layerConfig.transitionMs ?? 600)}
              textEntrance={layerConfig.subtitle?.textEntrance}
              textEntranceIntensity={layerConfig.subtitle?.textEntranceIntensity}
            />
          )}

          {/* Layer 5: Countdown overlay */}
          {lookVis.countdown && <CountdownLayer countdown={countdown} />}

          {/* Alert banner */}
          {alertVisible && alertText && (
            <AlertBanner text={alertText} position={alertPosition} bgColor={alertBgColor} textColor={alertTextColor} />
          )}
        </div>
      </div>

      {/* Audio element for backing tracks */}
      <audio ref={audioRef} />

      {/* Blackout — covers entire screen including black bars */}
      <div
        className="absolute inset-0 bg-black transition-opacity"
        style={{ opacity: isBlackout ? 1 : 0, zIndex: 100, transitionDuration: "150ms", pointerEvents: "none" }}
      />

      {/* Close button — shown on mouse move */}
      {showControls && (
        <button
          onClick={closeWindow}
          style={{
            position: "absolute", top: 16, right: 16, zIndex: 200,
            background: "rgba(0,0,0,0.6)", border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 6, color: "#fff", fontSize: 13, padding: "4px 12px", cursor: "pointer",
          }}
        >
          ✕ 닫기 (Esc)
        </button>
      )}
    </div>
    </ErrorBoundary>
  );
}
