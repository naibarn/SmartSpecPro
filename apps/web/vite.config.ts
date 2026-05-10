import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { sentryVitePlugin } from "@sentry/vite-plugin";


const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];
const require = createRequire(import.meta.url);
const reactPath = path.dirname(require.resolve("react/package.json"));
const reactDomPath = path.dirname(require.resolve("react-dom/package.json"));

// Conditionally add Sentry source map upload plugin (CI builds only)
if (process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG) {
  plugins.push(
    sentryVitePlugin({
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT || "smartspecpro-frontend",
      authToken: process.env.SENTRY_AUTH_TOKEN,
      release: {
        name: process.env.VITE_RELEASE || process.env.GIT_COMMIT_SHA,
      },
    }),
  );
}

export default defineConfig({
  plugins,
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".jsx", ".json"],
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      // Force all packages (including Radix) to use the same React copy even when npm hoists workspaces.
      "react": reactPath,
      "react-dom": reactDomPath,
      "react/jsx-runtime": path.join(reactPath, "jsx-runtime"),
      "react/jsx-dev-runtime": path.join(reactPath, "jsx-dev-runtime"),
    },
    dedupe: ["react", "react-dom"],
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    sourcemap: "hidden",
    // Route-based code splitting is in place. 2000 kB gives headroom for large
    // vendor chunks (Radix, Konva) while still catching regressions early.
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React core — must be a single chunk shared across all lazy routes
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/")) {
            return "vendor-react";
          }
          // Routing
          if (id.includes("node_modules/wouter/")) {
            return "vendor-router";
          }
          // Data fetching / tRPC
          if (
            id.includes("node_modules/@tanstack/") ||
            id.includes("node_modules/@trpc/")
          ) {
            return "vendor-query";
          }
          // Radix UI component primitives
          if (id.includes("node_modules/@radix-ui/")) {
            return "vendor-radix";
          }
          // Animation
          if (id.includes("node_modules/framer-motion/")) {
            return "vendor-framer";
          }
          // Icons
          if (id.includes("node_modules/lucide-react/")) {
            return "vendor-icons";
          }
          // Canvas / presentation editor (heavy)
          if (
            id.includes("node_modules/konva/") ||
            id.includes("node_modules/react-konva/")
          ) {
            return "vendor-canvas";
          }
          // CodeMirror editor + language extensions (pulled in by DocumentManagement)
          if (
            id.includes("node_modules/@uiw/react-codemirror/") ||
            id.includes("node_modules/@codemirror/") ||
            id.includes("node_modules/codemirror/")
          ) {
            return "vendor-codemirror";
          }
          // i18n runtime
          if (
            id.includes("node_modules/i18next/") ||
            id.includes("node_modules/react-i18next/") ||
            id.includes("node_modules/i18next-resources-to-backend/")
          ) {
            return "vendor-i18n";
          }
        },
      },
    },
  },
  server: {
    host: true,
    allowedHosts: [
      "localhost",
      "127.0.0.1",
      ".smartspec.local",
      ".smartspec.pro",
      ".smartaihub.app",
      "smartspec-web",
      "tauri.localhost",
    ],
    fs: {
      strict: true,
      allow: [
        path.resolve(import.meta.dirname, ".."),  // apps/
        path.resolve(import.meta.dirname, "../../packages"),  // packages/*
        path.resolve(import.meta.dirname, "../../node_modules"),  // hoisted node_modules
      ],
      deny: ["**/.*"],
    },
  },
});
