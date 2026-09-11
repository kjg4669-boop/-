import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri expects a fully static app
  trailingSlash: true,
  // Bundle Tauri plugin packages inline instead of splitting into separate chunks.
  // Prevents "Failed to load chunk" hot-reload errors in dev mode caused by hash mismatches.
  transpilePackages: [
    "@tauri-apps/api",
    "@tauri-apps/plugin-dialog",
    "@tauri-apps/plugin-fs",
    "@tauri-apps/plugin-sql",
    "@tauri-apps/plugin-shell",
  ],
};

export default nextConfig;
