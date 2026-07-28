"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ipc, emitEvent, isTauri } from "@/lib/ipc";
import type { LayerConfig, SlideMeta } from "@/lib/types";

function ClockDisplay() {
  const [time, setTime] = useState("");
  useEffect(() => {
    function update() {
      const now = new Date();
      setTime(now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono tabular-nums">{time}</span>;
}

export default function StagePage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [meta, setMeta] = useState<SlideMeta | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);

  const handleUpdate = useCallback((config: LayerConfig, m?: SlideMeta) => {
    setLayerConfig(config);
    setMeta(m ?? null);
  }, []);

  // Notify controller when this window is closed via OS close button
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    async function setupCloseHandler() {
      if (!isTauri()) {
        // Browser fallback (best-effort, async may not complete before unload)
        const onUnload = () => { emitEvent("stage:closed", {}); };
        window.addEventListener("beforeunload", onUnload);
        unlisten = () => window.removeEventListener("beforeunload", onUnload);
        return;
      }
      // Tauri: intercept close request to guarantee async emit before destroy
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      unlisten = await win.onCloseRequested(async (event) => {
        event.preventDefault();
        await emitEvent("stage:closed", {});
        await win.destroy();
      });
    }
    setupCloseHandler();
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function setup() {
      const unlisten = await ipc.onSlideUpdateWithMeta((config, m) => {
        if (mounted) handleUpdate(config, m);
      });
      if (mounted) {
        unlistenRefs.current.push(unlisten);
        // Signal ready so controller re-sends current state
        await ipc.sendOutputReady();
      } else {
        // Unmounted before setup completed — immediately release the listener
        unlisten();
      }
    }
    setup();
    return () => {
      mounted = false;
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, [handleUpdate]);

  const currentLines = layerConfig?.subtitle?.lines ?? [];
  const nextLines = meta?.nextLines ?? [];
  const nextSection = meta?.nextSection ?? "";

  const SECTION_LABEL: Record<string, string> = {
    verse: "절", chorus: "후렴", bridge: "브릿지",
    "pre-chorus": "프리코러스", intro: "인트로", outro: "아웃트로",
  };

  return (
    <div
      className="w-screen h-screen overflow-hidden select-none"
      style={{ background: "#0f0f1a", color: "#fff", fontFamily: "sans-serif", display: "flex", flexDirection: "column" }}
    >
      {/* ── Top Bar ─────────────────────────────────────────────────── */}
      <div
        style={{
          height: 44,
          background: "#1a1a2e",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 16,
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", fontWeight: 500 }}>
          STAGE DISPLAY
        </span>
        {meta && (
          <>
            <div style={{ width: 1, height: 18, background: "rgba(255,255,255,0.15)" }} />
            <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
              {meta.songTitle}
            </span>
            <span style={{
              fontSize: 11, fontWeight: 600,
              padding: "2px 8px", borderRadius: 4,
              background: "rgba(59,130,246,0.25)",
              color: "#93c5fd",
              textTransform: "uppercase" as const,
            }}>
              {SECTION_LABEL[meta.section] ?? meta.section}
            </span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                슬라이드 {meta.slideIndex + 1}/{meta.totalSlides}
              </span>
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                순서 {meta.itemIndex + 1}/{meta.totalItems}
              </span>
            </div>
          </>
        )}
        {!meta && <div style={{ marginLeft: "auto" }} />}
        <span style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", marginLeft: meta ? 0 : "auto" }}>
          <ClockDisplay />
        </span>
      </div>

      {/* ── Main Area: Current Slide ────────────────────────────────── */}
      <div
        style={{
          flex: "0 0 65%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 60px",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        {currentLines.length > 0 ? (
          <div style={{ textAlign: "center", maxWidth: 960 }}>
            {currentLines.map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: 56,
                  fontWeight: 700,
                  color: "#ffffff",
                  lineHeight: 1.35,
                  margin: "4px 0",
                  textShadow: "0 2px 12px rgba(0,0,0,0.8)",
                }}
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)" }}>
            <p style={{ fontSize: 32, fontWeight: 600 }}>대기 중</p>
            <p style={{ fontSize: 16, marginTop: 8 }}>슬라이드를 선택하면 여기에 표시됩니다</p>
          </div>
        )}
      </div>

      {/* ── Bottom Area: Next Slide Preview ────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "16px 60px 24px",
          background: "#12121f",
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.3)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
          다음 슬라이드
          {nextSection && (
            <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.2)" }}>
              ({SECTION_LABEL[nextSection] ?? nextSection})
            </span>
          )}
        </p>
        {nextLines.length > 0 ? (
          <div>
            {nextLines.map((line, i) => (
              <p
                key={i}
                style={{
                  fontSize: 26,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.45)",
                  lineHeight: 1.4,
                  margin: "2px 0",
                }}
              >
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 22, color: "rgba(255,255,255,0.2)", fontStyle: "italic" }}>
            마지막 슬라이드
          </p>
        )}
      </div>
    </div>
  );
}
