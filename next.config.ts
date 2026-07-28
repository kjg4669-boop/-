import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  images: {
    unoptimized: true,
  },
  // Tauri expects a fully static app
  trailingSlash: true,
};

export default nextConfig;
