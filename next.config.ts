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
  // PDF.js loads its worker dynamically, so automatic tracing misses it.
  // Include it for both the upload route and finance retry server actions.
  outputFileTracingIncludes: {
    "/api/finance/expense-evidence": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
    "/finance/*": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
