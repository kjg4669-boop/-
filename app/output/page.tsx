"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useOutputStore } from "@/stores/outputStore";
import { ipc, isTauri } from "@/lib/ipc";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import OverlayLayer from "@/components/layers/OverlayLayer";
import CanvasLayer from "@/components/layers/CanvasLayer";
import CountdownLayer from "@/components/layers/CountdownLayer";
import type { LayerConfig } from "@/lib/types";
import ErrorBoundary from "@/components/ErrorBoundary";

async function closeWindow() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  void getCurrentWindow().close();
}

export default function OutputPage() {
  const { layerConfig, isBlackout, alertText, alertVisible, countdown, setLayerConfig, setBlackout, setOutputReady, setAlert, setCountdown } = useOutputStore();
  const unlistenRefs = useRef<Array<() => void>>([]);
  const [showControls, setShowControls] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFrozenRef = useRef(false);

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
      const unlistenAlert = await ipc.onAlert((text: string, visible: boolean) => {
        if (mounted) setAlert(text, visible);
      });

      const unlistenCountdown = await ipc.onCountdown((payload) => {
        if (mounted) setCountdown(payload);
      });

      if (!mounted) {
        unlistenSlide(); unlistenBlackout(); unlistenAlert(); unlistenCountdown();
        return;
      }
      unlistenRefs.current.push(unlistenSlide, unlistenBlackout, unlistenAlert, unlistenCountdown);

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
      <BackgroundLayer config={layerConfig.background} />

      {/* Layer 2: Subtitle */}
      <SubtitleLayer config={layerConfig.subtitle} transitionMs={layerConfig.transitionMs} />

      {/* Layer 3: Overlay */}
      <OverlayLayer config={layerConfig.overlay} />

      {/* Layer 4: Canvas (free-position text blocks) */}
      <CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />

      {/* Layer 5: Countdown overlay (z:50, below blackout) */}
      <CountdownLayer countdown={countdown} />

      {/* Alert banner — appears above content, below blackout */}
      {alertVisible && alertText && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.82)",
            borderTop: "3px solid #f97316",
            color: "#fff",
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
