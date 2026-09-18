import { describe, expect, it } from "vitest";
import {
  evaluateVideoEditorCapability,
  projectVideoEditorStatus,
} from "../videoEditorCapabilityAdmission";

describe("video editor capability admission", () => {
  const required = {
    operation: "media.composition_scan",
    claim: "editor-media-operation-media-composition_scan",
    contractVersion: "1.0",
    locality: "node",
  };

  it("requires exact claim, contract, and locality", () => {
    expect(
      evaluateVideoEditorCapability(required, [
        {
          claim: required.claim,
          contractVersions: ["1.0"],
          localities: ["node"],
          available: true,
        },
      ]).state
    ).toBe("eligible");
    expect(
      evaluateVideoEditorCapability(required, [
        {
          claim: "editor-media-operation-media-transcribe",
          contractVersions: ["1.0"],
          localities: ["node"],
          available: true,
        },
      ])
    ).toMatchObject({ state: "capability_blocked", reason: "claim_mismatch" });
  });

  it("distinguishes an unavailable eligible agent from a blocked capability", () => {
    expect(
      evaluateVideoEditorCapability(required, [
        {
          claim: required.claim,
          contractVersions: ["1.0"],
          localities: ["node"],
          available: false,
        },
      ])
    ).toMatchObject({ state: "waiting_agent" });
    expect(
      projectVideoEditorStatus({
        state: "capability_blocked",
        reason: "claim_mismatch",
      }).label
    ).toBe("capability-blocked");
    expect(
      projectVideoEditorStatus({
        state: "waiting_agent",
        reason: "agent_unavailable",
      }).label
    ).toBe("waiting-agent");
  });
});
