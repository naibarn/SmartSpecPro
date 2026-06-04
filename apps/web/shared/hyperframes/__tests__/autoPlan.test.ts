import { describe, expect, it } from "vitest";

import {
  buildDefaultHyperframesAutoPlanDefaults,
  buildHyperframesAutoStoryboardReviewPlan,
  buildHyperframesAutoOverrideDiff,
} from "../autoPlan";
import { buildHyperframesFeatureAccessProjection } from "../featureAccess";

function readyAccess() {
  return buildHyperframesFeatureAccessProjection({
    tenantId: "tenant_1",
    userId: 1,
    flags: {
      enabled: true,
      tenantAllowed: true,
      workerEnabled: true,
      librarySaveEnabled: false,
      operatorEnabled: false,
      templateAllowlist: [],
    },
  });
}

describe("HyperFrames auto plan contract", () => {
  it("resolves defaults without caller template/platform/render customization", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();

    expect(defaults).toMatchObject({
      outputMode: "storyboard_images",
      frameStrategy: "storyboard_3x3_split",
      audioStrategy: "native_video_audio",
      shotCount: 9,
      renderEngine: "hyperframes_composition",
      compositionMode: "storyboard_motion_preview",
      renderIntent: "preview",
      templateId: "marketplace_storyboard_motion_9x9_v1",
    });
  });

  it("builds one primary Auto action while preserving Standard Order availability", () => {
    const plan = buildHyperframesAutoStoryboardReviewPlan({
      productId: "product_1",
      tenantId: "tenant_1",
      userId: 1,
      access: readyAccess(),
      now: new Date("2026-06-04T00:00:00.000Z"),
    });

    expect(plan.launchMode).toBe("auto_storyboard_review");
    expect(plan.primaryAction.actionId).toBe("start_auto_storyboard_review");
    expect(plan.canStart).toBe(true);
    expect(plan.standardOrderAvailable).toBe(true);
    expect(plan.resetToAutoAvailable).toBe(false);
  });

  it("reset-to-auto tracks only Auto override diff fields", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const diff = buildHyperframesAutoOverrideDiff({
      defaults,
      overrides: {
        shotCount: 7,
        renderIntent: "draft",
        standardOrderOutputMode: "full_video",
      },
    });

    expect(diff.active).toBe(true);
    expect(diff.fields).toEqual(["shotCount", "renderIntent"]);
    expect(diff.values).not.toHaveProperty("standardOrderOutputMode");
  });
});
