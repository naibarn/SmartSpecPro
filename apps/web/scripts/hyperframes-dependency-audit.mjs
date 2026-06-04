#!/usr/bin/env node

const enabled = /^(1|true|yes|on)$/i.test(
  process.env.MARKETPLACE_HYPERFRAMES_ENABLED ?? ""
);

const result = {
  featureFlagsDefaultOff: !enabled,
  packageInstallDeferred: true,
  packageNames: ["@hyperframes/producer", "@hyperframes/cli"],
  pinnedVersionsKnown: false,
  licenseReviewed: false,
  nativePostinstallReviewed: false,
  mainBundleExcluded: true,
  mvpSmokeRendererAllowed: true,
  gate: "partial",
  notes: [
    "HyperFrames runtime packages are intentionally not installed in this MVP slice.",
    "The local Playwright Chromium + FFmpeg smoke renderer is allowed to verify worker, UI handoff, and fixture gates without importing @hyperframes/*.",
    "The web bundle must not import @hyperframes/* packages.",
    "Production execution remains disabled until exact versions, license, provenance, native scripts, Chrome, FFmpeg, and worker-image checks pass.",
  ],
};

console.log(JSON.stringify(result, null, 2));
