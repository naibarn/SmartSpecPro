import { describe, expect, it } from "vitest";

import { clampMixWeight } from "@/components/verticalDramaSeries/CreateSeriesWizard";

describe("clampMixWeight", () => {
  it("passes through every valid integer weight 1-5 unchanged", () => {
    for (let weight = 1; weight <= 5; weight++) {
      expect(clampMixWeight(weight)).toBe(weight);
    }
  });

  it("clamps values below 1 up to 1", () => {
    expect(clampMixWeight(0)).toBe(1);
    expect(clampMixWeight(-3)).toBe(1);
  });

  it("clamps values above 5 down to 5", () => {
    expect(clampMixWeight(6)).toBe(5);
    expect(clampMixWeight(100)).toBe(5);
  });

  it("rounds a fractional value to the nearest integer weight", () => {
    expect(clampMixWeight(2.4)).toBe(2);
    expect(clampMixWeight(2.6)).toBe(3);
  });
});
