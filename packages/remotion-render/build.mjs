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
