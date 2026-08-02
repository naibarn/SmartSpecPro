#!/usr/bin/env node
// Two-step build:
//  1. `tsc` emits per-file `.d.ts` declarations (for editor/typecheck
//     consumers under this monorepo's "moduleResolution": "bundler"
//     convention, which tolerates extension-less type references fine).
//  2. `esbuild` bundles `src/index.ts` into a SINGLE self-contained
//     `dist/index.js`, overwriting tsc's per-file `.js` output. This is
//     required because plain `node` (unlike this monorepo's bundler-mode
//     dev tooling) enforces explicit file extensions on relative ESM
//     imports — bundling inlines the whole internal relative-import graph
//     into one file so there is nothing left for Node's loader to resolve
//     except the externalized npm packages (remotion/@remotion/*/react/
//     three/zod), which are expected to be present in node_modules
//     wherever this package is actually consumed (this monorepo's pnpm
//     workspace in dev, or the worker-app's staged runtime-pack
//     node_modules in a shipped release).
import { execFileSync } from "node:child_process";
import { build } from "esbuild";

console.log("[remotion-render] tsc (declarations)...");
try {
  execFileSync("npx", ["tsc", "-p", "tsconfig.json"], { stdio: "inherit" });
} catch {
  // tsc may exit non-zero on pre-existing, non-blocking type-only issues
  // (e.g. @types/three JSX intrinsic gaps) while still emitting valid
  // .d.ts/.js output — declarations are still usable; the runtime-critical
  // artifact is the esbuild bundle below, not tsc's per-file .js output.
  console.warn(
    "[remotion-render] tsc reported type errors (see above) — continuing to bundle."
  );
}

console.log("[remotion-render] esbuild (runtime bundle)...");
await build({
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  jsx: "automatic",
  external: [
    "react",
    "react-dom",
    "react/*",
    "remotion",
    "remotion/*",
    "@remotion/*",
    "three",
    "@react-three/fiber",
    "zod",
  ],
  logLevel: "info",
});
console.log("[remotion-render] build complete: dist/index.js");

// Second, lightweight bundle: `remotionRenderVideoSchema.ts` +
// `renderVideoJob.ts` + `ffmpegUtil.ts` + `postPassArgs.ts` ONLY — no React,
// no Remotion composition modules, no `@react-three/fiber`. This is what
// `apps/web` imports (`@smartspec/remotion-render/render-video-job`) so its
// `remotion_render_video` schema/orchestration consumers (including its
// Vitest suite) never have to resolve a working `react/jsx-runtime`. See
// `src/renderVideoJobEntry.ts`'s doc comment.
console.log("[remotion-render] esbuild (render-video-job bundle)...");
await build({
  entryPoints: ["src/renderVideoJobEntry.ts"],
  outfile: "dist/renderVideoJobEntry.js",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["zod"],
  logLevel: "info",
});
console.log("[remotion-render] build complete: dist/renderVideoJobEntry.js");

// Third bundle — SCHEMA ONLY, browser-safe. Field incident 2026-07-30: the
// client build broke with `"join" is not exported by "__vite-browser-external"`
// because `apps/web/shared/workerRuntime.ts` (imported by CLIENT code) was
// re-exporting from the `render-video-job` bundle, which contains the Node
// orchestrator (`node:fs`/`node:path`/`node:child_process`). Vite externalises
// those for the browser and the build fails. `remotionRenderVideoSchema.ts`
// imports only `zod` + `layerTemplateSchemas`, so this bundle is safe to pull
// into a browser graph. `platform: "neutral"` makes any accidental future Node
// import a hard build error here instead of a downstream Vite failure.
console.log("[remotion-render] esbuild (render-video-schema bundle)...");
await build({
  entryPoints: ["src/remotionRenderVideoSchema.ts"],
  outfile: "dist/remotionRenderVideoSchema.js",
  bundle: true,
  platform: "neutral",
  format: "esm",
  target: "es2022",
  external: ["zod"],
  logLevel: "info",
});
console.log("[remotion-render] build complete: dist/remotionRenderVideoSchema.js");
