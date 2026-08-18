interface AlertBannerProps {
  text: string;
  position: "top" | "center" | "bottom";
  bgColor: string;
  textColor: string;
}

/** Full-width alert banner overlay rendered on output and stage windows. */
export default function AlertBanner({ text, position, bgColor, textColor }: AlertBannerProps) {
  const posStyle =
    position === "top"
      ? { top: 0, left: 0, right: 0 }
      : position === "center"
      ? { top: "50%" as const, left: 0, right: 0, transform: "translateY(-50%)" }
      : { bottom: 0, left: 0, right: 0 };

  const borderStyle =
    position === "bottom"
      ? { borderTop: "3px solid #f97316" }
      : position === "top"
      ? { borderBottom: "3px solid #f97316" }
      : {};

  return (
    <div
      style={{
        position: "absolute",
        ...posStyle,
        ...borderStyle,
        zIndex: 60,
        background: bgColor,
        color: textColor,
        padding: "18px 40px",
        textAlign: "center",
        fontSize: 42,
        fontWeight: 600,
        letterSpacing: "0.01em",
        pointerEvents: "none",
      }}
    >
      {text}
    </div>
  );
}
