import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  turbopack: {
    root: process.cwd(),
  },
  experimental: {
    // Persist Turbopack's build cache to .next/cache so warm rebuilds are fast.
    // The Docker build mounts .next/cache, so this cache survives across deploys.
    turbopackFileSystemCacheForBuild: true,
  },
};

export default nextConfig;
