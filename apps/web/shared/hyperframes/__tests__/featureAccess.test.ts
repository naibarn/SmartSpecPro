import { describe, expect, it } from "vitest";

import { buildHyperframesFeatureAccessProjection } from "../featureAccess";

describe("HyperFrames feature access projection", () => {
  it("defaults to Auto disabled while Standard Order remains available", () => {
    const access = buildHyperframesFeatureAccessProjection({
      tenantId: "tenant_1",
      userId: 1,
      flags: {
        enabled: false,
        tenantAllowed: false,
        workerEnabled: false,
        librarySaveEnabled: false,
        operatorEnabled: false,
        templateAllowlist: [],
      },
    });

    expect(access.accessState).toBe("disabled");
    expect(access.capabilities.canStartAuto).toBe(false);
    expect(access.standardOrderAvailable).toBe(true);
    expect(access.capabilities.canUseStandardOrder).toBe(true);
  });

  it("separates worker, library, and operator capabilities", () => {
    const access = buildHyperframesFeatureAccessProjection({
      tenantId: "tenant_1",
      userId: 1,
      flags: {
        enabled: true,
        tenantAllowed: true,
        workerEnabled: true,
        librarySaveEnabled: true,
        operatorEnabled: true,
        templateAllowlist: [],
      },
      canSaveToLibrary: true,
      canInspectAsOperator: true,
      canReplayAsOperator: false,
    });

    expect(access.accessState).toBe("enabled");
    expect(access.capabilities.canStartAuto).toBe(true);
    expect(access.capabilities.canSaveToLibrary).toBe(true);
    expect(access.capabilities.canInspectAsOperator).toBe(true);
    expect(access.capabilities.canReplayAsOperator).toBe(false);
  });
});
