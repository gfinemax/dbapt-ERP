import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep Turbopack's persistent development cache separate from production
  // builds. Running `next build` while the dev server is active must not let
  // both processes write generated CSS into the same directory.
  distDir: process.env.NODE_ENV === "development" ? ".next-dev" : ".next",
  experimental: {
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  serverExternalPackages: ["@napi-rs/canvas", "pdf-parse"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
