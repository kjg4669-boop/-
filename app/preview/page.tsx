"use client";

import { useEffect, useRef, useState } from "react";
import { ipc, emitEvent, isTauri } from "@/lib/ipc";
import { DEFAULT_LAYER_CONFIG, type LayerConfig } from "@/lib/types";
import OutputPreview from "@/components/controller/OutputPreview";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function PreviewPage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig>(DEFAULT_LAYER_CONFIG);
  const [isBlackout, setIsBlackout] = useState(false);
  const [windowSize, setWindowSize] = useState({ w: CANVAS_W, h: CANVAS_H });
  const [isOutputLive, setIsOutputLive] = useState(false);
  const heartbeatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);

  // On mount: immediately fetch latest config from Rust app-state
  useEffect(() => {
    ipc.getPreviewConfig().then((json) => {
      if (json) { try { setLayerConfig(JSON.parse(json) as LayerConfig); } catch { /* ignore */ } }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track window size
  useEffect(() => {
    const update = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    update(); window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Enforce 16:9
  useEffect(() => {
    if (!isTauri()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    const snap = async () => {
      if (busy) return; busy = true;
      try {
        const w = window.innerWidth;
        const expectedH = Math.round(w * 9 / 16);
        if (Math.abs(window.innerHeight - expectedH) <= 1) return;
        const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
        const { LogicalSize } = await import("@tauri-apps/api/dpi");
        await getCurrentWebviewWindow().setSize(new LogicalSize(w, expectedH));
      } catch { /* ignore */ } finally { busy = false; }
    };
    const handle = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => void snap(), 150); };
    window.addEventListener("resize", handle);
    return () => { window.removeEventListener("resize", handle); if (timer) clearTimeout(timer); };
  }, []);

  // IPC listeners
  useEffect(() => {
    let mounted = true;
    async function setup() {
      let receivedUpdate = false;
      const unlistenPreview = await ipc.onPreviewUpdate((config) => {
        if (!mounted) return; receivedUpdate = true; setLayerConfig(config);
      });
      const unlistenBlackout = await ipc.onBlackout((active) => { if (mounted) setIsBlackout(active); });
      const unlistenHeartbeat = await ipc.onHeartbeat(() => {
        if (!mounted) return;
        setIsOutputLive(true);
        if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setTimeout(() => setIsOutputLive(false), 6000);
      });
      await ipc.sendOutputReady();
      let retryCount = 0;
      const retryInterval = setInterval(async () => {
        if (!mounted || receivedUpdate || retryCount >= 10) { clearInterval(retryInterval); return; }
        retryCount++; await ipc.sendOutputReady();
      }, 500);
      unlistenRefs.current.push(unlistenPreview, unlistenBlackout, unlistenHeartbeat, () => clearInterval(retryInterval));
    }
    void setup();
    const handleUnload = () => { void emitEvent("preview:closed", {}); };
    window.addEventListener("beforeunload", handleUnload);
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); void ipc.sendSubtitleNext(); }
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); void ipc.sendSubtitlePrev(); }
    };
    window.addEventListener("keydown", handleKey);
    return () => {
      mounted = false;
      if (heartbeatTimerRef.current) clearTimeout(heartbeatTimerRef.current);
      unlistenRefs.current.forEach(fn => fn()); unlistenRefs.current = [];
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  const scale = Math.min(windowSize.w / CANVAS_W, windowSize.h / CANVAS_H);
  const scaledW = Math.round(CANVAS_W * scale);

  return (
    <div className="w-full h-screen bg-black overflow-hidden flex items-center justify-center">
      <OutputPreview
        layerConfig={layerConfig}
        isBlackout={isBlackout}
        isLive={isOutputLive}
        width={scaledW}
        fullscreen
      />
    </div>
  );
}
