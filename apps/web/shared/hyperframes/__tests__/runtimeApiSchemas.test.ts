import { describe, expect, it } from "vitest";

import {
  CreateHyperframesPreviewOutputSchema,
  GetAutoStoryboardReviewPlanInputSchema,
  RepairHyperframesRenderJobInputSchema,
  RepairHyperframesRenderJobOutputSchema,
  StartAutoStoryboardReviewInputSchema,
} from "../runtimeApiSchemas";
import { createDefaultHyperframesPollingGuidance } from "../contracts";

describe("HyperFrames runtime API schemas", () => {
  it("parses page-load plan input without mutation fields", () => {
    expect(
      GetAutoStoryboardReviewPlanInputSchema.parse({ productId: "product_1" })
    ).toEqual({ productId: "product_1", includeTemplates: false, overrides: {} });
  });

  it("allows optional plan overrides while keeping template and engine backend-selected", () => {
    const input = GetAutoStoryboardReviewPlanInputSchema.parse({
      productId: "product_1",
      overrides: {
        qualityMode: "high",
        platformPresetId: "tiktok_reels_shorts_9_16",
        imageModel: "google-banana-2",
      },
    });

    expect(input.overrides).toMatchObject({
      qualityMode: "high",
      platformPresetId: "tiktok_reels_shorts_9_16",
      imageModel: "google-banana-2",
    });
    expect(() =>
      GetAutoStoryboardReviewPlanInputSchema.parse({
        productId: "product_1",
        overrides: {
          qualityMode: "high",
          renderEngine: "existing_ffmpeg_timeline",
        },
      })
    ).toThrow();
    expect(() =>
      StartAutoStoryboardReviewInputSchema.parse({
        productId: "product_1",
        overrides: { shotCount: 99 },
      })
    ).toThrow();
  });

  it("keeps start input backend-defaulted and override-diff based", () => {
    const input = StartAutoStoryboardReviewInputSchema.parse({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
      idempotencyKey: "hf-auto-start:hf_12345678",
    });

    expect(input).toEqual({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
      idempotencyKey: "hf-auto-start:hf_12345678",
      overrides: {},
    });
    expect(input).not.toHaveProperty("templateId");
    expect(input).not.toHaveProperty("platformPresetId");
    expect(input).not.toHaveProperty("renderEngine");
    expect(() =>
      StartAutoStoryboardReviewInputSchema.parse({
        productId: "product_1",
        idempotencyKey: "x".repeat(193),
      })
    ).toThrow();
  });

  it("requires charge summary, polling, and repair actions on preview output", () => {
    const parsed = CreateHyperframesPreviewOutputSchema.safeParse({
      contractVersion: "hyperframes_marketplace_auto_review_v1",
      render: {
        contractVersion: "hyperframes_marketplace_auto_review_v1",
        renderJobId: "hf_render_1",
        tenantId: "tenant_1",
        productId: "product_1",
        runId: "mar_1",
        launchMode: "auto_storyboard_review",
        status: "queued",
        progressPercent: 0,
        statusCopyId: "hyperframes.status.queued",
        safeMessage: "Queued",
        repairActions: [],
        polling: createDefaultHyperframesPollingGuidance("queued"),
        updatedAt: "2026-06-04T00:00:00.000Z",
      },
      chargeSummary: {
        chargeRequired: false,
        quotaDecision: "free_preview_allowed",
        noChargeReason: "preview_only",
      },
      polling: createDefaultHyperframesPollingGuidance("queued"),
    });

    expect(parsed.success).toBe(true);
  });

  it("contracts self-service repair actions with render and polling output", () => {
    expect(
      RepairHyperframesRenderJobInputSchema.parse({
        renderJobId: "hf_render_1",
        productId: "product_1",
        runId: "mar_1",
        actionId: "repair_retry_worker_step",
        actionType: "retry_worker_step",
        expectedCompositionInputHash: "hf_input",
      })
    ).toMatchObject({
      renderJobId: "hf_render_1",
      productId: "product_1",
      runId: "mar_1",
      actionType: "retry_worker_step",
    });

    expect(
      RepairHyperframesRenderJobOutputSchema.safeParse({
        contractVersion: "hyperframes_marketplace_auto_review_v1",
        render: {
          contractVersion: "hyperframes_marketplace_auto_review_v1",
          renderJobId: "hf_render_1",
          tenantId: "tenant_1",
          productId: "product_1",
          runId: "mar_1",
          launchMode: "auto_storyboard_review",
          status: "queued",
          progressPercent: 0,
          statusCopyId: "hyperframes.status.queued",
          safeMessage: "Queued",
          repairActions: [],
          polling: createDefaultHyperframesPollingGuidance("queued"),
          updatedAt: "2026-06-04T00:00:00.000Z",
        },
        polling: createDefaultHyperframesPollingGuidance("queued"),
        invalidates: ["marketplaceCapture.getHyperframesRenderJob"],
      }).success
    ).toBe(true);
  });
});
