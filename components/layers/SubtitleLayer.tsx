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
  copyright?: string;
}

export default function SubtitleLayer({ config, transitionMs: transitionMsProp, copyright = "" }: Props) {
  const FADE_MS = (transitionMsProp != null && transitionMsProp > 0) ? transitionMsProp : 600;
  // Use a ref so the effect closure always reads the latest FADE_MS without re-running on every change
  const fadeMsRef = useRef(FADE_MS);
  fadeMsRef.current = FADE_MS;

  const activeLines = config.visible && config.lines.length > 0 ? config.lines : [];
  // Include nonce so animation triggers even when lyrics repeat (same content, different slide)
  const activeLinesKey = `${config.nonce ?? 0}:${activeLines.join("\0")}`;
  const activeLines2Key = (config.lines2 ?? []).join("\0");

  const [displayedLines, setDisplayedLines] = useState(activeLines);
  const [displayedLines2, setDisplayedLines2] = useState(config.lines2 ?? []);
  const [faded, setFaded] = useState(activeLines.length === 0);
  // animKey: incrementing this forces the inner content div to remount,
  // which restarts the CSS @keyframes animation from its "from" state.
  const [animKey, setAnimKey] = useState(0);
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLinesRef = useRef(activeLines);
  const pendingLines2Ref = useRef(config.lines2 ?? []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      // Show current content immediately without animation
      setDisplayedLines(activeLines);
      setDisplayedLines2(config.lines2 ?? []);
      setFaded(activeLines.length === 0);
      return;
    }

    pendingLinesRef.current = activeLines;
    pendingLines2Ref.current = config.lines2 ?? [];
    if (timerRef.current) clearTimeout(timerRef.current);

    // "none" entrance: instant swap with no fade delay
    if (config.textEntrance === "none") {
      setDisplayedLines(activeLines);
      setDisplayedLines2(pendingLines2Ref.current);
      setFaded(activeLines.length === 0);
      return;
    }

    // Step 1: fade out current content
    setFaded(true);

    // Step 2: after fade-out, swap content and trigger CSS animation.
    // All setState calls are in one batch → one React commit:
    //   - outer div: opacity CSS transition fires (0 → config.opacity)
    //   - inner div: remounts (animKey changed) → @keyframes animation starts from "from" state
    // Both run simultaneously for FADE_MS duration.
    timerRef.current = setTimeout(() => {
      const lines = pendingLinesRef.current;
      const lines2 = pendingLines2Ref.current;
      if (lines.length > 0) {
        setDisplayedLines(lines);
        setDisplayedLines2(lines2);
        setAnimKey(k => k + 1);
        setFaded(false);
      }
      // lines.length === 0: keep faded=true (text stays hidden)
    }, fadeMsRef.current);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLinesKey, activeLines2Key]);

  const hasTransformEntrance =
    config.textEntrance === "slide-up" ||
    config.textEntrance === "slide-down" ||
    config.textEntrance === "zoom-in";

  // Intensity → CSS custom property values
  const intensity = config.textEntranceIntensity ?? 50;
  const enterDist = `${Math.round(4 + intensity * 0.8)}px`; // 0→4px, 50→44px, 100→84px
  const enterScale = `${(1 - (intensity / 100) * 0.6).toFixed(3)}`; // 0→1.0, 50→0.700, 100→0.400

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        left: config.layout === "right-half" ? "50%" : 0,
        right: config.layout === "left-half" ? "50%" : 0,
        zIndex: 20,
        display: "flex",
        flexDirection: "column",
        alignItems: alignItemsMap[config.textAlign ?? "center"],
        justifyContent: positionMap[config.position],
        padding: `48px ${config.layout === "left-half" || config.layout === "right-half" ? "32px" : "64px"}`,
        opacity: faded ? 0 : config.opacity,
        transition: `opacity ${FADE_MS}ms ease`,
        willChange: "opacity",
        transform: "translateZ(0)",
        pointerEvents: "none",
      }}
    >
      {displayedLines.length > 0 && (
        // key={animKey} forces remount on each slide → CSS @keyframes replays from its "from" state.
        // The outer div handles opacity (CSS transition); this div handles transform (CSS animation).
        <div
          key={animKey}
          style={{
            textAlign: config.textAlign ?? "center",
            ...({ "--enter-dist": enterDist, "--enter-scale": enterScale } as React.CSSProperties),
            animation:
              hasTransformEntrance && FADE_MS > 0
                ? `enter-${config.textEntrance} ${FADE_MS}ms ease forwards`
                : undefined,
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
                lineHeight: config.lineHeight ?? 1.3,
                letterSpacing: `${config.letterSpacing ?? 0}px`,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
              }}
            >
              {line}
            </p>
          ))}
          {config.bilingualEnabled && displayedLines2.length > 0 && displayedLines2.map((line2, i) => (
            <p
              key={`l2-${i}`}
              style={{
                margin: "2px 0",
                fontSize: `${config.fontSize2 ?? 28}px`,
                fontFamily: config.fontFamily,
                color: config.color2 ?? "#cccccc",
                fontWeight: config.fontWeight2 ?? "normal",
                fontStyle: config.fontStyle2 ?? "italic",
                lineHeight: config.lineHeight ?? 1.3,
                letterSpacing: `${config.letterSpacing ?? 0}px`,
                whiteSpace: "pre-wrap",
                wordBreak: "keep-all",
              }}
            >
              {line2}
            </p>
          ))}
        </div>
      )}
      {/* Copyright: absolutely positioned at bottom so it doesn't shift lyrics above true center */}
      {displayedLines.length > 0 && (config.showCopyright !== false) && copyright && (
        <p
          style={{
            position: "absolute",
            bottom: 48,
            left: config.layout === "left-half" || config.layout === "right-half" ? 32 : 64,
            right: config.layout === "left-half" || config.layout === "right-half" ? 32 : 64,
            margin: 0,
            fontSize: `${Math.max(14, Math.round(config.fontSize * 0.35))}px`,
            fontFamily: config.fontFamily,
            color: config.color,
            opacity: 0.7,
            textAlign: "center",
            fontWeight: "normal",
            fontStyle: "normal",
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
            wordBreak: "keep-all",
            WebkitTextStroke: "0px transparent",
          }}
        >
          {copyright}
        </p>
      )}
    </div>
  );
}
