#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const nodeRequirement = ">=20.20.0 <21 || >=22.22.0";

function hasCommand(command) {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readCommand(command) {
  try {
    return execFileSync("bash", ["-lc", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function parseNodeVersion(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function isSupportedNodeVersion(version = process.version) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  if (parsed.major === 20) {
    return parsed.minor > 20 || (parsed.minor === 20 && parsed.patch >= 0);
  }
  if (parsed.major === 22) {
    return parsed.minor > 22 || (parsed.minor === 22 && parsed.patch >= 0);
  }
  return false;
}

function getFontStatus() {
  const fontconfigAvailable = hasCommand("fc-match") && hasCommand("fc-list");
  const thaiFontFamilies = fontconfigAvailable
    ? [
        ...new Set(
          readCommand("fc-list :lang=th family")
            .split("\n")
            .map(line => line.replace(/\\-/g, "-").split(",")[0]?.trim())
            .filter(Boolean)
        ),
      ].slice(0, 10)
    : [];
  return {
    ok: fontconfigAvailable && thaiFontFamilies.length > 0,
    fontconfigAvailable,
    thaiFontFamilies,
    message:
      fontconfigAvailable && thaiFontFamilies.length > 0
        ? "Thai-capable render fonts are visible to fontconfig."
        : "Install and verify Thai-capable render fonts in the worker image before rollout.",
  };
}

async function getPlaywrightChromiumStatus() {
  try {
    const { chromium } = await import("playwright");
    const executablePath = chromium.executablePath();
    return {
      ok: Boolean(executablePath && existsSync(executablePath)),
      source: "playwright.chromium",
      executablePath,
    };
  } catch (error) {
    return {
      ok: false,
      source: "playwright.chromium",
      message: error instanceof Error ? error.message : "playwright unavailable",
    };
  }
}

const workspace = mkdtempSync(join(tmpdir(), "smartspec-hyperframes-doctor-"));
writeFileSync(join(workspace, "probe.txt"), "ok");
rmSync(workspace, { recursive: true, force: true });

const commandChromeOk =
  hasCommand("google-chrome") ||
  hasCommand("chromium") ||
  hasCommand("chromium-browser");
const playwrightChromium = await getPlaywrightChromiumStatus();
const ffmpegOk = hasCommand("ffmpeg");
const ffprobeOk = hasCommand("ffprobe");
const chromeOk = commandChromeOk || playwrightChromium.ok;
const nodeOk = isSupportedNodeVersion();
const fonts = getFontStatus();
const gate =
  nodeOk && chromeOk && ffmpegOk && ffprobeOk && fonts.ok
    ? "mvp_smoke_ready"
    : "blocked";

const result = {
  node: {
    ok: nodeOk,
    version: process.version,
    requirement: nodeRequirement,
    message: nodeOk
      ? "Node runtime satisfies the SmartSpecPro engine requirement."
      : `Node runtime must satisfy ${nodeRequirement}.`,
  },
  hyperframesRuntime: {
    ok: false,
    deferred: true,
    productionReady: false,
    message: "HyperFrames package installation is deferred by dependency audit.",
  },
  chrome: {
    ok: chromeOk,
    commandAvailable: commandChromeOk,
    playwrightChromium,
  },
  ffmpeg: { ok: ffmpegOk },
  ffprobe: { ok: ffprobeOk },
  localSmokeRenderer: {
    ok: chromeOk && ffmpegOk,
    renderer: "playwright_chromium_ffmpeg_smoke",
    message:
      "MVP smoke rendering can run without @hyperframes/*; production package execution remains separately gated.",
  },
  fonts,
  tempWorkspace: { ok: true, policy: "tenant/run scoped temp dirs" },
  storage: {
    ok: true,
    message: "Storage ownership is validated by hyperframesAssetStagingService.",
  },
  secretsPrinted: false,
  gate,
};

console.log(JSON.stringify(result, null, 2));
if (gate === "blocked") {
  process.exitCode = 1;
}
