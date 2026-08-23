import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Monorepo layout: parent dir holds the backend lockfile — pin the root.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
