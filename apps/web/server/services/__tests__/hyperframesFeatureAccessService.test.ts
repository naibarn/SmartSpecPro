import { afterEach, describe, expect, it } from "vitest";

import {
  buildHyperframesCreditEstimate,
  readHyperframesFeatureFlagsFromTenantConfig,
  resolveHyperframesFeatureAccess,
} from "../hyperframesFeatureAccessService";

describe("hyperframesFeatureAccessService", () => {
  const previousEnv = {
    enabled: process.env.MARKETPLACE_HYPERFRAMES_ENABLED,
    disabled: process.env.MARKETPLACE_HYPERFRAMES_DISABLED,
    worker: process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED,
    library: process.env.MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE,
    operator: process.env.MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED,
  };

  afterEach(() => {
    for (const [key, value] of [
      ["MARKETPLACE_HYPERFRAMES_ENABLED", previousEnv.enabled],
      ["MARKETPLACE_HYPERFRAMES_DISABLED", previousEnv.disabled],
      ["MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED", previousEnv.worker],
      ["MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE", previousEnv.library],
      ["MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED", previousEnv.operator],
    ] as const) {
      if (value == null) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

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

  it("keeps compliance review as a warning so Auto can still start", () => {
    const access = resolveHyperframesFeatureAccess({
      auth: { userId: 1, tenantId: "tenant_1" },
      complianceReviewRequired: true,
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
      },
    });

    expect(access.accessState).toBe("enabled");
    expect(access.capabilities.canStartAuto).toBe(true);
    expect(access.blockers.map(blocker => blocker.code)).not.toContain(
      "compliance_review_required"
    );
    expect(access.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "compliance_review_required",
          severity: "warning",
        }),
      ])
    );
  });

  it("reads Marketplace HyperFrames access from tenant feature flags without env enablement", () => {
    delete process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
    delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    delete process.env.MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE;
    delete process.env.MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED;

    const flags = readHyperframesFeatureFlagsFromTenantConfig(
      { userId: 1, tenantId: "tenant_1" },
      {
        marketplaceHyperframesEnabled: true,
        marketplaceHyperframesWorkerEnabled: true,
        marketplaceHyperframesLibrarySaveEnabled: true,
        marketplaceHyperframesOperatorEnabled: true,
      }
    );

    expect(flags).toMatchObject({
      enabled: true,
      tenantAllowed: true,
      workerEnabled: true,
      librarySaveEnabled: true,
      operatorEnabled: true,
    });
  });

  it("lets explicit env false values act as global HyperFrames kill switches", () => {
    process.env.MARKETPLACE_HYPERFRAMES_ENABLED = "false";
    process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED = "false";
    process.env.MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE = "false";
    process.env.MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED = "false";

    const flags = readHyperframesFeatureFlagsFromTenantConfig(
      { userId: 1, tenantId: "tenant_1" },
      {
        marketplaceHyperframesEnabled: true,
        marketplaceHyperframesWorkerEnabled: true,
        marketplaceHyperframesLibrarySaveEnabled: true,
        marketplaceHyperframesOperatorEnabled: true,
      }
    );

    expect(flags).toMatchObject({
      enabled: false,
      tenantAllowed: false,
      workerEnabled: false,
      librarySaveEnabled: false,
      operatorEnabled: false,
    });

    delete process.env.MARKETPLACE_HYPERFRAMES_ENABLED;
    delete process.env.MARKETPLACE_HYPERFRAMES_RENDER_WORKER_ENABLED;
    delete process.env.MARKETPLACE_HYPERFRAMES_ALLOW_LIBRARY_SAVE;
    delete process.env.MARKETPLACE_HYPERFRAMES_OPERATOR_ENABLED;
  });

  it("does not let internal overrides bypass global kill switches", () => {
    process.env.MARKETPLACE_HYPERFRAMES_DISABLED = "true";

    const flags = readHyperframesFeatureFlagsFromTenantConfig(
      { userId: 1, tenantId: "tenant_1" },
      {
        marketplaceHyperframesEnabled: true,
        marketplaceHyperframesWorkerEnabled: true,
        marketplaceHyperframesLibrarySaveEnabled: true,
        marketplaceHyperframesOperatorEnabled: true,
      },
      {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
        librarySaveEnabled: true,
        operatorEnabled: true,
      }
    );

    expect(flags).toMatchObject({
      enabled: false,
      tenantAllowed: false,
      workerEnabled: false,
      librarySaveEnabled: false,
      operatorEnabled: false,
    });
  });
});
