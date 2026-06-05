import { afterEach, describe, expect, it, vi } from "vitest";

const activeRun = {
  id: "mar_active_1",
  productId: "product_1",
  status: "waiting_provider",
  currentStage: "storyboard_review",
  renderJobId: "hf_active_1",
  links: {
    storyboardReview:
      "/storyboard-review/1?hyperframesRenderJobId=hf_active_1&productId=product_1&runId=mar_active_1",
  },
};

const resumePlan = {
  planHash: "plan_resume_1",
  primaryAction: { actionId: "resume_auto_storyboard_review" },
  activeRunId: activeRun.id,
  quotaDecision: { allowed: true, reason: "within_quota" },
};

describe("startAutoStoryboardReviewForApi resume fallback", () => {
  afterEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns the actual active run and render projection without starting a duplicate run, even when the previous start hash is stale", async () => {
    const getHyperframesAutoStoryboardReviewPlan = vi.fn(async () => resumePlan);
    const getMarketplaceAutoReviewRun = vi.fn(async () => activeRun);
    const startMarketplaceAutoReviewRun = vi.fn();
    const getHyperframesRenderProjection = vi.fn(async () => ({
      renderJobId: activeRun.renderJobId,
      productId: activeRun.productId,
      runId: activeRun.id,
      status: "running",
      polling: { recommendedIntervalMs: 5000 },
      redaction: {
        rawHtmlHidden: true,
        signedUrlsHidden: true,
        workerLogsHidden: true,
        storageKeysHidden: true,
      },
    }));
    const redactHyperframesRenderProjectionForUser = vi.fn(render => render);

    vi.doMock("../hyperframesAutoPlanService", () => ({
      getHyperframesAutoStoryboardReviewPlan,
    }));
    vi.doMock("../marketplaceAutoReviewService", () => ({
      getMarketplaceAutoReviewRun,
      startMarketplaceAutoReviewRun,
    }));
    vi.doMock("../hyperframesTemplateRegistry", () => ({
      listHyperframesTemplateRegistry: vi.fn(() => []),
    }));
    vi.doMock("../hyperframesFeatureAccessService", () => ({
      buildHyperframesCreditEstimate: vi.fn(),
      resolveHyperframesFeatureAccess: vi.fn(),
      resolveHyperframesFeatureAccessForTenant: vi.fn(),
    }));
    vi.doMock("../marketplaceProductService", () => ({
      getMarketplaceProductWithAccess: vi.fn(),
    }));
    vi.doMock("../hyperframesCompositionService", () => ({
      buildHyperframesCompositionInput: vi.fn(),
    }));
    vi.doMock("../hyperframesRenderService", () => ({
      buildHyperframesRenderJobPayload: vi.fn(),
      buildHyperframesRenderProjection: vi.fn(),
      cancelHyperframesRenderJob: vi.fn(),
      getHyperframesRenderProjection,
      queueHyperframesRenderJob: vi.fn(),
      redactHyperframesRenderProjectionForUser,
      retryHyperframesRenderJob: vi.fn(),
    }));
    vi.doMock("../hyperframesLibraryFinalizeService", () => ({
      finalizeHyperframesRenderToLibrary: vi.fn(),
    }));

    const { startAutoStoryboardReviewForApi } = await import(
      "../hyperframesRuntimeApiService"
    );

    const result = await startAutoStoryboardReviewForApi({
      productId: activeRun.productId,
      auth: { userId: 119, tenantId: "tenant_1" },
      expectedPlanHash: "stale_hash_from_previous_start",
    });

    expect(result.run).toEqual(activeRun);
    expect(result.render).toMatchObject({
      renderJobId: activeRun.renderJobId,
      status: "running",
    });
    expect(result.polling).toEqual({ recommendedIntervalMs: 5000 });
    expect(getMarketplaceAutoReviewRun).toHaveBeenCalledWith(activeRun.id, {
      userId: 119,
      tenantId: "tenant_1",
    });
    expect(getHyperframesRenderProjection).toHaveBeenCalledWith({
      auth: { userId: 119, tenantId: "tenant_1" },
      productId: activeRun.productId,
      runId: activeRun.id,
      renderJobId: activeRun.renderJobId,
    });
    expect(redactHyperframesRenderProjectionForUser).toHaveBeenCalledTimes(1);
    expect(startMarketplaceAutoReviewRun).not.toHaveBeenCalled();
  });

  it("starts auto review with effective override defaults from the plan", async () => {
    const overrides = {
      frameStrategy: "video_shot_start_stop",
      audioStrategy: "silent",
      shotCount: 7,
      overlayTextMode: "allow_text",
      imageModel: "google-banana-2",
      qualityMode: "high",
    };
    const startPlan = {
      planHash: "plan_override_1",
      primaryAction: { actionId: "start_auto_storyboard_review" },
      activeRunId: null,
      canStart: true,
      quotaDecision: "free_preview_allowed",
      creditEstimate: { idempotencyKey: "hf_credit_1" },
      defaults: {
        outputMode: "storyboard_images",
        frameStrategy: "video_shot_start_stop",
        audioStrategy: "silent",
        shotCount: 7,
        overlayTextMode: "allow_text",
        imageModel: "google-banana-2",
        qualityMode: "high",
      },
    };
    const startedRun = {
      id: "mar_override_1",
      productId: "product_1",
      status: "queued",
      resultJson: {},
    };
    const getHyperframesAutoStoryboardReviewPlan = vi.fn(
      async () => startPlan
    );
    const getMarketplaceAutoReviewRun = vi.fn();
    const startMarketplaceAutoReviewRun = vi.fn(async () => startedRun);

    vi.doMock("../hyperframesAutoPlanService", () => ({
      getHyperframesAutoStoryboardReviewPlan,
    }));
    vi.doMock("../marketplaceAutoReviewService", () => ({
      getMarketplaceAutoReviewRun,
      startMarketplaceAutoReviewRun,
    }));
    vi.doMock("../hyperframesTemplateRegistry", () => ({
      listHyperframesTemplateRegistry: vi.fn(() => []),
    }));
    vi.doMock("../hyperframesFeatureAccessService", () => ({
      buildHyperframesCreditEstimate: vi.fn(),
      resolveHyperframesFeatureAccess: vi.fn(),
      resolveHyperframesFeatureAccessForTenant: vi.fn(),
    }));
    vi.doMock("../marketplaceProductService", () => ({
      getMarketplaceProductWithAccess: vi.fn(),
    }));
    vi.doMock("../hyperframesCompositionService", () => ({
      buildHyperframesCompositionInput: vi.fn(),
    }));
    vi.doMock("../hyperframesRenderService", () => ({
      buildHyperframesRenderJobPayload: vi.fn(),
      buildHyperframesRenderProjection: vi.fn(),
      cancelHyperframesRenderJob: vi.fn(),
      getHyperframesRenderProjection: vi.fn(),
      queueHyperframesRenderJob: vi.fn(),
      redactHyperframesRenderProjectionForUser: vi.fn(render => render),
      retryHyperframesRenderJob: vi.fn(),
    }));
    vi.doMock("../hyperframesLibraryFinalizeService", () => ({
      finalizeHyperframesRenderToLibrary: vi.fn(),
    }));

    const { startAutoStoryboardReviewForApi } = await import(
      "../hyperframesRuntimeApiService"
    );

    const result = await startAutoStoryboardReviewForApi({
      productId: startedRun.productId,
      auth: { userId: 119, tenantId: "tenant_1" },
      expectedPlanHash: startPlan.planHash,
      idempotencyKey: "hf-auto-start:plan_override_1",
      overrides,
    });

    expect(result.run).toEqual(startedRun);
    expect(result.render).toBeNull();
    expect(getHyperframesAutoStoryboardReviewPlan).toHaveBeenCalledWith({
      productId: startedRun.productId,
      auth: { userId: 119, tenantId: "tenant_1" },
      overrides,
    });
    expect(startMarketplaceAutoReviewRun).toHaveBeenCalledWith(
      {
        productId: startedRun.productId,
        idempotencyKey: "hf-auto-start:plan_override_1",
        creationIntent: "auto_review_video",
        outputMode: "storyboard_images",
        frameStrategy: "video_shot_start_stop",
        audioStrategy: "silent",
        shotCount: 7,
        overlayTextMode: "allow_text",
        imageModel: "google-banana-2",
        qualityMode: "premium_strict_qa",
      },
      { userId: 119, tenantId: "tenant_1" },
      {}
    );
    expect(getMarketplaceAutoReviewRun).not.toHaveBeenCalled();
  });
});
