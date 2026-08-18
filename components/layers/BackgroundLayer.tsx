"use client";

import { useRef, useEffect } from "react";
import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";
import { ipc, emitEvent } from "@/lib/ipc";

interface Props {
  config: LayerConfig["background"];
  skipPlaybackEmit?: boolean;
  /** When true, keep video paused (e.g. preview window during standby) */
  paused?: boolean;
}

export default function BackgroundLayer({ config, skipPlaybackEmit, paused }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // Load and play when src changes (skip play if paused prop is set)
  useEffect(() => {
    if (videoRef.current && config.type === "video" && config.src) {
      const video = videoRef.current;
      video.load();
      if (!pausedRef.current) {
        video.play().then(() => { video.muted = false; }).catch(() => {});
      }
    }
  }, [config.src, config.type]);

  // Pause/resume when paused prop changes
  useEffect(() => {
    if (config.type !== "video") return;
    const vid = videoRef.current;
    if (!vid) return;
    if (paused) vid.pause();
    else vid.play().then(() => { vid.muted = false; }).catch(() => {});
  }, [paused, config.type]);

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
        case "volume": if (payload.value !== undefined) { vid.volume = Math.max(0, Math.min(1, payload.value)); vid.muted = payload.value === 0; } break;
        case "loop": vid.loop = payload.value === 1; break;
      }
    });
    return () => { void unlistenPromise.then((fn) => fn()); };
  }, [config.type]);

  // playback:status 주기적 emit (500ms) — Controller의 진행 바에 사용
  useEffect(() => {
    if (config.type !== "video" || skipPlaybackEmit) return;
    const interval = setInterval(() => {
      const vid = videoRef.current;
      if (vid && vid.duration) {
        void emitEvent("playback:status", {
          currentTime: vid.currentTime,
          duration: vid.duration,
          playing: !vid.paused,
        });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [config.type, config.src, skipPlaybackEmit]);

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
    // Wrap video in a div: WebKit/WKWebView <video> elements can escape their stacking context
    // and render above sibling layers regardless of z-index. Containing the video inside a
    // positioned div forces it to respect the parent's stacking order.
    return (
      <div style={{ ...baseStyle, overflow: "hidden" }}>
        <video
          ref={videoRef}
          autoPlay
          loop={config.loop ?? true}
          muted
          playsInline
          src={displayUrl}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          onCanPlay={(e) => {
            // Honour paused prop immediately when video is ready to play
            if (pausedRef.current) (e.target as HTMLVideoElement).pause();
          }}
        />
      </div>
    );
  }

  // Fallback: black
  return <div style={{ ...baseStyle, backgroundColor: "#000" }} />;
}
