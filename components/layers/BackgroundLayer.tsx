"use client";

import { useRef, useEffect, useState } from "react";
import type { LayerConfig } from "@/lib/types";
import { toDisplayUrl } from "@/lib/media";
import { ipc, emitEvent } from "@/lib/ipc";

interface Props {
  config: LayerConfig["background"];
  skipPlaybackEmit?: boolean;
  /** When true, keep video paused (e.g. preview window during standby) */
  paused?: boolean;
  /** CSS objectFit for video/camera background (default: "cover") */
  videoFit?: "cover" | "contain";
  /** Horizontally flip camera output */
  cameraMirror?: boolean;
}

const VIDEO_CROSSFADE_MS = 600;

export default function BackgroundLayer({ config, skipPlaybackEmit, paused, videoFit = "cover", cameraMirror = false }: Props) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  // ── Two-slot video crossfade ──────────────────────────────────────────────
  // When the video src changes (e.g. switching songs), crossfade between
  // the old and new video instead of cutting instantly.
  const videoRef0 = useRef<HTMLVideoElement>(null);
  const videoRef1 = useRef<HTMLVideoElement>(null);

  const [videoSlots, setVideoSlots] = useState<[string | null, string | null]>(() => {
    const url = config.type === "video" && config.src ? (toDisplayUrl(config.src) ?? null) : null;
    return [url, null];
  });
  const [activeVideoSlot, setActiveVideoSlot] = useState<0 | 1>(0);
  const currentVideoSlot = useRef<0 | 1>(0);
  const isFirstVideoRender = useRef(true);

  // Crossfade when video src changes
  useEffect(() => {
    if (config.type !== "video") return;
    const url = config.src ? toDisplayUrl(config.src) : null;
    if (!url) return;

    if (isFirstVideoRender.current) {
      isFirstVideoRender.current = false;
      // First change: update slot without animation
      setVideoSlots(prev => {
        const next: [string | null, string | null] = [prev[0], prev[1]];
        next[currentVideoSlot.current] = url;
        return next;
      });
      return;
    }

    const nextSlot = (1 - currentVideoSlot.current) as 0 | 1;
    currentVideoSlot.current = nextSlot;

    setVideoSlots(prev => {
      const next: [string | null, string | null] = [prev[0], prev[1]];
      next[nextSlot] = url;
      return next;
    });
    setActiveVideoSlot(nextSlot);

    // Pause the now-fading-out slot after transition completes (saves resources)
    const oldSlot = (1 - nextSlot) as 0 | 1;
    const timer = setTimeout(() => {
      (oldSlot === 0 ? videoRef0 : videoRef1).current?.pause();
    }, VIDEO_CROSSFADE_MS + 50);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.src, config.type]);

  // Pause/resume when paused prop changes (applies to active slot)
  useEffect(() => {
    if (config.type !== "video") return;
    const vid = (currentVideoSlot.current === 0 ? videoRef0 : videoRef1).current;
    if (!vid) return;
    if (paused) vid.pause();
    else vid.play().then(() => { vid.muted = false; }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, config.type]);

  // video:control IPC listener (applies to active slot)
  useEffect(() => {
    if (config.type !== "video") return;

    let mounted = true;
    let unlistenFn: (() => void) | null = null;

    ipc.onVideoControl((payload) => {
      const vid = (currentVideoSlot.current === 0 ? videoRef0 : videoRef1).current;
      if (!vid) return;
      switch (payload.action) {
        case "play": vid.play().catch(() => {}); break;
        case "pause": vid.pause(); break;
        case "seek": if (payload.value !== undefined) vid.currentTime = payload.value; break;
        case "volume": if (payload.value !== undefined) { vid.volume = Math.max(0, Math.min(1, payload.value)); vid.muted = payload.value === 0; } break;
        case "loop": vid.loop = payload.value === 1; break;
      }
    }).then((fn) => {
      if (mounted) unlistenFn = fn;
      else fn();
    }).catch(console.error);

    return () => {
      mounted = false;
      unlistenFn?.();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type]);

  // playback:status emit (500ms) — reports active slot's state
  useEffect(() => {
    if (config.type !== "video" || skipPlaybackEmit) return;
    const interval = setInterval(() => {
      const vid = (currentVideoSlot.current === 0 ? videoRef0 : videoRef1).current;
      if (vid && vid.duration) {
        void emitEvent("playback:status", {
          currentTime: vid.currentTime,
          duration: vid.duration,
          playing: !vid.paused,
        });
      }
    }, 500);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type, config.src, skipPlaybackEmit]);

  // ── Camera input ──────────────────────────────────────────────────────────
  // Frames are streamed from controller via IPC (camera:frame).
  // Camera access only happens in: (1) controller's useCameraFrameStream hook when broadcasting,
  // (2) ControlBar dropdown preview. BackgroundLayer is a pure frame consumer.
  const [cameraFrameUrl, setCameraFrameUrl] = useState<string | null>(null);
  useEffect(() => {
    if (config.type !== "camera") return;
    let unlisten: (() => void) | null = null;

    ipc.onCameraFrame((dataUrl) => setCameraFrameUrl(dataUrl))
      .then((fn) => { unlisten = fn; })
      .catch(() => {});

    return () => {
      unlisten?.();
      setCameraFrameUrl(null);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.type, config.src]);

  // ── Styles ────────────────────────────────────────────────────────────────
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
    return (
      // Wrap in positioned div: WebKit/WKWebView <video> escapes stacking context
      // and renders above siblings regardless of z-index. overflow:hidden confines it.
      <div style={{ ...baseStyle, overflow: "hidden" }}>
        {([0, 1] as const).map((idx) => (
          <div
            key={idx}
            style={{
              position: "absolute",
              inset: 0,
              opacity: activeVideoSlot === idx ? 1 : 0,
              transition: `opacity ${VIDEO_CROSSFADE_MS}ms ease`,
            }}
          >
            {videoSlots[idx] && (
              <video
                ref={idx === 0 ? videoRef0 : videoRef1}
                autoPlay
                loop={config.loop ?? true}
                muted
                playsInline
                src={videoSlots[idx]!}
                style={{ width: "100%", height: "100%", objectFit: videoFit }}
                onCanPlay={(e) => {
                  const video = e.target as HTMLVideoElement;
                  if (pausedRef.current) {
                    video.pause();
                  } else {
                    video.play().then(() => { video.muted = false; }).catch(() => {});
                  }
                }}
              />
            )}
          </div>
        ))}
      </div>
    );
  }

  if (config.type === "camera") {
    return (
      <div style={{ ...baseStyle, overflow: "hidden", backgroundColor: "#000" }}>
        {cameraFrameUrl && (
          <img
            src={cameraFrameUrl}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: videoFit, transform: cameraMirror ? "scaleX(-1)" : undefined, display: "block" }}
          />
        )}
      </div>
    );
  }

  // Fallback: black
  return <div style={{ ...baseStyle, backgroundColor: "#000" }} />;
}
