"use client";

import { useState, useEffect, useRef } from "react";
import type { LayerConfig } from "@/lib/types";

const positionMap = {
  top: "flex-start",
  center: "center",
  bottom: "flex-end",
} as const;

const alignItemsMap = {
  left: "flex-start" as const,
  center: "center" as const,
  right: "flex-end" as const,
};

interface Props {
  config: LayerConfig["subtitle"];
  transitionMs?: number;
}

export default function SubtitleLayer({ config, transitionMs: transitionMsProp }: Props) {
  const FADE_MS = transitionMsProp ?? 250;
  // Use a ref so the effect closure always reads the latest FADE_MS without re-running on every change
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  const activeLines = config.visible && config.lines.length > 0 ? config.lines : [];
  const activeLinesKey = activeLines.join("\0");

  const [displayedLines, setDisplayedLines] = useState(activeLines);
  const [faded, setFaded] = useState(activeLines.length === 0);
  const [slideY, setSlideY] = useState(0);
  const [scale, setScale] = useState(1);
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLinesRef = useRef(activeLines);
  const rafSeqRef = useRef(0);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    pendingLinesRef.current = activeLines;
    if (timerRef.current) clearTimeout(timerRef.current);

    // "none" entrance: instant swap with no fade delay
    if (config.textEntrance === "none") {
      setDisplayedLines(activeLines);
      setFaded(activeLines.length === 0);
      return;
    }

    // Step 1: fade out current content
    setFaded(true);

    // Step 2: after fade-out, swap to new content and fade in (if any)
    const seq = ++rafSeqRef.current;
    timerRef.current = setTimeout(() => {
      const lines = pendingLinesRef.current;
      setDisplayedLines(lines);
      if (lines.length > 0) {
        if (config.textEntrance === "slide-up") {
          setSlideY(15);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (rafSeqRef.current !== seq) return;
            setFaded(false);
            requestAnimationFrame(() => { if (rafSeqRef.current === seq) setSlideY(0); });
          }));
        } else if (config.textEntrance === "slide-down") {
          setSlideY(-15);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (rafSeqRef.current !== seq) return;
            setFaded(false);
            requestAnimationFrame(() => { if (rafSeqRef.current === seq) setSlideY(0); });
          }));
        } else if (config.textEntrance === "zoom-in") {
          setScale(0.9);
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (rafSeqRef.current !== seq) return;
            setFaded(false);
            requestAnimationFrame(() => { if (rafSeqRef.current === seq) setScale(1); });
          }));
        } else {
          requestAnimationFrame(() => requestAnimationFrame(() => {
            if (rafSeqRef.current === seq) setFaded(false);
          }));
        }
      }
    }, fadeMsRef.current);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLinesKey]);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: alignItemsMap[config.textAlign ?? "center"],
        justifyContent: positionMap[config.position],
        padding: "48px 64px",
        opacity: faded ? 0 : config.opacity,
        transform: (() => {
          const parts: string[] = [];
          if (config.textEntrance === "slide-up" || config.textEntrance === "slide-down") parts.push(`translateY(${slideY}px)`);
          if (config.textEntrance === "zoom-in") parts.push(`scale(${scale})`);
          return parts.length > 0 ? parts.join(" ") : undefined;
        })(),
        transition: `opacity ${FADE_MS}ms ease${
          config.textEntrance === "slide-up" || config.textEntrance === "slide-down" || config.textEntrance === "zoom-in"
            ? `, transform ${FADE_MS}ms ease` : ""
        }`,
        willChange: "opacity, transform",
        pointerEvents: "none",
      }}
    >
      {displayedLines.length > 0 && (
        <div
          style={{
            textAlign: config.textAlign ?? "center",
            ...(config.backgroundBoxVisible
              ? {
                  backgroundColor: `rgba(0,0,0,${config.backgroundBoxOpacity})`,
                  borderRadius: 4,
                  padding: "8px 24px",
                }
              : {}),
          }}
        >
          {displayedLines.map((line, i) => (
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
                fontWeight: config.fontWeight ?? "normal",
                fontStyle: config.fontStyle ?? "normal",
                lineHeight: 1.3,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
              }}
            >
              {line}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
