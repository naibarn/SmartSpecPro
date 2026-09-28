import { describe, expect, it } from "vitest";

import {
  buildDevelopmentRun,
  transitionDevelopmentRun,
  type DevelopmentRun,
} from "../spec224DevelopmentRunContracts";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";
import { compileRequirementClosureGraph } from "../spec224RequirementClosureContracts";
import { deriveSpec224RequirementId } from "../spec224SpecBaseline";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";
import { createSpec226DevelopmentControlBridge } from "../spec226DevelopmentControlBridge";

function runAtPlanning(): DevelopmentRun {
  return transitionDevelopmentRun(
    buildDevelopmentRun({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      goal: "Expose the canonical DevelopmentRun safely",
      repositoryRef: "repo:smartspecpro",
      baseRevision: "git:base123",
      contextPackHash: "a".repeat(64),
      workspaceId: "workspace:run-226-control",
    }),
    "PLANNING"
  );
}

function memoryAdapter(initial: DevelopmentRunStoreRecord) {
  let record = structuredClone(initial);
  const adapter: DevelopmentRunPersistenceAdapter = {
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
  };
  return { adapter, read: () => structuredClone(record) };
}

describe("Spec 226 DevelopmentRun control bridge", () => {
  it("projects persisted deferred obligations from canonical closure state", async () => {
    const run = runAtPlanning();
    const memory = memoryAdapter({ run, revision: 0, events: [] });
    const closures = createRequirementClosurePersistenceService(memory.adapter);
    const sourceArtifactDigest = "c".repeat(64);
    const specDigest = "b".repeat(64);
    const requirementText = "The bridge MUST expose deferred test provenance.";
    const requirementId = deriveSpec224RequirementId({
      specId: "224",
      revision: "21",
      sourceArtifactDigest,
      sourceDigest: specDigest,
      line: 1,
      text: requirementText,
    });
    const graph = compileRequirementClosureGraph({
      baseline: {
        specId: "224",
        revision: "21",
        sourceArtifactDigest,
        digest: specDigest,
        baselineId: "baseline:224-r21",
        authorityRef: "authority:platform-engineering",
        scopeEnvelopeRef: "scope:224-r21",
      },
      requirements: [
        {
          id: requirementId,
          sourceRef: "spec:224@21#L1",
          text: requirementText,
        },
      ],
      planSections: [
        { id: "section:deferred", requirementIds: [requirementId] },
      ],
      workPackages: [
        {
          id: "wp:deferred",
          planSectionId: "section:deferred",
          requirementIds: [requirementId],
          dependsOn: [],
        },
      ],
    });
    await closures.attachGraph({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 0,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "bridge:closure:attach",
      graph,
    });
    await closures.recordDeferredTestObligation({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 1,
      expectedFencingVersion: run.fencingVersion,
      idempotencyKey: "bridge:deferred:v1",
      obligationId: "obligation:bridge",
      requirementId,
      workPackageId: "wp:deferred",
      category: "INTEGRATION",
      testTarget: "Spec 226 canonical read projection",
      reason: "The complete bridge suite is deferred.",
      requiredEnvironment: "node-test-runtime",
    });
    const bridge = createSpec226DevelopmentControlBridge({
      persistence: memory.adapter,
      listRuns: async () => [memory.read().run],
    });

    const view = await bridge.get({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    expect(view.closure?.deferredTestObligations).toMatchObject([
      {
        obligationId: "obligation:bridge",
        version: 1,
        invalidatedAt: null,
      },
    ]);
    expect(view.evidenceRefs).not.toContain("obligation:bridge");
  });

  it("projects only the owner-scoped canonical run and replays events by cursor", async () => {
    const memory = memoryAdapter({
      run: runAtPlanning(),
      revision: 0,
      events: [],
    });
    const bridge = createSpec226DevelopmentControlBridge({
      persistence: memory.adapter,
      listRuns: async () => [memory.read().run],
    });

    await bridge.command({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      expectedDecisionEpoch: 0,
      idempotencyKey: "control:pause:1",
      action: "pause",
    });

    const listed = await bridge.list({
      tenantId: "tenant-acme",
      actorId: 42,
      limit: 10,
    });
    expect(listed[0]).toMatchObject({
      bridgeVersion: "spec-226-development-control-v3",
      decisionEpoch: 0,
      closure: null,
    });

    await expect(
      bridge.list({ tenantId: "tenant-other", actorId: 42, limit: 10 })
    ).resolves.toEqual([]);
    await expect(
      bridge.get({
        runId: "run-226-control",
        tenantId: "tenant-other",
        actorId: 42,
      })
    ).rejects.toThrow("RUN_NOT_FOUND");

    const events = await bridge.events({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      afterSequence: 0,
      limit: 10,
    });
    expect(events.events).toHaveLength(1);
    expect(events.events[0]).toMatchObject({ type: "RUN_PAUSED" });
    expect(events.nextCursor).toBe(1);
    await expect(
      bridge.events({
        runId: "run-226-control",
        tenantId: "tenant-acme",
        actorId: 42,
        afterSequence: 1,
        limit: 10,
      })
    ).resolves.toMatchObject({ events: [], nextCursor: 1 });
  });

  it("uses canonical revision, fence and event idempotency without adding another command ledger", async () => {
    const memory = memoryAdapter({
      run: runAtPlanning(),
      revision: 0,
      events: [],
    });
    const bridge = createSpec226DevelopmentControlBridge({
      persistence: memory.adapter,
      listRuns: async () => [memory.read().run],
    });
    const command = {
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      expectedDecisionEpoch: 0,
      idempotencyKey: "control:pause:1",
      action: "pause" as const,
    };

    const accepted = await bridge.command(command);
    const duplicate = await bridge.command(command);
    expect(accepted).toMatchObject({
      accepted: true,
      run: { state: "PAUSED_POLICY" },
    });
    expect(duplicate).toMatchObject({
      accepted: false,
      run: { state: "PAUSED_POLICY" },
    });
    expect(memory.read().events).toHaveLength(1);

    await expect(
      bridge.command({
        ...command,
        idempotencyKey: "control:cancel:stale",
        action: "cancel",
      })
    ).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(
      bridge.command({
        ...command,
        expectedRevision: 1,
        expectedFencingVersion: 9,
        expectedDecisionEpoch: 0,
        idempotencyKey: "control:cancel:fence",
        action: "cancel",
      })
    ).rejects.toThrow("RUN_FENCE_STALE");
  });

  it("does not expose continuation or policy-resume as a bypass around canonical decision and approval handling", async () => {
    const memory = memoryAdapter({
      run: runAtPlanning(),
      revision: 0,
      events: [],
    });
    const bridge = createSpec226DevelopmentControlBridge({
      persistence: memory.adapter,
      listRuns: async () => [memory.read().run],
    });

    const view = await bridge.get({
      runId: "run-226-control",
      tenantId: "tenant-acme",
      actorId: 42,
    });
    expect(view.actions).toEqual({ pause: true, cancel: true });
    expect(view.decisionEpoch).toBe(0);
    expect(view.closure).toBeNull();
    await expect(
      bridge.command({
        runId: "run-226-control",
        tenantId: "tenant-acme",
        actorId: 42,
        expectedRevision: 0,
        expectedFencingVersion: 0,
        expectedDecisionEpoch: 1,
        idempotencyKey: "control:pause:stale-epoch",
        action: "pause",
      })
    ).rejects.toThrow("RUN_DECISION_EPOCH_STALE");
    await expect(
      bridge.command({
        runId: "run-226-control",
        tenantId: "tenant-acme",
        actorId: 42,
        expectedRevision: 0,
        expectedFencingVersion: 0,
        expectedDecisionEpoch: 0,
        idempotencyKey: "control:resume:forbidden",
        action: "resume" as never,
      })
    ).rejects.toThrow("CONTROL_ACTION_UNSUPPORTED");
  });
});
