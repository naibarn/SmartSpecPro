import { describe, expect, it } from "vitest";

import {
  buildHyperframesCreditEstimate,
  resolveHyperframesFeatureAccess,
} from "../hyperframesFeatureAccessService";

describe("hyperframesFeatureAccessService", () => {
  it("keeps flags safely disabled by default and Standard Order available", () => {
    const access = resolveHyperframesFeatureAccess({
      auth: { userId: 1, tenantId: "tenant_1" },
      flags: {
        enabled: false,
        tenantAllowed: false,
        workerEnabled: false,
      },
    });

    expect(access.accessState).toBe("disabled");
    expect(access.capabilities.canStartAuto).toBe(false);
    expect(access.standardOrderAvailable).toBe(true);
    expect(access.blockers.map(blocker => blocker.code)).toContain(
      "feature_disabled"
    );
  });

  it("projects deterministic preview credit and quota estimate", () => {
    const estimate = buildHyperframesCreditEstimate({
      tenantId: "tenant_1",
      userId: 1,
      runId: "mar_1",
      renderIntent: "preview",
      compositionMode: "storyboard_motion_preview",
      costClass: "composition_preview",
      compositionInputHash: "hf_input",
      templateVersion: "1.0.0",
    });

    expect(estimate.idempotencyKey).toBe(
      "hyperframes-credit:tenant_1:mar_1:preview:hf_input:1.0.0:generic_vertical_9_16"
    );
    expect(estimate.quotaDecision).toBe("free_preview_allowed");
    expect(estimate.estimatedCredits).toBeGreaterThan(0);
  });
});
