import { describe, expect, it } from "vitest";

import { buildHyperframesAutoPlanFromState } from "../hyperframesAutoPlanService";

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
        imageModel: "google-banana-2",
        shotCount: 7,
        platformPresetId: "tiktok_reels_shorts_9_16",
        renderEngine: "existing_ffmpeg_timeline",
      },
    });

    expect(customizedPlan.defaults).toMatchObject({
      frameStrategy: "video_shot_start_stop",
      qualityMode: "high",
      imageModel: "google-banana-2",
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

  it("exposes active run resume metadata instead of a new-start primary action", () => {
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
    expect(plan.primaryAction.actionId).toBe("resume_auto_storyboard_review");
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
    expect(plan.primaryAction.actionId).toBe("resume_auto_storyboard_review");
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
    expect(plan.primaryAction.actionId).toBe("resume_auto_storyboard_review");
    expect(plan.blockers.map(blocker => blocker.code)).not.toContain(
      "active_standard_run"
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
