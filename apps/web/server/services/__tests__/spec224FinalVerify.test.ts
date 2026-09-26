import { describe, expect, it } from "vitest";

import {
  buildDevelopmentRun,
  type DevelopmentRun,
} from "../spec224DevelopmentRunContracts";
import {
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";
import { createSpec224FinalVerifyService } from "../spec224FinalVerify";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";

const baseRun: DevelopmentRun = {
  ...buildDevelopmentRun({
    runId: "run-224-final-verify",
    tenantId: "tenant-acme",
    actorId: 42,
    goal: "Independently verify bounded requirement closure",
    repositoryRef: "repo:smartspecpro",
    baseRevision: "git:finalverify224",
    contextPackHash: "a".repeat(64),
    workspaceId: "workspace:run-224-final-verify",
  }),
  state: "FINAL_VERIFY",
};

function graphInput() {
  return {
    baseline: {
      specId: "224",
      revision: "22",
      digest: "b".repeat(64),
      baselineId: "baseline:224-r22",
      authorityRef: "authority:platform-engineering",
      scopeEnvelopeRef: "scope:224-r22",
    },
    requirements: [
      {
        id: "REQ-224-FINAL",
        sourceRef: "spec:224#final-verify",
        text: "Final verification only completes after persisted closure.",
      },
    ],
    planSections: [
      { id: "section:final-verify", requirementIds: ["REQ-224-FINAL"] },
    ],
    workPackages: [
      {
        id: "wp:final-verify",
        planSectionId: "section:final-verify",
        requirementIds: ["REQ-224-FINAL"],
        dependsOn: [],
      },
    ],
  };
}

function memoryAdapter(
  initial: DevelopmentRunStoreRecord
): DevelopmentRunPersistenceAdapter & { read(): DevelopmentRunStoreRecord } {
  let record = structuredClone(initial);
  return {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (
            record.run.runId !== runId ||
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            return null;
          }
          return structuredClone(record);
        },
        async findEvent(runId, idempotencyKey, scope) {
          const current = await this.load(runId, scope);
          return (
            current?.events.find(
              event => event.idempotencyKey === idempotencyKey
            ) ?? null
          );
        },
        async save(next, expectedRevision, scope) {
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            throw new Error("RUN_SCOPE_FORBIDDEN");
          }
          if (record.revision !== expectedRevision) {
            throw new Error("RUN_PROJECTION_STALE");
          }
          record = structuredClone(next);
        },
        async appendEvent(event, scope) {
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          ) {
            throw new Error("RUN_SCOPE_FORBIDDEN");
          }
          const existing = record.events.find(
            item => item.idempotencyKey === event.idempotencyKey
          );
          if (existing) return existing;
          record.events.push(structuredClone(event));
          return event;
        },
        async getCanonicalJob() {
          return null;
        },
      });
    },
    read() {
      return structuredClone(record);
    },
  };
}

function verifyInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: baseRun.runId,
    tenantId: baseRun.tenantId,
    actorId: baseRun.actorId,
    expectedRevision: 1,
    expectedFencingVersion: 0,
    idempotencyKey: "final-verify:complete:v1",
    finalEvidenceRef: "evidence:final-224-r22",
    ...overrides,
  };
}

async function attachGraph(
  adapter: DevelopmentRunPersistenceAdapter,
  graph = compileRequirementClosureGraph(graphInput())
) {
  return createRequirementClosurePersistenceService(adapter).attachGraph({
    runId: baseRun.runId,
    tenantId: baseRun.tenantId,
    actorId: baseRun.actorId,
    expectedRevision: 0,
    expectedFencingVersion: 0,
    idempotencyKey: "closure:final-verify:attach",
    graph,
  });
}

describe("Spec 224 independent persisted Final Verify", () => {
  it("returns repair required without completing when a persisted requirement is unverified", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    await attachGraph(adapter);

    const result =
      await createSpec224FinalVerifyService(adapter).verify(verifyInput());

    expect(result).toMatchObject({
      status: "FAIL",
      outcome: "REPAIR_REQUIRED",
      closureErrorCode: "REQUIREMENT_NOT_TERMINAL",
      run: { state: "FINAL_VERIFY" },
      revision: 1,
    });
    expect(adapter.read().events).toHaveLength(1);
    expect(adapter.read().run.state).toBe("FINAL_VERIFY");
  });

  it("returns repair required without completing when a persisted blocker remains open", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const graph = compileRequirementClosureGraph(graphInput());
    await attachGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-224-final"],
      })),
    });
    const closure = createRequirementClosurePersistenceService(adapter);
    await closure.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:open",
      blocker: buildBlockerLedgerEntry({
        blockerId: "blocker:final-verify",
        runId: baseRun.runId,
        requirementRefs: ["REQ-224-FINAL"],
        classification: "TEST_FAILURE",
        severity: "high",
      }),
    });

    const result = await createSpec224FinalVerifyService(adapter).verify(
      verifyInput({ expectedRevision: 2 })
    );

    expect(result).toMatchObject({
      status: "FAIL",
      outcome: "REPAIR_REQUIRED",
      closureErrorCode: "BLOCKER_OPEN",
      run: { state: "FINAL_VERIFY" },
      revision: 2,
    });
    expect(adapter.read().run.state).toBe("FINAL_VERIFY");
  });

  it("completes once after persisted evidence and blocker closure", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const graph = compileRequirementClosureGraph(graphInput());
    await attachGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-224-final"],
      })),
    });
    const closure = createRequirementClosurePersistenceService(adapter);
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:final-verify",
      runId: baseRun.runId,
      requirementRefs: ["REQ-224-FINAL"],
      classification: "TEST_FAILURE",
      severity: "high",
    });
    await closure.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:open",
      blocker,
    });
    await closure.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:blocker-final-verify"],
    });

    const service = createSpec224FinalVerifyService(adapter);
    const first = await service.verify(verifyInput({ expectedRevision: 3 }));
    const duplicate = await service.verify(
      verifyInput({ expectedRevision: 4 })
    );

    expect(first).toMatchObject({
      status: "PASS",
      outcome: "COMPLETED",
      accepted: true,
      run: { state: "COMPLETED" },
      revision: 4,
      event: {
        type: "RUN_COMPLETED",
        idempotencyKey: "final-verify:complete:v1",
      },
    });
    expect(first.run.evidenceRefs).toContain("evidence:final-224-r22");
    expect(duplicate).toMatchObject({
      status: "PASS",
      outcome: "COMPLETED",
      accepted: false,
      revision: 4,
    });
    const completionEvents = adapter
      .read()
      .events.filter(event => event.type === "RUN_COMPLETED");
    expect(completionEvents).toHaveLength(1);
  });

  it("rejects stale revision and another tenant or actor", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const graph = compileRequirementClosureGraph(graphInput());
    await attachGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-224-final"],
      })),
    });
    const service = createSpec224FinalVerifyService(adapter);

    await expect(
      service.verify(verifyInput({ expectedRevision: 0 }))
    ).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(
      service.verify(verifyInput({ tenantId: "tenant-other" }))
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(service.verify(verifyInput({ actorId: 7 }))).rejects.toThrow(
      "RUN_NOT_FOUND"
    );
  });

  it("rejects a stale deterministic provenance tuple before completing", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const graph = compileRequirementClosureGraph(graphInput());
    await attachGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-224-final"],
      })),
    });

    await expect(
      createSpec224FinalVerifyService(adapter).verify(
        verifyInput({
          provenance: {
            candidateSha: "a".repeat(64),
            verifiedBaseSha: "b".repeat(64),
            specDigest: "f".repeat(64),
            policySnapshotDigest: "c".repeat(64),
            verificationProfileVersion: "profile:spec224-v1",
            evidenceBundleDigest: "d".repeat(64),
          },
        })
      )
    ).rejects.toThrow("SPEC_DIGEST_MISMATCH");
    expect(adapter.read().run.state).toBe("FINAL_VERIFY");
    expect(adapter.read().revision).toBe(1);
  });
});
