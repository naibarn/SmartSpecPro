#!/usr/bin/env node

import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const binariesDir = join(root, "apps", "tauri-shell", "src-tauri", "binaries");

function fail(message) {
  console.error(`[desktop-ffmpeg] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[desktop-ffmpeg] ${message}`);
}

function parseArgs(argv) {
  const options = {
    target: "",
    ffmpegPath: "",
    ffprobePath: "",
    force: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      options.target = argv[i + 1] ?? fail("Missing value for --target");
      i += 1;
    } else if (arg === "--ffmpeg-path") {
      options.ffmpegPath = argv[i + 1] ?? fail("Missing value for --ffmpeg-path");
      i += 1;
    } else if (arg === "--ffprobe-path") {
      options.ffprobePath = argv[i + 1] ?? fail("Missing value for --ffprobe-path");
      i += 1;
    } else if (arg === "--force") {
      options.force = true;
    } else if (arg === "--dry-run") {
      options.dryRun = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/prepare-ffmpeg-sidecars.mjs [options]

Options:
  --target <triple>        Optional Rust target triple. Defaults to the current host.
  --ffmpeg-path <path>     Explicit source path for ffmpeg.
  --ffprobe-path <path>    Explicit source path for ffprobe.
  --force                  Overwrite existing sidecar binaries.
  --dry-run                Print the resolved copy plan without writing files.
  -h, --help               Show this help.
`);
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function detectTargetTriple() {
  const arch = process.arch;
  const platform = process.platform;

  if (platform === "darwin") {
    if (arch === "arm64") return "aarch64-apple-darwin";
    if (arch === "x64") return "x86_64-apple-darwin";
  }

  if (platform === "linux") {
    if (arch === "arm64") return "aarch64-unknown-linux-gnu";
    if (arch === "x64") return "x86_64-unknown-linux-gnu";
  }

  if (platform === "win32") {
    return "x86_64-pc-windows-msvc";
  }

  fail(`Unsupported host platform for FFmpeg sidecar prep: ${platform}/${arch}`);
}

function resolveFromPath(binaryName) {
  const lookup = process.platform === "win32" ? "where" : "which";
  const result = spawnSync(lookup, [binaryName], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    return "";
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? "";
}

function ensureReadableFile(pathValue, label) {
  if (!pathValue) {
    fail(
      `${label} was not found. Install FFmpeg on this machine or provide --${label.toLowerCase()}-path.`,
    );
  }
  if (!existsSync(pathValue)) {
    fail(`${label} path does not exist: ${pathValue}`);
  }
}

function copySidecar(sourcePath, targetPath, options = {}) {
  if (existsSync(targetPath) && !options.force) {
    log(`Using existing sidecar ${targetPath}`);
    return;
  }

  if (options.dryRun) {
    log(`[dry-run] ${sourcePath} -> ${targetPath}`);
    return;
  }

  copyFileSync(sourcePath, targetPath);
  if (process.platform !== "win32") {
    chmodSync(targetPath, 0o755);
  }
  log(`Prepared ${targetPath}`);
}

const options = parseArgs(process.argv.slice(2));
const target = options.target || detectTargetTriple();
const wantsWindowsLayout = target.includes("windows");
const ffmpegSource = options.ffmpegPath || process.env.SMARTSPEC_FFMPEG_PATH || resolveFromPath("ffmpeg");
const ffprobeSource = options.ffprobePath || process.env.SMARTSPEC_FFPROBE_PATH || resolveFromPath("ffprobe");

ensureReadableFile(ffmpegSource, "FFmpeg");
ensureReadableFile(ffprobeSource, "FFprobe");

mkdirSync(binariesDir, { recursive: true });

const extension = wantsWindowsLayout ? ".exe" : "";
const ffmpegTarget = join(binariesDir, `ffmpeg-${target}${extension}`);
const ffprobeTarget = join(binariesDir, `ffprobe-${target}${extension}`);

copySidecar(ffmpegSource, ffmpegTarget, options);
copySidecar(ffprobeSource, ffprobeTarget, options);

if (options.dryRun) {
  log("Dry run complete.");
} else {
  log(`FFmpeg sidecars are ready for target ${target}.`);
}
