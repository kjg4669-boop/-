"use client";

import { open } from "@tauri-apps/plugin-dialog";
import { copyFile, mkdir } from "@tauri-apps/plugin-fs";
import { appDataDir, join } from "@tauri-apps/api/path";
import { convertFileSrc } from "@tauri-apps/api/core";
import { mediaDb } from "./db";
import type { MediaItem } from "./types";

/** 파일 선택 대화상자를 열고 미디어를 앱 데이터 디렉토리로 복사한 뒤 DB에 저장합니다. */
export async function importMediaFile(type: "image" | "video"): Promise<MediaItem | null> {
  const filters =
    type === "image"
      ? [{ name: "이미지", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }]
      : [{ name: "영상", extensions: ["mp4", "webm", "mov", "mkv", "avi"] }];

  const selected = await open({ filters, multiple: false });
  if (!selected || typeof selected !== "string") return null;

  const rawName = selected.replace(/\\/g, "/").split("/").pop() ?? "media";
  const fileName = `${Date.now()}_${rawName}`;
  const dataDir = await appDataDir();
  const destDir = await join(dataDir, "media");
  await mkdir(destDir, { recursive: true });

  const destPath = await join(destDir, fileName);
  await copyFile(selected, destPath);

  // name uses original filename for readability; file_path uses timestamped name to prevent collisions
  const id = await mediaDb.create({ type, file_path: destPath, name: rawName });

  return {
    id,
    type,
    file_path: destPath,
    name: rawName,
    created_at: new Date().toISOString(),
  };
}

/** 로컬 파일 경로를 WebView가 표시할 수 있는 URL로 변환합니다. */
export function toDisplayUrl(src: string | undefined): string | undefined {
  if (!src) return undefined;
  if (src.startsWith("data:") || src.startsWith("http") || src.startsWith("asset:")) return src;
  return convertFileSrc(src);
}

/**
 * 영상 파일에서 첫 프레임을 추출하여 data URL로 반환합니다.
 * 실패 시 null 반환 (썸네일 없이 플레이스홀더로 대체).
 */
export async function captureVideoThumbnail(src: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.src = src;
    video.crossOrigin = "anonymous";
    video.muted = true;

    let settled = false;
    const settle = (result: string | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      video.src = "";
      video.load();
      resolve(result);
    };

    // Fallback: resolve null after 5s if onseeked never fires
    const timeoutId = setTimeout(() => settle(null), 5000);

    video.onloadeddata = () => {
      video.currentTime = 0.5;
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        if (!ctx) { settle(null); return; }
        ctx.drawImage(video, 0, 0, 160, 90);
        settle(canvas.toDataURL("image/jpeg", 0.7));
      } catch {
        settle(null);
      }
    };

    video.onerror = () => settle(null);
    video.load();
  });
}
