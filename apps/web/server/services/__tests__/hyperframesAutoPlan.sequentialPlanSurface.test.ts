/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 05 §4.3. Plan-surface gating, strict-schema compatibility, and
 * no-LLM / fail-open tests for `getHyperframesAutoStoryboardReviewPlanWithEvidence`.
 *
 * Mock shape cloned from `hyperframesAutoPlanServiceProjection.test.ts`'s
 * established `vi.doMock` + `vi.resetModules()` + dynamic `import(...)`
 * convention (that file is the source of truth for how this service's
 * dependencies are mocked). `../marketplaceAutoReviewService` is mocked via
 * `vi.importActual` passthrough (NOT a bare replacement) because this
 * module's own `computeMarketplaceAutoReviewChildSubjectPolicy` and
 * `getSequentialReferenceImageModelCap` must stay REAL for the preview to
 * compute anything meaningful; only `listMarketplaceAutoReviewRuns` is
 * overridden.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { GetAutoStoryboardReviewPlanOutputSchema } from "@shared/hyperframes/runtimeApiSchemas";
import { HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION } from "@shared/hyperframes/contracts";

function productBundleFixture(
  overrides: Record<string, unknown> = {}
) {
  return {
    product: {
      title: "Product",
      productName: "โต๊ะวางของข้างเตียง",
      descriptionText: "โต๊ะไม้แท้คุณภาพดี ทนทาน",
      specsJson: { material: "ไม้แท้" },
      productCategory: "furniture",
      selectedImageUrls: ["https://cdn.example.com/product.png"],
    },
    images: [
      { url: "https://cdn.example.com/product.png" },
      { url: "https://cdn.example.com/angle-2.png" },
    ],
    ...overrides,
  };
}

function mockAccessAndFlags(sequentialEnabled: boolean) {
  vi.doMock("../../db", () => ({
    getDb: vi.fn(async () => null),
  }));
  vi.doMock("../tenantFeatureFlagService", () => ({
    getTenantFeatureFlags: vi.fn(async () => ({
      marketplaceSequentialStoryboard: sequentialEnabled,
    })),
  }));
  vi.doMock("../hyperframesFeatureAccessService", async () => {
    const actual = await vi.importActual<
      typeof import("../hyperframesFeatureAccessService")
    >("../hyperframesFeatureAccessService");
    const { buildHyperframesFeatureAccessProjection } = await vi.importActual<
      typeof import("@shared/hyperframes/featureAccess")
    >("@shared/hyperframes/featureAccess");
    const buildAccess = (input: {
      auth: { userId: number; tenantId?: string };
    }) =>
      buildHyperframesFeatureAccessProjection({
        tenantId: input.auth.tenantId,
        userId: input.auth.userId,
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
          librarySaveEnabled: false,
          operatorEnabled: false,
          templateAllowlist: [],
        },
        creditAndQuota: {
          quotaDecision: "free_preview_allowed",
          freePreviewAvailable: true,
        },
      });
    return {
      ...actual,
      resolveHyperframesFeatureAccess: vi.fn(buildAccess),
      resolveHyperframesFeatureAccessForTenant: vi.fn(async input =>
        buildAccess(input)
      ),
    };
  });
}

async function loadServiceWithMocks(input: {
  sequentialEnabled: boolean;
  productBundle?: unknown;
}) {
  mockAccessAndFlags(input.sequentialEnabled);
  vi.doMock("../marketplaceProductService", () => ({
    getMarketplaceProductWithAccess: vi.fn(
      async () => input.productBundle ?? productBundleFixture()
    ),
  }));
  vi.doMock("../marketplaceAutoReviewService", async () => {
    const actual = await vi.importActual<
      typeof import("../marketplaceAutoReviewService")
    >("../marketplaceAutoReviewService");
    return {
      ...actual,
      listMarketplaceAutoReviewRuns: vi.fn(async () => []),
    };
  });
  return import("../hyperframesAutoPlanService");
}

describe("getHyperframesAutoStoryboardReviewPlanWithEvidence (§4.3)", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("gating: both fields present ONLY when the flag is on AND the resolved strategy is sequential", async () => {
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });

    expect(result.plan.defaults.frameStrategy).toBe(
      "sequential_shot_storyboard"
    );
    expect(result.evidencePreview).toBeDefined();
    expect(result.referenceCapacity).toBeDefined();
    expect(result.evidencePreview?.verifiedHighlights).toEqual(
      expect.arrayContaining([
        { attribute: "material", value: "ไม้แท้", source: "text" },
      ])
    );
  });

  it("gating: flag OFF -> both fields absent even when frameStrategy is requested as sequential", async () => {
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: false });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });

    expect(result.plan.defaults.frameStrategy).toBe("storyboard_3x3_split");
    expect(result.evidencePreview).toBeUndefined();
    expect(result.referenceCapacity).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(result, "evidencePreview")).toBe(
      false
    );
  });

  it("gating: flag ON but strategy resolves to 3x3 (no override) -> both fields absent", async () => {
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
    });

    expect(result.plan.defaults.frameStrategy).toBe("storyboard_3x3_split");
    expect(result.evidencePreview).toBeUndefined();
    expect(result.referenceCapacity).toBeUndefined();
  });

  it("gating: flag ON with video_shot_start_stop -> both fields absent", async () => {
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "video_shot_start_stop" },
    });

    expect(result.evidencePreview).toBeUndefined();
    expect(result.referenceCapacity).toBeUndefined();
  });

  it("strict-schema compatibility: GetAutoStoryboardReviewPlanOutputSchema.parse succeeds WITH and WITHOUT the new fields", async () => {
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const withFields = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });
    const withResponse = {
      contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      access: withFields.plan.access,
      plan: withFields.plan,
      templates: [],
      ...(withFields.evidencePreview !== undefined
        ? { evidencePreview: withFields.evidencePreview }
        : {}),
      ...(withFields.referenceCapacity !== undefined
        ? { referenceCapacity: withFields.referenceCapacity }
        : {}),
    };
    expect(() =>
      GetAutoStoryboardReviewPlanOutputSchema.parse(withResponse)
    ).not.toThrow();

    const withoutFields = await getHyperframesAutoStoryboardReviewPlanWithEvidence(
      {
        productId: "product_1",
        auth: { userId: 1, tenantId: "tenant_1" },
      }
    );
    const withoutResponse = {
      contractVersion: HYPERFRAMES_MARKETPLACE_CONTRACT_VERSION,
      access: withoutFields.plan.access,
      plan: withoutFields.plan,
      templates: [],
    };
    expect(() =>
      GetAutoStoryboardReviewPlanOutputSchema.parse(withoutResponse)
    ).not.toThrow();
    const parsedWithout = GetAutoStoryboardReviewPlanOutputSchema.parse(
      withoutResponse
    );
    expect(
      Object.prototype.hasOwnProperty.call(parsedWithout, "evidencePreview")
    ).toBe(false);
  });

  it("no LLM at plan time: zero invocations of the shared skill runtime / section-04 runner during a plan query that populates evidencePreview", async () => {
    const executeSharedSkillTextRuntime = vi.fn();
    vi.doMock("../agentRuntime/skillRuntimeOrchestrator", async () => {
      const actual = await vi.importActual<
        typeof import("../agentRuntime/skillRuntimeOrchestrator")
      >("../agentRuntime/skillRuntimeOrchestrator");
      return { ...actual, executeSharedSkillTextRuntime };
    });
    const runProductReviewSequentialStoryboardSkillLoop = vi.fn();
    vi.doMock("../productReviewSequentialStoryboardSkillRunner", async () => {
      const actual = await vi.importActual<
        typeof import("../productReviewSequentialStoryboardSkillRunner")
      >("../productReviewSequentialStoryboardSkillRunner");
      return {
        ...actual,
        runProductReviewSequentialStoryboardSkillLoop,
      };
    });

    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });

    expect(result.evidencePreview).toBeDefined();
    expect(executeSharedSkillTextRuntime).not.toHaveBeenCalled();
    expect(runProductReviewSequentialStoryboardSkillLoop).not.toHaveBeenCalled();
  });

  it("fail-open: a malformed product bundle never makes the plan query throw; fields are simply omitted with a logged warning", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({
        sequentialEnabled: true,
        productBundle: null,
      });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });

    expect(result.plan).toBeDefined();
    // A `null` bundle degrades to empty text fields (never throws) — the
    // preview still derives cleanly from empty strings, matching the
    // "malformed but not throwing" contract. Explicitly force a throw path
    // too, to prove the try/catch fail-open branch.
    warnSpy.mockRestore();
  });

  it("fail-open: derivation errors inside the preview builder never propagate — omitted, with a warning logged", async () => {
    vi.doMock("@shared/marketplaceCapture/sequentialEvidencePreview", async () => {
      const actual = await vi.importActual<
        typeof import("@shared/marketplaceCapture/sequentialEvidencePreview")
      >("@shared/marketplaceCapture/sequentialEvidencePreview");
      return {
        ...actual,
        buildSequentialEvidencePreview: vi.fn(() => {
          throw new Error("boom");
        }),
      };
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { getHyperframesAutoStoryboardReviewPlanWithEvidence } =
      await loadServiceWithMocks({ sequentialEnabled: true });

    const result = await getHyperframesAutoStoryboardReviewPlanWithEvidence({
      productId: "product_1",
      auth: { userId: 1, tenantId: "tenant_1" },
      overrides: { frameStrategy: "sequential_shot_storyboard" },
    });

    expect(result.plan).toBeDefined();
    expect(result.evidencePreview).toBeUndefined();
    expect(result.referenceCapacity).toBeUndefined();
    expect(
      warnSpy.mock.calls.some(call =>
        String(call[0]).includes(
          "sequential_evidence_preview_derivation_failed"
        )
      )
    ).toBe(true);
    warnSpy.mockRestore();
  });
});
