import { describe, expect, it, vi } from "vitest";

import { mediaCallbackDlq, mediaCallbackEvents } from "../../drizzle/schema";
import {
  buildProviderTaskTenantResolution,
  runCallbackTenantAttributionBackfill,
} from "./libraryOpsTenantAttributionService";

function createMockDb(selectRowsQueue: Array<any[]>, executeRowsQueue: Array<any[]>) {
  const select = vi.fn().mockImplementation(() => {
    const rows = selectRowsQueue.shift() ?? [];
    const query: any = {};
    query.innerJoin = vi.fn().mockReturnValue(query);
    query.where = vi.fn().mockReturnValue(query);
    query.orderBy = vi.fn().mockReturnValue(query);
    query.limit = vi.fn().mockResolvedValue(rows);
    query.then = (resolve: (rows: any[]) => unknown) => Promise.resolve(rows).then(resolve);

    return {
      from: vi.fn().mockReturnValue(query),
    };
  });

  const execute = vi.fn().mockImplementation(() => {
    const rows = executeRowsQueue.shift() ?? [];
    return Promise.resolve({ rows });
  });

  return {
    db: {
      select,
      execute,
    },
    select,
    execute,
  };
}

describe("library callback tenant attribution schema", () => {
  it("exposes tenant id columns in callback tables", () => {
    expect(mediaCallbackEvents.tenantId).toBeDefined();
    expect(mediaCallbackDlq.tenantId).toBeDefined();
  });
});

describe("buildProviderTaskTenantResolution", () => {
  it("resolves deterministic provider-task tenant mapping and marks ambiguous tasks", () => {
    const result = buildProviderTaskTenantResolution([
      { providerTaskId: "task-1", tenantId: "tenant-a" },
      { providerTaskId: "task-1", tenantId: "tenant-a" },
      { providerTaskId: "task-2", tenantId: "tenant-a" },
      { providerTaskId: "task-2", tenantId: "tenant-b" },
      { providerTaskId: null, tenantId: "tenant-z" },
      { providerTaskId: "task-3", tenantId: null },
    ]);

    expect(result.resolved).toEqual({
      "task-1": "tenant-a",
    });
    expect(result.ambiguousProviderTaskIds).toEqual(["task-2"]);
  });
});

describe("runCallbackTenantAttributionBackfill", () => {
  it("returns dry-run report with candidate and unresolved counts", async () => {
    const { db, execute } = createMockDb(
      [
        [{ count: 3 }],
        [{ count: 2 }],
        [
          { providerTaskId: "task-1", tenantId: "tenant-a" },
          { providerTaskId: "task-2", tenantId: "tenant-a" },
          { providerTaskId: "task-2", tenantId: "tenant-b" },
        ],
        [{ id: 101, providerTaskId: "task-x" }],
        [{ id: 201, providerTaskId: null }],
      ],
      [
        [{ count: 2 }],
        [{ count: 1 }],
        [{ count: 4 }],
      ],
    );

    const report = await runCallbackTenantAttributionBackfill(db as any, {
      dryRun: true,
      sampleLimit: 10,
    });

    expect(report.dryRun).toBe(true);
    expect(report.events).toEqual({
      missingBefore: 3,
      missingAfter: 3,
      backfilled: 0,
      candidateFromLibraryLinks: 2,
    });
    expect(report.dlq).toEqual({
      missingBefore: 2,
      missingAfter: 2,
      backfilled: 0,
      candidateFromEventLink: 1,
      candidateFromLibraryLinks: 4,
    });
    expect(report.ambiguousProviderTaskIds).toEqual(["task-2"]);
    expect(report.unresolvedSamples.events).toHaveLength(1);
    expect(report.unresolvedSamples.dlq).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(3);
  });

  it("applies backfill updates in non-dry-run mode and reports final missing counts", async () => {
    const { db, execute } = createMockDb(
      [
        [{ count: 4 }],
        [{ count: 3 }],
        [{ providerTaskId: "task-1", tenantId: "tenant-a" }],
        [{ count: 1 }],
        [{ count: 1 }],
        [],
        [],
      ],
      [
        [{ count: 3 }],
        [{ count: 2 }],
        [{ count: 2 }],
        [{ id: 1 }, { id: 2 }, { id: 3 }],
        [{ id: 11 }],
        [{ id: 12 }, { id: 13 }],
      ],
    );

    const report = await runCallbackTenantAttributionBackfill(db as any, {
      dryRun: false,
    });

    expect(report.dryRun).toBe(false);
    expect(report.events.backfilled).toBe(3);
    expect(report.dlq.backfilled).toBe(3);
    expect(report.events.missingAfter).toBe(1);
    expect(report.dlq.missingAfter).toBe(1);
    expect(execute).toHaveBeenCalledTimes(6);
  });
});
