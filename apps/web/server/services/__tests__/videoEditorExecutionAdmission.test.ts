import { describe, expect, it } from "vitest";
import {
  buildVideoEditorExecutionSnapshot,
  classifyVideoEditorAdmissionFailure,
} from "../videoEditorExecutionAdmission";

describe("video editor execution admission", () => {
  const input = {
    tenantId: "tenant-1",
    projectId: 10,
    revisionId: "rev-1",
    revisionNumber: 2,
    idempotencyKey: "editor-op-20260918",
    operation: "media.composition_scan",
    contractVersion: "editorial.runtime.v1",
    sourceFingerprints: ["sha256:abcdef1234"],
    projectDocument: { projectId: "project-10", schemaVersion: "nle.web.1" },
    capabilityProfile: {
      claim: "editor.media.composition_scan",
      locality: "node",
    },
    policy: { allowDegraded: false },
  } as const;

  it("pins an immutable snapshot to revision, source, policy, and capability", async () => {
    const snapshot = await buildVideoEditorExecutionSnapshot(input);
    expect(snapshot.snapshotId).toMatch(/^snapshot-/);
    expect(snapshot.snapshotHash).toHaveLength(64);
    expect(snapshot.sourceFingerprints).toEqual(["sha256:abcdef1234"]);
    expect(snapshot.policy).toEqual(input.policy);
  });

  it("rejects unsafe local paths and classifies explicit admission failures", async () => {
    await expect(
      buildVideoEditorExecutionSnapshot({
        ...input,
        sourceFingerprints: ["/tmp/input.mp4"],
      })
    ).rejects.toThrow("SOURCE_REFERENCE_INVALID");
    expect(
      classifyVideoEditorAdmissionFailure("SOURCE_REFERENCE_INVALID")
    ).toEqual({ state: "blocked", reason: "source_invalid" });
    expect(classifyVideoEditorAdmissionFailure("NO_ELIGIBLE_AGENT")).toEqual({
      state: "waiting_agent",
      reason: "agent_unavailable",
    });
  });
});
