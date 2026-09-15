import { describe, expect, it } from "vitest";
import { isLegalPlatformTransition, REQUIRED_PLATFORM_GATES } from "../platformOperations";

describe("Feature 188 platform lifecycle", () => {
  it("accepts only the declared lifecycle edges", () => {
    expect(isLegalPlatformTransition("preparing", "blocked")).toBe(true);
    expect(isLegalPlatformTransition("preparing", "ready_for_cutover")).toBe(true);
    expect(isLegalPlatformTransition("ready_for_cutover", "activating")).toBe(true);
    expect(isLegalPlatformTransition("activating", "active")).toBe(true);
    expect(isLegalPlatformTransition("active", "separated")).toBe(true);
    expect(isLegalPlatformTransition("active", "preparing")).toBe(false);
    expect(isLegalPlatformTransition("succeeded", "activating")).toBe(false);
  });

  it("requires the Feature 187 cutover-candidate handoff before activation", () => {
    expect(REQUIRED_PLATFORM_GATES).toContain("feature_187_cutover_candidate");
    expect(REQUIRED_PLATFORM_GATES).toContain("feature_189_tenant_auth");
  });
});
