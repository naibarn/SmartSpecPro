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
