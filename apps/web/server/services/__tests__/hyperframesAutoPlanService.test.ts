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
    expect(plan.primaryAction.actionId).toBe("use_standard_order");
    expect(plan.standardOrderAvailable).toBe(true);
  });
});
