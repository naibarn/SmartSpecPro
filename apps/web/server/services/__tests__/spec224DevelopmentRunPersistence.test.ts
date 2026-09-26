import { describe, expect, it } from "vitest";

import { buildDevelopmentRun } from "../spec224DevelopmentRunContracts";
import {
  createDevelopmentRunService,
  createPersistedDevelopmentRun,
  type CanonicalDevelopmentJobSnapshot,
  type DevelopmentRunPersistenceAdapter,
  type DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";
import {
  buildBlockerLedgerEntry,
  compileRequirementClosureGraph,
} from "../spec224RequirementClosureContracts";
import { createRequirementClosurePersistenceService } from "../spec224RequirementClosurePersistence";

const baseRun = buildDevelopmentRun({
  runId: "run-224-persisted",
  tenantId: "tenant-acme",
  actorId: 42,
  goal: "Implement a governed Skill",
  repositoryRef: "repo:smartspecpro",
  baseRevision: "git:base123",
  contextPackHash: "a".repeat(64),
  workspaceId: "workspace:run-224-persisted",
});

function memoryAdapter(
  initial?: DevelopmentRunStoreRecord,
  canonicalJob: CanonicalDevelopmentJobSnapshot = {
    status: "succeeded",
    output: { evidenceRefs: ["evidence:phase-pass"] },
  }
): DevelopmentRunPersistenceAdapter {
  let record = initial ?? null;
  return {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (!record || record.run.runId !== runId) return null;
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            return null;
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
          if (expectedRevision === -1 && !record) {
            record = structuredClone(next);
            return;
          }
          if (!record || record.run.runId !== next.run.runId)
            throw new Error("RUN_NOT_FOUND");
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            throw new Error("RUN_SCOPE_FORBIDDEN");
          if (record.revision !== expectedRevision)
            throw new Error("RUN_PROJECTION_STALE");
          record = { ...structuredClone(next), revision: expectedRevision + 1 };
        },
        async appendEvent(event, scope) {
          if (!record || record.run.runId !== event.runId)
            throw new Error("RUN_NOT_FOUND");
          if (
            record.run.tenantId !== scope.tenantId ||
            record.run.actorId !== scope.actorId
          )
            throw new Error("RUN_SCOPE_FORBIDDEN");
          const existing = record.events.find(
            item => item.idempotencyKey === event.idempotencyKey
          );
          if (existing) return existing;
          record.events.push(structuredClone(event));
          return event;
        },
        async getCanonicalJob() {
          return canonicalJob;
        },
      });
    },
    async seed(next) {
      record = structuredClone(next);
    },
    async read() {
      return structuredClone(record);
    },
  };
}

describe("Spec 224 durable DevelopmentRun persistence", () => {
  function finalVerifyRun() {
    return {
      ...baseRun,
      state: "FINAL_VERIFY" as const,
      workerJobId: "worker-job-final-verify",
    };
  }

  function finalVerifyGraph() {
    return compileRequirementClosureGraph({
      baseline: {
        specId: "224",
        revision: "1",
        digest: "b".repeat(64),
        baselineId: "baseline:224-r1",
        authorityRef: "authority:platform-engineering",
        scopeEnvelopeRef: "scope:224-r1",
      },
      requirements: [
        {
          id: "REQ-224-FINAL-GATE",
          sourceRef: "spec:224#final-gate",
          text: "Final Verify uses persisted closure state.",
        },
      ],
      planSections: [
        {
          id: "section:final-gate",
          requirementIds: ["REQ-224-FINAL-GATE"],
        },
      ],
      workPackages: [
        {
          id: "wp:final-gate",
          planSectionId: "section:final-gate",
          requirementIds: ["REQ-224-FINAL-GATE"],
          dependsOn: [],
        },
      ],
    });
  }

  async function attachFinalVerifyGraph(
    adapter: DevelopmentRunPersistenceAdapter,
    graph = finalVerifyGraph()
  ) {
    return createRequirementClosurePersistenceService(adapter).attachGraph({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 0,
      idempotencyKey: "closure:final-gate:attach",
      graph,
    });
  }

  const finalVerifyProvenance = {
    candidateSha: "a".repeat(64),
    verifiedBaseSha: "c".repeat(64),
    specDigest: "b".repeat(64),
    policySnapshotDigest: "d".repeat(64),
    verificationProfileVersion: "profile:spec224-v1",
    evidenceBundleDigest: "e".repeat(64),
  };

  it("persists a phase transition and rejects a stale projection revision", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);

    const first = await service.command({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition",
        nextState: "PLANNING",
        eventType: "PHASE_COMPLETED",
        payload: { phase: "DISCOVERY" },
      },
    });
    expect(first.accepted).toBe(true);
    expect(first.run.state).toBe("PLANNING");
    expect((await adapter.read())?.revision).toBe(1);

    await expect(
      service.command({
        runId: baseRun.runId,
        tenantId: baseRun.tenantId,
        actorId: baseRun.actorId,
        expectedRevision: 0,
        idempotencyKey: "phase:planning:stale",
        command: {
          kind: "transition",
          nextState: "PLAN_VERIFY",
          eventType: "PHASE_COMPLETED",
          payload: {},
        },
      })
    ).rejects.toThrow("RUN_PROJECTION_STALE");
  });

  it("makes repeated commands idempotent and enforces tenant and actor scope", async () => {
    const adapter = memoryAdapter({ run: baseRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);
    const command = {
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
      expectedRevision: 0,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition" as const,
        nextState: "PLANNING" as const,
        eventType: "PHASE_COMPLETED" as const,
        payload: { phase: "DISCOVERY" },
      },
    };

    const first = await service.command(command);
    const duplicate = await service.command({
      ...command,
      expectedRevision: 1,
    });
    expect(first.accepted).toBe(true);
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.run.state).toBe("PLANNING");

    await expect(
      service.command({
        ...command,
        tenantId: "tenant-other",
        expectedRevision: 1,
      })
    ).rejects.toThrow("RUN_NOT_FOUND");
    await expect(
      service.command({ ...command, actorId: 7, expectedRevision: 1 })
    ).rejects.toThrow("RUN_NOT_FOUND");
  });

  it("reconciles a succeeded canonical worker job into the next safe phase", async () => {
    const adapter = memoryAdapter({
      run: { ...baseRun, workerJobId: "worker-job-224" },
      revision: 0,
      events: [],
    });
    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: baseRun.runId,
      tenantId: baseRun.tenantId,
      actorId: baseRun.actorId,
    });

    expect(result.action).toBe("CONTINUE");
    expect(result.run.state).toBe("PLANNING");
    expect(result.run.events.at(-1)?.type).toBe("PHASE_COMPLETED");
  });

  it("does not complete Final Verify when a persisted requirement is incomplete", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
        resultRef: "result:final-worker",
      }
    );
    await attachFinalVerifyGraph(adapter);
    const service = createDevelopmentRunService(adapter);

    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.reason).toBe("final_verification_rejected");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        workerJobId: run.workerJobId,
        closureErrorCode: "REQUIREMENT_NOT_TERMINAL",
      },
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    expect(duplicate.action).toBe("WAIT");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "PHASE_FAILED")
    ).toHaveLength(1);
  });

  it("rejects Final Verify when the persisted closure graph is missing", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
      }
    );

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: { closureErrorCode: "CLOSURE_GRAPH_NOT_FOUND" },
    });
  });

  it("does not complete Final Verify when a persisted blocker is open", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
      }
    );
    const graph = finalVerifyGraph();
    await attachFinalVerifyGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-final-gate"],
      })),
    });
    const closure = createRequirementClosurePersistenceService(adapter);
    await closure.upsertBlocker({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
      expectedRevision: 1,
      expectedFencingVersion: 0,
      idempotencyKey: "blocker:final-gate:open",
      blocker: buildBlockerLedgerEntry({
        blockerId: "blocker:final-gate",
        runId: run.runId,
        requirementRefs: ["REQ-224-FINAL-GATE"],
        classification: "TEST_FAILURE",
        severity: "high",
      }),
    });

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: { closureErrorCode: "BLOCKER_OPEN" },
    });
  });

  it("completes Final Verify only when the persisted closure is eligible", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: { evidenceRefs: ["evidence:final-worker-result"] },
        resultRef: "result:final-worker",
      }
    );
    const graph = finalVerifyGraph();
    await attachFinalVerifyGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-final-gate"],
      })),
    });

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("STOP");
    expect(result.run.state).toBe("COMPLETED");
    expect(result.reason).toBe("final_verification_passed");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "RUN_COMPLETED")
    ).toHaveLength(1);
  });

  it("rejects a stale terminal provenance tuple through the existing repair path", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: {
            ...finalVerifyProvenance,
            specDigest: "f".repeat(64),
          },
        },
      }
    );
    const graph = finalVerifyGraph();
    await attachFinalVerifyGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-final-gate"],
      })),
    });

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.state).toBe("DEBUG_REPAIR");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        closureErrorCode: "FINAL_VERIFY_PROVENANCE_STALE",
      },
    });
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "PHASE_FAILED")
    ).toHaveLength(1);
  });

  it("rejects a malformed terminal provenance tuple with a stable error code", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: {
            ...finalVerifyProvenance,
            candidateSha: "not-a-sha",
          },
        },
      }
    );
    const graph = finalVerifyGraph();
    await attachFinalVerifyGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-final-gate"],
      })),
    });

    const result = await createDevelopmentRunService(adapter).reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("RECOVER");
    expect(result.run.events.at(-1)).toMatchObject({
      type: "PHASE_FAILED",
      payload: {
        closureErrorCode: "FINAL_VERIFY_PROVENANCE_INVALID",
      },
    });
  });

  it("completes an eligible terminal provenance tuple and preserves duplicate reconciliation", async () => {
    const run = finalVerifyRun();
    const adapter = memoryAdapter(
      { run, revision: 0, events: [] },
      {
        status: "succeeded",
        output: {
          evidenceRefs: ["evidence:final-worker-result"],
          verificationProvenance: finalVerifyProvenance,
        },
      }
    );
    const graph = finalVerifyGraph();
    await attachFinalVerifyGraph(adapter, {
      ...graph,
      requirements: graph.requirements.map(requirement => ({
        ...requirement,
        state: "VERIFIED_PASS" as const,
        evidenceRefs: ["evidence:req-final-gate"],
      })),
    });

    const service = createDevelopmentRunService(adapter);
    const result = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });
    const duplicate = await service.reconcile({
      runId: run.runId,
      tenantId: run.tenantId,
      actorId: run.actorId,
    });

    expect(result.action).toBe("STOP");
    expect(result.run.state).toBe("COMPLETED");
    expect(duplicate.reason).toBe("worker_job_already_reconciled");
    expect(
      duplicate.run.events.filter(event => event.type === "RUN_COMPLETED")
    ).toHaveLength(1);
  });

  it("rejects idempotency-key reuse for another command and stale run fences", async () => {
    const boundRun = {
      ...baseRun,
      workerJobId: "worker-job-fenced",
      fencingVersion: 4,
    };
    const adapter = memoryAdapter({ run: boundRun, revision: 0, events: [] });
    const service = createDevelopmentRunService(adapter);
    const command = {
      runId: boundRun.runId,
      tenantId: boundRun.tenantId,
      actorId: boundRun.actorId,
      expectedRevision: 0,
      expectedFencingVersion: 4,
      idempotencyKey: "phase:discovery:complete",
      command: {
        kind: "transition" as const,
        nextState: "PLANNING" as const,
        eventType: "PHASE_COMPLETED" as const,
        payload: {},
      },
    };

    await service.command(command);
    await expect(
      service.command({
        ...command,
        expectedRevision: 1,
        command: { ...command.command, nextState: "PLAN_VERIFY" },
      })
    ).rejects.toThrow("RUN_IDEMPOTENCY_CONFLICT");
    await expect(
      service.command({
        ...command,
        expectedRevision: 1,
        expectedFencingVersion: 3,
        idempotencyKey: "phase:planning:stale-fence",
        command: { ...command.command, nextState: "PLAN_VERIFY" },
      })
    ).rejects.toThrow("RUN_FENCE_STALE");
  });

  it("creates the canonical worker job through external_agent_task and stores the bound run projection", async () => {
    const adapter = memoryAdapter();
    const result = await createPersistedDevelopmentRun({
      run: baseRun,
      provider: "codex",
      runtime: "local_runner",
      planId: "plan-224-persisted",
      planRevision: 1,
      skillIds: [],
      requestedCapabilities: ["workspace.edit"],
      authorizationScope: "spec224.development.run",
      persistence: adapter,
      controlPlane: {
        create: async definition => {
          expect(definition.jobType).toBe("external_agent_task");
          expect(definition.input).toHaveProperty("spec224Run");
          return { jobId: "worker-job-224", created: true };
        },
      } as never,
      executorRegistry: { has: () => true } as never,
    });

    expect(result.run.workerJobId).toBe("worker-job-224");
    expect((await adapter.read())?.events[0]?.type).toBe("RUN_CREATED");
  });
});
