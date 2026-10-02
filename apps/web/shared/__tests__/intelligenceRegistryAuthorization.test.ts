import { describe, expect, it } from "vitest";
import {
  canDomainAdminReviewIntelligenceSource,
  isAdminIntelligenceRegistryRoute,
} from "../../../../packages/shared/src/emergency/intelligenceRegistryAuthorization";

describe("intelligence registry role boundary", () => {
  it("recognizes registry routes for admins and domain admins", () => {
    expect(
      isAdminIntelligenceRegistryRoute("operations.intel.sources", "admin")
    ).toBe(true);
    expect(
      isAdminIntelligenceRegistryRoute(
        "operations.intel.source.create",
        "domain_admin"
      )
    ).toBe(true);
    expect(
      isAdminIntelligenceRegistryRoute(
        "operations.intel.source.review",
        "admin"
      )
    ).toBe(true);
    expect(
      isAdminIntelligenceRegistryRoute(
        "operations.intel.capture.create",
        "admin"
      )
    ).toBe(false);
  });

  it("does not grant registry operations to ordinary users", () => {
    expect(
      isAdminIntelligenceRegistryRoute("operations.intel.sources", "user")
    ).toBe(false);
    expect(
      isAdminIntelligenceRegistryRoute(
        "operations.intel.source.review",
        undefined
      )
    ).toBe(false);
  });

  it("limits domain-admin source review to explicitly general data", () => {
    expect(
      canDomainAdminReviewIntelligenceSource("domain_admin", "general")
    ).toBe(true);
    expect(
      canDomainAdminReviewIntelligenceSource("domain_admin", "sensitive")
    ).toBe(false);
    expect(
      canDomainAdminReviewIntelligenceSource("domain_admin", undefined)
    ).toBe(false);
    expect(canDomainAdminReviewIntelligenceSource("admin", "restricted")).toBe(
      false
    );
  });
});
