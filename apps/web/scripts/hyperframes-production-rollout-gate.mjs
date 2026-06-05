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
const routeAuditCountFields = [
  "overflowElementCount",
  "scrollableOverflowElementCount",
  "interactiveScrollableOverflowElementCount",
  "scrollableInteractiveWithoutAriaLabelCount",
];

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

const input = {
  packageInstallDeferred: !truthy(process.env.MARKETPLACE_HYPERFRAMES_PACKAGES_READY),
  pinnedVersionsKnown: truthy(process.env.MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED),
  licenseReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED),
  nativePostinstallReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED),
  provenanceReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED),
  workerImageReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED),
  fontsReviewed: truthy(process.env.MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED),
  chromeReady: truthy(process.env.MARKETPLACE_HYPERFRAMES_CHROME_READY),
  ffmpegReady: truthy(process.env.MARKETPLACE_HYPERFRAMES_FFMPEG_READY),
  bundleExcludesHyperframesPackages: !truthy(process.env.MARKETPLACE_HYPERFRAMES_ALLOW_WEB_BUNDLE_IMPORT),
  seededRouteE2ePassed: routeEvidencePassed(),
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
const mvpSmokeReady =
  input.bundleExcludesHyperframesPackages && input.seededRouteE2ePassed;
const productionRuntimePrerequisitesReady =
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
console.log(
  JSON.stringify(
    {
      gate: pass ? "pass" : "blocked",
      runtimeMode: pass ? "producer_ready" : "smoke_only",
      mvpSmokeReady,
      productionRuntimePrerequisitesReady,
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
    },
    null,
    2
  )
);
if (!pass) {
  process.exitCode = 1;
}
