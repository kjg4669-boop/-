"use client";

import { useRef, useEffect, useState } from "react";
import { flushSync } from "react-dom";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  blocks: TextBlock[];
  nonce?: number;
  /** 0 = instant (no fade); undefined = default 600ms */
  transitionMs?: number;
  textEntrance?: string;
}

function BlockList({ blocks, scale }: { blocks: TextBlock[]; scale: number }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: OUTPUT_W,
        height: OUTPUT_H,
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
    >
      {blocks.map((block) => (
        <div
          key={block.id}
          style={{
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
          }}
        >
          {block.text}
        </div>
      ))}
    </div>
  );
}

export default function CanvasLayer({ blocks, nonce, transitionMs, textEntrance }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const FADE_MS = transitionMs === 0 ? 0 : (transitionMs ?? 600);
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  // ── Two-slot crossfade with optional transform entrance ─────────────
  // Include nonce so animation fires even when block content is identical across slides
  const blocksKey = `${nonce ?? 0}:${blocks.map(b => `${b.id}:${b.text}`).join("\0")}`;
  const [slots, setSlots] = useState<[TextBlock[], TextBlock[]]>([blocks, []]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const [slotTransforms, setSlotTransforms] = useState<[string | undefined, string | undefined]>([undefined, undefined]);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    // Instant swap
    if (fadeMsRef.current === 0 || textEntrance === "none") {
      setSlots(prev => {
        const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]];
        next[currentSlot.current] = blocks;
        return next;
      });
      return;
    }

    const nextSlot = (1 - currentSlot.current) as 0 | 1;
    currentSlot.current = nextSlot;

    if (textEntrance === "slide-up") {
      // Paint new content at bottom (opacity:0) first, then animate up + fade in
      flushSync(() => {
        setSlots(prev => { const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]]; next[nextSlot] = blocks; return next; });
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = "translateY(40px)"; return next; });
      });
      requestAnimationFrame(() => {
        setActiveSlot(nextSlot);
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = undefined; return next; });
      });
    } else if (textEntrance === "slide-down") {
      flushSync(() => {
        setSlots(prev => { const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]]; next[nextSlot] = blocks; return next; });
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = "translateY(-40px)"; return next; });
      });
      requestAnimationFrame(() => {
        setActiveSlot(nextSlot);
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = undefined; return next; });
      });
    } else if (textEntrance === "zoom-in") {
      flushSync(() => {
        setSlots(prev => { const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]]; next[nextSlot] = blocks; return next; });
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = "scale(0.82)"; return next; });
      });
      requestAnimationFrame(() => {
        setActiveSlot(nextSlot);
        setSlotTransforms(prev => { const next: [string | undefined, string | undefined] = [prev[0], prev[1]]; next[nextSlot] = undefined; return next; });
      });
    } else {
      // fade: two-slot ping-pong (no transform needed)
      setSlots(prev => { const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]]; next[nextSlot] = blocks; return next; });
      setActiveSlot(nextSlot);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);

  // ── Container scale (fills output canvas) ──────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setScale(Math.min(el.offsetWidth / OUTPUT_W, el.offsetHeight / OUTPUT_H));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const hasTransformEntrance = textEntrance === "slide-up" || textEntrance === "slide-down" || textEntrance === "zoom-in";
  const transitionStr = `opacity ${FADE_MS}ms ease${hasTransformEntrance ? `, transform ${FADE_MS}ms ease` : ""}`;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none" }}
    >
      {([0, 1] as const).map((idx) => (
        <div
          key={idx}
          style={{
            position: "absolute",
            inset: 0,
            opacity: activeSlot === idx ? 1 : 0,
            transform: slotTransforms[idx],
            transition: transitionStr,
            pointerEvents: "none",
          }}
        >
          <BlockList blocks={slots[idx]} scale={scale} />
        </div>
      ))}
    </div>
  );
}
