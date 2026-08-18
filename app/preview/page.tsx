"use client";

import { useEffect, useRef, useState } from "react";
import { ipc, emitEvent, isTauri } from "@/lib/ipc";
import { DEFAULT_LAYER_CONFIG, type LayerConfig, type LookApplyPayload } from "@/lib/types";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import CanvasLayer from "@/components/layers/CanvasLayer";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PreviewPage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig>(DEFAULT_LAYER_CONFIG);
  const [isBlackout, setIsBlackout] = useState(false);
  const [copyright, setCopyright] = useState("");
  const [lookVis, setLookVis] = useState({
    background: true, subtitle: true, overlay: true, canvas: true, countdown: true,
  });
  const [windowSize, setWindowSize] = useState({ w: CANVAS_W, h: CANVAS_H });
  // SubtitleLayer은 첫 실제 state 수신 후에만 mount → isFirstRender가 실제 내용을 받아 즉시 표시
  const [hasReceivedState, setHasReceivedState] = useState(false);
  const [playback, setPlayback] = useState({ currentTime: 0, duration: 0, playing: false });
  const [isOutputLive, setIsOutputLive] = useState(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);

  // Track window size for scaling
  useEffect(() => {
    const update = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Enforce 16:9 aspect ratio when user resizes the window.
  // setSize() sets INNER size, so window.innerWidth/Height are the correct reference.
  useEffect(() => {
    if (!isTauri()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;

    const snap = async () => {
      if (busy) return;
      busy = true;
      try {
        const w = window.innerWidth;
        const expectedH = Math.round(w * 9 / 16);
        if (Math.abs(window.innerHeight - expectedH) <= 1) return;
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        await getCurrentWebviewWindow().setSize(new LogicalSize(w, expectedH));
      } catch { /* ignore */ }
      finally { busy = false; }
    };

    const handle = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void snap(), 150);
    };

    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("resize", handle);
      if (timer) clearTimeout(timer);
    };
  }, []);

  // IPC listeners
  useEffect(() => {
    let mounted = true;

    async function setup() {
      let receivedUpdate = false;

      const unlistenSlide = await ipc.onSlideUpdateWithMeta((_config, meta) => {
        if (!mounted) return;
        receivedUpdate = true;
        // preview:update is the authoritative layerConfig source for the preview window;
        // slide:update may carry a cleared subtitle (visible=false) that should not override it.
        setCopyright(meta?.copyright ?? "");
      });
      const unlistenPreview = await ipc.onPreviewUpdate((config) => {
        if (!mounted) return;
        receivedUpdate = true;
        setHasReceivedState(true);
        setLayerConfig(config);
      });
      const unlistenBlackout = await ipc.onBlackout((active) => {
        if (mounted) setIsBlackout(active);
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
      const unlistenPlayback = await ipc.onPlaybackStatus((status) => {
        if (mounted) setPlayback(status);
      });
      // Track heartbeat from output window to know if output is live
      const unlistenHeartbeat = await ipc.onHeartbeat(() => {
        if (!mounted) return;
        setIsOutputLive(true);
        if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setTimeout(() => {
          setIsOutputLive(false);
          setPlayback(prev => ({ ...prev, playing: false }));
        }, 6000); // output sends every 4s; 6s timeout means ≥1 missed beat = offline
      });

      // Request current state; retry every 500ms until a slide update arrives (max 10×)
      await ipc.sendOutputReady();
      let retryCount = 0;
      const retryInterval = setInterval(async () => {
        if (!mounted || receivedUpdate || retryCount >= 10) {
          clearInterval(retryInterval);
          return;
        }
        retryCount++;
        await ipc.sendOutputReady();
      }, 500);

      unlistenRefs.current.push(unlistenSlide, unlistenPreview, unlistenBlackout, unlistenLook, unlistenPlayback, unlistenHeartbeat, () => clearInterval(retryInterval));
    }

    void setup();

    // Notify controller when this window closes
    const handleUnload = () => {
      void emitEvent("preview:closed", {});
    };
    window.addEventListener("beforeunload", handleUnload);

    // Arrow keys → send subtitle:next/prev to controller
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        void ipc.sendSubtitleNext();
      } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        e.preventDefault();
        void ipc.sendSubtitlePrev();
      }
    };
    window.addEventListener("keydown", handleKey);

    return () => {
      mounted = false;
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const scale = Math.min(windowSize.w / CANVAS_W, windowSize.h / CANVAS_H);
  const scaledW = CANVAS_W * scale;
  const scaledH = CANVAS_H * scale;
  const isVideo = layerConfig.background.type === "video";

  return (
    <div className="w-full h-screen bg-black overflow-hidden flex items-center justify-center">
      {/* Scaled canvas wrapper */}
      <div style={{ width: scaledW, height: scaledH, position: "relative", overflow: "hidden" }}>
        {/* 1920×1080 virtual canvas, scaled down */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: CANVAS_W,
            height: CANVAS_H,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          <BackgroundLayer config={layerConfig.background} skipPlaybackEmit paused={!isOutputLive} />
          {/* SubtitleLayer은 첫 state 수신 후에만 mount (isFirstRender가 실제 내용으로 즉시 표시) */}
          {lookVis.subtitle && hasReceivedState && (
            <SubtitleLayer
              config={layerConfig.subtitle}
              transitionMs={layerConfig.transitionMs}
              copyright={copyright}
            />
          )}
          {lookVis.canvas && <CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />}
          {isBlackout && (
            <div className="absolute inset-0 bg-black" style={{ zIndex: 100 }} />
          )}
        </div>
      </div>

      {/* 영상 컨트롤 바 */}
      {isVideo && (
        <div
          style={{
            position: "absolute", bottom: 0, left: 0, right: 0, zIndex: 200,
            background: "rgba(0,0,0,0.75)", padding: "5px 8px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => ipc.sendVideoControl({ action: playback.playing ? "pause" : "play" })}
              style={{ color: "#fff", background: "none", border: "none", cursor: "pointer", fontSize: 14, lineHeight: 1, flexShrink: 0 }}
            >
              {playback.playing ? "⏸" : "▶"}
            </button>
            <span style={{ color: "#aaa", fontSize: 10, flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
              {formatTime(playback.currentTime)} / {formatTime(playback.duration)}
            </span>
            <input
              type="range"
              min={0}
              max={playback.duration || 1}
              value={playback.currentTime}
              step={0.1}
              onChange={(e) => ipc.sendVideoControl({ action: "seek", value: parseFloat(e.target.value) })}
              style={{ flex: 1, accentColor: "#3b82f6", height: 3, cursor: "pointer" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
