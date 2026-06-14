"use client";

import { useRef, useEffect, useState } from "react";
import { useOutputStore } from "@/stores/outputStore";
import { useQueueStore } from "@/stores/queueStore";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import OverlayLayer from "@/components/layers/OverlayLayer";
import CanvasLayer from "@/components/layers/CanvasLayer";

// Virtual output resolution
const OUTPUT_W = 1920;
const OUTPUT_H = 1080;

export default function PreviewPanel() {
  const { layerConfig, isBlackout } = useOutputStore();
  const { getActiveLyricSlide, getActiveSong, activeLyricSlideIndex, getTotalLyricSlides } = useQueueStore();
  const slide = getActiveLyricSlide();
  const song = getActiveSong();
  const total = getTotalLyricSlides();

  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(640 / OUTPUT_W);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setScale(el.offsetWidth / OUTPUT_W);
    });
    observer.observe(el);
    setScale(el.offsetWidth / OUTPUT_W);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex flex-col items-center gap-3 w-full max-w-2xl">
      {/* Preview screen — pixel-accurate scaled render */}
      <div
        ref={containerRef}
        className="relative rounded-lg overflow-hidden border border-zinc-600 w-full"
        style={{ aspectRatio: "16/9", maxWidth: 640 }}
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
            pointerEvents: "none",
          }}
        >
          <BackgroundLayer config={layerConfig.background} />
          <SubtitleLayer config={layerConfig.subtitle} />
          <OverlayLayer config={layerConfig.overlay} />
          <CanvasLayer blocks={layerConfig.canvas?.textBlocks ?? []} />
          {isBlackout && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                backgroundColor: "#000",
                zIndex: 100,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span style={{ color: "#f87171", fontSize: 48, fontWeight: "bold" }}>BLACKOUT</span>
            </div>
          )}
        </div>
      </div>

      {/* Song info */}
      {song && (
        <div className="text-center">
          <div className="text-sm font-medium">{song.title}</div>
          {song.artist && <div className="text-xs text-zinc-400">{song.artist}</div>}
          <div className="text-xs text-zinc-500 mt-1">
            슬라이드 {activeLyricSlideIndex + 1} / {total}
          </div>
        </div>
      )}

      {/* Slide content */}
      {slide && (
        <div className="text-center text-sm text-zinc-300 bg-zinc-800 rounded p-3 w-full max-w-md">
          {slide.lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  );
}
