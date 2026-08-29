"use client";

/**
 * .wpjson bundle format — ZIP containing service.json + media/
 * Similar to .pptx (which is also a ZIP).
 *
 * Structure inside ZIP:
 *   service.json        — Service JSON with relative media paths ("media/<basename>")
 *   media/<basename>    — embedded media files (images, videos, etc.)
 */

import type { Service } from "./types";

/** Check if bytes are a ZIP bundle (PK magic header). */
export function isWpkgBundle(data: Uint8Array): boolean {
  return data.length >= 4 &&
    data[0] === 0x50 && data[1] === 0x4B &&
    data[2] === 0x03 && data[3] === 0x04;
}

/** Collect all absolute file paths referenced in the service. */
function collectMediaPaths(service: Service): Set<string> {
  const paths = new Set<string>();
  for (const item of service.items) {
    if (item.media?.file_path && !item.media.file_path.startsWith("media/")) {
      paths.add(item.media.file_path);
    }
    const bg = item.settings_json?.background;
    if (bg?.src && !bg.src.startsWith("http") && !bg.src.startsWith("data:") && !bg.src.startsWith("media/")) {
      paths.add(bg.src);
    }
  }
  return paths;
}

/** Map absolute paths → relative "media/<basename>", handling name collisions. */
function buildPathMap(paths: Set<string>): Map<string, string> {
  const map = new Map<string, string>();
  const used = new Set<string>();
  for (const orig of paths) {
    let name = orig.split("/").pop() ?? "file";
    if (used.has(name)) {
      const ext = name.includes(".") ? name.slice(name.lastIndexOf(".")) : "";
      const stem = name.slice(0, name.length - ext.length);
      let n = 1;
      while (used.has(`${stem}_${n}${ext}`)) n++;
      name = `${stem}_${n}${ext}`;
    }
    used.add(name);
    map.set(orig, `media/${name}`);
  }
  return map;
}

/** Return a deep clone of the service with paths replaced by relPath. */
function applyPathMap(service: Service, pathMap: Map<string, string>): Service {
  const clone = JSON.parse(JSON.stringify(service)) as Service;
  for (const item of clone.items) {
    if (item.media?.file_path && pathMap.has(item.media.file_path)) {
      item.media.file_path = pathMap.get(item.media.file_path)!;
    }
    const bg = item.settings_json?.background;
    if (bg?.src && pathMap.has(bg.src)) bg.src = pathMap.get(bg.src)!;
  }
  return clone;
}

/**
 * Pack a service into a ZIP bundle (Uint8Array).
 * All referenced media files are embedded as media/<basename>.
 * Missing media files are skipped with a warning.
 */
export async function packService(service: Service): Promise<Uint8Array> {
  const { zipSync } = await import("fflate");
  const { readFile } = await import("@tauri-apps/plugin-fs");

  const mediaPaths = collectMediaPaths(service);
  const pathMap = buildPathMap(mediaPaths);
  const serviceCopy = applyPathMap(service, pathMap);

  const files: Record<string, Uint8Array> = {};

  // service.json
  files["service.json"] = new TextEncoder().encode(JSON.stringify(serviceCopy, null, 2));

  // media files
  for (const [origPath, relPath] of pathMap) {
    try {
      const bytes = await readFile(origPath);
      files[relPath] = bytes;
    } catch (e) {
      console.warn(`[wpkg] Skipping unreadable media: ${origPath}`, e);
    }
  }

  return zipSync(files);
}

/**
 * Unpack a ZIP bundle.
 * Extracts media files to appLocalDataDir/wpkg-cache/<bundleName>/media/
 * and returns the Service with updated absolute paths.
 */
export async function unpackService(data: Uint8Array, bundleName: string): Promise<Service> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(data);

  const serviceBytes = files["service.json"];
  if (!serviceBytes) throw new Error("bundle에 service.json이 없습니다.");

  const service = JSON.parse(new TextDecoder().decode(serviceBytes)) as Service;

  // Extract media to a persistent cache folder (appLocalDataDir is in scope)
  const { appLocalDataDir } = await import("@tauri-apps/api/path");
  const { mkdir, writeFile } = await import("@tauri-apps/plugin-fs");

  const base = (await appLocalDataDir()).replace(/\/$/, "");
  const cacheDir = `${base}/wpkg-cache/${bundleName}`;
  const mediaDir = `${cacheDir}/media`;

  // Build relPath → realPath map
  const relToReal = new Map<string, string>();

  for (const [name, bytes] of Object.entries(files)) {
    if (name.startsWith("media/") && bytes.length > 0) {
      const basename = name.slice("media/".length);
      await mkdir(mediaDir, { recursive: true });
      const realPath = `${mediaDir}/${basename}`;
      await writeFile(realPath, bytes);
      relToReal.set(name, realPath);
    }
  }

  // Update paths in service
  for (const item of service.items) {
    if (item.media?.file_path && relToReal.has(item.media.file_path)) {
      item.media.file_path = relToReal.get(item.media.file_path)!;
    }
    const bg = item.settings_json?.background;
    if (bg?.src && relToReal.has(bg.src)) {
      bg.src = relToReal.get(bg.src)!;
    }
  }

  return service;
}
