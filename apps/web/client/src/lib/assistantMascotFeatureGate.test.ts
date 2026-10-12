import { describe, expect, it } from "vitest";
import {
  ASSISTANT_MASCOT_GLOBAL_ALLOW,
  isAssistantMascotEnabled,
} from "./assistantMascotFeatureGate";

describe("SPEC-308 dual-surface feature gate", () => {
  it("defaults the deployment-wide visual allow switch off", () => {
    expect(ASSISTANT_MASCOT_GLOBAL_ALLOW).toBe(false);
  });

  it.each([
    [{ globalAllowed: false, tenantEnabled: true, tenantResolved: true, tenantError: false }, false],
    [{ globalAllowed: true, tenantEnabled: false, tenantResolved: true, tenantError: false }, false],
    [{ globalAllowed: true, tenantEnabled: undefined, tenantResolved: false, tenantError: false }, false],
    [{ globalAllowed: true, tenantEnabled: true, tenantResolved: false, tenantError: true }, false],
    [{ globalAllowed: true, tenantEnabled: true, tenantResolved: true, tenantError: true }, false],
    [{ globalAllowed: true, tenantEnabled: true, tenantResolved: true, tenantError: false }, true],
  ])("fails closed unless both explicit allows are resolved", (state, expected) => {
    expect(isAssistantMascotEnabled(state)).toBe(expected);
  });
});
