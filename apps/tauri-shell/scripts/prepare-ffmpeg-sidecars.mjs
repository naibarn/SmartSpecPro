#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import os from "node:os";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static");
const ffprobeStatic = require("ffprobe-static");

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(scriptDir, "..");
const binariesDir = resolve(appRoot, "src-tauri", "binaries");

function fail(message) {
  console.error(`[tauri-ffmpeg] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[tauri-ffmpeg] ${message}`);
}

function detectHostTarget() {
  const platform = process.platform;
  const arch = os.arch();

  if (platform === "linux") {
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
    if (arch === "arm64") return "aarch64-unknown-linux-gnu";
  }

  if (platform === "darwin") {
    if (arch === "x64") return "x86_64-apple-darwin";
    if (arch === "arm64") return "aarch64-apple-darwin";
  }

  if (platform === "win32" && arch === "x64") {
    return "x86_64-pc-windows-msvc";
  }

  fail(`Unsupported host platform for FFmpeg sidecar prep: ${platform}/${arch}`);
}

function parseArgs(argv) {
  const options = {
    target: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--target") {
      options.target = argv[index + 1] ?? fail("Missing value for --target");
      index += 1;
      continue;
    }
    if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/prepare-ffmpeg-sidecars.mjs [options]

Options:
  --target <triple>   Optional native Rust target triple to prepare.
  -h, --help          Show this help.
`);
      process.exit(0);
    }
    fail(`Unknown argument: ${arg}`);
  }

  return options;
}

const options = parseArgs(process.argv.slice(2));
const hostTarget = detectHostTarget();
const requestedTarget = options.target ?? hostTarget;

if (requestedTarget !== hostTarget) {
  fail(
    [
      "FFmpeg sidecar prep only supports native host builds right now.",
      `Host target is ${hostTarget}, but --target was ${requestedTarget}.`,
    ].join(" "),
  );
}

const ffmpegSource = ffmpegStatic;
const ffprobeSource = ffprobeStatic.path;

if (!ffmpegSource || !existsSync(ffmpegSource)) {
  fail("Could not resolve the ffmpeg-static binary path.");
}
if (!ffprobeSource || !existsSync(ffprobeSource)) {
  fail("Could not resolve the ffprobe-static binary path.");
}

mkdirSync(binariesDir, { recursive: true });

const usesExeSuffix = requestedTarget.includes("windows");
const ffmpegTargetPath = resolve(
  binariesDir,
  `ffmpeg-${requestedTarget}${usesExeSuffix ? ".exe" : ""}`,
);
const ffprobeTargetPath = resolve(
  binariesDir,
  `ffprobe-${requestedTarget}${usesExeSuffix ? ".exe" : ""}`,
);

if (existsSync(ffmpegTargetPath) && existsSync(ffprobeTargetPath)) {
  log(`Using existing ${basename(ffmpegTargetPath)} and ${basename(ffprobeTargetPath)}`);
  process.exit(0);
}

copyFileSync(ffmpegSource, ffmpegTargetPath);
copyFileSync(ffprobeSource, ffprobeTargetPath);

if (!usesExeSuffix) {
  chmodSync(ffmpegTargetPath, 0o755);
  chmodSync(ffprobeTargetPath, 0o755);
}

log(`Prepared ${basename(ffmpegTargetPath)} from ${ffmpegSource}`);
log(`Prepared ${basename(ffprobeTargetPath)} from ${ffprobeSource}`);
