export interface HyperframesProductionRolloutInput {
  packageInstallDeferred: boolean;
  pinnedVersionsKnown: boolean;
  licenseReviewed: boolean;
  nativePostinstallReviewed: boolean;
  provenanceReviewed: boolean;
  workerImageReviewed: boolean;
  fontsReviewed: boolean;
  chromeReady: boolean;
  ffmpegReady: boolean;
  bundleExcludesHyperframesPackages: boolean;
  seededRouteE2ePassed: boolean;
  goldenSnapshotsPassed: boolean;
}

export interface HyperframesProductionRolloutGate {
  gate: "pass" | "blocked";
  runtimeMode: "smoke_only" | "producer_ready";
  mvpSmokeReady: boolean;
  productionRuntimeReady: boolean;
  producerRuntimeBlocked: boolean;
  installAllowed: boolean;
  installCommandAllowed: boolean;
  packageNames: ["@hyperframes/producer", "@hyperframes/cli"];
  blockers: string[];
  requiredEvidence: string[];
  nextMilestone: string;
}

export function evaluateHyperframesProductionRolloutGate(
  input: HyperframesProductionRolloutInput
): HyperframesProductionRolloutGate {
  const blockers: string[] = [];
  if (input.packageInstallDeferred) blockers.push("package_install_deferred");
  if (!input.pinnedVersionsKnown) blockers.push("pinned_versions_missing");
  if (!input.licenseReviewed) blockers.push("license_not_reviewed");
  if (!input.nativePostinstallReviewed) blockers.push("native_postinstall_not_reviewed");
  if (!input.provenanceReviewed) blockers.push("provenance_not_reviewed");
  if (!input.workerImageReviewed) blockers.push("worker_image_not_reviewed");
  if (!input.fontsReviewed) blockers.push("fonts_not_reviewed");
  if (!input.chromeReady) blockers.push("chrome_not_ready");
  if (!input.ffmpegReady) blockers.push("ffmpeg_not_ready");
  if (!input.bundleExcludesHyperframesPackages) {
    blockers.push("main_bundle_import_risk");
  }
  if (!input.seededRouteE2ePassed) blockers.push("seeded_route_e2e_missing");
  if (!input.goldenSnapshotsPassed) blockers.push("golden_snapshots_missing");

  const pass = blockers.length === 0;
  const mvpSmokeReady =
    input.bundleExcludesHyperframesPackages && input.chromeReady && input.ffmpegReady;
  const milestoneGroups = [
    input.packageInstallDeferred ||
    !input.pinnedVersionsKnown ||
    !input.licenseReviewed ||
    !input.nativePostinstallReviewed ||
    !input.provenanceReviewed
      ? "dependency"
      : null,
    !input.workerImageReviewed ||
    !input.fontsReviewed ||
    !input.chromeReady ||
    !input.ffmpegReady
      ? "worker-image"
      : null,
    !input.bundleExcludesHyperframesPackages ? "bundle-import" : null,
    !input.seededRouteE2ePassed ? "seeded-route" : null,
    !input.goldenSnapshotsPassed ? "golden-snapshot" : null,
  ].filter(Boolean);
  return {
    gate: pass ? "pass" : "blocked",
    runtimeMode: pass ? "producer_ready" : "smoke_only",
    mvpSmokeReady,
    productionRuntimeReady: pass,
    producerRuntimeBlocked: !pass,
    installAllowed: pass,
    installCommandAllowed: pass,
    packageNames: ["@hyperframes/producer", "@hyperframes/cli"],
    blockers,
    requiredEvidence: blockers,
    nextMilestone: pass
      ? "Install pinned @hyperframes packages in the dedicated worker image and run production render verification."
      : `Keep MVP smoke renderer only; finish ${milestoneGroups.join(", ")} gates before installing @hyperframes packages.`,
  };
}

export function defaultHyperframesProductionRolloutGate() {
  return evaluateHyperframesProductionRolloutGate({
    packageInstallDeferred: true,
    pinnedVersionsKnown: false,
    licenseReviewed: false,
    nativePostinstallReviewed: false,
    provenanceReviewed: false,
    workerImageReviewed: false,
    fontsReviewed: false,
    chromeReady: false,
    ffmpegReady: false,
    bundleExcludesHyperframesPackages: true,
    seededRouteE2ePassed: false,
    goldenSnapshotsPassed: false,
  });
}
