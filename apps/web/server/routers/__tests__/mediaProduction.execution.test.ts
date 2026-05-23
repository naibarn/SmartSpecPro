import { describe, expect, it, vi } from "vitest";
import { mediaProductionRuns, mediaProductionSpaces } from "../../../drizzle/schema";
import type { ProductionSpace } from "../../../shared/mediaProduction";

const { mockGetDb, mockRefundCredits, mockDeductCredits } = vi.hoisted(() => ({
  mockGetDb: vi.fn(),
  mockRefundCredits: vi.fn().mockResolvedValue({ transactionId: 2 }),
  mockDeductCredits: vi.fn().mockResolvedValue({ transactionId: 1 }),
}));

vi.mock("../../db", () => ({
  getDb: mockGetDb,
  db: {},
}));

vi.mock("../../services/creditService", () => ({
  refundCredits: mockRefundCredits,
  deductCredits: mockDeductCredits,
}));

import { mediaProductionRouter } from "../mediaProduction";

const baseDate = new Date("2026-05-22T03:00:00.000Z");

function buildSpace(version = 1): ProductionSpace {
  return {
    schemaVersion: "1.0.0",
    productionRunId: "run-116",
    version,
    status: "final_preflight_passed",
    brief: {
      title: "Director Project",
      summary: "Production Director canvas",
    },
    shots: [{
      id: "shot-1",
      title: "Opening",
      order: 1,
      nodeIds: ["node-video"],
      status: "ready",
    }],
    flowNodes: [{
      id: "node-video",
      kind: "video",
      title: "Video Shot",
      status: "ready",
      configSnapshot: {
        snapshotId: "config-1",
        version: 1,
        toolSurface: "video",
        adapter: "video",
        config: { prompt: "show product" },
        configHash: "hash-1",
      },
      estimatedCredits: 4,
    }],
    flowEdges: [],
    contextAssets: [],
    featureFlags: {
      feature116RunOneNode: true,
      feature116RunOneShot: true,
      feature116BatchExecution: false,
    },
    updatedAt: baseDate.toISOString(),
  };
}

function createDb(space = buildSpace(1), options: { runUserId?: number } = {}) {
  const db = {
    runs: [{
      tenantId: "tenant-1",
      userId: options.runUserId ?? 7,
      productionRunId: "run-116",
      status: space.status,
      goalVersion: 1,
      planVersion: 1,
      goal: {},
      productionBible: {},
      assetPlan: {},
      updatedAt: baseDate,
    }],
    spaces: [{
      tenantId: "tenant-1",
      userId: 7,
      productionRunId: "run-116",
      version: space.version,
      space,
      status: space.status,
      archivedAt: null,
      deletedAt: null,
      createdAt: baseDate,
      updatedAt: baseDate,
    }] as Array<Record<string, any>>,
    insertedSpaces: [] as Array<Record<string, any>>,
    select() {
      let selectedTable: unknown;
      const query = {
        from(table: unknown) {
          selectedTable = table;
          return query;
        },
        where() {
          return query;
        },
        orderBy() {
          return query;
        },
        limit() {
          if (selectedTable === mediaProductionSpaces) {
            return Promise.resolve([...db.spaces].sort((a, b) => Number(b.version) - Number(a.version)).slice(0, 1));
          }
          if (selectedTable === mediaProductionRuns) {
            return Promise.resolve(db.runs.slice(0, 1));
          }
          return Promise.resolve([]);
        },
      };
      return query;
    },
    insert(table: unknown) {
      const insertQuery = {
        values(value: Record<string, any>) {
          if (table === mediaProductionSpaces) {
            const row = { id: db.spaces.length + 1, ...value };
            db.spaces.push(row);
            db.insertedSpaces.push(row);
          }
          return insertQuery;
        },
        onConflictDoUpdate() {
          return insertQuery;
        },
        returning() {
          if (table === mediaProductionSpaces) {
            return Promise.resolve([db.insertedSpaces[db.insertedSpaces.length - 1]]);
          }
          return Promise.resolve([db.runs[0]]);
        },
      };
      return insertQuery;
    },
  };
  return db;
}

function createCaller(options: { tenantId?: string | null; currentTenantId?: string | null; userId?: number } = {}) {
  return mediaProductionRouter.createCaller({
    user: {
      id: options.userId ?? 7,
      email: "user@example.com",
      name: "Director",
      role: "user",
      currentTenantId: options.currentTenantId === undefined ? "tenant-1" : options.currentTenantId,
    },
    tenantId: options.tenantId === undefined ? "tenant-1" : options.tenantId,
    userToken: "user-token",
    privateVaultToken: null,
    publicUrl: "https://example.com",
    req: { ip: "127.0.0.1", headers: {}, protocol: "https" } as any,
    res: {} as any,
  });
}

describe("mediaProduction execution router integration", () => {
  it("runs and cancels execution through the router with DB-backed version checks", async () => {
    const previous = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const caller = createCaller();

    const scheduled = await caller.runExecution({
      productionRunId: "run-116",
      expectedVersion: 1,
      scope: "node",
      targetId: "node-video",
      confirmed: true,
    });

    expect(scheduled.attempt.status).toBe("queued");
    expect(scheduled.version).toBe(2);

    const cancelled = await caller.cancelExecution({
      productionRunId: "run-116",
      expectedVersion: 2,
      attemptId: scheduled.attempt.attemptId,
    });

    expect(cancelled.attempt.status).toBe("cancelled");
    expect(cancelled.space.flowNodes[0].status).toBe("cancelled");

    if (previous === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previous;
  });

  it("reconciles a provider callback through the router without polling", async () => {
    const space = buildSpace(1);
    space.status = "final_generating";
    space.flowNodes[0].status = "running";
    space.flowNodes[0].outputRefs = [{
      outputRefId: "out-node-video-media-task-1",
      nodeId: "node-video",
      kind: "video",
      mediaTaskId: "media-task-1",
      providerTaskId: "provider-task-1",
    }];
    space.actionAttempts = [{
      attemptId: "attempt-1",
      kind: "generate",
      scope: "node",
      status: "running",
      actorUserId: 7,
      creditOwnerUserId: 7,
      nodeIds: ["node-video"],
      shotIds: ["shot-1"],
      idempotencyKey: "idem-1",
      expectedSpaceVersion: 1,
      creditEstimate: 4,
      creditReserved: 4,
      creditSpent: 0,
      creditRefunded: 0,
      mediaTaskIds: ["media-task-1"],
      providerTaskIds: ["provider-task-1"],
      createdAt: baseDate.toISOString(),
      updatedAt: baseDate.toISOString(),
    }];
    mockGetDb.mockResolvedValue(createDb(space));
    const caller = createCaller();

    const reconciled = await caller.reconcileProviderCallback({
      productionRunId: "run-116",
      task: {
        id: "media-task-1",
        taskId: "provider-task-1",
        userId: "7",
        mediaType: "video",
        status: "completed",
        model: "video-model",
        prompt: "show product",
        resultUrl: "https://cdn.example/generated.mp4",
        createdAt: baseDate.toISOString(),
        completedAt: baseDate.toISOString(),
      },
    });

    expect(reconciled.attempt.status).toBe("completed");
    expect(reconciled.space.status).toBe("final_qa_passed");
  });

  it("imports downstream result records through the router", async () => {
    const db = createDb();
    mockGetDb.mockResolvedValue(db);
    const caller = createCaller();

    const imported = await caller.importDownstreamResult({
      productionRunId: "run-116",
      expectedVersion: 1,
      result: {
        recordId: "storyboard-review-import-1",
        sourceSpaceVersion: 1,
        target: "storyboard_review",
        selectedTakeRefs: [{
          outputRefId: "take-storyboard-1",
          nodeId: "node-video",
          kind: "video",
          url: "https://cdn.example/storyboard-take.mp4",
        }],
        captionUpdates: [{
          id: "caption-1",
          shotId: "shot-1",
          startSeconds: 0,
          endSeconds: 3,
          kind: "caption",
          label: "Opening caption",
        }],
      },
    });

    expect(imported.version).toBe(2);
    expect(imported.record.status).toBe("imported");
    expect(imported.importedCueIds).toEqual(["caption-1"]);
    expect(imported.space.downstreamResultRecords?.[0]).toMatchObject({
      recordId: "storyboard-review-import-1",
      target: "storyboard_review",
      status: "imported",
    });
    expect(imported.space.flowNodes[0].outputRefs?.at(-1)).toMatchObject({
      outputRefId: "take-storyboard-1",
      nodeId: "node-video",
    });
  });

  it("rejects downstream imports without tenant context", async () => {
    mockGetDb.mockResolvedValue(createDb());
    const caller = createCaller({ tenantId: null, currentTenantId: null });

    await expect(caller.importDownstreamResult({
      productionRunId: "run-116",
      expectedVersion: 1,
      result: {
        recordId: "missing-tenant",
        sourceSpaceVersion: 1,
        target: "video_edit",
      },
    })).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Tenant context is required" });
  });

  it("rejects downstream imports from users without write permission", async () => {
    mockGetDb.mockResolvedValue(createDb(buildSpace(1), { runUserId: 99 }));
    const caller = createCaller();

    await expect(caller.importDownstreamResult({
      productionRunId: "run-116",
      expectedVersion: 1,
      result: {
        recordId: "forbidden-import",
        sourceSpaceVersion: 1,
        target: "video_edit",
      },
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects missing tenant context for every mutating ProductionSpace procedure", async () => {
    mockGetDb.mockResolvedValue(createDb());
    const caller = createCaller({ tenantId: null, currentTenantId: null });
    const space = buildSpace(1);
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["saveSpace", () => caller.saveSpace({ productionRunId: "run-116", expectedVersion: 1, space, changedFields: ["brief.summary"] })],
      ["saveBrief", () => caller.saveBrief({ productionRunId: "run-116", expectedVersion: 1, brief: space.brief })],
      ["saveShot", () => caller.saveShot({ productionRunId: "run-116", expectedVersion: 1, shot: space.shots[0] })],
      ["saveNodeConfig", () => caller.saveNodeConfig({ productionRunId: "run-116", expectedVersion: 1, nodeId: "node-video", configSnapshot: space.flowNodes[0].configSnapshot! })],
      ["saveCanvasLayout", () => caller.saveCanvasLayout({ productionRunId: "run-116", expectedVersion: 1, layout: { "node-video": { x: 10, y: 20 } } })],
      ["archiveSpace", () => caller.archiveSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["restoreSpace", () => caller.restoreSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["deleteSpace", () => caller.deleteSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["runExecution", () => caller.runExecution({ productionRunId: "run-116", expectedVersion: 1, scope: "node", targetId: "node-video", confirmed: true })],
      ["cancelExecution", () => caller.cancelExecution({ productionRunId: "run-116", expectedVersion: 1, attemptId: "attempt-1" })],
      ["retryExecution", () => caller.retryExecution({ productionRunId: "run-116", expectedVersion: 1, retryOfAttemptId: "attempt-1", scope: "node", targetId: "node-video", confirmed: true })],
      ["saveShotProductUse", () => caller.saveShotProductUse({ productionRunId: "run-116", expectedVersion: 1, shotProductUse: { shotId: "shot-1", productStoryboardAssetIds: [], claimIds: [], evidenceIds: [] } })],
      ["updateProductStoryboardAsset", () => caller.updateProductStoryboardAsset({ productionRunId: "run-116", expectedVersion: 1, productAssetId: "product-1", action: "request_more_evidence", patch: {} })],
      ["repairStaleOutputRefs", () => caller.repairStaleOutputRefs({ productionRunId: "run-116", expectedVersion: 1 })],
      ["importDownstreamResult", () => caller.importDownstreamResult({ productionRunId: "run-116", expectedVersion: 1, result: { recordId: "import-1", sourceSpaceVersion: 1, target: "video_edit" } })],
    ];

    for (const [name, action] of cases) {
      await expect(action(), name).rejects.toMatchObject({ code: "BAD_REQUEST", message: "Tenant context is required" });
    }
  });

  it("rejects cross-user access for every mutating ProductionSpace procedure before side effects", async () => {
    mockGetDb.mockResolvedValue(createDb(buildSpace(1), { runUserId: 99 }));
    const caller = createCaller();
    const space = buildSpace(1);
    const cases: Array<[string, () => Promise<unknown>]> = [
      ["saveSpace", () => caller.saveSpace({ productionRunId: "run-116", expectedVersion: 1, space, changedFields: ["brief.summary"] })],
      ["saveBrief", () => caller.saveBrief({ productionRunId: "run-116", expectedVersion: 1, brief: space.brief })],
      ["saveShot", () => caller.saveShot({ productionRunId: "run-116", expectedVersion: 1, shot: space.shots[0] })],
      ["saveNodeConfig", () => caller.saveNodeConfig({ productionRunId: "run-116", expectedVersion: 1, nodeId: "node-video", configSnapshot: space.flowNodes[0].configSnapshot! })],
      ["saveCanvasLayout", () => caller.saveCanvasLayout({ productionRunId: "run-116", expectedVersion: 1, layout: { "node-video": { x: 10, y: 20 } } })],
      ["archiveSpace", () => caller.archiveSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["restoreSpace", () => caller.restoreSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["deleteSpace", () => caller.deleteSpace({ productionRunId: "run-116", expectedVersion: 1 })],
      ["runExecution", () => caller.runExecution({ productionRunId: "run-116", expectedVersion: 1, scope: "node", targetId: "node-video", confirmed: true })],
      ["cancelExecution", () => caller.cancelExecution({ productionRunId: "run-116", expectedVersion: 1, attemptId: "attempt-1" })],
      ["retryExecution", () => caller.retryExecution({ productionRunId: "run-116", expectedVersion: 1, retryOfAttemptId: "attempt-1", scope: "node", targetId: "node-video", confirmed: true })],
      ["saveShotProductUse", () => caller.saveShotProductUse({ productionRunId: "run-116", expectedVersion: 1, shotProductUse: { shotId: "shot-1", productStoryboardAssetIds: [], claimIds: [], evidenceIds: [] } })],
      ["updateProductStoryboardAsset", () => caller.updateProductStoryboardAsset({ productionRunId: "run-116", expectedVersion: 1, productAssetId: "product-1", action: "request_more_evidence", patch: {} })],
      ["repairStaleOutputRefs", () => caller.repairStaleOutputRefs({ productionRunId: "run-116", expectedVersion: 1 })],
      ["importDownstreamResult", () => caller.importDownstreamResult({ productionRunId: "run-116", expectedVersion: 1, result: { recordId: "import-1", sourceSpaceVersion: 1, target: "video_edit" } })],
    ];

    for (const [name, action] of cases) {
      await expect(action(), name).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
  });

  it("enforces collaborator role boundaries for read, write, and execute access", async () => {
    const previous = process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
    process.env.FEATURE116_RUN_ONE_NODE_ENABLED = "true";
    try {
      const space = {
        ...buildSpace(1),
        accessPolicy: {
          ownerUserId: 7,
          collaborators: [
            { userId: 8, level: "read" as const },
            { userId: 9, level: "write" as const },
            { userId: 10, level: "execute" as const },
          ],
        },
      };

      mockGetDb.mockResolvedValue(createDb(space));
      await expect(createCaller({ userId: 8 }).saveBrief({
        productionRunId: "run-116",
        expectedVersion: 1,
        brief: space.brief,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      mockGetDb.mockResolvedValue(createDb(space));
      const writeSaved = await createCaller({ userId: 9 }).saveBrief({
        productionRunId: "run-116",
        expectedVersion: 1,
        brief: { ...space.brief, summary: "Writer update" },
      });
      expect(writeSaved.version).toBe(2);

      mockGetDb.mockResolvedValue(createDb(space));
      await expect(createCaller({ userId: 9 }).runExecution({
        productionRunId: "run-116",
        expectedVersion: 1,
        scope: "node",
        targetId: "node-video",
        confirmed: true,
      })).rejects.toMatchObject({ code: "FORBIDDEN" });

      mockGetDb.mockResolvedValue(createDb(space));
      const executed = await createCaller({ userId: 10 }).runExecution({
        productionRunId: "run-116",
        expectedVersion: 1,
        scope: "node",
        targetId: "node-video",
        confirmed: true,
      });
      expect(executed.attempt.status).toBe("queued");
    } finally {
      if (previous === undefined) delete process.env.FEATURE116_RUN_ONE_NODE_ENABLED;
      else process.env.FEATURE116_RUN_ONE_NODE_ENABLED = previous;
    }
  });
});
