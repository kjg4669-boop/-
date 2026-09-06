"use client";
import { useEffect } from "react";
import { emitEvent } from "@/lib/ipc";

/**
 * Captures frames from the specified camera and streams them via IPC
 * ("camera:frame" event) so the output window can render them without
 * needing its own getUserMedia() call (WKWebView restriction workaround).
 */
export function useCameraFrameStream(active: boolean, deviceId: string | undefined) {
  useEffect(() => {
    if (!active || !deviceId) return;

    let stream: MediaStream | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const video = document.createElement("video");
    video.autoplay = true;
    video.muted = true;
    video.playsInline = true;

    const canvas = document.createElement("canvas");
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    navigator.mediaDevices
      .getUserMedia({ video: { deviceId: { exact: deviceId } } })
      .then((s) => {
        stream = s;
        video.srcObject = s;
        void video.play();

        intervalId = setInterval(() => {
          if (video.readyState < 2) return;
          ctx.drawImage(video, 0, 0, 1280, 720);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          void emitEvent("camera:frame", { data: dataUrl });
        }, 33); // ~30fps
      })
      .catch(console.error);

    return () => {
      if (intervalId !== null) clearInterval(intervalId);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    };
  }, [active, deviceId]);
}
