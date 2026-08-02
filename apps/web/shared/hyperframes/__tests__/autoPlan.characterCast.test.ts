/**
 * Marketplace Auto Review — creation-time drama casting (planning/
 * marketplace-flexible-shots-and-creation-casting/plan.md, W2).
 * `characterCast` on the shared auto-plan defaults + override schemas,
 * following the section-13 `startFramePromptStyle` precedent exactly:
 * `.optional()` with NO `.default()` on either schema, a decorative entry
 * in `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES`, and a `safeParse` block
 * in `normalizeHyperframesAutoPlanOverrides`.
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
import { MarketplaceCharacterCastEntrySchema } from "../characterCast";

const HOST_ENTRY = {
  characterName: "ไอริณ",
  characterRole: "host" as const,
  url: "https://cdn.example.com/irin.png",
};

describe("W2 — characterCast autoPlan plumbing", () => {
  it("accepts a valid cast array in both the defaults and override schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: [HOST_ENTRY] }).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: [HOST_ENTRY] }).success
    ).toBe(true);
  });

  it("is optional (absent is valid) on both schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        characterCast: true,
      }).safeParse({}).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        characterCast: true,
      }).safeParse({}).success
    ).toBe(true);
  });

  /* Roster widened 2 -> 4 by
     `planning/marketplace-four-character-cast/plan.md` P1: two speaking leads
     plus up to two supporting characters, VD-picked and self-uploaded counted
     together against the one cap. */
  it("accepts a full 4-entry roster in both schemas", () => {
    const fourCast = [HOST_ENTRY, HOST_ENTRY, HOST_ENTRY, HOST_ENTRY];
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: fourCast }).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: fourCast }).success
    ).toBe(true);
  });

  it("rejects more than 4 cast entries in both schemas", () => {
    const fiveCast = [
      HOST_ENTRY,
      HOST_ENTRY,
      HOST_ENTRY,
      HOST_ENTRY,
      HOST_ENTRY,
    ];
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: fiveCast }).success
    ).toBe(false);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        characterCast: true,
      }).safeParse({ characterCast: fiveCast }).success
    ).toBe(false);
  });

  it("accepts the additive `support` role and the minor-grounding fact", () => {
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        ...HOST_ENTRY,
        characterRole: "support",
        depictsMinor: true,
        vdBaseCharacterId: "71",
        variantLabel: "ชุดลำลอง",
      }).success
    ).toBe(true);
  });

  it("has a decorative base-values string entry required by the satisfies constraint", () => {
    expect(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.characterCast).toBe("");
  });

  it("buildDefaultHyperframesAutoPlanDefaults() never carries the key (absent by default)", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    expect(
      Object.prototype.hasOwnProperty.call(defaults, "characterCast")
    ).toBe(false);
  });

  it("normalizes a valid override value through", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        characterCast: [HOST_ENTRY],
      }).characterCast
    ).toEqual([HOST_ENTRY]);
  });

  it("drops an invalid override value (key absent, not a thrown error)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        characterCast: [{ characterName: "no image or portrait" }],
      })
    ).not.toHaveProperty("characterCast");
  });

  it("does not inject a default when absent from overrides", () => {
    expect(normalizeHyperframesAutoPlanOverrides({})).not.toHaveProperty(
      "characterCast"
    );
  });

  it("merges through applyHyperframesAutoPlanOverrides without breaking the strict parse", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const overridden = applyHyperframesAutoPlanOverrides({
      defaults,
      overrides: { characterCast: [HOST_ENTRY] },
    });
    expect(overridden.characterCast).toEqual([HOST_ENTRY]);
  });

  it("byte-identical defaults JSON when no override is supplied (regression guard)", () => {
    const before = JSON.stringify(buildDefaultHyperframesAutoPlanDefaults());
    const after = JSON.stringify(
      applyHyperframesAutoPlanOverrides({
        defaults: buildDefaultHyperframesAutoPlanDefaults(),
        overrides: null,
      })
    );
    expect(after).toBe(before);
  });
});

describe("W2 — MarketplaceCharacterCastEntrySchema superRefine", () => {
  it("accepts an entry with only url", () => {
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        characterName: "ไอริณ",
        url: "https://cdn.example.com/irin.png",
      }).success
    ).toBe(true);
  });

  it("accepts an entry with only portraitAssetId", () => {
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        characterName: "ไอริณ",
        portraitAssetId: "42",
      }).success
    ).toBe(true);
  });

  it("rejects an entry with neither url nor portraitAssetId", () => {
    const result = MarketplaceCharacterCastEntrySchema.safeParse({
      characterName: "ไอริณ",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty characterName", () => {
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        characterName: "",
        url: "https://cdn.example.com/irin.png",
      }).success
    ).toBe(false);
  });

  it("rejects an invalid characterRole enum value", () => {
    expect(
      MarketplaceCharacterCastEntrySchema.safeParse({
        characterName: "ไอริณ",
        characterRole: "narrator",
        url: "https://cdn.example.com/irin.png",
      }).success
    ).toBe(false);
  });
});
