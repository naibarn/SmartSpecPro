/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) — section
 * 01 §4.3. Shared autoPlan schema/normalize additions: new frameStrategy
 * enum member + five new optional (no-default) override fields + new
 * blocker code. Both tenant flags stay irrelevant to this file — schema
 * acceptance is unconditional; runtime gating is tested separately in
 * server/services/__tests__/marketplaceAutoReview.sequentialGate.test.ts.
 */
import { describe, expect, it } from "vitest";

import {
  applyHyperframesAutoPlanOverrides,
  buildDefaultHyperframesAutoPlanDefaults,
  HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES,
  HyperframesAutoPlanDefaultsSchema,
  HyperframesAutoPlanOverrideInputSchema,
  normalizeHyperframesAutoPlanOverrides,
} from "../autoPlan";
import { HyperframesBlockerCodeSchema } from "../contracts";
import { getHyperframesBlockerCopy } from "../statusCopy";

const FEATURE_136_NEW_OVERRIDE_KEYS = [
  "confirmedAttributes",
  "forbiddenClaims",
  "targetAudience",
  "userRequirements",
  "sequentialImagePromptMaxChars",
] as const;

describe("Feature 136 — autoPlan schema/normalize additions", () => {
  it("accepts sequential_shot_storyboard in both the defaults and override frameStrategy enums", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({ frameStrategy: true }).safeParse(
        { frameStrategy: "sequential_shot_storyboard" },
      ).success,
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        frameStrategy: true,
      }).safeParse({ frameStrategy: "sequential_shot_storyboard" }).success,
    ).toBe(true);
  });

  it("still rejects an unknown frameStrategy string in both schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({ frameStrategy: true }).safeParse(
        { frameStrategy: "not_a_real_strategy" },
      ).success,
    ).toBe(false);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        frameStrategy: true,
      }).safeParse({ frameStrategy: "not_a_real_strategy" }).success,
    ).toBe(false);
  });

  it("keeps HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.frameStrategy at storyboard_3x3_split", () => {
    expect(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.frameStrategy).toBe(
      "storyboard_3x3_split",
    );
  });

  it("keeps buildDefaultHyperframesAutoPlanDefaults() free of the five new override keys and stable in shape", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    for (const key of FEATURE_136_NEW_OVERRIDE_KEYS) {
      expect(Object.prototype.hasOwnProperty.call(defaults, key)).toBe(false);
    }
    expect(JSON.stringify(defaults)).toMatchSnapshot();
  });

  it("normalizes the five new override fields through when valid", () => {
    const normalized = normalizeHyperframesAutoPlanOverrides({
      confirmedAttributes: { color: "black", material: "wood" },
      forbiddenClaims: ["cures disease"],
      targetAudience: "  Busy parents  ",
      userRequirements: "  Must show 3 angles  ",
      sequentialImagePromptMaxChars: 2500,
    });

    expect(normalized.confirmedAttributes).toEqual({
      color: "black",
      material: "wood",
    });
    expect(normalized.forbiddenClaims).toEqual(["cures disease"]);
    expect(normalized.targetAudience).toBe("Busy parents");
    expect(normalized.userRequirements).toBe("Must show 3 angles");
    expect(normalized.sequentialImagePromptMaxChars).toBe(2500);
  });

  it("drops out-of-bounds sequentialImagePromptMaxChars values (below min, above max, non-integer)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        sequentialImagePromptMaxChars: 999,
      }),
    ).not.toHaveProperty("sequentialImagePromptMaxChars");
    expect(
      normalizeHyperframesAutoPlanOverrides({
        sequentialImagePromptMaxChars: 4001,
      }),
    ).not.toHaveProperty("sequentialImagePromptMaxChars");
    expect(
      normalizeHyperframesAutoPlanOverrides({
        sequentialImagePromptMaxChars: 2000.5,
      }),
    ).not.toHaveProperty("sequentialImagePromptMaxChars");
  });

  it("does not inject a default sequentialImagePromptMaxChars value when absent (default materializes in section 04, not here)", () => {
    expect(normalizeHyperframesAutoPlanOverrides({})).not.toHaveProperty(
      "sequentialImagePromptMaxChars",
    );
  });

  it("trims free text and drops empty-after-trim targetAudience / userRequirements (no empty-string overrides)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({ targetAudience: "   " }),
    ).not.toHaveProperty("targetAudience");
    expect(
      normalizeHyperframesAutoPlanOverrides({ userRequirements: "   " }),
    ).not.toHaveProperty("userRequirements");
  });

  it("caps confirmedAttributes at 40 entries", () => {
    const tooMany = Object.fromEntries(
      Array.from({ length: 41 }, (_, index) => [`attr_${index}`, "value"]),
    );
    expect(
      normalizeHyperframesAutoPlanOverrides({ confirmedAttributes: tooMany }),
    ).not.toHaveProperty("confirmedAttributes");

    const exactlyFortyOk = Object.fromEntries(
      Array.from({ length: 40 }, (_, index) => [`attr_${index}`, "value"]),
    );
    expect(
      normalizeHyperframesAutoPlanOverrides({
        confirmedAttributes: exactlyFortyOk,
      }).confirmedAttributes,
    ).toBeDefined();
  });

  it("merges the five new fields into defaults via applyHyperframesAutoPlanOverrides without breaking the strict parse", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const overridden = applyHyperframesAutoPlanOverrides({
      defaults,
      overrides: {
        confirmedAttributes: { color: "black" },
        forbiddenClaims: ["cures disease"],
        targetAudience: "Busy parents",
        userRequirements: "Show 3 angles",
        sequentialImagePromptMaxChars: 2500,
      },
    });

    expect(overridden.confirmedAttributes).toEqual({ color: "black" });
    expect(overridden.forbiddenClaims).toEqual(["cures disease"]);
    expect(overridden.targetAudience).toBe("Busy parents");
    expect(overridden.userRequirements).toBe("Show 3 angles");
    expect(overridden.sequentialImagePromptMaxChars).toBe(2500);
  });

  it("registers the sequential_storyboard_disabled blocker code with the exact Thai copy", () => {
    expect(() =>
      HyperframesBlockerCodeSchema.parse("sequential_storyboard_disabled"),
    ).not.toThrow();
    expect(
      getHyperframesBlockerCopy("sequential_storyboard_disabled", "th")
        .description,
    ).toBe(
      "โหมด Storyboard แบบ 9 ภาพต่อเนื่องยังไม่เปิดใช้งานสำหรับ tenant นี้",
    );
  });
});
