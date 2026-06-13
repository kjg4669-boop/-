"use client";

import type { LayerConfig } from "@/lib/types";

interface Props {
  config: LayerConfig["subtitle"];
}

const positionMap = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
} as const;

export default function SubtitleLayer({ config }: Props) {
  if (!config.visible || config.lines.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: positionMap[config.position],
        padding: "48px 64px",
        opacity: config.opacity,
        transition: "opacity 200ms ease",
        willChange: "opacity",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          textAlign: "center",
          ...(config.backgroundBoxVisible
            ? {
                backgroundColor: `rgba(0,0,0,${config.backgroundBoxOpacity})`,
                borderRadius: 4,
                padding: "8px 24px",
              }
            : {}),
        }}
      >
        {config.lines.map((line, i) => (
          <p
            key={i}
            style={{
              margin: "4px 0",
              fontSize: `${config.fontSize}px`,
              fontFamily: config.fontFamily,
              color: config.color,
              WebkitTextStroke: `${config.strokeWidth}px ${config.strokeColor}`,
              paintOrder: "stroke fill",
              filter: config.shadowEnabled
                ? `drop-shadow(0 2px 8px ${config.strokeColor}80)`
                : undefined,
              lineHeight: 1.3,
              whiteSpace: "pre-wrap",
              wordBreak: "keep-all",
            }}
          >
            {line}
          </p>
        ))}
      </div>
    </div>
  );
}
