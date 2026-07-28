"use client";

import { useRef, useEffect } from "react";
import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";
import { ipc, emitEvent } from "@/lib/ipc";

interface Props {
  config: LayerConfig["background"];
}

export default function BackgroundLayer({ config }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && config.type === "video" && config.src) {
      const video = videoRef.current;
      video.load();
      video.play().catch(() => {});
    }
  }, [config.src, config.type]);

  // video:control IPC 리스너
  useEffect(() => {
    if (config.type !== "video") return;
    const unlistenPromise = ipc.onVideoControl((payload) => {
      const vid = videoRef.current;
      if (!vid) return;
      switch (payload.action) {
        case "play": vid.play().catch(() => {}); break;
        case "pause": vid.pause(); break;
        case "seek": if (payload.value !== undefined) vid.currentTime = payload.value; break;
        case "volume": if (payload.value !== undefined) vid.volume = Math.max(0, Math.min(1, payload.value)); break;
        case "loop": vid.loop = payload.value === 1; break;
      }
    });
    return () => { unlistenPromise.then((fn) => fn()); };
  }, [config.type]);

  // playback:status 주기적 emit (500ms) — Controller의 진행 바에 사용
  useEffect(() => {
    if (config.type !== "video") return;
    const interval = setInterval(() => {
      const vid = videoRef.current;
      if (vid && vid.duration) {
        emitEvent("playback:status", {
          currentTime: vid.currentTime,
          duration: vid.duration,
          playing: !vid.paused,
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [config.type, config.src]);

  const baseStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    zIndex: 10,
    opacity: config.opacity,
    transition: "opacity 200ms ease",
    willChange: "opacity",
    transform: "translateZ(0)",
  };

  if (config.type === "color") {
    return (
      <div
        style={{
          ...baseStyle,
          backgroundColor: config.color ?? "#000",
          transition: "background-color 300ms ease, opacity 200ms ease",
        }}
      />
    );
  }

  if (config.type === "image" && config.src) {
    const displayUrl = toDisplayUrl(config.src);
    return (
      <div
        style={{
          ...baseStyle,
          backgroundImage: `url(${displayUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      />
    );
  }

  if (config.type === "video" && config.src) {
    const displayUrl = toDisplayUrl(config.src);
    return (
      <video
        ref={videoRef}
        autoPlay
        loop={config.loop ?? true}
        muted
        playsInline
        src={displayUrl}
        style={{
          ...baseStyle,
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
    );
  }

  // Fallback: black
  return <div style={{ ...baseStyle, backgroundColor: "#000" }} />;
}
