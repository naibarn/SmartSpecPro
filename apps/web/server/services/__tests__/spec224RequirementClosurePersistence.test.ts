import { describe, expect, it } from "vitest";

import {
  buildDevelopmentRun,
  type DevelopmentEvent,
} from "../spec224DevelopmentRunContracts";
import {
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";

const baseRun = buildDevelopmentRun({
  runId: "run-224-closure",
  tenantId: "tenant-acme",
  actorId: 42,
  goal: "Prove persisted requirement closure",
  repositoryRef: "repo:smartspecpro",
  baseRevision: "git:base123",
  contextPackHash: "a".repeat(64),
  workspaceId: "workspace:run-224-closure",
});

function graphInput() {
  return {
    baseline: {
      specId: "224",
      revision: "21",
      digest: "b".repeat(64),
      baselineId: "baseline:224-r21",
      authorityRef: "authority:platform-engineering",
      scopeEnvelopeRef: "scope:224-r21",
    },
    requirements: [
      {
        id: "REQ-1",
        sourceRef: "spec:224#1",
        text: "Persist the closure graph without a second event store.",
      },
    ],
    planSections: [{ id: "section:closure", requirementIds: ["REQ-1"] }],
    workPackages: [
      {
        id: "wp:closure",
        planSectionId: "section:closure",
        requirementIds: ["REQ-1"],
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

function attachmentInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: baseRun.runId,
    tenantId: baseRun.tenantId,
    actorId: baseRun.actorId,
    expectedRevision: 0,
    expectedFencingVersion: 0,
    idempotencyKey: "closure:attach:v1",
    graph: compileRequirementClosureGraph(graphInput()),
    ...overrides,
  };
}

describe("Spec 224 persisted requirement closure projection", () => {
  it("attaches a graph, emits bounded evidence, and reloads it through a fresh service", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const first = createRequirementClosurePersistenceService(adapter);

    const attached = await first.attachGraph(attachmentInput());
    const evidence = adapter.read().events.at(-1) as DevelopmentEvent;
    const reloaded = await createRequirementClosurePersistenceService(
      adapter
    ).get({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
    });

    expect(attached.accepted).toBe(true);
    expect(attached.revision).toBe(1);
    expect(evidence.type).toBe("EVIDENCE_RECORDED");
    expect(evidence.payload).toMatchObject({
      action: "closure_graph_attached",
      graphDigest: expect.stringMatching(/^[a-f0-9]{64}$/),
      requirementIds: ["REQ-1"],
    });
    expect(JSON.stringify(evidence.payload)).not.toContain(
      "Persist the closure graph"
    );
    expect(reloaded.graph.baseline.baselineId).toBe("baseline:224-r21");
    expect(reloaded.revision).toBe(1);
  });

  it("enforces scope, revision fencing, and idempotency conflicts", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    await service.attachGraph(attachmentInput());

    await expect(
      service.attachGraph(
        attachmentInput({ tenantId: "tenant-other", expectedRevision: 1 })
      )
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.attachGraph(attachmentInput({ actorId: 7, expectedRevision: 1 }))
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.attachGraph(
        attachmentInput({
          expectedRevision: 0,
          idempotencyKey: "closure:stale",
        })
      )
    ).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(
      service.attachGraph(
        attachmentInput({
          expectedRevision: 1,
          graph: compileRequirementClosureGraph({
            ...graphInput(),
            baseline: { ...graphInput().baseline, revision: "22" },
          }),
        })
      )
    ).rejects.toThrow("RUN_IDEMPOTENCY_CONFLICT");
  });

  it("closes a blocker with verification evidence and reopens it with a new ledger epoch", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    await service.attachGraph(attachmentInput());
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:closure",
      runId: baseRun.runId,
      requirementRefs: ["REQ-1"],
      classification: "IMPLEMENTATION_DEFECT",
      severity: "high",
    });

    const closed = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:blocker-closure"],
    });
    const duplicateClose = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:blocker-closure"],
    });
    const reopened = await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:closure:reopened",
      blocker: { ...blocker, status: "REPAIR" },
    });

    expect(closed.graph.blockers[0]).toMatchObject({
      status: "CLOSED",
      verificationRefs: ["evidence:blocker-closure"],
      reopenCount: 0,
    });
    expect(duplicateClose).toMatchObject({ accepted: false, revision: 2 });
    expect(reopened.graph.blockers[0]).toMatchObject({
      status: "REPAIR",
      verificationRefs: [],
      reopenCount: 1,
    });
  });

  it("keeps Final Verify closed for a persisted open blocker and passes after close", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createRequirementClosurePersistenceService(adapter);
    const graph = compileRequirementClosureGraph(graphInput());
    const verified = {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-1"],
      })),
    };
    await service.attachGraph(attachmentInput({ graph: verified }));
    const blocker = buildBlockerLedgerEntry({
      blockerId: "blocker:final-verify",
      runId: baseRun.runId,
      requirementRefs: ["REQ-1"],
      classification: "TEST_FAILURE",
      severity: "medium",
    });
    await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:open",
      blocker,
    });

    await expect(
      service.assertFinalVerifyReady({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
      })
    ).rejects.toThrow("BLOCKER_OPEN");

    await service.upsertBlocker({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 2,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-verify:closed",
      blocker: { ...blocker, status: "CLOSED" },
      verificationRefs: ["evidence:final-blocker"],
    });

    await expect(
      service.assertFinalVerifyReady({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
      })
    ).resolves.toBe(true);
  });
});
