"use client";

import { useRef, useEffect, useState } from "react";
import type { TextBlock } from "@/lib/types";

const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

interface Props {
  blocks: TextBlock[];
}

export default function CanvasLayer({ blocks }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

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

  if (!blocks || blocks.length === 0) return null;

  return (
    <div
      ref={containerRef}
      style={{ position: "absolute", inset: 0, zIndex: 40, pointerEvents: "none" }}
    >
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
              alignItems: "center",
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
    </div>
  );
}
