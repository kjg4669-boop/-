"use client";

import { useState, useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { listen } from "@tauri-apps/api/event";
import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";

interface Props {
  layerConfig: LayerConfig;
  isBlackout: boolean;
  isLive: boolean;
}

// Preview is rendered at 232×130 (≈16:9, fits w-64 sidebar)
const PREVIEW_W = 232;
const NATIVE_W = 1920;
const SCALE = PREVIEW_W / NATIVE_W;

export default function OutputPreview({ layerConfig, isBlackout, isLive }: Props) {
  const bg = layerConfig.background;
  const sub = layerConfig.subtitle;
  const canvasBlocks = layerConfig.canvas?.textBlocks ?? [];
  const FADE_MS = (layerConfig.transitionMs != null && layerConfig.transitionMs > 0) ? layerConfig.transitionMs : 600;
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  const activeLines = sub.visible && sub.lines.length > 0 ? sub.lines : [];
  const activeLinesKey = activeLines.join("\0");
  const canvasBlocksKey = canvasBlocks.map(b => `${b.id}:${b.text}`).join("\0");

  // ── 자막 두 슬롯 크로스페이드 ──────────────────────────────────────
  const [slots, setSlots] = useState<[string[], string[]]>([activeLines, []]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);

  // ── 캔버스 블록 두 슬롯 크로스페이드 ───────────────────────────────
  const [canvasSlots, setCanvasSlots] = useState<[typeof canvasBlocks, typeof canvasBlocks]>([canvasBlocks, []]);
  const [activeCanvasSlot, setActiveCanvasSlot] = useState<0 | 1>(0);
  const [canvasSlotTransforms, setCanvasSlotTransforms] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const currentCanvasSlot = useRef<0 | 1>(0);
  const isCanvasFirstRender = useRef(true);

  // 개발자 디버그
  const [showDebug, setShowDebug] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<void>("menu:toggle-devmode", () => setShowDebug(prev => !prev))
      .then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    if (sub.textEntrance === "none") {
      setSlots(prev => {
        const next: [string[], string[]] = [prev[0], prev[1]];
        next[currentSlot.current] = activeLines;
        return next;
      });
      return;
    }

    // 비활성 슬롯에 새 내용 기입 후 activeSlot 전환 (한 배치로 커밋).
    // 비활성 슬롯은 항상 opacity:0 상태이므로 브라우저가 "from" 값을 알고 있어
    // CSS transition이 0→1 으로 정상 동작함.
    const nextSlot = (1 - currentSlot.current) as 0 | 1;
    currentSlot.current = nextSlot;

    setSlots(prev => {
      const next: [string[], string[]] = [prev[0], prev[1]];
      next[nextSlot] = activeLines;
      return next;
    });
    setActiveSlot(nextSlot);

    const ts = new Date().toLocaleTimeString("ko", { hour12: false });
    setDebugLog(prev => [...prev.slice(-4), `${ts} slot${nextSlot} ← ${activeLines.length}줄`]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLinesKey]);

  // ── 캔버스 블록 크로스페이드 effect ───────────────────────────────
  useEffect(() => {
    if (isCanvasFirstRender.current) {
      isCanvasFirstRender.current = false;
      return;
    }
    if (sub.textEntrance === "none") {
      setCanvasSlots(prev => {
        const next: [typeof canvasBlocks, typeof canvasBlocks] = [prev[0], prev[1]];
        next[currentCanvasSlot.current] = canvasBlocks;
        return next;
      });
      return;
    }
    const nextSlot = (1 - currentCanvasSlot.current) as 0 | 1;
    currentCanvasSlot.current = nextSlot;

    const entrance = sub.textEntrance;
    if (entrance === "slide-up" || entrance === "slide-down" || entrance === "zoom-in") {
      const initTransform =
        entrance === "slide-up" ? "translateY(10px)"
        : entrance === "slide-down" ? "translateY(-10px)"
        : "scale(0.82)";
      flushSync(() => {
        setCanvasSlots(prev => { const next: [typeof canvasBlocks, typeof canvasBlocks] = [prev[0], prev[1]]; next[nextSlot] = canvasBlocks; return next; });
        setCanvasSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = initTransform; return next; });
      });
      requestAnimationFrame(() => {
        setActiveCanvasSlot(nextSlot);
        setCanvasSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = undefined; return next; });
      });
    } else {
      setCanvasSlots(prev => { const next: [typeof canvasBlocks, typeof canvasBlocks] = [prev[0], prev[1]]; next[nextSlot] = canvasBlocks; return next; });
      setActiveCanvasSlot(nextSlot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasBlocksKey]);

  // ── 배경 스타일 ────────────────────────────────────────────────────
  let bgStyle: React.CSSProperties = {};
  if (bg.type === "color") {
    bgStyle = { backgroundColor: bg.color ?? "#000000", opacity: bg.opacity };
  } else if (bg.type === "image" && bg.src) {
    const url = toDisplayUrl(bg.src);
    bgStyle = url
      ? { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center", opacity: bg.opacity }
      : { backgroundColor: "#000" };
  }

  const positionJustify: Record<string, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
  const scaledFontSize = Math.max(8, sub.fontSize * SCALE);

  const renderLines = (lines: string[]) => {
    if (lines.length === 0) return null;
    return (
      <div
        style={{
          width: "100%",
          textAlign: sub.textAlign ?? "center",
          ...(sub.backgroundBoxVisible
            ? { backgroundColor: `rgba(0,0,0,${sub.backgroundBoxOpacity})`, padding: "1px 3px", borderRadius: 2 }
            : {}),
        }}
      >
        {lines.map((line, i) => (
          <div
            key={i}
            style={{
              fontFamily: sub.fontFamily,
              fontSize: scaledFontSize,
              fontWeight: sub.fontWeight ?? "normal",
              fontStyle: sub.fontStyle ?? "normal",
              color: sub.color,
              WebkitTextStroke: sub.strokeWidth > 0 ? `${sub.strokeWidth * SCALE}px ${sub.strokeColor}` : undefined,
              textShadow: sub.shadowEnabled ? "0 1px 2px #000" : undefined,
              lineHeight: 1.25,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {line}
          </div>
        ))}
      </div>
    );
  };

  const slotStyle = (idx: 0 | 1): React.CSSProperties => ({
    paddingTop: 18,
    paddingBottom: 18,
    justifyContent: positionJustify[sub.position] ?? "center",
    opacity: activeSlot === idx ? (sub.opacity ?? 1) : 0,
    transition: `opacity ${fadeMsRef.current}ms ease`,
    pointerEvents: "none",
  });

  return (
    <div
      style={{ width: PREVIEW_W, height: 130 }}
      className="relative overflow-hidden rounded bg-black border border-zinc-600 flex-shrink-0"
    >
      {/* 배경 */}
      {bg.type !== "video" && <div className="absolute inset-0" style={bgStyle} />}
      {bg.type === "video" && (
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
          <span className="text-zinc-600 text-xs">▶ 영상</span>
        </div>
      )}

      {/* 블랙아웃 */}
      {isBlackout && <div className="absolute inset-0 bg-black" />}

      {/* 자막 슬롯 0 */}
      {!isBlackout && (
        <div className="absolute inset-0 flex flex-col px-1" style={slotStyle(0)}>
          {renderLines(slots[0])}
        </div>
      )}
      {/* 자막 슬롯 1 */}
      {!isBlackout && (
        <div className="absolute inset-0 flex flex-col px-1" style={slotStyle(1)}>
          {renderLines(slots[1])}
        </div>
      )}

      {/* 캔버스 텍스트 블록 (두 슬롯 크로스페이드) */}
      {([0, 1] as const).map((idx) => (
        <div
          key={idx}
          className="absolute inset-0"
          style={{
            opacity: activeCanvasSlot === idx ? 1 : 0,
            transform: canvasSlotTransforms[idx],
            transition: `opacity ${fadeMsRef.current}ms ease, transform ${fadeMsRef.current}ms ease`,
            pointerEvents: "none",
          }}
        >
          {!isBlackout && canvasSlots[idx as 0 | 1].map((block) => (
            <div
              key={block.id}
              style={{
                position: "absolute",
                left: block.x * SCALE,
                top: (block.y ?? 0) * SCALE,
                width: block.width * SCALE,
                fontSize: Math.max(6, block.fontSize * SCALE),
                fontFamily: block.fontFamily,
                fontWeight: block.fontWeight ?? "normal",
                fontStyle: block.fontStyle ?? "normal",
                color: block.color,
                textAlign: block.textAlign ?? "left",
                lineHeight: 1.25,
                overflow: "hidden",
                pointerEvents: "none",
              }}
            >
              {block.text}
            </div>
          ))}
        </div>
      ))}

      {/* 개발자 디버그 오버레이 (보기 > 개발자 도구) */}
      {showDebug && (
        <div
          style={{
            position: "absolute",
            top: 2, left: 2, right: 2,
            background: "rgba(0,0,0,0.82)",
            color: "#00ff88",
            fontFamily: "monospace",
            fontSize: 7,
            lineHeight: 1.5,
            padding: "2px 4px",
            borderRadius: 2,
            pointerEvents: "none",
            zIndex: 999,
          }}
        >
          <div>entrance: <b>{sub.textEntrance ?? "fade"}</b> | ms: {FADE_MS}</div>
          <div>sub: slot{activeSlot} | visible: {sub.visible ? "yes" : "NO"} | lines: {sub.lines.length}</div>
          <div>canvas: slot{activeCanvasSlot} | blocks: {canvasBlocks.length}</div>
          <div>s0: {slots[0].length}줄 | s1: {slots[1].length}줄 | cs0: {canvasSlots[0].length} | cs1: {canvasSlots[1].length}</div>
          {debugLog.map((e, i) => <div key={i} style={{ color: "#aaffcc" }}>{e}</div>)}
        </div>
      )}

      {/* 우하단 상태 레이블 */}
      <div className="absolute bottom-0.5 right-1 text-xs text-zinc-600 pointer-events-none">
        {isLive ? "미리보기" : "송출 대기"}
      </div>
    </div>
  );
}
