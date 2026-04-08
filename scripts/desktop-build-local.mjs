#!/usr/bin/env node

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const validBundleModes = new Set(["skip", "on-demand", "e2b", "e4b", "all"]);

function fail(message) {
  console.error(`[desktop-build] ERROR: ${message}`);
  process.exit(1);
}

function log(message) {
  console.log(`[desktop-build] ${message}`);
}

function parseArgs(argv) {
  const options = {
    target: null,
    bundleMode: "skip",
    noInstall: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      options.target = argv[i + 1] ?? fail("Missing value for --target");
      i += 1;
    } else if (arg === "--bundle-mode") {
      options.bundleMode = argv[i + 1] ?? fail("Missing value for --bundle-mode");
      i += 1;
    } else if (arg === "--no-install") {
      options.noInstall = true;
    } else if (arg === "-h" || arg === "--help") {
      console.log(`Usage: node scripts/desktop-build-local.mjs [options]

Options:
  --target <triple>        Optional Rust target triple to pass to Tauri build.
  --bundle-mode <mode>     One of: skip, on-demand, e2b, e4b, all.
  --no-install             Skip npm install even if Tauri CLI is missing.
  -h, --help               Show this help.
`);
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }

  if (!validBundleModes.has(options.bundleMode)) {
    fail(`Unsupported --bundle-mode value: ${options.bundleMode}`);
  }

  return options;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    fail(`${command} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${command} exited with code ${result.status}`);
  }
}

function commandExists(command, versionArgs = ["--version"]) {
  const result = spawnSync(command, versionArgs, {
    cwd: root,
    stdio: "ignore",
    shell: process.platform === "win32",
  });
  return result.status === 0;
}

function assertHostSupportsTarget(target) {
  if (!target) {
    return;
  }

  const isWindowsTarget = target.includes("windows");
  const isMacTarget = target.includes("apple-darwin");
  const isLinuxTarget = target.includes("linux");

  if (isWindowsTarget && process.platform !== "win32") {
    fail(
      [
        `Target ${target} must be built on a Windows host for this project.`,
        "This machine is not Windows, so the local builder will not continue.",
        "Use `npm run release:desktop:gh -- --tag vX.Y.Z --platform windows --watch` from Linux/macOS,",
        "or run `npm run build:desktop:windows-local` on a Windows machine.",
      ].join(" "),
    );
  }

  if (isMacTarget && process.platform !== "darwin") {
    fail(`Target ${target} must be built on a macOS host for this project.`);
  }

  if (isLinuxTarget && process.platform !== "linux") {
    fail(`Target ${target} must be built on a Linux host for this project.`);
  }
}

function resolvePythonCommand() {
  const candidates = process.platform === "win32"
    ? [
        ["py", ["-3", "--version"]],
        ["python", ["--version"]],
        ["python3", ["--version"]],
      ]
    : [
        ["python3", ["--version"]],
        ["python", ["--version"]],
      ];

  for (const [command, args] of candidates) {
    if (commandExists(command, args)) {
      return command === "py" ? [command, ["-3"]] : [command, []];
    }
  }

  return null;
}

const options = parseArgs(process.argv.slice(2));

if (!commandExists("npm")) {
  fail("npm is required.");
}
if (!commandExists("cargo")) {
  fail("Rust/Cargo is required.");
}

assertHostSupportsTarget(options.target);

const tauriBin = join(root, "node_modules", ".bin", process.platform === "win32" ? "tauri.cmd" : "tauri");
if (!existsSync(tauriBin)) {
  if (options.noInstall) {
    fail("Tauri CLI is not installed and --no-install was provided.");
  }
  log("Installing npm dependencies...");
  run("npm", ["install"]);
}

if (options.bundleMode !== "skip") {
  const python = resolvePythonCommand();
  if (!python) {
    fail("Python 3 is required to prepare LiteRT-LM bundles.");
  }

  log(`Preparing LiteRT-LM bundle (${options.bundleMode})...`);
  run(python[0], [
    ...python[1],
    "apps/tauri-shell/scripts/prepare-litert-lm-bundle.py",
    "--bundle-mode",
    options.bundleMode,
  ]);
}

log("Building SmartSpec Web assets...");
run("npm", ["--workspace", "apps/web", "run", "build"]);

const tauriArgs = ["--workspace", "apps/tauri-shell", "run", "tauri:build"];
if (options.target) {
  tauriArgs.push("--", "--target", options.target);
}

log("Building Tauri desktop bundle...");
run("npm", tauriArgs);

log("Desktop bundle completed.");
console.log(`[desktop-build] Bundle output: ${join(root, "apps", "tauri-shell", "src-tauri", "target")}`);
