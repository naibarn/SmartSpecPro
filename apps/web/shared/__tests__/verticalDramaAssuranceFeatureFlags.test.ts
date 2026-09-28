import { describe, expect, it } from "vitest";
import { ALLOWED_FEATURE_FLAGS, FEATURE_FLAG_DEFAULTS } from "../featureFlags";
import { getVerticalDramaAssuranceFlagSnapshot } from "../../server/services/verticalDramaAssuranceAdapter";

const keys = [
  "verticalDramaAssuranceShadow",
  "verticalDramaDraftQcOrchestraActive",
  "verticalDramaPromptQcOrchestraActive",
  "verticalDramaStoryAssuranceActive",
  "verticalDramaAssuranceKillSwitch",
] as const;

describe("Feature 157 assurance feature flags", () => {
  it("registers only the five canonical default-off keys", () => {
    for (const key of keys) {
      expect(ALLOWED_FEATURE_FLAGS.has(key)).toBe(true);
      expect(FEATURE_FLAG_DEFAULTS[key]).toBe(false);
    }
    expect(ALLOWED_FEATURE_FLAGS.has("verticalDramaAssuranceEnabled")).toBe(false);
  });

  it("resolves absent flags to their canonical defaults", () => {
    expect(getVerticalDramaAssuranceFlagSnapshot({})).toEqual({
      verticalDramaAssuranceShadow: false,
      verticalDramaDraftQcOrchestraActive: false,
      verticalDramaPromptQcOrchestraActive: false,
      verticalDramaStoryAssuranceActive: false,
      verticalDramaAssuranceKillSwitch: false,
    });
  });
});
