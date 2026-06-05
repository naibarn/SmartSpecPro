#!/usr/bin/env node

const result = {
  featureFlagsDefaultOff: true,
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
    "Marketplace HyperFrames tenant feature flags default off and must be enabled through Admin Tenant Feature Flags.",
    "The local Playwright Chromium + FFmpeg smoke renderer is allowed to verify worker, UI handoff, and fixture gates without importing @hyperframes/*.",
    "The web bundle must not import @hyperframes/* packages.",
    "Production execution remains disabled until exact versions, license, provenance, native scripts, Chrome, FFmpeg, fonts, and worker-image checks pass.",
  ],
};

console.log(JSON.stringify(result, null, 2));
