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
      idempotencyKey: "control:pause:1",
      action: "pause",
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
    await expect(
      bridge.command({
        runId: "run-226-control",
        tenantId: "tenant-acme",
        actorId: 42,
        expectedRevision: 0,
        expectedFencingVersion: 0,
        idempotencyKey: "control:resume:forbidden",
        action: "resume" as never,
      })
    ).rejects.toThrow("CONTROL_ACTION_UNSUPPORTED");
  });
});
