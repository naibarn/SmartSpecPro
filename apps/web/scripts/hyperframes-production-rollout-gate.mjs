#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const truthy = value => /^(1|true|yes|on)$/i.test(value ?? "");
const here = dirname(fileURLToPath(import.meta.url));
const evidenceDir =
  process.env.MARKETPLACE_HYPERFRAMES_EVIDENCE_DIR ||
  join(here, "../test-results/marketplace-hyperframes");
const DEFAULT_ROUTE_EVIDENCE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const routeEvidenceMaxAgeMs = Number.parseInt(
  process.env.MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS ?? "",
  10
);
const routeEvidenceFreshnessMs =
  Number.isFinite(routeEvidenceMaxAgeMs) && routeEvidenceMaxAgeMs > 0
    ? routeEvidenceMaxAgeMs
    : DEFAULT_ROUTE_EVIDENCE_MAX_AGE_MS;
const requiredRouteScreenshotSpecs = [
  {
    fileName: "route-product-detail-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-storyboard-review-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-mediastudio-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-media-history-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-media-history-product-run-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-document-management-390x844.png",
    width: 390,
    height: 844,
  },
  {
    fileName: "route-video-editor-390x844.png",
    width: 390,
    height: 844,
  },
];
const requiredRouteScreenshots = requiredRouteScreenshotSpecs.map(
  screenshot => screenshot.fileName
);
const requiredRouteScreenshotByName = new Map(
  requiredRouteScreenshotSpecs.map(screenshot => [
    screenshot.fileName,
    screenshot,
  ])
);
const requiredRouteOverflowKeys = [
  "productDetail",
  "storyboardReview",
  "mediaStudio",
  "mediaHistory",
  "mediaHistoryProductRun",
  "documentManagement",
  "videoEditor",
];
const zeroCountEvidenceFields = [
  "overflowElementCount",
  "scrollableInteractiveWithoutAriaLabelCount",
];
const openQuestionDecisionLogPath =
  process.env.MARKETPLACE_HYPERFRAMES_OPEN_QUESTION_LOG ||
  join(
    here,
    "../../..",
    "specs/feature/120-hyperframes-creative-systems-overlay-audio-presets/reviews/open-question-decision-log.md"
  );
const capabilityDecisionEnvMap = [
  ["MARKETPLACE_HYPERFRAMES_ENABLE_SFX_PACKS", "OQ-01"],
  ["MARKETPLACE_HYPERFRAMES_ENABLE_MUSIC_PACKS", "OQ-02"],
  ["MARKETPLACE_HYPERFRAMES_ENABLE_KARAOKE_WORD", "OQ-03"],
  ["MARKETPLACE_HYPERFRAMES_ENABLE_PRODUCER_RUNTIME", "OQ-04"],
  ["MARKETPLACE_HYPERFRAMES_ENABLE_STUDIO_PREVIEW", "OQ-05"],
];
const routeAuditCountFields = [
  "overflowElementCount",
  "scrollableOverflowElementCount",
  "interactiveScrollableOverflowElementCount",
  "scrollableInteractiveWithoutAriaLabelCount",
];
const genericEvidenceMaxAgeMs = Number.parseInt(
  process.env.MARKETPLACE_HYPERFRAMES_EVIDENCE_MAX_AGE_MS ?? "",
  10
);
const evidenceFreshnessMs =
  Number.isFinite(genericEvidenceMaxAgeMs) && genericEvidenceMaxAgeMs > 0
    ? genericEvidenceMaxAgeMs
    : DEFAULT_ROUTE_EVIDENCE_MAX_AGE_MS;

function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function routeEvidenceFresh(evidence) {
  const generatedAt = Date.parse(evidence?.generatedAt ?? "");
  if (!Number.isFinite(generatedAt)) return false;
  const ageMs = Date.now() - generatedAt;
  return ageMs >= 0 && ageMs <= routeEvidenceFreshnessMs;
}

function evidenceFresh(evidence) {
  const generatedAt = Date.parse(evidence?.generatedAt ?? "");
  if (!Number.isFinite(generatedAt)) return false;
  const ageMs = Date.now() - generatedAt;
  return ageMs >= 0 && ageMs <= evidenceFreshnessMs;
}

function dependencyEvidencePassed() {
  const report = readJsonIfExists(join(evidenceDir, "dependency-audit-report.json"));
  if (!report || !evidenceFresh(report)) return false;
  const packages = Array.isArray(report.packages) ? report.packages : [];
  const requiredNames = new Set(["hyperframes", "@hyperframes/producer"]);
  const packageByName = new Map();
  for (const item of packages) {
    if (!requiredNames.has(item?.name) || packageByName.has(item.name)) {
      return false;
    }
    packageByName.set(item.name, item);
  }
  const requiredPackageEvidenceOk = [...requiredNames].every(name => {
    const item = packageByName.get(name);
    return Boolean(
      item &&
        item.lockVersion === item.pinnedVersion &&
        item.installedVersion === item.pinnedVersion &&
        typeof item.integrity === "string" &&
        item.integrity.startsWith("sha512-") &&
        item.hasInstallScript === false
    );
  });
  return Boolean(
    report.gate === "pass" &&
      report.status === "passed" &&
      report.packageInstallDeferred === false &&
      report.pinnedVersionsKnown === true &&
      report.licenseReviewed === true &&
      report.nativePostinstallReviewed === true &&
      report.provenanceReviewed === true &&
      report.mainBundleExcluded === true &&
      requiredPackageEvidenceOk
  );
}

function doctorEvidence() {
  const report = readJsonIfExists(join(evidenceDir, "doctor-report.json"));
  if (!report || !evidenceFresh(report)) return null;
  return report;
}

function doctorRuntimeEvidencePassed(report) {
  return Boolean(
    report?.gate === "official_runtime_ready" &&
      report?.officialHyperframesNode?.ok === true &&
      report?.hyperframesRuntime?.ok === true &&
      report?.chrome?.ok === true &&
      report?.ffmpeg?.ok === true &&
      report?.ffprobe?.ok === true &&
      report?.fonts?.ok === true &&
      report?.tempWorkspace?.ok === true &&
      report?.storage?.ok === true &&
      report?.workerImage?.reviewed === true &&
      report?.officialCli?.ok === true
  );
}

function snapshotEvidencePassed() {
  const manifest = readJsonIfExists(join(evidenceDir, "snapshot-test-manifest.json"));
  if (!manifest || !evidenceFresh(manifest)) return false;
  return Boolean(
    manifest.gate === "snapshot-test" &&
      manifest.status === "passed" &&
      manifest.officialRuntime === true &&
      typeof manifest.goldenSnapshotHash === "string" &&
      /^hf_[a-f0-9]{24,128}$/i.test(manifest.goldenSnapshotHash) &&
      manifest.checks?.officialRuntime === true &&
      manifest.checks?.playableVideo === true &&
      manifest.checks?.exactDuration === true &&
      manifest.checks?.textSafeArea === true &&
      manifest.checks?.subtitleSafeArea === true &&
      manifest.checks?.outputHashPresent === true &&
      manifest.checks?.requiredCasesCovered === true
  );
}

function officialCliEvidencePassed(report) {
  const compatibility = readJsonIfExists(join(evidenceDir, "official-compatibility-report.json"));
  if (!doctorRuntimeEvidencePassed(report)) return false;
  if (!compatibility || !evidenceFresh(compatibility)) return false;
  return Boolean(
    compatibility.gate === "official-compatibility" &&
      compatibility.node?.officialRuntimeReady === true &&
      compatibility.fixture?.commandRan === true &&
      compatibility.fixture?.status === 0 &&
      compatibility.fixture?.manifestStatus === "passed" &&
      compatibility.fixture?.officialRuntime === true &&
      compatibility.fixture?.renderer === "hyperframes_cli_official"
  );
}

function rollbackEvidencePassed() {
  const evidence = readJsonIfExists(join(evidenceDir, "rollback-evidence.json"));
  if (!evidence || !evidenceFresh(evidence)) return false;
  const checks = evidence.checks && typeof evidence.checks === "object" ? evidence.checks : {};
  return Boolean(
    evidence.gate === "rollback-drill" &&
      evidence.status === "passed" &&
      checks.featureFlagRollbackPathDocumented === true &&
      checks.newJobsBlockedWhenRuntimeDisabled === true &&
      checks.diagnosticFallbackCannotCompleteUserFacingFinal === true &&
      checks.completedLibraryArtifactsRemainReadable === true &&
      checks.standardOrderFallbackPreserved === true &&
      checks.transientArtifactPurgeIsDryRunFirst === true
  );
}

function buildCrcTable() {
  const table = new Uint32Array(256);
  for (let index = 0; index < table.length; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value =
        value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
}

const crcTable = buildCrcTable();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function parsePngMetadata(file) {
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (
    file.length < 57 ||
    !pngSignature.every((byte, index) => file[index] === byte)
  ) {
    return null;
  }
  let offset = 8;
  let width = 0;
  let height = 0;
  let seenIhdr = false;
  let seenIdat = false;
  let seenIend = false;
  while (offset + 12 <= file.length) {
    const length = file.readUInt32BE(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcEnd = dataEnd + 4;
    if (dataEnd > file.length || crcEnd > file.length) return null;
    const type = file.toString("ascii", typeStart, dataStart);
    const expectedCrc = file.readUInt32BE(dataEnd);
    const actualCrc = crc32(file.subarray(typeStart, dataEnd));
    if (actualCrc !== expectedCrc) return null;
    if (!seenIhdr) {
      if (type !== "IHDR" || length !== 13) return null;
      width = file.readUInt32BE(dataStart);
      height = file.readUInt32BE(dataStart + 4);
      if (width <= 0 || height <= 0) return null;
      seenIhdr = true;
    } else if (type === "IHDR") {
      return null;
    }
    if (type === "IDAT") seenIdat = true;
    if (type === "IEND") {
      seenIend = true;
      return crcEnd === file.length && seenIhdr && seenIdat
        ? { width, height }
        : null;
    }
    offset = crcEnd;
  }
  return seenIend ? { width, height } : null;
}

function screenshotEvidenceValid(fileName) {
  const path = join(evidenceDir, fileName);
  if (!existsSync(path)) return false;
  try {
    const stats = statSync(path);
    if (stats.size < 1024) return false;
    const file = readFileSync(path);
    const metadata = parsePngMetadata(file);
    if (!metadata) return false;
    const expected = requiredRouteScreenshotByName.get(fileName);
    return expected
      ? metadata.width === expected.width && metadata.height >= expected.height
      : true;
  } catch {
    return false;
  }
}

function zeroCountEvidenceValid(evidence) {
  return zeroCountEvidenceFields.every(field => evidence[field] === 0);
}

function emptyArrayEvidenceValid(evidence, field) {
  return Array.isArray(evidence[field]) && evidence[field].length === 0;
}

function routeOverflowEvidenceValid(evidence) {
  const overflowByRoute = evidence.overflowByRoute;
  if (!overflowByRoute || typeof overflowByRoute !== "object") return false;
  for (const routeKey of requiredRouteOverflowKeys) {
    const overflow = overflowByRoute[routeKey];
    if (
      !overflow ||
      typeof overflow.scrollWidth !== "number" ||
      typeof overflow.clientWidth !== "number"
    ) {
      return false;
    }
    if (overflow.scrollWidth > overflow.clientWidth + 1) return false;
  }
  return true;
}

function routeOverflowAuditEvidenceValid(evidence) {
  const overflowAuditByRoute = evidence.overflowAuditByRoute;
  if (!overflowAuditByRoute || typeof overflowAuditByRoute !== "object") {
    return false;
  }
  const totals = Object.fromEntries(
    routeAuditCountFields.map(field => [field, 0])
  );
  for (const routeKey of requiredRouteOverflowKeys) {
    const audit = overflowAuditByRoute[routeKey];
    if (!audit || typeof audit !== "object") return false;
    for (const field of routeAuditCountFields) {
      if (typeof audit[field] !== "number") return false;
      totals[field] += audit[field];
    }
    if (audit.overflowElementCount !== 0) return false;
    if (audit.scrollableInteractiveWithoutAriaLabelCount !== 0) return false;
    if (!emptyArrayEvidenceValid(audit, "overflowElements")) return false;
    if (
      !emptyArrayEvidenceValid(
        audit,
        "scrollableInteractiveWithoutAriaLabels"
      )
    ) {
      return false;
    }
  }
  return routeAuditCountFields.every(field => evidence[field] === totals[field]);
}

function productDetailFirstViewportEvidenceValid(evidence) {
  const firstViewport = evidence.productDetailFirstViewport;
  if (!firstViewport || typeof firstViewport !== "object") return false;
  const viewportHeight = Number(firstViewport.viewportHeight);
  const autoFirstActionTop = Number(firstViewport.autoFirstActionTop);
  const autoCtaTop = Number(firstViewport.autoCtaTop);
  const standardModeTop = Number(firstViewport.standardModeTop);
  const productSummaryTop = Number(firstViewport.productSummaryTop);
  if (
    !Number.isFinite(viewportHeight) ||
    !Number.isFinite(autoFirstActionTop) ||
    !Number.isFinite(autoCtaTop) ||
    !Number.isFinite(standardModeTop) ||
    !Number.isFinite(productSummaryTop)
  ) {
    return false;
  }
  return (
    viewportHeight >= 600 &&
    autoFirstActionTop >= 0 &&
    autoCtaTop >= 0 &&
    standardModeTop >= 0 &&
    productSummaryTop >= 0 &&
    autoFirstActionTop < viewportHeight &&
    autoCtaTop < viewportHeight &&
    standardModeTop < viewportHeight &&
    autoFirstActionTop < productSummaryTop
  );
}

function routeEvidencePassed() {
  const evidence = readJsonIfExists(join(evidenceDir, "route-evidence.json"));
  if (!evidence?.routeLevel || !evidence?.authenticated) return false;
  if (!routeEvidenceFresh(evidence)) return false;
  const routes = new Set(Array.isArray(evidence.routes) ? evidence.routes : []);
  for (const route of [
    "/marketplace-capture/products/product_1",
    "/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1",
    "/media-studio",
    "/media-history?source=marketplace_auto_review_hyperframes_render&type=video&productId=product_1&runId=mar_1",
    "/media-history?type=video&productId=product_1&runId=mar_1",
    "/document-management?source=marketplace_auto_review_hyperframes_render&productId=product_1&runId=mar_1",
    "/video-editor?libraryItemId=1",
  ]) {
    if (!routes.has(route)) return false;
  }
  if (!emptyArrayEvidenceValid(evidence, "consoleErrors")) return false;
  if (!emptyArrayEvidenceValid(evidence, "pageErrors")) return false;
  if (!emptyArrayEvidenceValid(evidence, "overflowElements")) return false;
  if (!emptyArrayEvidenceValid(evidence, "scrollableInteractiveWithoutAriaLabels")) {
    return false;
  }
  if (!zeroCountEvidenceValid(evidence)) return false;
  if (!routeOverflowEvidenceValid(evidence)) return false;
  if (!routeOverflowAuditEvidenceValid(evidence)) return false;
  if (!productDetailFirstViewportEvidenceValid(evidence)) return false;
  const screenshots = Array.isArray(evidence.screenshots)
    ? evidence.screenshots
    : [];
  const screenshotSet = new Set(screenshots);
  for (const screenshot of requiredRouteScreenshots) {
    if (!screenshotSet.has(screenshot) || !screenshotEvidenceValid(screenshot)) {
      return false;
    }
  }
  return screenshots.every(screenshotEvidenceValid);
}

function fixtureFinalOutputEvidencePassed() {
  const manifest = readJsonIfExists(join(evidenceDir, "fixture-render-manifest.json"));
  if (!manifest || manifest.status !== "passed") return false;
  const output = manifest.output && typeof manifest.output === "object"
    ? manifest.output
    : {};
  const outputRef = manifest.outputRef && typeof manifest.outputRef === "object"
    ? manifest.outputRef
    : {};
  const playableProbe = manifest.playableProbe && typeof manifest.playableProbe === "object"
    ? manifest.playableProbe
    : {};
  const mediaHistory = manifest.mediaHistory && typeof manifest.mediaHistory === "object"
    ? manifest.mediaHistory
    : {};
  const audioMixReport = manifest.audioMixReport && typeof manifest.audioMixReport === "object"
    ? manifest.audioMixReport
    : {};
  const exactDuration = manifest.exactDuration && typeof manifest.exactDuration === "object"
    ? manifest.exactDuration
    : {};
  const safeArea = manifest.safeArea && typeof manifest.safeArea === "object"
    ? manifest.safeArea
    : {};
  const fixtureMatrix = manifest.fixtureMatrix && typeof manifest.fixtureMatrix === "object"
    ? manifest.fixtureMatrix
    : {};
  const officialRuntimeEvidenceOk =
    manifest.officialRuntime === true &&
    typeof manifest.renderer === "string" &&
    /^hyperframes_(cli|producer)_official$/.test(manifest.renderer);
  const coveredCases = Array.isArray(fixtureMatrix.coveredCases)
    ? new Set(fixtureMatrix.coveredCases)
    : new Set();
  const policyCases = Array.isArray(fixtureMatrix.policyCases)
    ? new Set(fixtureMatrix.policyCases)
    : new Set();
	  const requiredFixtureCases = [
	    "ecommerce_toy_no_audio_silent_policy",
	    "electronics_spec_overlay",
	    "price_deal_overlay",
	    "ugc_review_subtitle_style",
	    "thai_long_text_safe_area",
	    "music_sfx_event_map",
	    "native_audio_policy",
	    "generated_clip_source_preservation",
	    "multi_scene_transition",
	  ];
  const requiredPolicyCases = [
    "licensed_audio_asset_pending",
    "missing_license_source_blocks_without_fallback",
    "stale_price_requires_evidence_refresh",
    "unsupported_user_claim_requires_review",
    "product_truth_hash_mismatch_blocks_render",
  ];
  const validHash = value =>
    typeof value === "string" && /^hf_[a-f0-9]{24,128}$/i.test(value);
  const audioPolicyOk =
    playableProbe.hasAudio === true ||
    (audioMixReport.outputAudioPolicy === "no_audio_explicit_silent_policy" &&
      audioMixReport.explicitSilentPolicy === true);
  return Boolean(
    validHash(manifest.creativePlanHash) &&
      officialRuntimeEvidenceOk &&
      validHash(manifest.presetManifestHash) &&
      validHash(manifest.audioEventMapHash) &&
      requiredFixtureCases.every(item => coveredCases.has(item)) &&
      requiredPolicyCases.every(item => policyCases.has(item)) &&
      output.ok === true &&
      Number(output.sizeBytes) > 1024 &&
      outputRef.kind === "final_video" &&
      typeof outputRef.url === "string" &&
      outputRef.url.startsWith("/api/storage/files/") &&
      typeof outputRef.contentHash === "string" &&
      outputRef.contentHash.startsWith("hf_") &&
      playableProbe.passed === true &&
      playableProbe.hasVideo === true &&
      typeof playableProbe.durationSec === "number" &&
      playableProbe.durationSec > 0 &&
      exactDuration.passed === true &&
      typeof exactDuration.expectedDurationSec === "number" &&
      Math.abs(Number(exactDuration.actualDurationSec) - exactDuration.expectedDurationSec) <=
        Number(exactDuration.toleranceSec ?? 0.25) &&
      safeArea.textSafe === true &&
      safeArea.subtitleSafe === true &&
      safeArea.overflowElementCount === 0 &&
      mediaHistory.source === "marketplace_auto_review_hyperframes_render" &&
      mediaHistory.mediaKind === "video" &&
      mediaHistory.productId === "product_1" &&
      mediaHistory.runId === "mar_1" &&
      mediaHistory.openAction === true &&
      mediaHistory.downloadAction === true &&
      typeof audioMixReport.outputAudioPolicy === "string" &&
      audioMixReport.audioEventMapHash === manifest.audioEventMapHash &&
      audioPolicyOk
  );
}

function readOpenDecisionIds() {
  if (!existsSync(openQuestionDecisionLogPath)) return new Set(["OQ-01", "OQ-02", "OQ-03", "OQ-04", "OQ-05"]);
  const text = readFileSync(openQuestionDecisionLogPath, "utf8");
  const openIds = new Set();
  for (const line of text.split(/\r?\n/)) {
    const cells = line
      .split("|")
      .map(cell => cell.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;
    const [id, , , decisionStatus] = cells;
    if (/^OQ-\d+$/i.test(id) && /^Open$/i.test(decisionStatus)) {
      openIds.add(id.toUpperCase());
    }
  }
  return openIds;
}

function enabledCapabilityOpenQuestionBlockers() {
  const openIds = readOpenDecisionIds();
  return capabilityDecisionEnvMap
    .filter(([envName, decisionId]) => truthy(process.env[envName]) && openIds.has(decisionId))
    .map(([, decisionId]) => `open_question_${decisionId}`);
}

const doctorReport = doctorEvidence();
const dependencyReady = dependencyEvidencePassed();
const runtimeReady = doctorRuntimeEvidencePassed(doctorReport);
const input = {
  packageInstallDeferred: !dependencyReady,
  pinnedVersionsKnown: dependencyReady,
  licenseReviewed: dependencyReady,
  nativePostinstallReviewed: dependencyReady,
  provenanceReviewed: dependencyReady,
  workerImageReviewed: runtimeReady,
  fontsReviewed: runtimeReady,
  chromeReady: runtimeReady,
  ffmpegReady: runtimeReady,
  bundleExcludesHyperframesPackages: !truthy(process.env.MARKETPLACE_HYPERFRAMES_ALLOW_WEB_BUNDLE_IMPORT),
  seededRouteE2ePassed: routeEvidencePassed(),
  fixtureFinalOutputPassed: fixtureFinalOutputEvidencePassed(),
  goldenSnapshotsPassed: snapshotEvidencePassed(),
  officialCliReady: officialCliEvidencePassed(doctorReport),
  producerRuntimeRequested: truthy(process.env.MARKETPLACE_HYPERFRAMES_ENABLE_PRODUCER_RUNTIME),
  canaryApproved: truthy(process.env.MARKETPLACE_HYPERFRAMES_RUNTIME_CANARY_APPROVED),
  rollbackVerified: rollbackEvidencePassed(),
};

const blockers = [];
const openQuestionBlockers = enabledCapabilityOpenQuestionBlockers();
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
if (!input.fixtureFinalOutputPassed) blockers.push("fixture_final_output_missing");
if (!input.goldenSnapshotsPassed) blockers.push("golden_snapshots_missing");
if (!input.officialCliReady) blockers.push("official_cli_not_ready");
if (!input.rollbackVerified) blockers.push("rollback_not_verified");
blockers.push(...openQuestionBlockers);

const pass = blockers.length === 0;
const diagnosticOnlyReady =
  input.bundleExcludesHyperframesPackages && input.seededRouteE2ePassed;
const productionRuntimePrerequisitesReady =
  input.bundleExcludesHyperframesPackages && input.chromeReady && input.ffmpegReady;
const officialRuntimeReady = pass;
const runtimeMode = pass
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
  !input.fixtureFinalOutputPassed ? "fixture-final-output" : null,
  !input.goldenSnapshotsPassed ? "golden-snapshot" : null,
  !input.officialCliReady ? "official-cli-runtime" : null,
  !input.rollbackVerified ? "rollback-proof" : null,
  openQuestionBlockers.length > 0 ? "open-question-decision" : null,
].filter(Boolean);
console.log(
  JSON.stringify(
    {
      gate: pass ? "pass" : "blocked",
      runtimeMode,
      diagnosticOnlyReady,
      officialRuntimeReady,
      productionRuntimePrerequisitesReady,
      productionRuntimeReady: pass,
      producerRuntimeBlocked: !pass,
      installAllowed: pass,
      installCommandAllowed: pass,
	      evidence: {
	        dependencyAuditPassed: dependencyReady,
	        bundleExcludesHyperframesPackages: input.bundleExcludesHyperframesPackages,
	        seededRouteE2ePassed: input.seededRouteE2ePassed,
	        fixtureFinalOutputPassed: input.fixtureFinalOutputPassed,
	        goldenSnapshotsPassed: input.goldenSnapshotsPassed,
	        productionRuntimePrerequisitesReady,
	        officialCliReady: input.officialCliReady,
	        rollbackVerified: input.rollbackVerified,
	        doctorOfficialRuntimeReady: runtimeReady,
	      },
      packageNames: ["hyperframes", "@hyperframes/producer"],
      blockers,
      requiredEvidence: blockers,
      nextMilestone: pass
        ? "Enable pinned official HyperFrames runtime in the dedicated worker image and continue canary monitoring."
        : `Keep diagnostic fallback blocked from user-facing completion; finish ${milestoneGroups.join(", ")} gates before enabling official HyperFrames runtime.`,
    },
    null,
    2
  )
);
if (!pass) {
  process.exitCode = 1;
}
