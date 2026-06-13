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
  officialCliReady?: boolean;
  producerRuntimeRequested?: boolean;
  canaryApproved?: boolean;
  rollbackVerified?: boolean;
}

export interface HyperframesProductionRolloutGate {
  gate: "pass" | "blocked";
  runtimeMode:
    | "official_runtime_blocked"
    | "official_cli_ready"
    | "official_producer_ready"
    | "canary"
    | "rollback";
  diagnosticOnlyReady: boolean;
  officialRuntimeReady: boolean;
  productionRuntimeReady: boolean;
  producerRuntimeBlocked: boolean;
  installAllowed: boolean;
  installCommandAllowed: boolean;
  packageNames: ["hyperframes", "@hyperframes/producer"];
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
  if (!input.officialCliReady) blockers.push("official_cli_not_ready");
  if (!input.rollbackVerified) blockers.push("rollback_not_verified");

  const pass = blockers.length === 0;
  const diagnosticOnlyReady =
    input.bundleExcludesHyperframesPackages && input.chromeReady && input.ffmpegReady;
  const officialRuntimeReady = pass;
  const runtimeMode: HyperframesProductionRolloutGate["runtimeMode"] = pass
    ? input.canaryApproved
      ? "canary"
      : input.producerRuntimeRequested
        ? "official_producer_ready"
        : "official_cli_ready"
    : "official_runtime_blocked";
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
    !input.officialCliReady ? "official-cli-runtime" : null,
    !input.rollbackVerified ? "rollback-proof" : null,
  ].filter(Boolean);
  return {
    gate: pass ? "pass" : "blocked",
    runtimeMode,
    diagnosticOnlyReady,
    officialRuntimeReady,
    productionRuntimeReady: pass,
    producerRuntimeBlocked: !pass,
    installAllowed: pass,
    installCommandAllowed: pass,
    packageNames: ["hyperframes", "@hyperframes/producer"],
    blockers,
    requiredEvidence: blockers,
    nextMilestone: pass
      ? "Enable pinned official HyperFrames runtime in the dedicated worker image and continue canary monitoring."
      : `Keep diagnostic fallback blocked from user-facing completion; finish ${milestoneGroups.join(", ")} gates before enabling official HyperFrames runtime.`,
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
    officialCliReady: false,
    rollbackVerified: false,
  });
}
