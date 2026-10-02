import { describe, expect, it } from "vitest";
import { evaluateEmergencyTriage } from "./triage";

describe("deterministic Spec 260 triage advisory", () => {
  it("routes critical events for immediate human review without automating response", () => {
    expect(evaluateEmergencyTriage({ hazardCategory: "medical", severity: "critical" })).toMatchObject({
      advisoryOnly: true,
      priority: "immediate_human_review",
      publicPublicationAllowed: false,
      automatedDispatchAllowed: false,
    });
  });

  it("requires verification for unknown hazards and reassessment for stale observations", () => {
    expect(evaluateEmergencyTriage({ hazardCategory: "unknown", severity: "unknown", observedAt: "2026-01-01T00:00:00Z", now: new Date("2026-01-02T00:00:00Z") })).toMatchObject({
      verificationRequired: true,
      reassessmentRequired: true,
    });
  });
});
