import { describe, expect, it } from "vitest";

import {
  CreateHyperframesPreviewOutputSchema,
  GetAutoStoryboardReviewPlanInputSchema,
  StartAutoStoryboardReviewInputSchema,
} from "../runtimeApiSchemas";
import { createDefaultHyperframesPollingGuidance } from "../contracts";

describe("HyperFrames runtime API schemas", () => {
  it("parses page-load plan input without mutation fields", () => {
    expect(
      GetAutoStoryboardReviewPlanInputSchema.parse({ productId: "product_1" })
    ).toEqual({ productId: "product_1", includeTemplates: false });
  });

  it("keeps start input backend-defaulted and override-diff based", () => {
    const input = StartAutoStoryboardReviewInputSchema.parse({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
    });

    expect(input).toEqual({
      productId: "product_1",
      expectedPlanHash: "hf_12345678",
      overrides: {},
    });
    expect(input).not.toHaveProperty("templateId");
    expect(input).not.toHaveProperty("platformPresetId");
    expect(input).not.toHaveProperty("renderEngine");
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
});
