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

async function closeWindow() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  void getCurrentWindow().close();
}

export default function OutputPage() {
  const { layerConfig, isBlackout, alertText, alertVisible, alertDuration, alertPosition, alertBgColor, alertTextColor, countdown, setLayerConfig, setBlackout, setOutputReady, setAlert, setCountdown } = useOutputStore();
  const unlistenRefs = useRef<Array<() => void>>([]);
  const [showControls, setShowControls] = useState(false);
  const [lookVis, setLookVis] = useState({
    background: true, subtitle: true, overlay: true, canvas: true, countdown: true,
  });
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFrozenRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [announcement, setAnnouncement] = useState<AnnouncementShowPayload>({ visible: false, title: "", body: "" });

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

      const unlistenSlide = await ipc.onSlideUpdate((config: LayerConfig) => {
        if (!mounted) return;
        if (!isFrozenRef.current) setLayerConfig(config);
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
      });

      const unlistenAnnouncement = await ipc.onAnnouncementShow((p) => {
        if (mounted) setAnnouncement({ visible: p.visible, title: p.title, body: p.body });
      });

      unlistenRefs.current.push(unlistenSlide, unlistenBlackout, unlistenAlert, unlistenCountdown, unlistenAudioPlay, unlistenAudioStop, unlistenLook, unlistenAnnouncement);

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
  }, [setLayerConfig, setBlackout, setOutputReady, setAlert, setCountdown]);

  // Esc key closes the window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") void closeWindow();
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
        setAlert("", false, 0, alertPosition, alertBgColor, alertTextColor);
      }, alertDuration);
    }
    return () => {
      if (alertDismissTimerRef.current !== null) {
        clearTimeout(alertDismissTimerRef.current);
        alertDismissTimerRef.current = null;
      }
    };
  }, [alertVisible, alertDuration, alertPosition, alertBgColor, alertTextColor, setAlert]);

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (hideTimerRef.current !== null) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = null;
      setShowControls(false);
    }, 2000);
  }, []);

  return (
    <ErrorBoundary fallback="blackout">
    <div
      className="relative w-screen h-screen overflow-hidden bg-black"
      style={{ cursor: showControls ? "default" : "none" }}
      onMouseMove={handleMouseMove}
    >
      {/* Layer 1: Background */}
      {lookVis.background && <BackgroundLayer config={layerConfig.background} />}

      {/* Layer 2: Subtitle */}
      {lookVis.subtitle && <SubtitleLayer config={layerConfig.subtitle} transitionMs={layerConfig.transitionMs} />}

      {/* Announcement Overlay */}
      {announcement.visible && (
        <div style={{
          position: "absolute", inset: 0, zIndex: 35,
          display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            backgroundColor: "rgba(0,0,0,0.75)",
            borderRadius: 12,
            padding: "40px 80px",
            textAlign: "center",
            maxWidth: "80%",
          }}>
            <p style={{ fontSize: 52, fontWeight: "bold", color: "#ffffff", margin: 0, lineHeight: 1.3 }}>
              {announcement.title}
            </p>
            {announcement.body && (
              <p style={{ fontSize: 32, color: "#cccccc", margin: "16px 0 0", lineHeight: 1.4 }}>
                {announcement.body}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Layer 3: Overlay */}
      {lookVis.overlay && <OverlayLayer config={layerConfig.overlay} />}

      {/* Layer 4: Canvas (free-position text blocks) */}
      {lookVis.canvas && <CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />}

      {/* Layer 5: Countdown overlay (z:50, below blackout) */}
      {lookVis.countdown && <CountdownLayer countdown={countdown} />}

      {/* Alert banner — appears above content, below blackout */}
      {alertVisible && alertText && (
        <div
          style={{
            position: "absolute",
            ...(alertPosition === "top"
              ? { top: 0, left: 0, right: 0 }
              : alertPosition === "center"
              ? { top: "50%", left: 0, right: 0, transform: "translateY(-50%)" }
              : { bottom: 0, left: 0, right: 0 }),
            zIndex: 60,
            background: alertBgColor,
            ...(alertPosition === "bottom"
              ? { borderTop: "3px solid #f97316" }
              : alertPosition === "top"
              ? { borderBottom: "3px solid #f97316" }
              : {}),
            color: alertTextColor,
            padding: "18px 40px",
            textAlign: "center",
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: "0.01em",
            pointerEvents: "none",
          }}
        >
          {alertText}
        </div>
      )}

      {/* Audio element for backing tracks */}
      <audio ref={audioRef} />

      {/* Blackout layer */}
      <div
        className="absolute inset-0 bg-black transition-opacity"
        style={{
          opacity: isBlackout ? 1 : 0,
          zIndex: 100,
          transitionDuration: "150ms",
          pointerEvents: "none",
        }}
      />

      {/* Close button — shown on mouse move */}
      {showControls && (
        <button
          onClick={closeWindow}
          style={{
            position: "absolute",
            top: 16,
            right: 16,
            zIndex: 200,
            background: "rgba(0,0,0,0.6)",
            border: "1px solid rgba(255,255,255,0.3)",
            borderRadius: 6,
            color: "#fff",
            fontSize: 13,
            padding: "4px 12px",
            cursor: "pointer",
          }}
        >
          ✕ 닫기 (Esc)
        </button>
      )}
    </div>
    </ErrorBoundary>
  );
}
