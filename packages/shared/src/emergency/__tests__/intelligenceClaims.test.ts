import { describe, expect, it } from "vitest";
import { canTransitionEmergencyIntelClaim, countIndependentEmergencyIntelSources } from "../intelligenceClaims";

describe("emergency intelligence claim safeguards", () => {
  it("requires an explicit review step before verification and makes terminal states immutable", () => {
    expect(canTransitionEmergencyIntelClaim("unreviewed", "verified")).toBe(false);
    expect(canTransitionEmergencyIntelClaim("unreviewed", "under_review")).toBe(true);
    expect(canTransitionEmergencyIntelClaim("under_review", "verified")).toBe(true);
    expect(canTransitionEmergencyIntelClaim("retracted", "verified")).toBe(false);
    expect(canTransitionEmergencyIntelClaim("superseded", "disputed")).toBe(false);
  });

  it("counts distinct, non-empty independence groups rather than source records", () => {
    expect(countIndependentEmergencyIntelSources(["agency-a", "agency-a", "agency-b", "  "])).toBe(2);
  });
});
