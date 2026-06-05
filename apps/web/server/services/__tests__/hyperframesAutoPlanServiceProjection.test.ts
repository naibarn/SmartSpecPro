import { afterEach, describe, expect, it, vi } from "vitest";

describe("hyperframesAutoPlanService summary projection integration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("resumes legacy HyperFrames Auto runs from summarized metadata markers", async () => {
    const getMarketplaceProductWithAccess = vi.fn(async () => ({
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.test/product.png"],
      },
    }));
    const listMarketplaceAutoReviewRuns = vi.fn(async () => [
      {
        id: "mar_legacy_summary_1",
        productId: "product_1",
        status: "running",
        currentStage: "storyboard_review",
        idempotencyKey: "marketplace-auto-review:legacy",
        metadataJson: {
          hyperframesAutoPreview: {
            renderJobId: "hf_legacy_summary_1",
            status: "queued",
          },
        },
      },
    ]);

    vi.doMock("../marketplaceProductService", () => ({
      getMarketplaceProductWithAccess,
    }));
    vi.doMock("../marketplaceAutoReviewService", () => ({
      listMarketplaceAutoReviewRuns,
    }));
    vi.doMock("../hyperframesFeatureAccessService", async () => {
      const actual = await vi.importActual<
        typeof import("../hyperframesFeatureAccessService")
      >("../hyperframesFeatureAccessService");
      const { buildHyperframesFeatureAccessProjection } = await vi.importActual<
        typeof import("@shared/hyperframes/featureAccess")
      >("@shared/hyperframes/featureAccess");
      const buildAccess = (input: { auth: { userId: number; tenantId?: string } }) =>
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

    const { getHyperframesAutoStoryboardReviewPlan } = await import(
      "../hyperframesAutoPlanService"
    );

    const plan = await getHyperframesAutoStoryboardReviewPlan({
      productId: "product_1",
      auth: { userId: 119, tenantId: "tenant_1" },
    });

    expect(plan.activeRunId).toBe("mar_legacy_summary_1");
    expect(plan.primaryAction.actionId).toBe("resume_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
    expect(listMarketplaceAutoReviewRuns).toHaveBeenCalledWith(
      { productId: "product_1", limit: 3, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
  });
});
