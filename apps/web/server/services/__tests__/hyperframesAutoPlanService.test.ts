import { describe, expect, it } from "vitest";

import { buildHyperframesAutoPlanFromState } from "../hyperframesAutoPlanService";
import {
  acceptMarketplaceAutoReviewImageQaWithWarningsAfterStoryboardFramesReadyForTest,
} from "../marketplaceAutoReviewService";

describe("hyperframesAutoPlanService", () => {
  it("builds an automatic backend-selected plan without caller customization", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.defaults.templateId).toBe("marketplace_storyboard_motion_9x9_v1");
    expect(plan.defaults.platformPreset.presetId).toBe("generic_vertical_9_16");
    expect(plan.standardOrderAvailable).toBe(true);
  });

  it("applies optional auto overrides to defaults and credit estimate without caller template control", () => {
    const input = {
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
      now: new Date("2026-06-04T00:00:00.000Z"),
    };

    const basePlan = buildHyperframesAutoPlanFromState(input);
    const customizedPlan = buildHyperframesAutoPlanFromState({
      ...input,
      overrides: {
        frameStrategy: "video_shot_start_stop",
        qualityMode: "high",
        imageModel: "google-nano-banana-pro",
        shotCount: 7,
        platformPresetId: "tiktok_reels_shorts_9_16",
        renderEngine: "existing_ffmpeg_timeline",
      },
    });

    expect(customizedPlan.defaults).toMatchObject({
      frameStrategy: "video_shot_start_stop",
      qualityMode: "high",
      imageModel: "google-nano-banana-pro",
      shotCount: 7,
      renderEngine: "hyperframes_composition",
    });
    expect(customizedPlan.defaults.platformPreset.presetId).toBe(
      "tiktok_reels_shorts_9_16"
    );
    expect(customizedPlan.overrideDiff.fields).toEqual([
      "frameStrategy",
      "shotCount",
      "imageModel",
      "qualityMode",
      "platformPreset",
    ]);
    expect(customizedPlan.creditEstimate?.workerComplexityMultiplier).toBe(1.21);
    expect(
      customizedPlan.creditEstimate?.workerComplexityMultiplier
    ).not.toBe(basePlan.creditEstimate?.workerComplexityMultiplier);
    expect(customizedPlan.creditEstimate?.estimatedCredits).toBeGreaterThan(
      basePlan.creditEstimate?.estimatedCredits ?? 0
    );
  });

  it("blocks missing product anchor without hiding Standard Order", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: { product: { title: "Product" } },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.canStart).toBe(false);
    expect(plan.blockers.map(blocker => blocker.code)).toContain(
      "missing_product_anchor"
    );
    expect(
      plan.blockers.filter(blocker => blocker.code === "missing_product_anchor")
    ).toHaveLength(1);
    expect(plan.primaryAction.actionId).toBe("use_standard_order");
    expect(plan.standardOrderAvailable).toBe(true);
  });

  it("keeps active run metadata without blocking a new Auto start", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_active_1",
        idempotencyKey: "hf-auto-start:hf_active_plan",
        status: "running",
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_active_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
  });

  it("resumes legacy HyperFrames Auto runs from render metadata without an idempotency prefix", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_legacy_auto_1",
        idempotencyKey: "marketplace-auto-review:legacy",
        status: "running",
        metadataJson: JSON.stringify({
          hyperframesAutoPreview: {
            renderJobId: "hf_legacy_1",
          },
        }),
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_legacy_auto_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
  });

  it("resumes legacy HyperFrames Auto runs from result render metadata", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_result_auto_1",
        idempotencyKey: "marketplace-auto-review:legacy",
        status: "running",
        resultJson: {
          render: {
            renderJobId: "hf_result_1",
          },
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_result_auto_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
  });

  it("resumes storyboard-ready Marketplace Auto runs that already have storyboard frames but no Storyboard Review id", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_storyboard_ready_1",
        idempotencyKey: "mar-run:storyboard-ready-1",
        status: "running",
        currentStage: "storyboard_review",
        metadataJson: {
          storyboardFrameUrls: [
            "https://cdn.example.com/frame-1.png",
            "https://cdn.example.com/frame-2.png",
          ],
          generatedMediaAcceptanceEnvelope: {
            status: "accepted_with_warnings",
            selectedImageAttempt: 2,
            selectedImageAttemptScore: 88,
          },
        },
        resultJson: {
          storyboardFrameUrls: [
            "https://cdn.example.com/frame-1.png",
            "https://cdn.example.com/frame-2.png",
          ],
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_storyboard_ready_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
    );
  });

  it("resumes legacy Marketplace Auto runs that are still in image QA repair once storyboard frames already exist", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_repairing_1",
        idempotencyKey: "marketplace-auto-review:legacy",
        status: "running",
        currentStage: "image_generation",
        metadataJson: {
          storyboardFrameUrls: [
            "https://cdn.example.com/frame-1.png",
            "https://cdn.example.com/frame-2.png",
            "https://cdn.example.com/frame-3.png",
          ],
          generatedMediaAcceptanceEnvelope: {
            status: "repair_required",
            selectedImageAttempt: 3,
            selectedImageAttemptScore: 84,
          },
        },
        resultJson: {
          frameUrls: [
            "https://cdn.example.com/frame-1.png",
            "https://cdn.example.com/frame-2.png",
            "https://cdn.example.com/frame-3.png",
          ],
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_repairing_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
  });

  it("resumes legacy Marketplace Auto runs from summarized imageAttemptReviews even before top-level storyboardFrameUrls are promoted", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_summary_reviews_1",
        idempotencyKey: "marketplace-auto-review:legacy",
        status: "running",
        currentStage: "image_generation",
        metadataJson: {
          imageAttemptReviews: [
            {
              reviewId: "image-attempt-review:mar_summary_reviews_1:2",
              attempt: 2,
              status: "accepted_with_warnings",
              storyboardFrameUrls: [
                "https://cdn.example.com/frame-1.png",
                "https://cdn.example.com/frame-2.png",
                "https://cdn.example.com/frame-3.png",
              ],
              qualityScore: 87,
              negativeScore: 5,
            },
          ],
          generatedMediaAcceptanceEnvelope: {
            status: "accepted_with_warnings",
            selectedImageAttempt: 2,
            selectedImageAttemptScore: 87,
          },
        },
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBe("mar_summary_reviews_1");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
  });

  it("selects the best available attempt and accepts with warnings once storyboard frames are ready", () => {
    const accepted =
      acceptMarketplaceAutoReviewImageQaWithWarningsAfterStoryboardFramesReadyForTest(
        {
          metadata: {
            imageAttemptReviews: [
              {
                reviewId: "image-attempt-review:mar_best_ready_1:1",
                attempt: 1,
                status: "repair_required",
                selectionEligible: false,
                qualityScore: 74,
                negativeScore: 18,
                storyboardFrameUrls: [
                  "https://cdn.example.com/frame-1.png",
                  "https://cdn.example.com/frame-2.png",
                  "https://cdn.example.com/frame-3.png",
                ],
                expectedFrameCount: 3,
              },
              {
                reviewId: "image-attempt-review:mar_best_ready_1:2",
                attempt: 2,
                status: "accepted_with_warnings",
                selectionEligible: true,
                qualityScore: 89,
                negativeScore: 4,
                storyboardFrameUrls: [
                  "https://cdn.example.com/frame-1.png",
                  "https://cdn.example.com/frame-2.png",
                  "https://cdn.example.com/frame-3.png",
                ],
                expectedFrameCount: 3,
              },
            ],
            generatedMediaAcceptanceEnvelope: {
              status: "repair_required",
            },
            storyboardFrameUrls: [
              "https://cdn.example.com/frame-1.png",
              "https://cdn.example.com/frame-2.png",
              "https://cdn.example.com/frame-3.png",
            ],
          } as never,
          repairUnits:
            [{ unitId: "repair_1", repairReasonCodes: ["adWarningTextBlocked"] }] as never,
          refs: [] as never,
        }
      );

    expect(accepted?.selectedImageAttempt).toBe(2);
    expect(accepted?.generatedMediaAcceptanceEnvelope.status).toBe(
      "accepted_with_warnings"
    );
    expect(accepted?.imageQaReviewOverride?.reason).toBe(
      "best_available_attempt_after_storyboard_frames_ready"
    );
  });

  it("blocks Auto start without relabeling an active Standard Order run as Auto resume", () => {
    const plan = buildHyperframesAutoPlanFromState({
      auth: { userId: 1, tenantId: "tenant_1" },
      productId: "product_1",
      productBundle: {
        product: {
          title: "Product",
          selectedImageUrls: ["https://cdn.example.com/product.png"],
        },
      },
      activeRun: {
        id: "mar_standard_1",
        idempotencyKey: "marketplace-auto-review:standard",
        status: "running",
      },
      accessInput: {
        flags: {
          enabled: true,
          tenantAllowed: true,
          workerEnabled: true,
        },
      },
    });

    expect(plan.activeRunId).toBeNull();
    expect(plan.canStart).toBe(false);
    expect(plan.primaryAction.actionId).toBe("use_standard_order");
    expect(plan.blockers.map(blocker => blocker.code)).toContain(
      "active_standard_run"
    );
  });
});
