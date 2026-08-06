"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ipc, emitEvent, isTauri } from "@/lib/ipc";
import type { LayerConfig, SlideMeta } from "@/lib/types";
import { SECTION_LABEL } from "@/lib/constants";
import ErrorBoundary from "@/components/ErrorBoundary";

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

async function closeWindow() {
  if (isTauri()) {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  } else {
    window.close();
  }
}

export default function StagePage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig | null>(null);
  const [meta, setMeta] = useState<SlideMeta | null>(null);
  const [stageAlert, setStageAlert] = useState<{ text: string; position: string; bgColor: string; textColor: string; } | null>(null);
  const [stageMsg, setStageMsg] = useState<{ text: string } | null>(null);
  const unlistenRefs = useRef<Array<() => void>>([]);
  const stageAlertTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        const onUnload = () => { void emitEvent("stage:closed", {}); };
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
    void setupCloseHandler();
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    let mounted = true;
    async function setup() {
      const unlisten = await ipc.onSlideUpdateWithMeta((config, m) => {
        if (mounted) handleUpdate(config, m);
      });

      const unlistenAlert = await ipc.onAlert((payload) => {
        if (!mounted) return;
        if (stageAlertTimerRef.current !== null) {
          clearTimeout(stageAlertTimerRef.current);
          stageAlertTimerRef.current = null;
        }
        if (payload.visible && payload.text) {
          setStageAlert({
            text: payload.text,
            position: payload.position,
            bgColor: payload.backgroundColor ?? "rgba(0,0,0,0.85)",
            textColor: payload.textColor ?? "#ffffff",
          });
          if (payload.duration > 0) {
            stageAlertTimerRef.current = setTimeout(() => {
              stageAlertTimerRef.current = null;
              if (mounted) setStageAlert(null);
            }, payload.duration);
          }
        } else {
          setStageAlert(null);
        }
      });

      const unlistenStageMsg = await ipc.onStageMessage((p) => {
        if (!mounted) return;
        setStageMsg(p.visible && p.text ? { text: p.text } : null);
      });

      if (mounted) {
        unlistenRefs.current.push(unlisten, unlistenAlert, unlistenStageMsg);
        // Signal ready so controller re-sends current state
        await ipc.sendOutputReady();
      } else {
        // Unmounted before setup completed — immediately release the listeners
        unlisten();
        unlistenAlert();
        unlistenStageMsg();
      }
    }
    void setup();
    return () => {
      mounted = false;
      if (stageAlertTimerRef.current !== null) clearTimeout(stageAlertTimerRef.current);
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, [handleUpdate]);

  const currentLines = layerConfig?.subtitle?.lines ?? [];
  const nextLines = meta?.nextLines ?? [];
  const nextSection = meta?.nextSection ?? "";

  return (
    <ErrorBoundary>
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
              {meta.bpm && (
                <span style={{ fontSize: 13, color: "#f59e0b", marginLeft: 8 }}>♩={meta.bpm}</span>
              )}
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
        <button
          onClick={() => void closeWindow()}
          title="Stage Display 닫기"
          style={{
            marginLeft: 12,
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.25)",
            fontSize: 16,
            cursor: "pointer",
            lineHeight: 1,
            padding: "2px 6px",
            borderRadius: 4,
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.7)"; (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.25)"; (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
        >
          ✕
        </button>
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
            {meta?.chords && (
              <div style={{ fontFamily: "monospace", fontSize: 22, color: "#60a5fa", letterSpacing: 2, marginBottom: 8, whiteSpace: "pre" }}>
                {meta.chords}
              </div>
            )}
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

      {/* ── Bottom Area ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", background: "#12121f" }}>
        {/* Next Slide Preview */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            padding: "16px 40px 24px",
            borderRight: meta?.notes ? "1px solid rgba(255,255,255,0.06)" : undefined,
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
        {/* Presenter Notes */}
        {meta?.notes && (
          <div
            style={{
              width: 280,
              flexShrink: 0,
              display: "flex",
              flexDirection: "column",
              padding: "16px 24px 24px",
              background: "rgba(245,158,11,0.06)",
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,158,11,0.6)", marginBottom: 10, textTransform: "uppercase" as const, letterSpacing: "0.08em" }}>
              발표자 메모
            </p>
            <p style={{ fontSize: 18, color: "rgba(245,158,11,0.9)", lineHeight: 1.6, whiteSpace: "pre-wrap" as const }}>
              {meta.notes}
            </p>
          </div>
        )}
      </div>
      {/* Stage message overlay (private, operator-to-stage) */}
      {stageMsg && (
        <div style={{
          position: "fixed", top: 24, left: "50%", transform: "translateX(-50%)",
          zIndex: 200, backgroundColor: "rgba(234,179,8,0.92)", color: "#000",
          borderRadius: 8, padding: "12px 32px", fontSize: 28, fontWeight: "bold",
          maxWidth: "80%", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
          whiteSpace: "pre-wrap",
        }}>
          💬 {stageMsg.text}
        </div>
      )}
      {/* Alert overlay */}
      {stageAlert && (
        <div
          style={{
            position: "absolute",
            ...(stageAlert.position === "top"
              ? { top: 0, left: 0, right: 0 }
              : stageAlert.position === "center"
              ? { top: "50%", left: 0, right: 0, transform: "translateY(-50%)" }
              : { bottom: 0, left: 0, right: 0 }),
            zIndex: 60,
            background: stageAlert.bgColor,
            ...(stageAlert.position === "bottom"
              ? { borderTop: "3px solid #f97316" }
              : stageAlert.position === "top"
              ? { borderBottom: "3px solid #f97316" }
              : {}),
            color: stageAlert.textColor,
            padding: "18px 40px",
            textAlign: "center",
            fontSize: 42,
            fontWeight: 600,
            letterSpacing: "0.01em",
            pointerEvents: "none",
          }}
        >
          {stageAlert.text}
        </div>
      )}
    </div>
    </ErrorBoundary>
  );
}
