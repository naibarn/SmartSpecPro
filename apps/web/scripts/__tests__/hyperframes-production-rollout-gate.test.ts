import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const scriptPath = resolve(here, "../hyperframes-production-rollout-gate.mjs");

const requiredRoutes = [
  "/marketplace-capture/products/product_1",
  "/storyboard-review?hyperframesRenderJobId=hf_route_1&productId=product_1&runId=mar_1",
  "/media-studio",
  "/media-history?source=marketplace_auto_review_hyperframes_render&type=video&productId=product_1&runId=mar_1",
  "/media-history?type=video&productId=product_1&runId=mar_1",
  "/document-management?source=marketplace_auto_review_hyperframes_render&productId=product_1&runId=mar_1",
  "/video-editor?libraryItemId=1",
];
const requiredScreenshots = [
  "route-product-detail-390x844.png",
  "route-storyboard-review-390x844.png",
  "route-mediastudio-390x844.png",
  "route-media-history-390x844.png",
  "route-media-history-product-run-390x844.png",
  "route-document-management-390x844.png",
  "route-video-editor-390x844.png",
];
const routeOverflow = { scrollWidth: 390, clientWidth: 390 };
const requiredOverflowByRoute = {
  productDetail: routeOverflow,
  storyboardReview: routeOverflow,
  mediaStudio: routeOverflow,
  mediaHistory: routeOverflow,
  mediaHistoryProductRun: routeOverflow,
  documentManagement: routeOverflow,
  videoEditor: routeOverflow,
};
const routeAudit = {
  overflowElementCount: 0,
  scrollableOverflowElementCount: 0,
  interactiveScrollableOverflowElementCount: 0,
  scrollableInteractiveWithoutAriaLabelCount: 0,
  overflowElements: [],
  scrollableOverflowElements: [],
  interactiveScrollableOverflowElements: [],
  scrollableInteractiveWithoutAriaLabels: [],
};
const requiredOverflowAuditByRoute = {
  productDetail: routeAudit,
  storyboardReview: routeAudit,
  mediaStudio: routeAudit,
  mediaHistory: routeAudit,
  mediaHistoryProductRun: routeAudit,
  documentManagement: routeAudit,
  videoEditor: routeAudit,
};
const productDetailFirstViewport = {
  viewportHeight: 844,
  autoFirstActionTop: 76,
  autoCtaTop: 308,
  standardModeTop: 156,
  productSummaryTop: 534,
};

type RolloutGateOutput = {
  gate: string;
  blockers: string[];
  mvpSmokeReady: boolean;
  productionRuntimePrerequisitesReady: boolean;
};

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

function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function validPngFixture(width = 390, height = 844) {
  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const rawScanlines = Buffer.alloc((width + 1) * height);
  const text = Buffer.from(`Comment\0${"route evidence ".repeat(120)}`);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("tEXt", text),
    pngChunk("IDAT", deflateSync(rawScanlines)),
    pngChunk("IEND"),
  ]);
}

function signatureOnlyPngFixture() {
  const buffer = Buffer.alloc(2048);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(
    buffer
  );
  return buffer;
}

function writeRouteEvidence(
  generatedAt: string,
  screenshot = validPngFixture(),
  screenshots = requiredScreenshots,
  evidenceOverrides: Record<string, unknown> = {}
) {
  const evidenceDir = mkdtempSync(resolve(tmpdir(), "hyperframes-route-evidence-"));
  for (const fileName of screenshots) {
    writeFileSync(resolve(evidenceDir, fileName), screenshot);
  }
  writeFileSync(
    resolve(evidenceDir, "route-evidence.json"),
    JSON.stringify(
      {
        generatedAt,
        routeLevel: true,
        authenticated: true,
        routes: requiredRoutes,
        consoleErrors: [],
        pageErrors: [],
        overflowElements: [],
        scrollableOverflowElements: [],
        interactiveScrollableOverflowElements: [],
        scrollableInteractiveWithoutAriaLabels: [],
        overflowElementCount: 0,
        scrollableOverflowElementCount: 0,
        interactiveScrollableOverflowElementCount: 0,
        scrollableInteractiveWithoutAriaLabelCount: 0,
        overflowByRoute: requiredOverflowByRoute,
        overflowAuditByRoute: requiredOverflowAuditByRoute,
        productDetailFirstViewport,
        screenshots,
        ...evidenceOverrides,
      },
      null,
      2
    )
  );
  return evidenceDir;
}

function runGate(
  evidenceDir: string,
  routeEvidenceMaxAgeMs: string,
  extraEnv: NodeJS.ProcessEnv = {}
) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: resolve(here, ".."),
    encoding: "utf8",
    env: {
      ...process.env,
      MARKETPLACE_HYPERFRAMES_EVIDENCE_DIR: evidenceDir,
      MARKETPLACE_HYPERFRAMES_ROUTE_EVIDENCE_MAX_AGE_MS: routeEvidenceMaxAgeMs,
      MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED: "false",
      MARKETPLACE_HYPERFRAMES_PACKAGES_READY: "true",
      MARKETPLACE_HYPERFRAMES_PINNED_VERSIONS_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_LICENSE_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_POSTINSTALL_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_PROVENANCE_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_WORKER_IMAGE_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_FONTS_REVIEWED: "true",
      MARKETPLACE_HYPERFRAMES_CHROME_READY: "true",
      MARKETPLACE_HYPERFRAMES_FFMPEG_READY: "true",
      MARKETPLACE_HYPERFRAMES_GOLDEN_SNAPSHOTS_PASSED: "true",
      ...extraEnv,
    },
  });
  return {
    ...(JSON.parse(result.stdout) as RolloutGateOutput),
    status: result.status,
  };
}

describe("hyperframes-production-rollout-gate script", () => {
  it("accepts fresh seeded route evidence", () => {
    const evidenceDir = writeRouteEvidence(new Date().toISOString());
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("pass");
      expect(gate.status).toBe(0);
      expect(gate.mvpSmokeReady).toBe(true);
      expect(gate.productionRuntimePrerequisitesReady).toBe(true);
      expect(gate.blockers).not.toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects route evidence that does not prove Product Detail Auto-first first viewport ordering", () => {
    const missingFirstViewportDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      { productDetailFirstViewport: undefined }
    );
    try {
      const gate = runGate(
        missingFirstViewportDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(missingFirstViewportDir, { recursive: true, force: true });
    }

    const invertedFirstViewportDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        productDetailFirstViewport: {
          ...productDetailFirstViewport,
          autoFirstActionTop: 610,
          productSummaryTop: 80,
        },
      }
    );
    try {
      const gate = runGate(
        invertedFirstViewportDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(invertedFirstViewportDir, { recursive: true, force: true });
    }
  });

  it("keeps MVP smoke readiness separate from production runtime prerequisites", () => {
    const evidenceDir = writeRouteEvidence(new Date().toISOString());
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000), {
        MARKETPLACE_HYPERFRAMES_CHROME_READY: "false",
        MARKETPLACE_HYPERFRAMES_FFMPEG_READY: "false",
      });

      expect(gate.gate).toBe("blocked");
      expect(gate.mvpSmokeReady).toBe(true);
      expect(gate.productionRuntimePrerequisitesReady).toBe(false);
      expect(gate.blockers).toContain("chrome_not_ready");
      expect(gate.blockers).toContain("ffmpeg_not_ready");
      expect(gate.blockers).not.toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects stale seeded route evidence", () => {
    const evidenceDir = writeRouteEvidence("2026-01-01T00:00:00.000Z");
    try {
      const gate = runGate(evidenceDir, "1000");

      expect(gate.gate).toBe("blocked");
      expect(gate.status).not.toBe(0);
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects empty or malformed route screenshots", () => {
    const evidenceDir = writeRouteEvidence(new Date().toISOString(), Buffer.alloc(0));
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }

    const malformedEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      Buffer.alloc(2048, 1)
    );
    try {
      const gate = runGate(
        malformedEvidenceDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(malformedEvidenceDir, { recursive: true, force: true });
    }

    const signatureOnlyEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      signatureOnlyPngFixture()
    );
    try {
      const gate = runGate(
        signatureOnlyEvidenceDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(signatureOnlyEvidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects route screenshots with the wrong dimensions", () => {
    const evidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(391, 844)
    );
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects fresh route evidence that omits required route screenshots", () => {
    const evidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      []
    );
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }

    const partialEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      ["route-product-detail-390x844.png"]
    );
    try {
      const gate = runGate(partialEvidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(partialEvidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects fresh route evidence that omits the product/run-only Media History route", () => {
    const productRunOnlyRoute =
      "/media-history?type=video&productId=product_1&runId=mar_1";
    const evidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        routes: requiredRoutes.filter(route => route !== productRunOnlyRoute),
      }
    );
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.status).not.toBe(0);
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects fresh route evidence that omits required route overflow checks", () => {
    const evidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        overflowByRoute: {},
      }
    );
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }

    const overflowingEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        overflowByRoute: {
          ...requiredOverflowByRoute,
          videoEditor: { scrollWidth: 480, clientWidth: 390 },
        },
      }
    );
    try {
      const gate = runGate(
        overflowingEvidenceDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(overflowingEvidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects fresh route evidence that omits required per-route overflow audits", () => {
    const evidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        overflowAuditByRoute: {},
      }
    );
    try {
      const gate = runGate(evidenceDir, String(24 * 60 * 60 * 1000));

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });

  it("rejects fresh route evidence with non-zero overflow or missing-label counts", () => {
    const overflowCountEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        overflowElementCount: 1,
      }
    );
    try {
      const gate = runGate(
        overflowCountEvidenceDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(overflowCountEvidenceDir, { recursive: true, force: true });
    }

    const missingLabelEvidenceDir = writeRouteEvidence(
      new Date().toISOString(),
      validPngFixture(),
      requiredScreenshots,
      {
        scrollableInteractiveWithoutAriaLabelCount: 1,
        scrollableInteractiveWithoutAriaLabels: [{ tag: "button" }],
      }
    );
    try {
      const gate = runGate(
        missingLabelEvidenceDir,
        String(24 * 60 * 60 * 1000)
      );

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(missingLabelEvidenceDir, { recursive: true, force: true });
    }
  });

  it("does not allow an env flag to bypass stale seeded route evidence", () => {
    const evidenceDir = writeRouteEvidence("2026-01-01T00:00:00.000Z");
    try {
      const gate = runGate(evidenceDir, "1000", {
        MARKETPLACE_HYPERFRAMES_SEEDED_E2E_PASSED: "true",
      });

      expect(gate.gate).toBe("blocked");
      expect(gate.blockers).toContain("seeded_route_e2e_missing");
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
    }
  });
});
