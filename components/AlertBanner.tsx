import type { CSSProperties } from "react";

interface AlertBannerProps {
  text: string;
  position: "top" | "center" | "bottom";
  bgColor: string;
  textColor: string;
  /** Overrides position: vertical center position as % of container height (0=top, 100=bottom). */
  yPercent?: number;
  /** Explicit font size in rendered pixels. When set, overrides scale-based default. */
  fontSize?: number;
  /** Scale factor applied to the default 42px font size (used when fontSize not set). */
  scale?: number;
}

/** Full-width alert banner overlay rendered on output and stage windows. */
export default function AlertBanner({ text, position, bgColor, textColor, yPercent, fontSize, scale = 1 }: AlertBannerProps) {
  const resolvedFontSize = fontSize ?? 42 * scale;
  const padding = `${resolvedFontSize * 0.43}px ${resolvedFontSize * 0.95}px`;

  const posStyle: CSSProperties =
    yPercent !== undefined
      ? { top: `${yPercent}%`, left: 0, right: 0, transform: "translateY(-50%)" }
      : position === "top"
      ? { top: 0, left: 0, right: 0 }
      : position === "center"
      ? { top: "50%", left: 0, right: 0, transform: "translateY(-50%)" }
      : { bottom: 0, left: 0, right: 0 };

  const borderStyle: CSSProperties =
    yPercent !== undefined
      ? yPercent < 30
        ? { borderBottom: "3px solid #f97316" }
        : yPercent > 70
        ? { borderTop: "3px solid #f97316" }
        : { borderTop: "3px solid #f97316", borderBottom: "3px solid #f97316" }
      : position === "bottom"
      ? { borderTop: "3px solid #f97316" }
      : position === "top"
      ? { borderBottom: "3px solid #f97316" }
      : { borderTop: "3px solid #f97316", borderBottom: "3px solid #f97316" };

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        ...borderStyle,
        zIndex: 60,
        background: bgColor,
        color: textColor,
        padding,
        textAlign: "center",
        fontSize: resolvedFontSize,
        fontWeight: 600,
        letterSpacing: "0.01em",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
