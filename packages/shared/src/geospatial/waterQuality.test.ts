import { describe, expect, it } from "vitest";
import { assessWaterQualityMeasurement } from "./waterQuality";

describe("water quality contract", () => {
  it("does not infer water safety from an incomplete measurement", () => {
    expect(assessWaterQualityMeasurement({
      parameter: "turbidity", value: 2.4, unit: "NTU", observedAt: "2026-10-01T00:00:00.000Z",
      source: { id: "lab:1", revision: "2" },
    }).conclusion).toBe("incomplete");
  });

  it("preserves threshold basis and only reports threshold comparison", () => {
    const result = assessWaterQualityMeasurement({
      parameter: "turbidity", value: 7, unit: "NTU", method: "ISO 7027", observedAt: "2026-10-01T00:00:00.000Z",
      sample: { id: "sample:1", collectedAt: "2026-09-30T23:00:00.000Z" }, source: { id: "lab:1", revision: "2" },
      thresholdBasis: { id: "standard:1", revision: "3", comparator: "max", value: 5, unit: "NTU" },
    });
    expect(result.conclusion).toBe("threshold_exceeded");
    expect(result.safeForDrinking).toBe(false);
  });
});
