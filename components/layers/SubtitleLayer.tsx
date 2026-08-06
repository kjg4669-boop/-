"use client";

import { useState, useEffect, useRef } from "react";
import type { LayerConfig } from "@/lib/types";
import { ipc } from "@/lib/ipc";

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
  const activeLines2Key = (config.lines2 ?? []).join("\0");

  const [displayedLines, setDisplayedLines] = useState(activeLines);
  const [displayedLines2, setDisplayedLines2] = useState(config.lines2 ?? []);
  const [faded, setFaded] = useState(activeLines.length === 0);
  const [slideY, setSlideY] = useState(0);
  const [scale, setScale] = useState(1);
  const [copyright, setCopyright] = useState("");
  const isFirstRender = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingLinesRef = useRef(activeLines);
  const pendingLines2Ref = useRef(config.lines2 ?? []);
  const rafSeqRef = useRef(0);

  // Listen for meta.copyright from slide:update IPC events
  useEffect(() => {
    let mounted = true;
    const unlistenPromise = ipc.onSlideUpdateWithMeta((_config, meta) => {
      if (!mounted) return;
      setCopyright(meta?.copyright ?? "");
    });
    return () => {
      mounted = false;
      void unlistenPromise.then((fn) => fn());
    };
  }, []);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
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

    // Step 2: after fade-out, swap to new content and fade in (if any)
    const seq = ++rafSeqRef.current;
    timerRef.current = setTimeout(() => {
      const lines = pendingLinesRef.current;
      setDisplayedLines(lines);
      setDisplayedLines2(pendingLines2Ref.current);
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
  }, [activeLinesKey, activeLines2Key]); // eslint-disable-line react-hooks/exhaustive-deps

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
          {(config.showCopyright !== false) && copyright && (
            <p
              style={{
                margin: "8px 0 0",
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
      )}
    </div>
  );
}
