import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    agentUpgrade: "security",
  },
  transpilePackages: ["@united-technologies/shared"],
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    root: path.resolve(process.cwd(), "../.."),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
