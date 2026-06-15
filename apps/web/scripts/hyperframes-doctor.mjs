#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const nodeRequirement = ">=22.22.0 <23";
const officialHyperframesNodeRequirement = ">=22.22.0";
const here = dirname(fileURLToPath(import.meta.url));
const resultsDir = resolve(here, "../test-results/marketplace-hyperframes");
const outputPath = join(resultsDir, "doctor-report.json");
const requireFromDoctor = createRequire(import.meta.url);

function hasCommand(command) {
  try {
    execFileSync("sh", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readCommand(command) {
  try {
    return execFileSync("sh", ["-lc", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function commandOutput(command) {
  const output = readCommand(command).trim();
  return output || null;
}

function hashValue(value) {
  return `hf_${createHash("sha256").update(String(value)).digest("hex").slice(0, 48)}`;
}

function packageJsonCandidates(packageName) {
  const packageParts = packageName.split("/");
  return [
    join(process.cwd(), "node_modules", ...packageParts, "package.json"),
    join(process.cwd(), "apps", "web", "node_modules", ...packageParts, "package.json"),
    resolve(here, "../node_modules", ...packageParts, "package.json"),
    resolve(here, "../../../node_modules", ...packageParts, "package.json"),
  ];
}

function readPackageVersion(packageName) {
  try {
    return String(requireFromDoctor(`${packageName}/package.json`).version ?? "");
  } catch {
    for (const candidate of packageJsonCandidates(packageName)) {
      if (!existsSync(candidate)) continue;
      try {
        const packageJson = JSON.parse(readFileSync(candidate, "utf8"));
        return typeof packageJson.version === "string" ? packageJson.version : null;
      } catch {
        return null;
      }
    }
    return null;
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
  if (parsed.major === 22) {
    return parsed.minor > 22 || (parsed.minor === 22 && parsed.patch >= 0);
  }
  return false;
}

function isSupportedOfficialHyperframesNodeVersion(version = process.version) {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  return parsed.major > 22 || (parsed.major === 22 && parsed.minor >= 22);
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
const chromeVersion =
  commandOutput("google-chrome --version") ||
  commandOutput("chromium --version") ||
  commandOutput("chromium-browser --version") ||
  (playwrightChromium.ok ? "playwright.chromium bundled" : null);
const nodeOk = isSupportedNodeVersion();
const officialNodeOk = isSupportedOfficialHyperframesNodeVersion();
const fonts = getFontStatus();
const hyperframesPackageVersion = readPackageVersion("hyperframes");
const producerPackageVersion = readPackageVersion("@hyperframes/producer");
const hyperframesCliCandidates = [
  join(process.cwd(), "node_modules", ".bin", "hyperframes"),
  join(process.cwd(), "apps", "web", "node_modules", ".bin", "hyperframes"),
  resolve(here, "../node_modules/.bin/hyperframes"),
  resolve(here, "../../../node_modules/.bin/hyperframes"),
];
const hyperframesCliAvailable =
  hyperframesCliCandidates.some(candidate => existsSync(candidate)) ||
  hasCommand("hyperframes") ||
  hyperframesPackageVersion != null;
const producerPackageAvailable = producerPackageVersion != null;
const officialRuntimeReady =
  nodeOk && officialNodeOk && hyperframesCliAvailable && producerPackageAvailable && chromeOk && ffmpegOk && ffprobeOk && fonts.ok;
const gate =
  officialRuntimeReady
    ? "official_runtime_ready"
    : nodeOk && chromeOk && ffmpegOk && ffprobeOk && fonts.ok
      ? "diagnostic_ready"
    : "blocked";

const result = {
  generatedAt: new Date().toISOString(),
  node: {
    ok: nodeOk,
    version: process.version,
    requirement: nodeRequirement,
    message: nodeOk
      ? "Node runtime satisfies the SmartSpecPro engine requirement."
      : `Node runtime must satisfy ${nodeRequirement}.`,
  },
  officialHyperframesNode: {
    ok: officialNodeOk,
    version: process.version,
    requirement: officialHyperframesNodeRequirement,
    message: officialNodeOk
      ? "Node runtime satisfies the official HyperFrames runtime requirement."
      : `Official HyperFrames runtime requires ${officialHyperframesNodeRequirement}.`,
  },
  hyperframesRuntime: {
    ok: officialRuntimeReady,
    cliAvailable: hyperframesCliAvailable,
    producerPackageAvailable,
    cliPackage: hyperframesPackageVersion ? `hyperframes@${hyperframesPackageVersion}` : null,
    producerPackage: producerPackageVersion ? `@hyperframes/producer@${producerPackageVersion}` : null,
    productionReady: officialRuntimeReady,
    message: officialRuntimeReady
      ? "Official HyperFrames runtime prerequisites are visible in this environment."
      : "Official HyperFrames runtime remains blocked until Node 22.22.x worker evidence and all runtime dependencies pass.",
  },
  chrome: {
    ok: chromeOk,
    commandAvailable: commandChromeOk,
    version: chromeVersion,
    playwrightChromium,
  },
  ffmpeg: { ok: ffmpegOk, version: commandOutput("ffmpeg -version | head -n 1") },
  ffprobe: { ok: ffprobeOk, version: commandOutput("ffprobe -version | head -n 1") },
  localSmokeRenderer: {
    ok: chromeOk && ffmpegOk,
    renderer: "diagnostic_ffmpeg_smoke",
    message:
      "Diagnostic smoke rendering can verify plumbing only; it cannot complete user-facing HyperFrames renders.",
  },
  fonts,
  tempWorkspace: { ok: true, policy: "tenant/run scoped temp dirs" },
  storage: {
    ok: true,
    message: "Storage ownership is validated by hyperframesAssetStagingService.",
  },
  workerImage: {
    ok: officialRuntimeReady,
    reviewed: officialRuntimeReady,
    imageDigest: process.env.MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_DIGEST || hashValue([
      process.platform,
      process.arch,
      process.version,
      chromeVersion,
      commandOutput("ffmpeg -version | head -n 1"),
    ].filter(Boolean).join("|")),
    note: "Local/CI worker evidence. Production should set MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_DIGEST to the deployed image digest.",
  },
  officialCli: {
    ok: officialRuntimeReady,
    packageVersion: hyperframesPackageVersion,
    producerPackageVersion,
    nodeRequirement: officialHyperframesNodeRequirement,
  },
  secretsPrinted: false,
  gate,
};

mkdirSync(resultsDir, { recursive: true });
writeFileSync(outputPath, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
if (gate === "blocked") {
  process.exitCode = 1;
}
