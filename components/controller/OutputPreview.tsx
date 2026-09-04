"use client";

import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import type { LayerConfig, TextBlock, ShapeBlock } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";

type BgConfig = LayerConfig["background"];
interface SubContent { lines: string[]; lines2: string[] }

interface Props {
  layerConfig: LayerConfig;
  isBlackout: boolean;
  isLive: boolean;
  /** 렌더링 너비 px (기본 232 — 도킹 사이드바). 창모드에서는 실제 창 너비를 전달 */
  width?: number;
  /** true이면 테두리/둥근 모서리 없음 (창모드 전체화면용) */
  fullscreen?: boolean;
}

const DEFAULT_W = 232;
const NATIVE_W = 1920;
const NATIVE_H = 1080;

export default function OutputPreview({ layerConfig, isBlackout, isLive, width = DEFAULT_W, fullscreen = false }: Props) {
  const SCALE = width / NATIVE_W;
  const height = Math.round(width * NATIVE_H / NATIVE_W);
  const scaleRatio = width / DEFAULT_W; // 고정 px 값 비례 스케일용
  const bg = layerConfig.background;
  const sub = layerConfig.subtitle;
  const canvasBlocks = (layerConfig.canvas?.textBlocks ?? []).filter(b => b.visible !== false);
  const shapeBlocks = (layerConfig.canvas?.shapeBlocks ?? []).filter(s => s.visible !== false);
  const canvasLayerOrder = layerConfig.canvas?.layerOrder;
  const FADE_MS = (layerConfig.transitionMs != null && layerConfig.transitionMs > 0) ? layerConfig.transitionMs : 600;
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  const activeLines = sub.visible && sub.lines.length > 0 ? sub.lines : [];
  // Include nonce so animation fires even when content is identical across slides
  const activeLinesKey = `${sub.nonce ?? 0}:${activeLines.join("\0")}`;
  const canvasBlocksKey = `${layerConfig.canvas?.nonce ?? 0}:${canvasBlocks.map(b => `${b.id}:${b.text}`).join("\0")}:${shapeBlocks.map(s => `${s.id}:${s.text ?? ""}`).join("\0")}`;

  // ── 배경 두 슬롯 크로스페이드 ──────────────────────────────────────
  const bgIdentity = `${bg.type}:${bg.src ?? ""}:${bg.color ?? ""}`;
  const [bgSlots, setBgSlots] = useState<[BgConfig, BgConfig]>([bg, bg]);
  const [activeBgSlot, setActiveBgSlot] = useState<0 | 1>(0);
  const currentBgSlot = useRef<0 | 1>(0);
  const bgFirstRender = useRef(true);

  // ── 자막 두 슬롯 크로스페이드 ──────────────────────────────────────
  const [slots, setSlots] = useState<[SubContent, SubContent]>([
    { lines: activeLines, lines2: sub.lines2 ?? [] }, { lines: [], lines2: [] },
  ]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);

  // ── 캔버스 블록 두 슬롯 크로스페이드 ───────────────────────────────
  type CanvasSlotData = { blocks: TextBlock[]; shapes: ShapeBlock[]; layerOrder?: string[] };
  const [canvasSlots, setCanvasSlots] = useState<[CanvasSlotData, CanvasSlotData]>([
    { blocks: canvasBlocks, shapes: shapeBlocks, layerOrder: canvasLayerOrder },
    { blocks: [], shapes: [] },
  ]);
  const [activeCanvasSlot, setActiveCanvasSlot] = useState<0 | 1>(0);
  // slotAnimKeys: -1 means no animation (initial render). Incrementing forces inner div remount → @keyframes restart.
  const [canvasSlotAnimKeys, setCanvasSlotAnimKeys] = useState<[number, number]>([-1, -1]);
  const currentCanvasSlot = useRef<0 | 1>(0);
  const isCanvasFirstRender = useRef(true);
  const prevCanvasNonceRef = useRef<number>(layerConfig.canvas?.nonce ?? 0);

  // Video refs for bg slots
  const videoRefs = useRef<[HTMLVideoElement | null, HTMLVideoElement | null]>([null, null]);

  // Pause video when output is not live (standby), play when live
  useEffect(() => {
    videoRefs.current.forEach(v => {
      if (!v) return;
      if (isLive) v.play().catch(() => {}); else v.pause();
    });
  }, [isLive]);

  const [showDebug, setShowDebug] = useState(false);
  const [debugLog, setDebugLog] = useState<string[]>([]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    listen<void>("menu:toggle-devmode", () => setShowDebug(prev => !prev))
      .then(fn => { unlisten = fn; });
    return () => { unlisten?.(); };
  }, []);

  // ── 배경 crossfade effect ──────────────────────────────────────────
  useEffect(() => {
    if (bgFirstRender.current) { bgFirstRender.current = false; setBgSlots([bg, bg]); return; }
    const next = (1 - currentBgSlot.current) as 0 | 1;
    currentBgSlot.current = next;
    setBgSlots(prev => { const s: [BgConfig, BgConfig] = [prev[0], prev[1]]; s[next] = bg; return s; });
    setActiveBgSlot(next);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bgIdentity]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      setSlots(prev => {
        const next: [SubContent, SubContent] = [prev[0], prev[1]];
        next[currentSlot.current] = { lines: activeLines, lines2: sub.lines2 ?? [] };
        return next;
      });
      return;
    }

    if (sub.textEntrance === "none") {
      setSlots(prev => {
        const next: [SubContent, SubContent] = [prev[0], prev[1]];
        next[currentSlot.current] = { lines: activeLines, lines2: sub.lines2 ?? [] };
        return next;
      });
      return;
    }

    const nextSlot = (1 - currentSlot.current) as 0 | 1;
    currentSlot.current = nextSlot;

    setSlots(prev => {
      const next: [SubContent, SubContent] = [prev[0], prev[1]];
      next[nextSlot] = { lines: activeLines, lines2: sub.lines2 ?? [] };
      return next;
    });
    setActiveSlot(nextSlot);

    const ts = new Date().toLocaleTimeString("ko", { hour12: false });
    setDebugLog(prev => [...prev.slice(-4), `${ts} slot${nextSlot} ← ${activeLines.length}줄`]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLinesKey]);

  // ── 캔버스 블록 크로스페이드 effect ───────────────────────────────
  useEffect(() => {
    const currentNonce = layerConfig.canvas?.nonce ?? 0;
    const nonceChanged = currentNonce !== prevCanvasNonceRef.current;
    prevCanvasNonceRef.current = currentNonce;

    if (isCanvasFirstRender.current) {
      isCanvasFirstRender.current = false;
      setCanvasSlots(prev => {
        const next: [CanvasSlotData, CanvasSlotData] = [prev[0], prev[1]];
        next[currentCanvasSlot.current] = { blocks: canvasBlocks, shapes: shapeBlocks, layerOrder: canvasLayerOrder };
        return next;
      });
      return;
    }
    // In-place update (no crossfade) when: entrance=none, or only content changed (not a slide navigation)
    if (sub.textEntrance === "none" || !nonceChanged) {
      setCanvasSlots(prev => {
        const next: [CanvasSlotData, CanvasSlotData] = [prev[0], prev[1]];
        next[currentCanvasSlot.current] = { blocks: canvasBlocks, shapes: shapeBlocks, layerOrder: canvasLayerOrder };
        return next;
      });
      return;
    }
    const nextSlot = (1 - currentCanvasSlot.current) as 0 | 1;
    currentCanvasSlot.current = nextSlot;

    // All setState calls batched → one commit:
    //   outer slot div opacity transition fires; inner div remounts → @keyframes restarts.
    setCanvasSlots(prev => { const next: [CanvasSlotData, CanvasSlotData] = [prev[0], prev[1]]; next[nextSlot] = { blocks: canvasBlocks, shapes: shapeBlocks, layerOrder: canvasLayerOrder }; return next; });
    setActiveCanvasSlot(nextSlot);
    setCanvasSlotAnimKeys(prev => { const next: [number, number] = [prev[0], prev[1]]; next[nextSlot]++; return next; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasBlocksKey]);

  // ── 배경 슬롯 렌더링 ───────────────────────────────────────────────
  const bgStyleFor = (bgCfg: BgConfig): React.CSSProperties => {
    if (bgCfg.type === "color") return { backgroundColor: bgCfg.color ?? "#000", opacity: bgCfg.opacity };
    if (bgCfg.type === "image" && bgCfg.src) {
      const url = toDisplayUrl(bgCfg.src);
      return url
        ? { backgroundImage: `url(${url})`, backgroundSize: "cover", backgroundPosition: "center", opacity: bgCfg.opacity }
        : { backgroundColor: "#000" };
    }
    return {};
  };

  const renderBgSlot = (idx: 0 | 1) => {
    const bgCfg = bgSlots[idx];
    const videoUrl = bgCfg.type === "video" && bgCfg.src ? toDisplayUrl(bgCfg.src) : null;
    return (
      <div
        key={idx}
        style={{
          position: "absolute", inset: 0,
          opacity: activeBgSlot === idx ? 1 : 0,
          transition: `opacity ${fadeMsRef.current}ms ease-in-out`,
        }}
      >
        {bgCfg.type !== "video" && <div style={{ position: "absolute", inset: 0, ...bgStyleFor(bgCfg) }} />}
        {bgCfg.type === "video" && (
          videoUrl
            ? <div style={{ position: "absolute", inset: 0, overflow: "hidden", zIndex: 10 }}>
                <video
                  ref={el => { videoRefs.current[idx] = el; }}
                  src={videoUrl}
                  muted
                  autoPlay
                  loop={bgCfg.loop ?? true}
                  playsInline
                  style={{ width: "100%", height: "100%", objectFit: "cover", opacity: bgCfg.opacity ?? 1 }}
                />
              </div>
            : <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center" style={{ zIndex: 10 }}>
                <span className="text-zinc-600 text-xs select-none">▶ 영상</span>
              </div>
        )}
      </div>
    );
  };

  const positionJustify: Record<string, string> = { top: "flex-start", center: "center", bottom: "flex-end" };
  const scaledFontSize = Math.max(8, sub.fontSize * SCALE);

  const hasTransformEntrance =
    sub.textEntrance === "slide-up" ||
    sub.textEntrance === "slide-down" ||
    sub.textEntrance === "zoom-in";

  const intensity = sub.textEntranceIntensity ?? 50;
  // Canvas blocks are already in preview pixel space (scaled by SCALE externally),
  // so the animation distance must also be scaled.
  const enterDistPx = Math.round(4 + intensity * 0.8);
  const enterDistScaled = `${Math.round(enterDistPx * SCALE)}px`;
  const enterScale = `${(1 - (intensity / 100) * 0.6).toFixed(3)}`;

  const renderLines = ({ lines, lines2 }: SubContent) => {
    if (lines.length === 0) return null;
    const boxPad = Math.max(1, Math.round(2 * scaleRatio));
    return (
      <div
        style={{
          width: "100%",
          textAlign: sub.textAlign ?? "center",
          ...(sub.backgroundBoxVisible
            ? { backgroundColor: `rgba(0,0,0,${sub.backgroundBoxOpacity})`, padding: `${boxPad}px ${boxPad * 3}px`, borderRadius: boxPad }
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
              textShadow: sub.shadowEnabled ? `0 ${Math.max(1, Math.round(2 * SCALE))}px ${Math.max(2, Math.round(8 * SCALE))}px #000` : undefined,
              lineHeight: sub.lineHeight ?? 1.25,
              letterSpacing: sub.letterSpacing != null ? `${sub.letterSpacing * SCALE}px` : undefined,
            }}
          >
            {line}
          </div>
        ))}
        {sub.bilingualEnabled && lines2.map((l2, i) => (
          l2 ? (
            <div key={`l2-${i}`} style={{
              fontFamily: sub.fontFamily,
              fontSize: Math.max(6, (sub.fontSize2 ?? Math.round(sub.fontSize * 0.7)) * SCALE),
              fontWeight: sub.fontWeight2 ?? "normal",
              fontStyle: sub.fontStyle2 ?? "normal",
              color: sub.color2 ?? "#cccccc",
              lineHeight: sub.lineHeight ?? 1.25,
            }}>{l2}</div>
          ) : null
        ))}
      </div>
    );
  };

  const subPadV = Math.max(2, Math.round(18 * scaleRatio));
  const subPadH = Math.max(1, Math.round(4 * scaleRatio));

  const slotStyle = (idx: 0 | 1): React.CSSProperties => ({
    paddingTop: subPadV,
    paddingBottom: subPadV,
    paddingLeft: subPadH,
    paddingRight: subPadH,
    justifyContent: positionJustify[sub.position] ?? "center",
    opacity: activeSlot === idx ? (sub.opacity ?? 1) : 0,
    transition: `opacity ${fadeMsRef.current}ms ease-in-out`,
    pointerEvents: "none",
  });

  return (
    <div
      style={{ width, height }}
      className={`relative overflow-hidden bg-black flex-shrink-0${fullscreen ? "" : " rounded border border-zinc-600"}`}
    >
      {/* 배경 두 슬롯 크로스페이드 */}
      {renderBgSlot(0)}
      {renderBgSlot(1)}

      {/* 블랙아웃 */}
      {isBlackout && <div className="absolute inset-0 bg-black" style={{ zIndex: 90 }} />}

      {/* 자막 슬롯 0 */}
      {!isBlackout && (
        <div className="absolute inset-0 flex flex-col" style={{ ...slotStyle(0), zIndex: 20 }}>
          {renderLines(slots[0])}
        </div>
      )}
      {/* 자막 슬롯 1 */}
      {!isBlackout && (
        <div className="absolute inset-0 flex flex-col" style={{ ...slotStyle(1), zIndex: 20 }}>
          {renderLines(slots[1])}
        </div>
      )}

      {/* 캔버스 블록 (두 슬롯 크로스페이드, 통합 Z-order) */}
      {([0, 1] as const).map((idx) => (
        <div
          key={idx}
          className="absolute inset-0"
          style={{
            opacity: activeCanvasSlot === idx ? 1 : 0,
            transition: `opacity ${fadeMsRef.current}ms ease-in-out`,
            pointerEvents: "none",
            zIndex: 30,
            transform: "translateZ(0)",
          }}
        >
          <div
            key={canvasSlotAnimKeys[idx]}
            className="absolute inset-0"
            style={{
              ...({ "--enter-dist": enterDistScaled, "--enter-scale": enterScale } as React.CSSProperties),
              animation:
                hasTransformEntrance && FADE_MS > 0 && canvasSlotAnimKeys[idx] >= 0
                  ? `enter-${sub.textEntrance} ${FADE_MS}ms ease forwards`
                  : undefined,
            }}
          >
            {!isBlackout && (() => {
              const slot = canvasSlots[idx as 0 | 1];
              const blocksById = Object.fromEntries(slot.blocks.map(b => [b.id, b]));
              const shapesById = Object.fromEntries(slot.shapes.map(s => [s.id, s]));
              const knownIds = new Set([...slot.blocks.map(b => b.id), ...slot.shapes.map(s => s.id)]);
              // Use current canvasLayerOrder prop directly so Z-order changes apply instantly
              const effectiveOrder: string[] = canvasLayerOrder
                ? [
                    ...slot.blocks.filter(b => !canvasLayerOrder.includes(b.id)).map(b => b.id),
                    ...slot.shapes.filter(s => !canvasLayerOrder.includes(s.id)).map(s => s.id),
                    ...canvasLayerOrder.filter(id => knownIds.has(id)),
                  ]
                : [...slot.blocks.map(b => b.id), ...slot.shapes.map(s => s.id)];

              return effectiveOrder.map((id, zOrd) => {
                const block = blocksById[id];
                if (block) {
                  return (
                    <div
                      key={id}
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
                        zIndex: zOrd + 1,
                      }}
                    >
                      {block.text}
                    </div>
                  );
                }
                const s = shapesById[id];
                if (s) {
                  const filterId = `ps-${idx}-${s.id}`;
                  const fill = s.fillEnabled ? s.fillColor : "none";
                  const fillOpacity = s.fillEnabled ? s.fillOpacity / 100 : 0;
                  const stroke = s.strokeEnabled ? s.strokeColor : "none";
                  const strokeOpacity = s.strokeEnabled ? s.strokeOpacity / 100 : 0;
                  const strokeWidth = s.strokeEnabled ? s.strokeWidth : 0;
                  const filterAttr = s.shadowEnabled ? `url(#${filterId})` : undefined;
                  const cx = s.x + s.width / 2, cy = s.y + s.height / 2;
                  const x = s.x, y = s.y, w = s.width, h = s.height;
                  const cp = { fill, fillOpacity, stroke, strokeOpacity, strokeWidth, filter: filterAttr };
                  let shapeEl: React.ReactNode = null;
                  switch (s.shapeType) {
                    case "rect": shapeEl = <rect x={x} y={y} width={w} height={h} {...cp} />; break;
                    case "rounded-rect": shapeEl = <rect x={x} y={y} width={w} height={h} rx={Math.min(w,h)*0.12} ry={Math.min(w,h)*0.12} {...cp} />; break;
                    case "ellipse": shapeEl = <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} {...cp} />; break;
                    case "triangle": shapeEl = <polygon points={`${cx},${y} ${x+w},${y+h} ${x},${y+h}`} {...cp} />; break;
                    case "diamond": shapeEl = <polygon points={`${cx},${y} ${x+w},${cy} ${cx},${y+h} ${x},${cy}`} {...cp} />; break;
                    case "line": shapeEl = <line x1={x} y1={cy} x2={x+w} y2={cy} stroke={s.strokeEnabled ? s.strokeColor : "#fff"} strokeOpacity={strokeOpacity} strokeWidth={s.strokeEnabled ? s.strokeWidth : 4} filter={filterAttr} />; break;
                    case "arrow-right": { const ah=h*0.4,aw=w*0.35; shapeEl = <polygon points={[`${x},${cy-ah/2}`,`${x+w-aw},${cy-ah/2}`,`${x+w-aw},${y}`,`${x+w},${cy}`,`${x+w-aw},${y+h}`,`${x+w-aw},${cy+ah/2}`,`${x},${cy+ah/2}`].join(" ")} {...cp} />; break; }
                    case "star": { const r1=Math.min(w,h)/2,r2=r1*0.4; shapeEl = <polygon points={Array.from({length:10}).map((_,i)=>{const a=(Math.PI/5)*i-Math.PI/2,r=i%2===0?r1:r2;return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(" ")} {...cp} />; break; }
                    case "pentagon": { const r=Math.min(w,h)/2; shapeEl = <polygon points={Array.from({length:5}).map((_,i)=>{const a=(Math.PI*2/5)*i-Math.PI/2;return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(" ")} {...cp} />; break; }
                  }
                  const fs = s.textFontSize ?? 60;
                  const lines = (s.text ?? "").split("\n");
                  const lh = fs * 1.3;
                  const startY = cy - (lh * lines.length) / 2 + lh / 2;
                  const anchor = s.textAlign === "left" ? "start" : s.textAlign === "right" ? "end" : "middle";
                  const textX = s.textAlign === "left" ? x+8 : s.textAlign === "right" ? x+w-8 : cx;
                  const textEl = s.text ? (
                    <text textAnchor={anchor} fill={s.textColor ?? "#ffffff"} fontSize={fs}
                      fontFamily={s.textFontFamily ?? "sans-serif"} fontWeight={s.textFontWeight ?? "normal"}
                      fontStyle={s.textFontStyle ?? "normal"} textDecoration={s.textDecoration ?? "none"} dominantBaseline="middle">
                      {lines.map((line, i) => <tspan key={i} x={textX} y={startY + lh * i}>{line}</tspan>)}
                    </text>
                  ) : null;
                  return (
                    <svg
                      key={id}
                      viewBox="0 0 1920 1080"
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: zOrd + 1 }}
                      preserveAspectRatio="none"
                    >
                      {s.shadowEnabled && (
                        <defs>
                          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
                            <feDropShadow dx={s.shadowX} dy={s.shadowY} stdDeviation={s.shadowBlur} floodColor={s.shadowColor} floodOpacity={0.7} />
                          </filter>
                        </defs>
                      )}
                      {shapeEl ? <g opacity={s.opacity !== undefined ? s.opacity / 100 : 1}>{shapeEl}{textEl}</g> : null}
                    </svg>
                  );
                }
                return null;
              });
            })()}
          </div>
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
          <div>bg: slot{activeBgSlot} | type: {bg.type}</div>
          <div>sub: slot{activeSlot} | visible: {sub.visible ? "yes" : "NO"} | lines: {sub.lines.length}</div>
          <div>canvas: slot{activeCanvasSlot} | blocks: {canvasBlocks.length}</div>
          <div>s0: {slots[0].lines.length}줄 | s1: {slots[1].lines.length}줄 | cs0: {canvasSlots[0].blocks.length} | cs1: {canvasSlots[1].blocks.length}</div>
          {debugLog.map((e, i) => <div key={i} style={{ color: "#aaffcc" }}>{e}</div>)}
        </div>
      )}

    </div>
  );
}
