import { describe, expect, it } from "vitest";
import { getEmergencyProtocolPack, satisfiesEmergencyProtocolSafetyClass } from "./protocolPacks";

describe("versioned emergency response protocol packs", () => {
  it("requires human-review and specialist handling for high-risk hazards", () => {
    expect(getEmergencyProtocolPack({ hazardCategory: "hazardous_material", severity: "moderate" })).toMatchObject({
      version: "spec260-protocol-v1:hazardous_material:moderate", minimumSafetyClass: "restricted", humanReviewRequired: true,
    });
    expect(getEmergencyProtocolPack({ hazardCategory: "natural", severity: "critical" }).minimumSafetyClass).toBe("restricted");
  });

  it("does not allow a task to fall below the protocol safety floor", () => {
    expect(satisfiesEmergencyProtocolSafetyClass("community_safe", "professional_only")).toBe(false);
    expect(satisfiesEmergencyProtocolSafetyClass("restricted", "professional_only")).toBe(true);
  });

  it("changes the review identity when hazard or severity changes", () => {
    expect(getEmergencyProtocolPack({ hazardCategory: "fire", severity: "high" }).version)
      .not.toBe(getEmergencyProtocolPack({ hazardCategory: "fire", severity: "critical" }).version);
  });

  it("keeps hazard-specific golden scenarios advisory and routes each to a safe protocol floor", () => {
    const cases = [
      ["medical", "professional_only", "request-qualified-care"],
      ["structural", "professional_only", "keep-clear"],
      ["fire", "professional_only", "do-not-enter"],
      ["hazardous_material", "restricted", "do-not-approach"],
      ["security", "restricted", "do-not-confront"],
      ["civil_crowd", "professional_only", "keep-egress-clear"],
      ["multi_hazard", "restricted", "no-unverified-entry"],
      ["unknown", "professional_only", "verify-hazard-before-entry"],
    ] as const;
    for (const [hazardCategory, floor, requiredAction] of cases) {
      const pack = getEmergencyProtocolPack({ hazardCategory, severity: "high" });
      expect(pack.minimumSafetyClass).toBe(floor);
      expect(pack.actions).toContain(requiredAction);
      expect(pack.humanReviewRequired).toBe(true);
    }
  });
});
