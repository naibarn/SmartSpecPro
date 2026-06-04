#!/usr/bin/env node

const truthy = value => /^(1|true|yes|on)$/i.test(value ?? "");

const input = {
  packageInstallDeferred: !truthy(process.env.MARKETPLACE_HYPERFRAMES_PACKAGES_READY),
  pinnedVersionsKnown: truthy(process.env.MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED),
  licenseReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED),
  nativePostinstallReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED),
  provenanceReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED),
  workerImageReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED),
  fontsReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED),
  chromeReady: truthy(process.env.MARKETPLACE_HYPERFRAMES_CHROME_READY),
  ffmpegReady: truthy(process.env.MARKETPLACE_HYPERFRAMES_FFMPEG_READY ?? "true"),
  bundleExcludesHyperframesPackages: !truthy(process.env.MARKETPLACE_HYPERFRAMES_ALLOW_WEB_BUNDLE_IMPORT),
  seededRouteE2ePassed: truthy(process.env.MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED),
  goldenSnapshotsPassed: truthy(process.env.MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED),
};

const blockers = [];
if (input.packageInstallDeferred) blockers.push("package_install_deferred");
if (!input.pinnedVersionsKnown) blockers.push("pinned_versions_missing");
if (!input.licenseReviewed) blockers.push("license_not_reviewed");
if (!input.nativePostinstallReviewed) blockers.push("native_postinstall_not_reviewed");
if (!input.provenanceReviewed) blockers.push("provenance_not_reviewed");
if (!input.workerImageReviewed) blockers.push("worker_image_not_reviewed");
if (!input.fontsReviewed) blockers.push("fonts_not_reviewed");
if (!input.chromeReady) blockers.push("chrome_not_ready");
if (!input.ffmpegReady) blockers.push("ffmpeg_not_ready");
if (!input.bundleExcludesHyperframesPackages) blockers.push("main_bundle_import_risk");
if (!input.seededRouteE2ePassed) blockers.push("seeded_route_e2e_missing");
if (!input.goldenSnapshotsPassed) blockers.push("golden_snapshots_missing");

const pass = blockers.length === 0;
console.log(
  JSON.stringify(
    {
      gate: pass ? "pass" : "blocked",
      productionRuntimeReady: pass,
      installAllowed: pass,
      packageNames: ["@hyperframes/producer", "@hyperframes/cli"],
      blockers,
      nextMilestone: pass
        ? "Install pinned @hyperframes packages in the dedicated worker image and run production render verification."
        : "Keep MVP smoke renderer only; finish dependency, worker-image, seeded-route, and golden-snapshot gates before installing @hyperframes packages.",
    },
    null,
    2
  )
);
