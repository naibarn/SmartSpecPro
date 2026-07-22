/**
 * Feature 136 (Marketplace Auto Review: Sequential Shot Storyboard) —
 * section 13 §4 deliverable 2. `startFramePromptStyle` on the shared
 * auto-plan defaults + override schemas, following the section-01 precedent
 * for the five override fields EXACTLY: `.optional()` with NO `.default()`
 * on either schema (an unconditional default would inject a new key into
 * every `getAutoStoryboardReviewPlan` response and break byte-identical
 * output for runs that never ask for it), a decorative string entry in
 * `HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES` (required by the `satisfies
 * Record<...>` compile-time constraint, never read by
 * `buildDefaultHyperframesAutoPlanDefaults`), and a `safeParse` block in
 * `normalizeHyperframesAutoPlanOverrides`.
 *
 * Kept as its own file (not appended to `autoPlan.feature136.test.ts`,
 * section 01's own file) to avoid any edit collision with that file.
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

describe("Feature 136 section 13 — startFramePromptStyle autoPlan plumbing", () => {
  it("accepts both style values in the defaults and override schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({ startFramePromptStyle: "evidence_product" }).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({ startFramePromptStyle: "cinematic_auto" }).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({ startFramePromptStyle: "cinematic_auto" }).success
    ).toBe(true);
  });

  it("rejects an unknown startFramePromptStyle string in both schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({ startFramePromptStyle: "hollywood_mode" }).success
    ).toBe(false);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({ startFramePromptStyle: "hollywood_mode" }).success
    ).toBe(false);
  });

  it("is optional (absent is valid) on both schemas", () => {
    expect(
      HyperframesAutoPlanDefaultsSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({}).success
    ).toBe(true);
    expect(
      HyperframesAutoPlanOverrideInputSchema.pick({
        startFramePromptStyle: true,
      }).safeParse({}).success
    ).toBe(true);
  });

  it("has a decorative base-values string entry required by the satisfies constraint", () => {
    expect(HYPERFRAMES_BASE_AUTO_PLAN_OVERRIDE_VALUES.startFramePromptStyle).toBe(
      "evidence_product"
    );
  });

  it("buildDefaultHyperframesAutoPlanDefaults() never carries the key (absent by default, no unconditional default)", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    expect(
      Object.prototype.hasOwnProperty.call(defaults, "startFramePromptStyle")
    ).toBe(false);
  });

  it("normalizes a valid override value through", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        startFramePromptStyle: "cinematic_auto",
      }).startFramePromptStyle
    ).toBe("cinematic_auto");
    expect(
      normalizeHyperframesAutoPlanOverrides({
        startFramePromptStyle: "evidence_product",
      }).startFramePromptStyle
    ).toBe("evidence_product");
  });

  it("drops an invalid override value (key absent, not a thrown error)", () => {
    expect(
      normalizeHyperframesAutoPlanOverrides({
        startFramePromptStyle: "not_a_real_style",
      })
    ).not.toHaveProperty("startFramePromptStyle");
  });

  it("does not inject a default when absent from overrides", () => {
    expect(normalizeHyperframesAutoPlanOverrides({})).not.toHaveProperty(
      "startFramePromptStyle"
    );
  });

  it("merges through applyHyperframesAutoPlanOverrides without breaking the strict parse", () => {
    const defaults = buildDefaultHyperframesAutoPlanDefaults();
    const overridden = applyHyperframesAutoPlanOverrides({
      defaults,
      overrides: { startFramePromptStyle: "cinematic_auto" },
    });
    expect(overridden.startFramePromptStyle).toBe("cinematic_auto");
  });

  it("byte-identical defaults JSON when no override is supplied (regression guard for the flags-off/no-override path)", () => {
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
