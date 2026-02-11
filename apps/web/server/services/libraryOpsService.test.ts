import { describe, expect, it, vi } from "vitest";

import {
  getLibraryOpsSummary,
  reprocessCallbackDlqEntry,
  retryFailedLibraryIndexJobs,
  type LibraryOpsRepository,
} from "./libraryOpsService";

function createInMemoryRepo(): LibraryOpsRepository {
  const dlq = new Map<number, {
    id: number;
    eventId: number | null;
    status: "pending" | "reprocessed" | "discarded";
    resolvedAt: Date | null;
  }>();
  const eventStatus = new Map<number, { status: string; nextRetryAt: Date | null }>();

  dlq.set(1, { id: 1, eventId: 100, status: "pending", resolvedAt: null });
  dlq.set(2, { id: 2, eventId: null, status: "pending", resolvedAt: null });
  eventStatus.set(100, { status: "failed", nextRetryAt: null });

  return {
    getDlqEntryById: async (id) => dlq.get(id) ?? null,
    markDlqEntryReprocessed: async (id, resolvedAt) => {
      const entry = dlq.get(id);
      if (!entry) return;
      entry.status = "reprocessed";
      entry.resolvedAt = resolvedAt;
    },
    moveEventToRetryPending: async (eventId, retryAt) => {
      const event = eventStatus.get(eventId);
      if (!event) return;
      event.status = "retry_pending";
      event.nextRetryAt = retryAt;
    },
  };
}

describe("reprocessCallbackDlqEntry", () => {
  it("moves pending DLQ entry back into retry pipeline", async () => {
    const repo = createInMemoryRepo();

    const result = await reprocessCallbackDlqEntry(repo, 1);

    expect(result.success).toBe(true);
    expect(result.status).toBe("reprocessed");
    expect(result.eventMovedToRetry).toBe(true);
  });

  it("returns not_found when entry does not exist", async () => {
    const repo = createInMemoryRepo();

    const result = await reprocessCallbackDlqEntry(repo, 999);

    expect(result.success).toBe(false);
    expect(result.status).toBe("not_found");
  });
});

function createMockDb(
  selectRowsQueue: Array<any[]>,
  updatedRows: Array<{ id: number }> = [],
) {
  const select = vi.fn().mockImplementation(() => {
    const rows = selectRowsQueue.shift() ?? [];
    const query: any = {};
    query.where = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    return {
      from: vi.fn().mockReturnValue(query),
    };
  });

  const returning = vi.fn().mockResolvedValue(updatedRows);
  const where = vi.fn().mockReturnValue({ returning });
  const set = vi.fn().mockReturnValue({ where });
  const update = vi.fn().mockReturnValue({ set });

  return {
    db: {
      select,
      update,
    },
    select,
    update,
    where,
    returning,
  };
}

describe("retryFailedLibraryIndexJobs", () => {
  it("retries only tenant-scoped failed jobs", async () => {
    const { db, update } = createMockDb(
      [[{ id: 1 }, { id: 3 }]],
      [{ id: 1 }],
    );

    const result = await retryFailedLibraryIndexJobs(db as any, {
      tenantId: "tenant-A",
      jobIds: [1, 2, 3],
      limit: 10,
    });

    expect(result).toEqual({
      retried: 1,
      jobIds: [1],
    });
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("returns zero when no retry-eligible jobs remain in tenant scope", async () => {
    const { db, update } = createMockDb([[]]);

    const result = await retryFailedLibraryIndexJobs(db as any, {
      tenantId: "tenant-A",
      jobIds: [101, 102],
      limit: 10,
    });

    expect(result).toEqual({
      retried: 0,
      jobIds: [],
    });
    expect(update).not.toHaveBeenCalled();
  });
});

describe("getLibraryOpsSummary", () => {
  it("returns tenant-scoped index metrics and hides global callback metrics by default", async () => {
    const { db, select } = createMockDb([
      [{ count: 4 }],
      [{ count: 2 }],
    ]);

    const result = await getLibraryOpsSummary(db as any, {
      tenantId: "tenant-A",
      includeGlobalCallbackMetrics: false,
    });

    expect(result).toEqual({
      callbackDlqPending: 0,
      callbackRetryPending: 0,
      indexRetryPending: 4,
      indexFailed: 2,
    });
    expect(select).toHaveBeenCalledTimes(2);
  });

  it("returns global callback metrics only when explicitly requested", async () => {
    const { db, select } = createMockDb([
      [{ count: 7 }],
      [{ count: 5 }],
      [{ count: 3 }],
      [{ count: 1 }],
    ]);

    const result = await getLibraryOpsSummary(db as any, {
      tenantId: null,
      includeGlobalCallbackMetrics: true,
    });

    expect(result).toEqual({
      callbackDlqPending: 7,
      callbackRetryPending: 5,
      indexRetryPending: 3,
      indexFailed: 1,
    });
    expect(select).toHaveBeenCalledTimes(4);
  });
});
