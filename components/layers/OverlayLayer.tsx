"use client";

import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";

interface Props {
  config: LayerConfig["overlay"];
}

export default function OverlayLayer({ config }: Props) {
  if (!config.visible || !config.src) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        zIndex: 30,
        left: config.x,
        top: config.y,
        width: config.width,
        height: config.height,
        opacity: config.opacity,
        transition: "opacity 200ms ease",
        willChange: "opacity",
        pointerEvents: "none",
      }}
    >
      <img
        src={toDisplayUrl(config.src)}
        alt="overlay"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </div>
  );
}
