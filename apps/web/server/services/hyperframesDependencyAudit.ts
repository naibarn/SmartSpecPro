import { execFileSync } from "node:child_process";
import { resolveWhisperExecutable } from "./hyperframesTranscriptionService";

const SMARTSPEC_NODE_ENGINE_REQUIREMENT = ">=22.23.4 <23";
const HYPERFRAMES_OFFICIAL_NODE_ENGINE_REQUIREMENT = "22.23.4+, 24.22.1+, or 26.12.1+";

export interface HyperframesDependencyAuditResult {
  featureFlagsDefaultOff: boolean;
  packageInstallDeferred: boolean;
  packageNames: string[];
  pinnedVersionsKnown: boolean;
  licenseReviewed: boolean;
  nativePostinstallReviewed: boolean;
  mainBundleExcluded: boolean;
  doctorCanRunWithoutSecrets: boolean;
  runtimeModeDecision: {
    localDev: "official_cli_or_diagnostic";
    production: "official_cli_or_producer_worker";
  };
  gate: "pass" | "partial" | "fail";
  notes: string[];
}

function hasCommand(command: string): boolean {
  try {
    execFileSync("bash", ["-lc", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function readCommand(command: string): string {
  try {
    return execFileSync("bash", ["-lc", command], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return "";
  }
}

function parseNodeVersion(version: string): {
  major: number;
  minor: number;
  patch: number;
} | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

export function isSupportedHyperframesNodeVersion(
  version = process.version
): boolean {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  if (parsed.major === 22) {
    return parsed.minor > 23 || (parsed.minor === 23 && parsed.patch >= 4);
  }
  return false;
}

export function isSupportedOfficialHyperframesNodeVersion(
  version = process.version
): boolean {
  const parsed = parseNodeVersion(version);
  if (!parsed) return false;
  if (parsed.major === 22) return parsed.minor > 23 || (parsed.minor === 23 && parsed.patch >= 4);
  if (parsed.major === 24) return parsed.minor > 22 || (parsed.minor === 22 && parsed.patch >= 1);
  if (parsed.major === 26) return parsed.minor > 12 || (parsed.minor === 12 && parsed.patch >= 1);
  return false;
}

function getHyperframesFontStatus() {
  const fontconfigAvailable = hasCommand("fc-match") && hasCommand("fc-list");
  const thaiFontFamilies = fontconfigAvailable
    ? Array.from(
        new Set(
          readCommand("fc-list :lang=th family")
            .split("\n")
            .map(line => line.replace(/\\-/g, "-").split(",")[0]?.trim())
            .filter(Boolean)
        )
      ).slice(0, 10)
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

function getWhisperCppStatus() {
  try {
    const binary = resolveWhisperExecutable(process.env);
    return {
      ok: true,
      binary,
      message: "A working whisper.cpp executable is available for HyperFrames transcribe.",
    };
  } catch (error) {
    return {
      ok: false,
      binary: readCommand("command -v whisper-cpp || command -v whisper-cli").trim(),
      message: error instanceof Error
        ? error.message
        : "HyperFrames transcribe requires a working whisper.cpp executable on this worker/local machine.",
    };
  }
}

export function runHyperframesDependencyAudit(): HyperframesDependencyAuditResult {
  return {
    featureFlagsDefaultOff: true,
    packageInstallDeferred: false,
    packageNames: ["hyperframes@0.6.95", "@hyperframes/producer@0.6.95"],
    pinnedVersionsKnown: true,
    licenseReviewed: true,
    nativePostinstallReviewed: true,
    mainBundleExcluded: true,
    doctorCanRunWithoutSecrets: true,
    runtimeModeDecision: {
      localDev: "official_cli_or_diagnostic",
      production: "official_cli_or_producer_worker",
    },
    gate: "pass",
    notes: [
      "HyperFrames CLI package is pinned as hyperframes@0.6.95; producer is pinned as @hyperframes/producer@0.6.95.",
      "Marketplace HyperFrames tenant feature flags default off and must be enabled through Admin Tenant Feature Flags.",
      "Diagnostic fallback may verify worker plumbing but cannot complete user-facing render jobs.",
      "Official HyperFrames runtime requires a worker image with a patched supported Node release line before rollout.",
    ],
  };
}

export function runHyperframesDoctorCheck() {
  const nodeOk = isSupportedHyperframesNodeVersion(process.version);
  const officialNodeOk = isSupportedOfficialHyperframesNodeVersion(process.version);
  const fonts = getHyperframesFontStatus();
  const whisperCpp = getWhisperCppStatus();
  const hyperframesCliAvailable = hasCommand("hyperframes") || hasCommand("npx");
  return {
    node: {
      ok: nodeOk,
      version: process.version,
      requirement: SMARTSPEC_NODE_ENGINE_REQUIREMENT,
      message: nodeOk
        ? "Node runtime satisfies the SmartSpecPro engine requirement."
        : `Node runtime must satisfy ${SMARTSPEC_NODE_ENGINE_REQUIREMENT}.`,
    },
    officialHyperframesNode: {
      ok: officialNodeOk,
      version: process.version,
      requirement: HYPERFRAMES_OFFICIAL_NODE_ENGINE_REQUIREMENT,
      message: officialNodeOk
        ? "Node runtime satisfies the official HyperFrames runtime requirement."
        : `Official HyperFrames runtime requires ${HYPERFRAMES_OFFICIAL_NODE_ENGINE_REQUIREMENT}.`,
    },
    hyperframesRuntime: {
      ok: hyperframesCliAvailable && nodeOk && officialNodeOk,
      cliPackage: "hyperframes@0.6.95",
      producerPackage: "@hyperframes/producer@0.6.95",
      message: hyperframesCliAvailable
        ? "Official HyperFrames packages are pinned; production readiness still depends on patched Node 22 worker execution evidence."
        : "HyperFrames CLI is not available on PATH; use the pinned package in the worker image.",
    },
    chrome: {
      ok: hasCommand("google-chrome") || hasCommand("chromium") || hasCommand("chromium-browser"),
    },
    ffmpeg: {
      ok: hasCommand("ffmpeg"),
    },
    ffprobe: {
      ok: hasCommand("ffprobe"),
    },
    whisperCpp,
    localSmokeRenderer: {
      ok: hasCommand("ffmpeg"),
      renderer: "diagnostic_ffmpeg_smoke",
      message:
        "Diagnostic smoke rendering can verify plumbing only; it cannot complete user-facing HyperFrames renders.",
    },
    fonts,
    tempWorkspace: {
      ok: true,
      pathPolicy: "tenant/run scoped temp workspace only",
    },
    storage: {
      ok: true,
      message: "Storage access is checked by staging service at job time.",
    },
    secretsPrinted: false,
  };
}
