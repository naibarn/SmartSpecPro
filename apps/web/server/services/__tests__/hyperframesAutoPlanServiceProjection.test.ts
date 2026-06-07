import { afterEach, describe, expect, it, vi } from "vitest";

describe("hyperframesAutoPlanService summary projection integration", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("resumes storyboard-ready Marketplace Auto runs from summarized storyboard-frame metadata", async () => {
    const getMarketplaceProductWithAccess = vi.fn(async () => ({
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.test/product.png"],
      },
    }));
    const listMarketplaceAutoReviewRuns = vi.fn(async () => [
      {
        id: "mar_storyboard_ready_1",
        productId: "product_1",
        status: "running",
        currentStage: "storyboard_review",
        idempotencyKey: "mar-run:storyboard-ready-1",
        metadataJson: {
          storyboardFrameUrls: [
            "https://cdn.example.test/frame-1.png",
            "https://cdn.example.test/frame-2.png",
          ],
          generatedMediaAcceptanceEnvelope: {
            status: "accepted_with_warnings",
            selectedImageAttempt: 2,
            selectedImageAttemptScore: 88,
          },
          imageAttemptReviews: [
            {
              reviewId: "image-attempt-review:mar_storyboard_ready_1:1",
              attempt: 1,
              status: "repair_required",
              qualityScore: 72,
              negativeScore: 10,
            },
            {
              reviewId: "image-attempt-review:mar_storyboard_ready_1:2",
              attempt: 2,
              status: "accepted_with_warnings",
              qualityScore: 88,
              negativeScore: 4,
            },
          ],
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

    expect(plan.activeRunId).toBe("mar_storyboard_ready_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
    expect(listMarketplaceAutoReviewRuns).toHaveBeenCalledWith(
      { productId: "product_1", limit: 3, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
  });

  it("resumes summarized Marketplace Auto runs from imageAttemptReviews storyboardFrameUrls without top-level storyboardFrameUrls", async () => {
    const getMarketplaceProductWithAccess = vi.fn(async () => ({
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.test/product.png"],
      },
    }));
    const listMarketplaceAutoReviewRuns = vi.fn(async () => [
      {
        id: "mar_summary_no_top_level_1",
        productId: "product_1",
        status: "running",
        currentStage: "storyboard_review",
        idempotencyKey: "mar-run:storyboard-summary-no-top-level-1",
        metadataJson: {
          generatedMediaAcceptanceEnvelope: {
            status: "accepted_with_warnings",
            selectedImageAttempt: 2,
            selectedImageAttemptScore: 88,
          },
          imageAttemptReviews: [
            {
              reviewId: "image-attempt-review:mar_summary_no_top_level_1:2",
              attempt: 2,
              status: "accepted_with_warnings",
              storyboardFrameUrls: [
                "https://cdn.example.test/frame-1.png",
                "https://cdn.example.test/frame-2.png",
              ],
              qualityScore: 88,
              negativeScore: 4,
            },
          ],
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

    expect(plan.activeRunId).toBe("mar_summary_no_top_level_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
    expect(listMarketplaceAutoReviewRuns).toHaveBeenCalledWith(
      { productId: "product_1", limit: 3, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
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
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
    expect(listMarketplaceAutoReviewRuns).toHaveBeenCalledWith(
      { productId: "product_1", limit: 3, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
  });

  it("resumes repairing Marketplace Auto runs once storyboard frames already exist in the summary payload", async () => {
    const getMarketplaceProductWithAccess = vi.fn(async () => ({
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.test/product.png"],
      },
    }));
    const listMarketplaceAutoReviewRuns = vi.fn(async () => [
      {
        id: "mar_repairing_1",
        productId: "product_1",
        status: "running",
        currentStage: "image_generation",
        idempotencyKey: "marketplace-auto-review:legacy",
        metadataJson: {
          storyboardFrameUrls: [
            "https://cdn.example.test/frame-1.png",
            "https://cdn.example.test/frame-2.png",
            "https://cdn.example.test/frame-3.png",
          ],
          generatedMediaAcceptanceEnvelope: {
            status: "repair_required",
            selectedImageAttempt: 3,
            selectedImageAttemptScore: 84,
          },
        },
        stages: [
          {
            stageKey: "image_generation",
            status: "repairing",
          },
          {
            stageKey: "storyboard_review",
            status: "queued",
          },
        ],
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

    expect(plan.activeRunId).toBe("mar_repairing_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
  });

  it("falls back to a broader resumable-run search when the latest 3 runs do not contain the candidate", async () => {
    const getMarketplaceProductWithAccess = vi.fn(async () => ({
      product: {
        title: "Product",
        selectedImageUrls: ["https://cdn.example.test/product.png"],
      },
    }));
    const listMarketplaceAutoReviewRuns = vi
      .fn()
      .mockResolvedValueOnce([
        {
          id: "mar_recent_1",
          productId: "product_1",
          status: "completed",
          currentStage: "library_finalize",
          idempotencyKey: "mar-run:recent-1",
          metadataJson: {},
        },
        {
          id: "mar_recent_2",
          productId: "product_1",
          status: "completed",
          currentStage: "library_finalize",
          idempotencyKey: "mar-run:recent-2",
          metadataJson: {},
        },
        {
          id: "mar_recent_3",
          productId: "product_1",
          status: "completed",
          currentStage: "library_finalize",
          idempotencyKey: "mar-run:recent-3",
          metadataJson: {},
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "mar_broader_resume_1",
          productId: "product_1",
          status: "running",
          currentStage: "storyboard_review",
          idempotencyKey: "mar-run:broader-resume-1",
          metadataJson: {
            storyboardFrameUrls: [
              "https://cdn.example.test/frame-1.png",
              "https://cdn.example.test/frame-2.png",
              "https://cdn.example.test/frame-3.png",
            ],
            generatedMediaAcceptanceEnvelope: {
              status: "accepted_with_warnings",
              selectedImageAttempt: 3,
              selectedImageAttemptScore: 91,
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

    expect(plan.activeRunId).toBe("mar_broader_resume_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(listMarketplaceAutoReviewRuns).toHaveBeenNthCalledWith(
      1,
      { productId: "product_1", limit: 3, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
    expect(listMarketplaceAutoReviewRuns).toHaveBeenNthCalledWith(
      2,
      { productId: "product_1", limit: 10, summary: true },
      { userId: 119, tenantId: "tenant_1" }
    );
  });
});
