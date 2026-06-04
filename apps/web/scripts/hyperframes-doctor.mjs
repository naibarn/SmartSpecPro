#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

const result = {
  node: {
    ok: /^v(20|22)\./.test(process.version),
    version: process.version,
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
  tempWorkspace: { ok: true, policy: "tenant/run scoped temp dirs" },
  storage: {
    ok: true,
    message: "Storage ownership is validated by hyperframesAssetStagingService.",
  },
  secretsPrinted: false,
  gate: chromeOk && ffmpegOk && ffprobeOk ? "mvp_smoke_ready" : "blocked",
};

console.log(JSON.stringify(result, null, 2));
