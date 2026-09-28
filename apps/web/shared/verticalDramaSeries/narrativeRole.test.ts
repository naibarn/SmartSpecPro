import { describe, expect, it } from "vitest";
import {
  isLeadRoleTier,
  normalizeLegacyRole,
  ROLE_TIER_LABELS,
  roleTierToNarrativeRole,
} from "./narrativeRole";

describe("vertical drama narrative role contract", () => {
  it("keeps narrative role separate from occupation-like legacy text", () => {
    const result = normalizeLegacyRole("ซีอีโอหญิง");
    expect(result.roleTier).toBeNull();
    expect(result.narrativeRole).toBeNull();
    expect(result.reviewStatus).toBe("needs_role_review");
  });

  it("normalizes explicit heroine language", () => {
    const result = normalizeLegacyRole("นางเอก / ซีอีโอหญิง");
    expect(result.roleTier).toBe("lead_female");
    expect(result.narrativeRole).toBe("protagonist");
    expect(result.reviewStatus).toBe("ready");
  });

  it("provides stable localized labels", () => {
    expect(ROLE_TIER_LABELS.lead_female.th).toBe("นางเอก");
    expect(ROLE_TIER_LABELS.lead_male.th).toBe("พระเอก");
    expect(ROLE_TIER_LABELS.villain_male_hidden.th).toBe("ตัวร้ายชายแฝงตัว");
  });

  it("maps detailed tiers to story-level roles", () => {
    expect(roleTierToNarrativeRole("second_lead_male")).toBe("secondary_lead");
    expect(roleTierToNarrativeRole("villain_female_hidden")).toBe("antagonist");
    expect(roleTierToNarrativeRole("support_memorable")).toBe("supporting");
  });

  it("recognizes only canonical lead tiers as leads", () => {
    expect(isLeadRoleTier("lead_female")).toBe(true);
    expect(isLeadRoleTier("second_lead_male")).toBe(false);
    expect(isLeadRoleTier("other")).toBe(false);
  });
});
