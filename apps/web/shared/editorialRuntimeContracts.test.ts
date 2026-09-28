import { describe, expect, it } from "vitest";
import {
  assertEditorialEvidence,
  assertEditorialIntent,
  assertExecutableEditPlan,
  assertEditorialChangeSet,
  computeEditorialContractHash,
} from "@smartspec/shared";
import { millisecondsToTicks, ticksToMilliseconds } from "@smartspec/shared";

describe("shared editorial runtime contracts", () => {
  it("round-trips canonical ticks using an explicit timebase", () => {
    const ticks = millisecondsToTicks(1_000, { num: 90_000, den: 1 });
    expect(ticks).toBe(90_000);
    expect(ticksToMilliseconds(ticks, { num: 90_000, den: 1 })).toBe(1_000);
  });

  it("rejects invalid canonical time", () => {
    expect(() => millisecondsToTicks(-1, { num: 90_000, den: 1 })).toThrow("TIME_VALUE_INVALID");
    expect(() => ticksToMilliseconds(1, { num: 0, den: 1 })).toThrow("TIMEBASE_INVALID");
  });

  it("accepts full evidence and preserves degraded as a non-approved state", () => {
    const evidence = {
      schemaVersion: "editorial.evidence.v1",
      evidenceId: "ev-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      revisionId: "revision-1",
      snapshotId: "snapshot-1",
      sourceFingerprint: "source-1",
      status: "degraded" as const,
      confidence: 0.4,
      provenance: { executor: "node-composition-scan", contractVersion: "feature-191.v1" },
      evidenceRefs: ["evidence://scan-1"],
      warnings: ["object_interaction_detector_unavailable"],
      evidenceHash: "hash-1",
    };
    expect(assertEditorialEvidence(evidence).status).toBe("degraded");
    expect(() => assertEditorialEvidence({ ...evidence, confidence: 2 })).toThrow("EVIDENCE_CONFIDENCE_INVALID");
    expect(() => assertEditorialEvidence({ ...evidence, evidenceRefs: ["/tmp/private.json"] })).toThrow("EDITORIAL_UNSAFE_INPUT");
  });

  it("rejects unsafe intent and cyclic executable plans", () => {
    const intent = {
      schemaVersion: "editorial.intent.v1",
      intentId: "intent-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      revisionId: "revision-1",
      snapshotId: "snapshot-1",
      evidenceRefs: ["evidence-1"],
      policyVersion: "policy-1",
      reviewRequired: true,
      operations: [{ id: "op-1", type: "cut", startTick: 0, endTick: 90_000 }],
    };
    expect(assertEditorialIntent(intent).operations).toHaveLength(1);
    expect(() => assertEditorialIntent({ ...intent, operations: [{ ...intent.operations[0], instruction: "child_process.exec" }] })).toThrow("EDITORIAL_UNSAFE_INPUT");

    const plan = {
      schemaVersion: "editorial.executable_plan.v1",
      planId: "plan-1",
      planHash: "hash-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      revisionId: "revision-1",
      snapshotId: "snapshot-1",
      operations: [
        { id: "a", type: "cut", dependsOn: ["b"], startTick: 0, endTick: 1 },
        { id: "b", type: "cut", dependsOn: ["a"], startTick: 1, endTick: 2 },
      ],
      outputRoles: ["preview"],
      validatorVersion: "validator-1",
    };
    expect(() => assertExecutableEditPlan(plan)).toThrow("PLAN_DEPENDENCY_INVALID");
  });

  it("validates idempotent change-set identity and stable hash", async () => {
    const changeSet = {
      schemaVersion: "editorial.change_set.v1",
      changeSetId: "changes-1",
      tenantId: "tenant-1",
      projectId: "project-1",
      expectedRevisionId: "revision-1",
      planHash: "hash-1",
      operations: [{ id: "op-1", type: "cut", payload: { startTick: 0, endTick: 1 } }],
    };
    expect(assertEditorialChangeSet(changeSet).changeSetId).toBe("changes-1");
    const first = await computeEditorialContractHash(changeSet);
    const second = await computeEditorialContractHash({ ...changeSet, operations: [...changeSet.operations] });
    expect(first).toBe(second);
  });
});
