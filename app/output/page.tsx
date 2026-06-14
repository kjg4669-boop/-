"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useOutputStore } from "@/stores/outputStore";
import { ipc, isTauri } from "@/lib/ipc";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import OverlayLayer from "@/components/layers/OverlayLayer";
import CanvasLayer from "@/components/layers/CanvasLayer";
import type { LayerConfig } from "@/lib/types";

async function closeWindow() {
  if (!isTauri()) return;
  const { getCurrentWindow } = await import("@tauri-apps/api/window");
  getCurrentWindow().close();
}

export default function OutputPage() {
  const { layerConfig, isBlackout, setLayerConfig, setBlackout, setOutputReady } = useOutputStore();
  const unlistenRefs = useRef<Array<() => void>>([]);
  const [showControls, setShowControls] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      const unlistenSlide = await ipc.onSlideUpdate((config: LayerConfig) => {
        if (mounted) setLayerConfig(config);
      });
      const unlistenBlackout = await ipc.onBlackout((active: boolean) => {
        if (mounted) setBlackout(active);
      });

      unlistenRefs.current = [unlistenSlide, unlistenBlackout];

      await ipc.sendOutputReady();
      if (mounted) setOutputReady(true);
    }

    setup();

    return () => {
      mounted = false;
      unlistenRefs.current.forEach((fn) => fn());
    };
  }, [setLayerConfig, setBlackout, setOutputReady]);

  // Esc key closes the window
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeWindow();
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
    <div
      className="relative w-screen h-screen overflow-hidden bg-black"
      style={{ cursor: showControls ? "default" : "none" }}
      onMouseMove={handleMouseMove}
    >
      {/* Layer 1: Background */}
      <BackgroundLayer config={layerConfig.background} />

      {/* Layer 2: Subtitle */}
      <SubtitleLayer config={layerConfig.subtitle} />

      {/* Layer 3: Overlay */}
      <OverlayLayer config={layerConfig.overlay} />

      {/* Layer 4: Canvas (free-position text blocks) */}
      <CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />

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
  );
}
