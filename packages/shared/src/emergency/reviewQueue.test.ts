import { describe, expect, it } from "vitest";
import { evaluateEmergencyTriage } from "./triage";
import { requiredEmergencyCaseReviews } from "./reviewQueue";

describe("Spec 260 case review obligations", () => {
  it("creates a verification obligation for unknown and multi-hazard reports", () => {
    expect(requiredEmergencyCaseReviews(evaluateEmergencyTriage({ hazardCategory: "unknown", severity: "unknown" })))
      .toEqual(["verification"]);
    expect(requiredEmergencyCaseReviews(evaluateEmergencyTriage({ hazardCategory: "multi_hazard", severity: "high" })))
      .toEqual(["verification"]);
  });

  it("creates a reassessment obligation for invalid, future, or stale observations", () => {
    const now = new Date("2026-09-30T00:00:00.000Z");
    for (const observedAt of ["not-a-date", "2026-10-01T00:00:00.000Z", "2026-09-29T00:00:00.000Z"]) {
      expect(requiredEmergencyCaseReviews(evaluateEmergencyTriage({ hazardCategory: "medical", severity: "critical", observedAt, now })))
        .toContain("reassessment");
    }
  });

  it("does not create a review obligation for current, classified observations", () => {
    expect(requiredEmergencyCaseReviews(evaluateEmergencyTriage({ hazardCategory: "medical", severity: "moderate", observedAt: "2026-09-30T00:00:00.000Z", now: new Date("2026-09-30T00:01:00.000Z") })))
      .toEqual([]);
  });
});
