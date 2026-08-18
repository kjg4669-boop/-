"use client";

import { useRef, useEffect, useState } from "react";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  blocks: TextBlock[];
  nonce?: number;
  /** 0 = instant (no fade); undefined = default 600ms */
  transitionMs?: number;
  textEntrance?: string;
  /** 0-100; slide: px distance, zoom: scale depth. Default 50. */
  textEntranceIntensity?: number;
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

export default function CanvasLayer({ blocks, nonce, transitionMs, textEntrance, textEntranceIntensity }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const FADE_MS = transitionMs === 0 ? 0 : (transitionMs ?? 600);
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  // ── Two-slot crossfade ────────────────────────────────────────────────
  // Include nonce so animation fires even when block content is identical across slides
  const blocksKey = `${nonce ?? 0}:${blocks.map(b => `${b.id}:${b.text}`).join("\0")}`;
  const [slots, setSlots] = useState<[TextBlock[], TextBlock[]]>([blocks, []]);
  const [activeSlot, setActiveSlot] = useState<0 | 1>(0);
  // slotAnimKeys: each element starts at -1 (no animation on initial render).
  // Incrementing a slot's key forces its inner div to remount → CSS @keyframes restarts.
  const [slotAnimKeys, setSlotAnimKeys] = useState<[number, number]>([-1, -1]);
  const currentSlot = useRef<0 | 1>(0);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // 첫 변경은 애니메이션 없이 현재 슬롯 내용만 업데이트
      setSlots(prev => {
        const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]];
        next[currentSlot.current] = blocks;
        return next;
      });
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

    // All three setState calls are batched into one React commit:
    //   - outer slot div: opacity CSS transition fires (0 → 1)
    //   - inner div: remounts (slotAnimKeys[nextSlot] incremented) → @keyframes starts from "from"
    setSlots(prev => { const next: [TextBlock[], TextBlock[]] = [prev[0], prev[1]]; next[nextSlot] = blocks; return next; });
    setActiveSlot(nextSlot);
    setSlotAnimKeys(prev => { const next: [number, number] = [prev[0], prev[1]]; next[nextSlot]++; return next; });
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
        // Outer div: stable key, handles opacity crossfade via CSS transition
        <div
          key={idx}
          style={{
            position: "absolute",
            inset: 0,
            opacity: activeSlot === idx ? 1 : 0,
            transition: `opacity ${FADE_MS}ms ease`,
            pointerEvents: "none",
          }}
        >
          {/* Inner div: key changes when slot activates → remount → CSS @keyframes restarts.
              Outer handles opacity; this handles transform animation (no opacity in keyframes). */}
          <div
            key={slotAnimKeys[idx]}
            style={{
              position: "absolute",
              inset: 0,
              ...({ "--enter-dist": enterDist, "--enter-scale": enterScale } as React.CSSProperties),
              animation:
                hasTransformEntrance && FADE_MS > 0 && slotAnimKeys[idx] >= 0
                  ? `enter-${textEntrance} ${FADE_MS}ms ease forwards`
                  : undefined,
            }}
          >
            <BlockList blocks={slots[idx]} scale={scale} />
          </div>
        </div>
      ))}
    </div>
  );
}
