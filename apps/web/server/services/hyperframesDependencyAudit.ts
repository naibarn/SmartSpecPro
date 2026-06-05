import { execFileSync } from "node:child_process";

const HYPERFRAMES_NODE_ENGINE_REQUIREMENT = ">=20.20.0 <21 || >=22.22.0";

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
    localDev: "smoke_renderer_or_disabled";
    production: "dedicated_worker_or_disabled";
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
  if (parsed.major === 20) {
    return parsed.minor > 20 || (parsed.minor === 20 && parsed.patch >= 0);
  }
  if (parsed.major === 22) {
    return parsed.minor > 22 || (parsed.minor === 22 && parsed.patch >= 0);
  }
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

export function runHyperframesDependencyAudit(): HyperframesDependencyAuditResult {
  return {
    featureFlagsDefaultOff: true,
    packageInstallDeferred: true,
    packageNames: ["@hyperframes/producer", "@hyperframes/cli"],
    pinnedVersionsKnown: false,
    licenseReviewed: false,
    nativePostinstallReviewed: false,
    mainBundleExcluded: true,
    doctorCanRunWithoutSecrets: true,
    runtimeModeDecision: {
      localDev: "smoke_renderer_or_disabled",
      production: "dedicated_worker_or_disabled",
    },
    gate: "partial",
    notes: [
      "HyperFrames package installation is deferred until exact versions and license/provenance checks are complete.",
      "Marketplace HyperFrames tenant feature flags default off and must be enabled through Admin Tenant Feature Flags.",
      "The MVP smoke renderer may execute without @hyperframes/* packages to verify worker, storage, MediaStudio handoff, and fixture gates.",
      "Production @hyperframes/* execution remains disabled until dependency, browser-image, font, and worker isolation checks pass.",
    ],
  };
}

export function runHyperframesDoctorCheck() {
  const nodeOk = isSupportedHyperframesNodeVersion(process.version);
  const fonts = getHyperframesFontStatus();
  return {
    node: {
      ok: nodeOk,
      version: process.version,
      requirement: HYPERFRAMES_NODE_ENGINE_REQUIREMENT,
      message: nodeOk
        ? "Node runtime satisfies the SmartSpecPro engine requirement."
        : `Node runtime must satisfy ${HYPERFRAMES_NODE_ENGINE_REQUIREMENT}.`,
    },
    hyperframesRuntime: {
      ok: false,
      message: "HyperFrames runtime is intentionally deferred in MVP preflight.",
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
    localSmokeRenderer: {
      ok: hasCommand("ffmpeg"),
      renderer: "playwright_chromium_ffmpeg_smoke",
      message:
        "Local smoke rendering is allowed for MVP gates; production @hyperframes/* execution remains separately gated.",
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
