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

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist/public/widget/v1",
    emptyOutDir: false,
    target: "es2020",
    cssCodeSplit: false,
    rollupOptions: {
      input: {
        widget: resolve(__dirname, "client/widget/main.tsx"),
        embed: resolve(__dirname, "client/widget/embed.ts"),
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
      "@": resolve(__dirname, "client/src"),
    },
  },
  // Prevent Vite from referencing server-side modules
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
});
