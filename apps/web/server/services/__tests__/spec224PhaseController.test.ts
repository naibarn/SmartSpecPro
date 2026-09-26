import { describe, expect, it } from "vitest";

import {
  bindWorkerJob,
  buildDevelopmentRun,
  recordDevelopmentEvent,
  type DevelopmentRun,
} from "../spec224DevelopmentRunContracts";
import { createAndBindNextPhase } from "../spec224PhaseController";
import type {
  DevelopmentRunPersistenceAdapter,
  DevelopmentRunStoreRecord,
} from "../spec224DevelopmentRunPersistence";

function memoryAdapter(initial: DevelopmentRunStoreRecord) {
  let record = structuredClone(initial);
  const scopeMatches = (scope: { tenantId: string; actorId: number }) =>
    record.run.tenantId === scope.tenantId &&
    record.run.actorId === scope.actorId;

  const adapter: DevelopmentRunPersistenceAdapter = {
    async transaction(work) {
      return work({
        async load(runId, scope) {
          if (!scopeMatches(scope) || record.run.runId !== runId) return null;
          return structuredClone(record);
        },
        async findEvent(runId, idempotencyKey, scope) {
          if (!scopeMatches(scope) || record.run.runId !== runId) return null;
          return (
            record.events.find(
              event => event.idempotencyKey === idempotencyKey
            ) ?? null
          );
        },
        async save(next, expectedRevision, scope) {
          if (!scopeMatches(scope)) throw new Error("RUN_SCOPE_FORBIDDEN");
          if (record.revision !== expectedRevision)
            throw new Error("RUN_PROJECTION_STALE");
          record = structuredClone(next);
        },
        async appendEvent(event, scope) {
          if (!scopeMatches(scope)) throw new Error("RUN_SCOPE_FORBIDDEN");
          return event;
        },
        async getCanonicalJob() {
          return null;
        },
      });
    },
  };

  return {
    adapter,
    read: () => structuredClone(record),
    replace: (next: DevelopmentRunStoreRecord) => {
      record = structuredClone(next);
    },
  };
}

function reconciledRun(): DevelopmentRunStoreRecord {
  const initial = bindWorkerJob(
    buildDevelopmentRun({
      runId: "run-224-phase-controller",
      tenantId: "tenant-224",
      actorId: 224,
      goal: "Execute the next bounded development phase",
      repositoryRef: "repo:smartspecpro",
      baseRevision: "git:phase-controller",
      contextPackHash: "a".repeat(64),
      workspaceId: "workspace:spec224-phase-controller",
    }),
    "worker-discovery"
  );
  const reconciled = recordDevelopmentEvent(
    { ...initial, state: "PLANNING" },
    {
      eventId: "event-discovery-completed",
      idempotencyKey: "reconcile:worker-discovery:succeeded",
      type: "PHASE_COMPLETED",
      payload: { workerJobId: "worker-discovery", phase: "DISCOVERY" },
    }
  );
  if (!reconciled.event) throw new Error("TEST_EVENT_NOT_RECORDED");
  return { run: reconciled.run, revision: 4, events: [reconciled.event] };
}

function phaseInput(overrides: Record<string, unknown> = {}) {
  return {
    runId: "run-224-phase-controller",
    tenantId: "tenant-224",
    actorId: 224,
    expectedRevision: 4,
    expectedFencingVersion: 1,
    idempotencyKey: "continue:planning:revision-2",
    provider: "codex" as const,
    runtime: "local_runner" as const,
    planId: "plan-224-phase-controller",
    planRevision: 2,
    skillIds: ["skill:spec224-core"],
    requestedCapabilities: ["workspace.edit"],
    authorizationScope: "spec224.development.run",
    ...overrides,
  };
}

describe("Spec 224 executable phase continuation", () => {
  it("binds distinct canonical jobs for consecutive reconciled phases and makes the first command idempotent", async () => {
    const memory = memoryAdapter(reconciledRun());
    const definitions: Array<{ idempotencyKey?: string }> = [];
    let admissions = 0;
    const controlPlane = {
      create: async (definition: { idempotencyKey?: string }) => {
        definitions.push(definition);
        admissions += 1;
        return {
          jobId: `worker-phase-${admissions}`,
          created: true,
        };
      },
    };

    const first = await createAndBindNextPhase({
      ...phaseInput(),
      persistence: memory.adapter,
      controlPlane: controlPlane as never,
      executorRegistry: { has: () => true } as never,
    });
    const duplicate = await createAndBindNextPhase({
      ...phaseInput(),
      persistence: memory.adapter,
      controlPlane: controlPlane as never,
      executorRegistry: { has: () => true } as never,
    });

    expect(first).toMatchObject({
      accepted: true,
      jobRef: { jobId: "worker-phase-1", created: true },
      run: {
        workerJobId: "worker-phase-1",
        state: "PLANNING",
        fencingVersion: 2,
      },
      revision: 5,
    });
    expect(first.event).toMatchObject({
      type: "PHASE_STARTED",
      payload: {
        workerJobId: "worker-phase-1",
        phase: "PLANNING",
        planRevision: 2,
      },
    });
    expect(duplicate).toMatchObject({
      accepted: false,
      jobRef: { jobId: "worker-phase-1", created: false },
      revision: 5,
    });
    expect(admissions).toBe(1);

    const firstRecord = memory.read();
    const nextPhase = recordDevelopmentEvent(
      { ...firstRecord.run, state: "PLAN_VERIFY" },
      {
        eventId: "event-planning-completed",
        idempotencyKey: "reconcile:worker-phase-1:succeeded",
        type: "PHASE_COMPLETED",
        payload: { workerJobId: "worker-phase-1", phase: "PLANNING" },
      }
    );
    if (!nextPhase.event) throw new Error("TEST_EVENT_NOT_RECORDED");
    memory.replace({
      run: nextPhase.run,
      revision: firstRecord.revision + 1,
      events: [...firstRecord.events, nextPhase.event],
    });

    const second = await createAndBindNextPhase({
      ...phaseInput({
        expectedRevision: 6,
        expectedFencingVersion: 2,
        idempotencyKey: "continue:plan-verify:revision-3",
        planRevision: 3,
      }),
      persistence: memory.adapter,
      controlPlane: controlPlane as never,
      executorRegistry: { has: () => true } as never,
    });

    expect(second).toMatchObject({
      accepted: true,
      jobRef: { jobId: "worker-phase-2", created: true },
      run: {
        workerJobId: "worker-phase-2",
        state: "PLAN_VERIFY",
        fencingVersion: 3,
      },
    });
    expect(second.jobRef.jobId).not.toBe(first.jobRef.jobId);
    expect(definitions.map(definition => definition.idempotencyKey)).toEqual([
      "spec224:phase:run-224-phase-controller:PLANNING:plan:2",
      "spec224:phase:run-224-phase-controller:PLAN_VERIFY:plan:3",
    ]);
  });

  it("rejects an active current job, stale projections, and an out-of-scope caller", async () => {
    const active = reconciledRun();
    active.run.events = [];
    active.events = [];
    const memory = memoryAdapter(active);
    const controlPlane = {
      create: async () => ({ jobId: "worker-unexpected", created: true }),
    };

    await expect(
      createAndBindNextPhase({
        ...phaseInput(),
        persistence: memory.adapter,
        controlPlane: controlPlane as never,
        executorRegistry: { has: () => true } as never,
      })
    ).rejects.toThrow("RUN_CURRENT_JOB_UNRECONCILED");

    const reconciled = memoryAdapter(reconciledRun());
    await expect(
      createAndBindNextPhase({
        ...phaseInput({ expectedRevision: 3 }),
        persistence: reconciled.adapter,
        controlPlane: controlPlane as never,
        executorRegistry: { has: () => true } as never,
      })
    ).rejects.toThrow("RUN_PROJECTION_STALE");
    await expect(
      createAndBindNextPhase({
        ...phaseInput({ tenantId: "tenant-other" }),
        persistence: reconciled.adapter,
        controlPlane: controlPlane as never,
        executorRegistry: { has: () => true } as never,
      })
    ).rejects.toThrow("RUN_NOT_FOUND");

    const cancelled = reconciledRun();
    cancelled.run.state = "CANCELLED";
    const terminal = memoryAdapter(cancelled);
    await expect(
      createAndBindNextPhase({
        ...phaseInput(),
        persistence: terminal.adapter,
        controlPlane: controlPlane as never,
        executorRegistry: { has: () => true } as never,
      })
    ).rejects.toThrow("RUN_NEXT_PHASE_NOT_AUTHORIZED");
  });

  it("surfaces a typed uncertainty when admission succeeds but the projection bind fails", async () => {
    const memory = memoryAdapter(reconciledRun());
    const persistence: DevelopmentRunPersistenceAdapter = {
      transaction: work =>
        memory.adapter.transaction(async tx =>
          work({
            ...tx,
            save: async () => {
              throw new Error("PERSISTENCE_WRITE_INTERRUPTED");
            },
          })
        ),
    };

    await expect(
      createAndBindNextPhase({
        ...phaseInput(),
        persistence,
        controlPlane: {
          create: async () => ({
            jobId: "worker-admitted-only",
            created: true,
          }),
        } as never,
        executorRegistry: { has: () => true } as never,
      })
    ).rejects.toMatchObject({
      code: "PHASE_ADMISSION_BIND_UNCERTAIN",
      jobId: "worker-admitted-only",
    });
  });
});
