import { describe, expect, it } from "vitest";
import { compileEditorialIntent } from "../editorialCompiler";
import {
  assertExecutableEvidence,
  bindEditorialEvidence,
} from "../editorialEvidenceService";
import { validateEditorialIntent } from "../editorialIntentService";
import { validateEditorialSafety } from "../editorialSafetyValidator";

const evidence = {
  schemaVersion: "editorial.evidence.v1" as const,
  evidenceId: "evidence-1",
  tenantId: "tenant-1",
  projectId: "project-1",
  revisionId: "revision-1",
  snapshotId: "snapshot-1",
  sourceFingerprint: "sha256:abcdef1234",
  status: "available" as const,
  confidence: 0.95,
  provenance: { executor: "node", algorithm: "composition-scan" },
  evidenceRefs: ["evidence://one"],
  warnings: [],
  evidenceHash: "hash-1",
};

const intent = {
  schemaVersion: "editorial.intent.v1" as const,
  intentId: "intent-1",
  tenantId: "tenant-1",
  projectId: "project-1",
  revisionId: "revision-1",
  snapshotId: "snapshot-1",
  evidenceRefs: ["evidence-1"],
  policyVersion: "policy-1",
  reviewRequired: true,
  operations: [
    { id: "cut-1", type: "cut" as const, startTick: 100, endTick: 200 },
  ],
};

describe("editorial runtime services", () => {
  it("binds evidence and blocks degraded/stale evidence from execution", () => {
    expect(
      bindEditorialEvidence(evidence, {
        tenantId: "tenant-1",
        projectId: "project-1",
        revisionId: "revision-1",
        snapshotId: "snapshot-1",
        sourceFingerprint: "sha256:abcdef1234",
      }).status
    ).toBe("available");
    expect(() =>
      bindEditorialEvidence(
        { ...evidence, revisionId: "revision-2" },
        {
          tenantId: "tenant-1",
          projectId: "project-1",
          revisionId: "revision-1",
          snapshotId: "snapshot-1",
          sourceFingerprint: "sha256:abcdef1234",
        }
      )
    ).toThrow("EVIDENCE_STALE");
    expect(() =>
      assertExecutableEvidence({ ...evidence, status: "degraded" })
    ).toThrow("EVIDENCE_NOT_EXECUTABLE");
  });

  it("compiles identical input deterministically and preserves review-required intent", async () => {
    validateEditorialIntent(intent);
    const first = await compileEditorialIntent({
      snapshotId: "snapshot-1",
      evidence,
      intent,
      policyVersion: "policy-1",
    });
    const second = await compileEditorialIntent({
      snapshotId: "snapshot-1",
      evidence,
      intent,
      policyVersion: "policy-1",
    });
    expect(first.planHash).toBe(second.planHash);
    expect(first.operations[0].dependsOn).toEqual([]);
    expect(first.reviewRequired).toBe(true);
  });

  it("rejects protected ranges and unsafe geometry", () => {
    expect(() =>
      validateEditorialSafety(intent.operations, {
        protectedRanges: [{ startTick: 50, endTick: 250 }],
      })
    ).toThrow("PROTECTED_RANGE_CONFLICT");
    expect(() =>
      validateEditorialSafety(
        [{ ...intent.operations[0], type: "reframe", payload: { scale: 99 } }],
        { protectedRanges: [] }
      )
    ).toThrow("GEOMETRY_UNSAFE");
  });
});
