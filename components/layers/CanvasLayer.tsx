"use client";

import { useRef, useEffect, useState } from "react";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  blocks: TextBlock[];
  /** 0 = instant (no fade); undefined = default 600ms */
  transitionMs?: number;
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

export default function CanvasLayer({ blocks, transitionMs }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const FADE_MS = transitionMs === 0 ? 0 : (transitionMs ?? 600);
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  // ── Two-slot crossfade (same ping-pong pattern as SubtitleLayer) ────────
  const blocksKey = blocks.map(b => `${b.id}:${b.text}`).join("\0");
  const [slots, setSlots] = useState<[TextBlock[], TextBlock[]]>([blocks, []]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    if (fadeMsRef.current === 0) {
      // Instant swap: update active slot in place (no crossfade)
      setSlots(prev => {
        const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]];
        next[currentSlot.current] = blocks;
        return next;
      });
      return;
    }
    // Write new content into inactive slot, then flip activeSlot
    const nextSlot = (1 - currentSlot.current) as 0 | 1;
    currentSlot.current = nextSlot;
    setSlots(prev => {
      const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]];
      next[nextSlot] = blocks;
      return next;
    });
    setActiveSlot(nextSlot);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocksKey]);

  // ── Container scale (fills output canvas) ──────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      setScale(Math.min(el.offsetWidth / OUTPUT_W, el.offsetHeight / OUTPUT_H));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none" }}
    >
      {/* Slot 0 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: activeSlot === 0 ? 1 : 0,
          transition: `opacity ${fadeMsRef.current}ms ease`,
          pointerEvents: "none",
        }}
      >
        <BlockList blocks={slots[0]} scale={scale} />
      </div>
      {/* Slot 1 */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: activeSlot === 1 ? 1 : 0,
          transition: `opacity ${fadeMsRef.current}ms ease`,
          pointerEvents: "none",
        }}
      >
        <BlockList blocks={slots[1]} scale={scale} />
      </div>
    </div>
  );
}
