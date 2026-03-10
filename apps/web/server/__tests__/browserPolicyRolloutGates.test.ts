import { describe, expect, it } from "vitest";

import {
  evaluateBrowserPolicyRolloutGate,
  isObserveModeWriteSafe,
} from "../services/browserPolicyRolloutGates";

describe("browser policy rollout gates", () => {
  it("enforces the observe-to-read-only threshold bundle", () => {
    const result = evaluateBrowserPolicyRolloutGate("observe_to_read_only", {
      observedDays: 10,
      totalDecisions: 9000,
      reviewedSampleSize: 420,
      precision: 0.97,
      falsePositiveRate: 0.02,
      falseNegativeRate: 0.03,
      stableDays: 5,
      p0p1Misses: 1,
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks).toContain("minimum_observed_days");
    expect(result.failedChecks).toContain("minimum_total_decisions");
    expect(result.failedChecks).toContain("minimum_reviewed_sample");
    expect(result.failedChecks).toContain("precision_gate");
    expect(result.failedChecks).toContain("false_positive_gate");
    expect(result.failedChecks).toContain("false_negative_gate");
    expect(result.failedChecks).toContain("stability_window");
    expect(result.failedChecks).toContain("p0_p1_misses");
  });

  it("never treats observe mode as safe for production commit actions", () => {
    expect(
      isObserveModeWriteSafe({
        productionSurface: true,
        actionClass: "commit",
      }),
    ).toBe(false);
  });
});
