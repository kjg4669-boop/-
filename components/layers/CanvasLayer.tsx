"use client";

import { useRef, useEffect, useState } from "react";
import type { TextBlock, ShapeBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  blocks: TextBlock[];
  shapeBlocks?: ShapeBlock[];
  nonce?: number;
  /** 0 = instant (no fade); undefined = default 600ms */
  transitionMs?: number;
  textEntrance?: string;
  /** 0-100; slide: px distance, zoom: scale depth. Default 50. */
  textEntranceIntensity?: number;
  /** Element IDs bottom-to-top. When provided, all blocks+shapes render with unified z-order. */
  layerOrder?: string[];
}

type SlotData = { blocks: TextBlock[]; shapes: ShapeBlock[]; layerOrder?: string[] };

/** Render a single text block inside a scale container */
function SingleTextBlock({ block, scale, zIdx }: { block: TextBlock; scale: number; zIdx: number }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0,
      width: OUTPUT_W, height: OUTPUT_H,
      transform: `scale(${scale})`, transformOrigin: "top left",
      zIndex: zIdx, pointerEvents: "none",
    }}>
      <div style={{
        position: "absolute",
        left: block.x,
        top: block.y,
        width: block.width,
        height: block.height,
        transform: block.rotation ? `rotate(${block.rotation}deg)` : undefined,
        display: "flex",
        alignItems: "flex-start",
        justifyContent:
          block.textAlign === "left" ? "flex-start"
          : block.textAlign === "right" ? "flex-end"
          : "center",
        fontSize: block.fontSize,
        color: block.color,
        fontFamily: block.fontFamily,
        fontWeight: block.fontWeight ?? "normal",
        fontStyle: block.fontStyle ?? "normal",
        textDecoration: block.textDecoration ?? "none",
        textAlign: block.textAlign ?? "center",
        lineHeight: 1.3,
        whiteSpace: "pre-wrap",
        wordBreak: "keep-all",
        padding: "8px",
      }}>
        {block.spans && block.spans.length > 0 ? (
          block.spans.map((span, i) => (
            <span key={i} style={{
              fontFamily: span.fontFamily,
              fontWeight: span.fontWeight ?? (block.fontWeight ?? "normal"),
              fontStyle: span.fontStyle ?? (block.fontStyle ?? "normal"),
              textDecoration: span.textDecoration ?? (block.textDecoration ?? "none"),
              color: span.color ?? block.color,
              fontSize: span.fontSize !== undefined ? `${span.fontSize}px` : undefined,
            }}>
              {span.text}
            </span>
          ))
        ) : (
          block.text
        )}
      </div>
    </div>
  );
}

/** Render a single shape inside its own SVG scale container */
function SingleShape({ shape, scale, zIdx }: { shape: ShapeBlock; scale: number; zIdx: number }) {
  const filterId = `shadow-${shape.id}`;
  const fillColor = shape.fillEnabled ? shape.fillColor : "none";
  const fillOpacity = shape.fillEnabled ? shape.fillOpacity / 100 : 0;
  const strokeColor = shape.strokeEnabled ? shape.strokeColor : "none";
  const strokeOpacity = shape.strokeEnabled ? shape.strokeOpacity / 100 : 0;
  const strokeWidth = shape.strokeEnabled ? shape.strokeWidth : 0;
  const filterAttr = shape.shadowEnabled ? `url(#${filterId})` : undefined;
  const cx = shape.x + shape.width / 2;
  const cy = shape.y + shape.height / 2;
  const transformAttr = shape.rotation ? `rotate(${shape.rotation} ${cx} ${cy})` : undefined;
  const x = shape.x, y = shape.y, w = shape.width, h = shape.height;
  const cp = { fill: fillColor, fillOpacity, stroke: strokeColor, strokeOpacity, strokeWidth, filter: filterAttr, transform: transformAttr };

  let shapeEl: React.ReactNode = null;
  switch (shape.shapeType) {
    case "rect": shapeEl = <rect x={x} y={y} width={w} height={h} {...cp} />; break;
    case "rounded-rect": shapeEl = <rect x={x} y={y} width={w} height={h} rx={Math.min(w,h)*0.12} ry={Math.min(w,h)*0.12} {...cp} />; break;
    case "ellipse": shapeEl = <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} {...cp} />; break;
    case "triangle": shapeEl = <polygon points={`${x+w/2},${y} ${x+w},${y+h} ${x},${y+h}`} {...cp} />; break;
    case "diamond": shapeEl = <polygon points={`${x+w/2},${y} ${x+w},${cy} ${x+w/2},${y+h} ${x},${cy}`} {...cp} />; break;
    case "line": shapeEl = <line x1={x} y1={cy} x2={x+w} y2={cy} stroke={shape.strokeEnabled ? shape.strokeColor : "#ffffff"} strokeOpacity={strokeOpacity} strokeWidth={shape.strokeEnabled ? shape.strokeWidth : 4} filter={filterAttr} transform={transformAttr} />; break;
    case "arrow-right": {
      const ah = h*0.4, aw = w*0.35;
      const pts = [`${x},${cy-ah/2}`,`${x+w-aw},${cy-ah/2}`,`${x+w-aw},${y}`,`${x+w},${cy}`,`${x+w-aw},${y+h}`,`${x+w-aw},${cy+ah/2}`,`${x},${cy+ah/2}`].join(" ");
      shapeEl = <polygon points={pts} {...cp} />; break;
    }
    case "star": {
      const r1 = Math.min(w,h)/2, r2 = r1*0.4;
      const pts = Array.from({length:10}).map((_,i) => { const a=(Math.PI/5)*i-Math.PI/2, r=i%2===0?r1:r2; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(" ");
      shapeEl = <polygon points={pts} {...cp} />; break;
    }
    case "pentagon": {
      const r = Math.min(w,h)/2;
      const pts = Array.from({length:5}).map((_,i) => { const a=(Math.PI*2/5)*i-Math.PI/2; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`; }).join(" ");
      shapeEl = <polygon points={pts} {...cp} />; break;
    }
  }

  const fs = shape.textFontSize ?? 60;
  let textEl: React.ReactNode = null;
  if (shape.text) {
    const lines = shape.text.split("\n");
    const lh = fs * 1.3;
    const startY = cy - (lh * lines.length) / 2 + lh / 2;
    const anchor = shape.textAlign === "left" ? "start" : shape.textAlign === "right" ? "end" : "middle";
    const textX = shape.textAlign === "left" ? x + 8 : shape.textAlign === "right" ? x + w - 8 : cx;
    const spans = shape.textSpans;
    if (spans && spans.length > 0) {
      // Split spans across line boundaries for per-span SVG tspan rendering
      type Seg = { text: string; color?: string; fontWeight?: string; fontStyle?: string; textDecoration?: string; fontSize?: number };
      const lineSegs: Seg[][] = lines.map(() => []);
      let lineIdx = 0;
      for (const span of spans) {
        let rem = span.text;
        while (rem.length > 0) {
          const nl = rem.indexOf("\n");
          const chunk = nl === -1 ? rem : rem.slice(0, nl);
          if (chunk.length > 0 && lineIdx < lineSegs.length)
            lineSegs[lineIdx].push({ text: chunk, color: span.color, fontWeight: span.fontWeight, fontStyle: span.fontStyle, textDecoration: span.textDecoration, fontSize: span.fontSize });
          if (nl === -1) { rem = ""; } else { lineIdx++; rem = rem.slice(nl + 1); }
        }
      }
      textEl = (
        <text key="t" textAnchor={anchor} fontSize={fs}
          fontFamily={shape.textFontFamily ?? "sans-serif"} fontWeight={shape.textFontWeight ?? "normal"}
          fontStyle={shape.textFontStyle ?? "normal"} dominantBaseline="middle">
          {lines.map((_, i) => (
            <tspan key={i} x={textX} y={startY + lh * i}>
              {lineSegs[i]?.length > 0
                ? lineSegs[i].map((seg, j) => (
                    <tspan key={j}
                      fill={seg.color ?? shape.textColor ?? "#ffffff"}
                      fontWeight={seg.fontWeight ?? shape.textFontWeight ?? "normal"}
                      fontStyle={seg.fontStyle ?? shape.textFontStyle ?? "normal"}
                      textDecoration={seg.textDecoration ?? shape.textDecoration ?? "none"}
                      fontSize={seg.fontSize !== undefined ? seg.fontSize : fs}>
                      {seg.text}
                    </tspan>
                  ))
                : <tspan fill={shape.textColor ?? "#ffffff"}>{""}</tspan>}
            </tspan>
          ))}
        </text>
      );
    } else {
      textEl = (
        <text key="t" textAnchor={anchor} fill={shape.textColor ?? "#ffffff"} fontSize={fs}
          fontFamily={shape.textFontFamily ?? "sans-serif"} fontWeight={shape.textFontWeight ?? "normal"}
          fontStyle={shape.textFontStyle ?? "normal"} textDecoration={shape.textDecoration ?? "none"} dominantBaseline="middle">
          {lines.map((line, i) => <tspan key={i} x={textX} y={startY + lh * i}>{line}</tspan>)}
        </text>
      );
    }
  }

  return (
    <div style={{
      position: "absolute", top: 0, left: 0,
      width: OUTPUT_W, height: OUTPUT_H,
      transform: `scale(${scale})`, transformOrigin: "top left",
      zIndex: zIdx, pointerEvents: "none",
      opacity: shape.opacity !== undefined ? shape.opacity / 100 : 1,
    }}>
      <svg width={OUTPUT_W} height={OUTPUT_H} style={{ position: "absolute", top: 0, left: 0 }}>
        {shape.shadowEnabled && (
          <defs>
            <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx={shape.shadowX} dy={shape.shadowY} stdDeviation={shape.shadowBlur} floodColor={shape.shadowColor} floodOpacity={0.7} />
            </filter>
          </defs>
        )}
        {shapeEl ? <g>{shapeEl}{textEl}</g> : null}
      </svg>
    </div>
  );
}

export default function CanvasLayer({ blocks, shapeBlocks, nonce, transitionMs, textEntrance, textEntranceIntensity, layerOrder }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const FADE_MS = transitionMs === 0 ? 0 : (transitionMs ?? 600);
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  // ── Two-slot crossfade ────────────────────────────────────────────────
  const visibleBlocks = blocks.filter(b => b.visible !== false);
  const visibleShapes = (shapeBlocks ?? []).filter(s => s.visible !== false);
  const blocksKey = `${nonce ?? 0}:${visibleBlocks.map(b => `${b.id}:${b.text}:${b.color}:${b.fontSize}:${b.fontWeight}:${b.fontStyle}:${b.spans?.map(s => `${s.color ?? ""}${s.fontWeight ?? ""}${s.fontStyle ?? ""}${s.textDecoration ?? ""}`).join("|") ?? ""}`).join("\0")}:${visibleShapes.map(s => `${s.id}:${s.text ?? ""}:${s.textColor ?? ""}:${s.fillColor}:${s.strokeColor}:${s.textSpans?.map(sp => `${sp.color ?? ""}${sp.fontWeight ?? ""}${sp.fontStyle ?? ""}${sp.textDecoration ?? ""}`).join("|") ?? ""}`).join("\0")}`;
  const [slots, setSlots] = useState<[SlotData, SlotData]>([
    { blocks: visibleBlocks, shapes: visibleShapes, layerOrder },
    { blocks: [], shapes: [], layerOrder: undefined },
  ]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [slotAnimKeys, setSlotAnimKeys] = useState<[number, number]>([-1, -1]);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);
  const prevNonceRef = useRef<number>(nonce ?? 0);

  useEffect(() => {
    const nonceChanged = (nonce ?? 0) !== prevNonceRef.current;
    prevNonceRef.current = nonce ?? 0;

    if (isFirstRender.current) {
      isFirstRender.current = false;
      setSlots(prev => {
        const next: [SlotData, SlotData] = [prev[0], prev[1]];
        next[currentSlot.current] = { blocks: visibleBlocks, shapes: visibleShapes, layerOrder };
        return next;
      });
      return;
    }

    // In-place update (no crossfade) when: transitions disabled, entrance=none, or only content changed (not a slide navigation)
    if (fadeMsRef.current === 0 || textEntrance === "none" || !nonceChanged) {
      setSlots(prev => {
        const next: [SlotData, SlotData] = [prev[0], prev[1]];
        next[currentSlot.current] = { blocks: visibleBlocks, shapes: visibleShapes, layerOrder };
        return next;
      });
      return;
    }

    const nextSlot = (1 - currentSlot.current) as 0 | 1;
    currentSlot.current = nextSlot;
    setSlots(prev => { const next: [SlotData, SlotData] = [prev[0], prev[1]]; next[nextSlot] = { blocks: visibleBlocks, shapes: visibleShapes, layerOrder }; return next; });
    setActiveSlot(nextSlot);
    setSlotAnimKeys(prev => { const next: [number, number] = [prev[0], prev[1]]; next[nextSlot]++; return next; });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);

  // ── Container scale ──────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.offsetWidth / OUTPUT_W, el.offsetHeight / OUTPUT_H));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasTransformEntrance =
    textEntrance === "slide-up" ||
    textEntrance === "slide-down" ||
    textEntrance === "zoom-in";

  const intensity = textEntranceIntensity ?? 50;
  const enterDist = `${Math.round(4 + intensity * 0.8)}px`;
  const enterScale = `${(1 - (intensity / 100) * 0.6).toFixed(3)}`;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 40, transform: "translateZ(0)", pointerEvents: "none" }}
    >
      {([0, 1] as const).map((idx) => (
        <div
          key={idx}
          style={{
            position: "absolute", inset: 0,
            opacity: activeSlot === idx ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
            pointerEvents: "none",
          }}
        >
          <div
            key={slotAnimKeys[idx]}
            style={{
              position: "absolute", inset: 0,
              ...({ "--enter-dist": enterDist, "--enter-scale": enterScale } as React.CSSProperties),
              animation:
                hasTransformEntrance && FADE_MS > 0 && slotAnimKeys[idx] >= 0
                  ? `enter-${textEntrance} ${FADE_MS}ms ease forwards`
                  : undefined,
            }}
          >
            {(() => {
              const slot = slots[idx];
              const blocksById = Object.fromEntries(slot.blocks.map(b => [b.id, b]));
              const shapesById = Object.fromEntries(slot.shapes.map(s => [s.id, s]));
              const knownIds = new Set([...slot.blocks.map(b => b.id), ...slot.shapes.map(s => s.id)]);
              // Use the current layerOrder prop directly so Z-order changes apply instantly
              const effectiveOrder: string[] = layerOrder
                ? [
                    ...slot.blocks.filter(b => !layerOrder.includes(b.id)).map(b => b.id),
                    ...slot.shapes.filter(s => !layerOrder.includes(s.id)).map(s => s.id),
                    ...layerOrder.filter(id => knownIds.has(id)),
                  ]
                : [...slot.blocks.map(b => b.id), ...slot.shapes.map(s => s.id)];

              return effectiveOrder.map((id, zOrd) => {
                const block = blocksById[id];
                if (block) return <SingleTextBlock key={id} block={block} scale={scale} zIdx={zOrd + 1} />;
                const shape = shapesById[id];
                if (shape) return <SingleShape key={id} shape={shape} scale={scale} zIdx={zOrd + 1} />;
                return null;
              });
            })()}
          </div>
        </div>
      ))}
    </div>
  );
}
