"use client";

import type { TextBlock } from "@/lib/types";

interface Props {
  blocks: TextBlock[];
}

export default function CanvasLayer({ blocks }: Props) {
  if (!blocks || blocks.length === 0) return null;

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 25,
        pointerEvents: "none",
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
            fontSize: block.fontSize,
            color: block.color,
            fontFamily: block.fontFamily,
            WebkitTextStroke: "2px rgba(0,0,0,0.8)",
            paintOrder: "stroke fill",
            filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))",
            lineHeight: 1.3,
            whiteSpace: "pre-wrap",
            wordBreak: "keep-all",
          }}
        >
          {block.text}
        </div>
      ))}
    </div>
  );
}
