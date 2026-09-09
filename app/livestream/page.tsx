"use client";

import { useEffect, useRef, useState } from "react";
import { ipc } from "@/lib/ipc";
import BackgroundLayer from "@/components/layers/BackgroundLayer";
import SubtitleLayer from "@/components/layers/SubtitleLayer";
import type { LayerConfig } from "@/lib/types";
import { DEFAULT_LIVESTREAM_LAYER_CONFIG } from "@/lib/types";
import ErrorBoundary from "@/components/ErrorBoundary";

const CANVAS_W = 1920;
const CANVAS_H = 1080;

export default function LivestreamPage() {
  const [layerConfig, setLayerConfig] = useState<LayerConfig>(DEFAULT_LIVESTREAM_LAYER_CONFIG);
  const [windowSize, setWindowSize] = useState({ w: CANVAS_W, h: CANVAS_H });
  const unlistenRefs = useRef<Array<() => void>>([]);

  useEffect(() => {
    const update = () => setWindowSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      const unlistenSlide = await ipc.onLivestreamUpdate((config: LayerConfig) => {
        if (mounted) setLayerConfig(config);
      });
      if (!mounted) { unlistenSlide(); return; }
      unlistenRefs.current.push(unlistenSlide);

      ipc.sendOutputReady();
    }

    void setup();
    return () => {
      mounted = false;
      unlistenRefs.current.forEach((fn) => fn());
      unlistenRefs.current = [];
    };
  }, []);

  // Scale canvas to fill window (letterbox)
  const scaleX = windowSize.w / CANVAS_W;
  const scaleY = windowSize.h / CANVAS_H;
  const scale = Math.min(scaleX, scaleY);
  const offsetX = (windowSize.w - CANVAS_W * scale) / 2;
  const offsetY = (windowSize.h - CANVAS_H * scale) / 2;

  return (
    <ErrorBoundary>
      <div
        className="overflow-hidden"
        style={{ width: windowSize.w, height: windowSize.h, background: "transparent" }}
      >
        <div
          style={{
            position: "absolute",
            left: offsetX,
            top: offsetY,
            width: CANVAS_W,
            height: CANVAS_H,
            transformOrigin: "top left",
            transform: `scale(${scale})`,
          }}
        >
          <BackgroundLayer config={layerConfig.background} />
          <SubtitleLayer config={layerConfig.subtitle} transitionMs={layerConfig.transitionMs} copyright="" />
        </div>
      </div>
    </ErrorBoundary>
  );
}
