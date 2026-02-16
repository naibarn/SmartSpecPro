import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "path";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";
import { sentryVitePlugin } from "@sentry/vite-plugin";


const plugins = [react(), tailwindcss(), jsxLocPlugin(), vitePluginManusRuntime()];

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
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
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
    // Large code-highlighting/diagram bundles are expected in this app.
    // Raise warning threshold to reduce non-actionable build noise.
    chunkSizeWarningLimit: 8000,
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
