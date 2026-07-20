/**
 * Stale MCP media task reconciler + hard timeout coverage
 * (2026-07-07 stuck-task incident: a Higgsfield video task created shortly
 * after a server restart sat in "processing" for 6+ hours because nothing
 * ever re-polled it in the background, and the provider's `job_status`
 * response for the job — `isError: true` with a generic
 * "Something went wrong. Please try again." — was previously treated as a
 * transient failure, leaving the task unchanged forever).
 *
 * `../db`, `./crypto`, and `../mcpConnectionService` are mocked so these
 * tests exercise `refreshMcpMediaTaskStatus` / `reconcileStaleMcpMediaTasks`
 * against a fully deterministic connection row + provider response, without
 * touching a real database or network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MediaTask } from "../mediaGenerationService";

const { dbMock, recordMcpUsageEventMock, connectionRow, tasksTableRows } = vi.hoisted(() => {
  const connectionRow = {
    connection: {
      id: "conn-1",
      status: "connected",
      encryptedTokenRef: "encrypted-token-placeholder",
      tokenExpiresAt: null,
    },
    template: {
      mcpUrl: "https://mcp.higgsfield.ai/mcp",
    },
  };
  const tasksTableRows: unknown[] = [];
  const dbMock = {
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  };
  const recordMcpUsageEventMock = vi.fn().mockResolvedValue(undefined);
  return { dbMock, recordMcpUsageEventMock, connectionRow, tasksTableRows };
});

vi.mock("../../db", () => ({
  getDb: () => dbMock,
}));

vi.mock("../crypto", () => ({
  decrypt: () => JSON.stringify({ accessToken: "test-token", tokenType: "Bearer" }),
  encrypt: (value: string) => value,
}));

vi.mock("../mcpConnectionService", () => ({
  recordMcpUsageEvent: recordMcpUsageEventMock,
}));

// Set A gap 5/6 (2026-07-16 stuck-candidate fix) — the VD portrait-candidate
// cascade lazy-`import()`s both of these at the call site (see
// `cascadeFailedVdPortraitCandidateTask` in `../mcpMediaAdapter`) precisely
// so this module's static import graph stays worker/scheduler-safe; mocked
// here so the cascade tests below assert the wiring without loading the
// real (heavy, adminProcedure-carrying) `routers/media.ts` or touching a
// real database through the VD stock service.
const { mockReconcileTaskCredits, mockMarkPortraitCandidateSubmissionFailed } = vi.hoisted(() => ({
  mockReconcileTaskCredits: vi.fn().mockResolvedValue({ adjusted: true, difference: -5, action: "refund" }),
  mockMarkPortraitCandidateSubmissionFailed: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../routers/media", () => ({
  reconcileTaskCredits: mockReconcileTaskCredits,
}));
vi.mock("../verticalDramaCharacterStock", () => ({
  verticalDramaCharacterStockService: {
    markPortraitCandidateSubmissionFailed: mockMarkPortraitCandidateSubmissionFailed,
  },
}));

function makeSelectChain(result: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn().mockReturnValue(chain);
  chain.innerJoin = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockReturnValue(chain);
  chain.orderBy = vi.fn().mockReturnValue(chain);
  chain.limit = vi.fn().mockResolvedValue(result);
  // Some call sites `await` the chain directly without `.limit(...)`.
  (chain as any).then = (resolve: (value: unknown[]) => void) => resolve(result);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn().mockReturnValue(chain);
  chain.where = vi.fn().mockResolvedValue(undefined);
  return chain;
}

function makeInsertChain() {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn().mockReturnValue(chain);
  chain.onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
  return chain;
}

const baseTask: MediaTask = {
  id: "mcp_test_task",
  taskId: "provider-job-1",
  userId: "1",
  mediaType: "video",
  status: "processing",
  model: "higgsfield/grok_video",
  prompt: "test prompt",
  parameters: {
    transportMetadata: {
      tenantId: "tenant-test",
      actorUserId: 1,
      ownerUserId: 1,
      providerKey: "higgsfield",
      connectionId: "conn-1",
      providerJobId: "provider-job-1",
      assetType: "video",
    },
  },
  resultData: {},
  creditsUsed: 0,
  createdAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
};

describe("mcpMediaAdapter — stale reconciler + hard timeout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordMcpUsageEventMock.mockResolvedValue(undefined);
    dbMock.select.mockImplementation(() => makeSelectChain([connectionRow]));
    dbMock.update.mockImplementation(() => makeUpdateChain());
    dbMock.insert.mockImplementation(() => makeInsertChain());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses a shorter hard timeout for image/audio tasks while preserving the video window", async () => {
    const { getMcpTaskHardTimeoutMsForTest } = await import("../mcpMediaAdapter");

    expect(getMcpTaskHardTimeoutMsForTest("image")).toBe(2 * 60 * 60_000);
    expect(getMcpTaskHardTimeoutMsForTest("audio")).toBe(2 * 60 * 60_000);
    expect(getMcpTaskHardTimeoutMsForTest("video")).toBe(24 * 60 * 60_000);
  });

  it("hard-times-out an abandoned image task after the image-specific window", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { refreshMcpMediaTaskStatus } = await import("../mcpMediaAdapter");
    const result = await refreshMcpMediaTaskStatus({
      ...baseTask,
      mediaType: "image",
      createdAt: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("หมดเวลารอผลจากผู้ให้บริการ");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("marks a task failed when the provider positively rejects every status-check argument shape (job not found)", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "1",
        result: {
          isError: true,
          content: [{ type: "text", text: "Something went wrong. Please try again." }],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshMcpMediaTaskStatus } = await import("../mcpMediaAdapter");
    const result = await refreshMcpMediaTaskStatus({ ...baseTask });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("ไม่พบงานนี้ฝั่งผู้ให้บริการ — กรุณาสั่งสร้างใหม่");
    expect(recordMcpUsageEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "generation_failed", status: "failed" }),
    );
  });

  it("leaves the task processing (does not mark failed) when the provider is merely unreachable (network/HTTP failure)", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => new Response("Internal Server Error", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { refreshMcpMediaTaskStatus } = await import("../mcpMediaAdapter");
    const result = await refreshMcpMediaTaskStatus({ ...baseTask });

    expect(result.status).toBe("processing");
    expect(recordMcpUsageEventMock).not.toHaveBeenCalled();
  });

  it("marks a task failed via hard timeout once it has been processing far longer than the max age, even without calling the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { refreshMcpMediaTaskStatus } = await import("../mcpMediaAdapter");
    const oldTask: MediaTask = {
      ...baseTask,
      createdAt: new Date(Date.now() - 30 * 60 * 60_000).toISOString(), // 30h ago
    };
    const result = await refreshMcpMediaTaskStatus(oldTask);

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toBe("หมดเวลารอผลจากผู้ให้บริการ");
    // Hard timeout short-circuits before any provider call is attempted.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reconcileStaleMcpMediaTasks scans stale rows and tolerates a per-task failure without aborting the sweep", async () => {
    const staleRowOk = {
      id: "mcp_stale_ok",
      tenantId: "tenant-test",
      userId: 1,
      connectionId: "conn-1",
      shareId: null,
      providerTaskId: "provider-job-ok",
      idempotencyKey: null,
      mediaType: "video",
      status: "processing",
      model: "higgsfield/grok_video",
      prompt: "p",
      parameters: {
        transportMetadata: {
          tenantId: "tenant-test",
          actorUserId: 1,
          ownerUserId: 1,
          providerKey: "higgsfield",
          connectionId: "conn-1",
          providerJobId: "provider-job-ok",
          assetType: "video",
        },
      },
      resultData: {},
      errorMessage: null,
      createdAt: new Date(Date.now() - 60 * 60_000),
      startedAt: new Date(Date.now() - 60 * 60_000),
      completedAt: null,
      updatedAt: new Date(Date.now() - 20 * 60_000),
    };
    const staleRowBroken = {
      ...staleRowOk,
      id: "mcp_stale_broken",
      providerTaskId: "provider-job-broken",
      parameters: {
        transportMetadata: {
          ...staleRowOk.parameters.transportMetadata,
          providerJobId: "provider-job-broken",
          connectionId: "missing-connection",
        },
      },
    };

    let selectCallCount = 0;
    dbMock.select.mockImplementation(() => {
      selectCallCount += 1;
      // First call: the reconciler's own stale-task scan.
      if (selectCallCount === 1) return makeSelectChain([staleRowOk, staleRowBroken]);
      // Subsequent calls: getMcpConnectionRuntime lookups per task.
      // "missing-connection" resolves to no row -> getMcpConnectionRuntime throws.
      return makeSelectChain(selectCallCount === 2 ? [connectionRow] : []);
    });

    const fetchMock = vi.fn().mockImplementation(async () => new Response(
      JSON.stringify({ jsonrpc: "2.0", id: "1", result: { status: "processing" } }),
      { status: 200, headers: { "content-type": "application/json" } },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const { reconcileStaleMcpMediaTasks } = await import("../mcpMediaAdapter");
    const summary = await reconcileStaleMcpMediaTasks();

    expect(summary.scanned).toBe(2);
    // Neither task changed status here (one stayed processing via provider
    // response, the other's connection lookup failed and is left processing
    // — the sweep must not throw for either case).
    expect(summary.changed).toBe(0);
  });
});

/**
 * VD portrait-candidate cascade (2026-07-16 Set A gap 5/6 fix): a stale
 * `mcp_media_tasks` row tagged with `__vd_portrait_candidate_asset_link_id`
 * (`generatePortraitCandidateBatch`'s marker, see
 * `readVdPortraitCandidateTaskMarker` in `../mcpMediaAdapter`) that the sweep
 * force-fails must also refund reserved credits and durably fail the VD
 * asset row — without depending on a browser tab ever polling again.
 */
describe("reconcileStaleMcpMediaTasks — VD portrait-candidate cascade (2026-07-16)", () => {
  const vdStaleRow = {
    id: "mcp_vd_candidate",
    tenantId: "tenant-test",
    userId: 1,
    connectionId: "conn-1",
    shareId: null,
    providerTaskId: "provider-job-vd",
    idempotencyKey: null,
    mediaType: "image",
    status: "processing",
    model: "higgsfield/text2image",
    prompt: "portrait prompt",
    parameters: {
      transportMetadata: {
        tenantId: "tenant-test",
        actorUserId: 1,
        ownerUserId: 1,
        providerKey: "higgsfield",
        connectionId: "conn-1",
        providerJobId: "provider-job-vd",
        assetType: "image",
      },
      extraParams: {
        __origin_surface: "vertical_drama_character_portrait_candidates",
        __reserved_credits: 5,
        __vd_series_id: "10",
        __vd_character_id: "3",
        __vd_portrait_candidate_batch_id: "batch-1",
        __vd_portrait_candidate_id: "candidate-1",
        __vd_portrait_candidate_asset_link_id: "71",
      },
    },
    resultData: {},
    errorMessage: null,
    // Hard-timeout branch (30h > default 24h ceiling) — deterministic
    // "failed" outcome with no provider network call, same pattern as the
    // hard-timeout test above.
    createdAt: new Date(Date.now() - 30 * 60 * 60_000),
    startedAt: new Date(Date.now() - 30 * 60 * 60_000),
    completedAt: null,
    updatedAt: new Date(Date.now() - 30 * 60 * 60_000),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    recordMcpUsageEventMock.mockResolvedValue(undefined);
    mockReconcileTaskCredits.mockResolvedValue({ adjusted: true, difference: -5, action: "refund" });
    mockMarkPortraitCandidateSubmissionFailed.mockResolvedValue(undefined);
    dbMock.update.mockImplementation(() => makeUpdateChain());
    dbMock.insert.mockImplementation(() => makeInsertChain());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("force-fails a VD-tagged stale task and cascades: refunds reserved credits AND marks the candidate row failed", async () => {
    dbMock.select.mockImplementation(() => makeSelectChain([vdStaleRow]));
    vi.stubGlobal("fetch", vi.fn());

    const { reconcileStaleMcpMediaTasks } = await import("../mcpMediaAdapter");
    const summary = await reconcileStaleMcpMediaTasks();

    expect(summary.scanned).toBe(1);
    expect(summary.changed).toBe(1);
    expect(mockReconcileTaskCredits).toHaveBeenCalledTimes(1);
    expect(mockReconcileTaskCredits).toHaveBeenCalledWith({
      task: expect.objectContaining({ id: "mcp_vd_candidate", status: "failed", userId: "1" }),
      userId: 1,
    });
    expect(mockMarkPortraitCandidateSubmissionFailed).toHaveBeenCalledTimes(1);
    expect(mockMarkPortraitCandidateSubmissionFailed).toHaveBeenCalledWith({
      tenantId: "tenant-test",
      userId: 1,
      seriesId: 10,
      assetLinkId: 71,
      errorMessage: "หมดเวลารอผลจากผู้ให้บริการ",
    });
  });

  it("does not cascade for a non-VD stale task even when force-failed (generic reconcile behavior unchanged)", async () => {
    const nonVdStaleRow = {
      ...vdStaleRow,
      id: "mcp_non_vd",
      parameters: {
        transportMetadata: vdStaleRow.parameters.transportMetadata,
        // No `__vd_portrait_candidate_asset_link_id` marker.
        extraParams: { __origin_surface: "media_studio" },
      },
    };
    dbMock.select.mockImplementation(() => makeSelectChain([nonVdStaleRow]));
    vi.stubGlobal("fetch", vi.fn());

    const { reconcileStaleMcpMediaTasks } = await import("../mcpMediaAdapter");
    const summary = await reconcileStaleMcpMediaTasks();

    expect(summary.changed).toBe(1);
    expect(mockReconcileTaskCredits).not.toHaveBeenCalled();
    expect(mockMarkPortraitCandidateSubmissionFailed).not.toHaveBeenCalled();
  });

  it("tolerates a credit-reconcile failure and still attempts to mark the candidate row failed (per-call error isolation)", async () => {
    dbMock.select.mockImplementation(() => makeSelectChain([vdStaleRow]));
    vi.stubGlobal("fetch", vi.fn());
    mockReconcileTaskCredits.mockRejectedValueOnce(new Error("redis unreachable"));

    const { reconcileStaleMcpMediaTasks } = await import("../mcpMediaAdapter");
    const summary = await reconcileStaleMcpMediaTasks();

    expect(summary.changed).toBe(1);
    expect(mockMarkPortraitCandidateSubmissionFailed).toHaveBeenCalledTimes(1);
  });

  it("skips the cascade (but still force-fails the mcp_media_tasks row) when tenant/series markers are incomplete", async () => {
    const incompleteRow = {
      ...vdStaleRow,
      id: "mcp_vd_incomplete",
      parameters: {
        transportMetadata: { ...vdStaleRow.parameters.transportMetadata, tenantId: undefined },
        extraParams: vdStaleRow.parameters.extraParams,
      },
    };
    dbMock.select.mockImplementation(() => makeSelectChain([incompleteRow]));
    vi.stubGlobal("fetch", vi.fn());

    const { reconcileStaleMcpMediaTasks } = await import("../mcpMediaAdapter");
    const summary = await reconcileStaleMcpMediaTasks();

    expect(summary.changed).toBe(1);
    expect(mockReconcileTaskCredits).not.toHaveBeenCalled();
    expect(mockMarkPortraitCandidateSubmissionFailed).not.toHaveBeenCalled();
  });
});
