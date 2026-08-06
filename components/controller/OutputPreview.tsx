"use client";

import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";

interface Props {
  layerConfig: LayerConfig;
  isBlackout: boolean;
}

// Preview is rendered at 232×130 (≈16:9, fits w-64 sidebar)
const PREVIEW_W = 232;
const PREVIEW_H = 130;
const NATIVE_W = 1920;
const SCALE = PREVIEW_W / NATIVE_W;

export default function OutputPreview({ layerConfig, isBlackout }: Props) {
  const bg = layerConfig.background;
  const sub = layerConfig.subtitle;

  // Background style
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
  const textJustify: Record<string, string> = { left: "flex-start", center: "center", right: "flex-end" };

  const showSubtitle = !isBlackout && sub.visible && sub.lines.length > 0;
  const scaledFontSize = Math.max(6, sub.fontSize * SCALE);

  return (
    <div
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
      className="relative overflow-hidden rounded bg-black border border-zinc-600 flex-shrink-0"
    >
      {/* Background */}
      {bg.type !== "video" && <div className="absolute inset-0" style={bgStyle} />}
      {bg.type === "video" && (
        <div className="absolute inset-0 bg-zinc-900 flex items-center justify-center">
          <span className="text-zinc-600 text-xs">▶ 영상</span>
        </div>
      )}

      {/* Blackout */}
      {isBlackout && <div className="absolute inset-0 bg-black" />}

      {/* Subtitle */}
      {showSubtitle && (
        <div
          className="absolute inset-0 flex flex-col px-1 py-1"
          style={{
            justifyContent: positionJustify[sub.position] ?? "flex-end",
            alignItems: textJustify[sub.textAlign ?? "center"] ?? "center",
            opacity: sub.opacity,
          }}
        >
          <div
            style={{
              ...(sub.backgroundBoxVisible
                ? { backgroundColor: `rgba(0,0,0,${sub.backgroundBoxOpacity})`, padding: "1px 3px", borderRadius: 2 }
                : {}),
            }}
          >
            {sub.lines.map((line, i) => (
              <div
                key={i}
                style={{
                  fontFamily: sub.fontFamily,
                  fontSize: scaledFontSize,
                  fontWeight: sub.fontWeight ?? "normal",
                  fontStyle: sub.fontStyle ?? "normal",
                  color: sub.color,
                  textAlign: sub.textAlign ?? "center",
                  WebkitTextStroke: sub.strokeWidth > 0 ? `${sub.strokeWidth * SCALE}px ${sub.strokeColor}` : undefined,
                  textShadow: sub.shadowEnabled ? "0 1px 2px #000" : undefined,
                  lineHeight: 1.25,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: PREVIEW_W - 8,
                }}
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Label */}
      <div className="absolute bottom-0.5 right-1 text-xs text-zinc-600 pointer-events-none">미리보기</div>
    </div>
  );
}
