import { describe, expect, it } from "vitest";
import {
  AGENT_EXPERIENCE_CANARY_STAGES,
  validateAgentExperienceReleaseEvidence,
  validateAgentExperienceWaiver,
} from "../index";

describe("Agent Experience rollout gates", () => {
  it("defines ordered canary stages", () => {
    expect(AGENT_EXPERIENCE_CANARY_STAGES).toEqual([
      "fixture_only",
      "shadow_internal",
      "preview_internal",
      "selected_tenants",
      "ramp_25",
      "ramp_50",
      "ramp_100",
    ]);
  });

  it("rejects incomplete, expired, or critical safety waivers", () => {
    expect(validateAgentExperienceWaiver({ owner: "ops" })).toEqual(expect.arrayContaining([
      "waiver missing waiver_id",
      "waiver missing expires_on",
    ]));
    expect(validateAgentExperienceWaiver({
      waiver_id: "w1",
      gate: "perf",
      reason: "temporary",
      owner: "ops",
      expires_on: "2020-01-01",
      mitigation: "watch",
      revisit_trigger: "next deploy",
      impacted_stage: "preview_internal",
    }, new Date("2026-06-22"))).toContain("waiver expired");
    expect(validateAgentExperienceWaiver({
      waiver_id: "w2",
      gate: "cross-tenant",
      reason: "never",
      owner: "ops",
      expires_on: "2099-01-01",
      mitigation: "none",
      revisit_trigger: "none",
      impacted_stage: "selected_tenants",
      criticalSafetyGate: true,
    })).toContain("waiver cannot bypass critical safety gates");
  });

  it("requires evidence before tenant beta", () => {
    expect(validateAgentExperienceReleaseEvidence({})).toEqual(expect.arrayContaining([
      "missing command results",
      "missing fixture inventory",
      "missing schema changelog",
      "missing rollback drill",
      "missing threat model",
      "missing performance baseline",
      "missing alert/triage matrix",
      "missing reviewer signoff",
      "missing surface adoption criteria",
    ]));

    expect(validateAgentExperienceReleaseEvidence({
      commandResults: { typecheck: "pass" },
      fixtureInventoryPresent: true,
      schemaChangelogPresent: true,
      rollbackDrillPresent: true,
      threatModelPresent: true,
      performanceBaselinePresent: true,
      alertTriageMatrixPresent: true,
      reviewerSignoffPresent: true,
      surfaceAdoptionCriteriaPresent: true,
    })).toEqual([]);
  });
});
