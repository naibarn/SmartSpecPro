/**
 * Vite configuration for the embeddable chat widget build.
 *
 * Produces a self-contained bundle at dist/public/widget/v1/:
 *   - widget.js  — React widget app (< 50KB gzipped goal)
 *   - embed.js   — Standalone loader script (< 5KB minified)
 *
 * Key settings:
 * - No code splitting (single bundle each)
 * - CSS inlined into JS to minimize requests
 * - es2020 target for broad browser compatibility
 * - Only React core — no Radix, no TanStack Query, no tRPC client
 */

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

const configDir = import.meta.dirname;

// SSP_BUILD_OUT_DIR lets scripts/build-atomic.sh redirect the widget build
// into the same staging directory used for the main app build, so both
// halves of the output can be swapped into place atomically. Unset in
// normal `npm run build:widget` usage, which keeps writing straight to
// dist/public/widget/v1.
const outDir = process.env.SSP_BUILD_OUT_DIR
  ? resolve(process.env.SSP_BUILD_OUT_DIR, "widget/v1")
  : "dist/public/widget/v1";

export default defineConfig({
  plugins: [react()],
  // The widget has no standalone public assets. In an atomic build the main
  // script populates public files once at the staging root.
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: false,
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        widget: resolve(configDir, "client/widget/main.tsx"),
        embed: resolve(configDir, "client/widget/embed.ts"),
      },
      output: {
        // Single file per entry, no chunks
        manualChunks: undefined,
        entryFileNames: "[name].js",
        chunkFileNames: "[name]-[hash].js",
        assetFileNames: "[name][extname]",
      },
      external: [],
    },
    // Inline CSS into JS
    cssMinify: true,
    minify: "esbuild",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: {
      "@": resolve(configDir, "client/src"),
    },
  },
  // Prevent Vite from referencing server-side modules
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
