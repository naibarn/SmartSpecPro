#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

if (process.platform !== "darwin" || process.arch !== "arm64") {
  throw new Error("macOS runtime packaging must run on an Apple Silicon macOS host; WSL2 and Linux are rejected");
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const runtimeReleaseScript = resolve(scriptDir, "package-runtime-release.mjs");
const args = process.argv.slice(2);
if (!args.includes("--target-runtime") && !args.some((arg) => arg.startsWith("--target-runtime="))) {
  args.push("--target-runtime", "hyperframes-macos-arm64");
}

const targetArg = args.find((arg) => arg === "--target-runtime" || arg.startsWith("--target-runtime="));
const targetIndex = targetArg === "--target-runtime" ? args.indexOf(targetArg) + 1 : -1;
const target = targetArg?.startsWith("--target-runtime=")
  ? targetArg.slice("--target-runtime=".length)
  : args[targetIndex];
if (target !== "hyperframes-macos-arm64") {
  throw new Error(`macOS runtime packager refuses target ${target || "(missing)"}; use hyperframes-macos-arm64 only`);
}

execFileSync(process.execPath, [runtimeReleaseScript, ...args], { cwd: resolve(scriptDir, ".."), stdio: "inherit" });
