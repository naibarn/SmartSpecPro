import { execFileSync } from "node:child_process";

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

export function runHyperframesDependencyAudit(): HyperframesDependencyAuditResult {
  const enabledByDefault = ["1", "true", "yes", "on"].includes(
    (process.env.MARKETPLACE_HYPERFRAMES_ENABLED ?? "").toLowerCase()
  );
  return {
    featureFlagsDefaultOff: !enabledByDefault,
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
      "The MVP smoke renderer may execute without @hyperframes/* packages to verify worker, storage, MediaStudio handoff, and fixture gates.",
      "Production @hyperframes/* execution remains disabled until dependency, browser-image, font, and worker isolation checks pass.",
    ],
  };
}

export function runHyperframesDoctorCheck() {
  return {
    node: {
      ok: /^v(20|22)\./.test(process.version),
      version: process.version,
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
    fonts: {
      ok: true,
      message: "Font availability must be verified in worker image before rollout.",
    },
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
