import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetDb = vi.hoisted(() => vi.fn());

vi.mock("../../db", () => ({
  getDb: mockGetDb,
}));

import {
  getAutoTeamRetentionSummary,
  runAutoTeamRetentionCleanup,
} from "../autoTeamRetentionService";

function setRetentionFlag(enabled: boolean) {
  process.env.AUTO_TEAM_RETENTION_CLEANUP = enabled ? "true" : "false";
}

function makeFakeDb() {
  const selectRows = [
    [{ id: "room-1" }],
    [{ id: "run-old-1" }],
    [{ id: "rd-1" }],
    [{ id: "st-1" }],
    [{ id: "mj-1" }],
    [{ id: "rv-1" }],
    [{ id: "fr-1" }],
    [{ id: "te-1" }],
    [{ id: "ar-1" }],
  ];
  const deleteRows = [
    [{ id: "ar-1" }],
    [{ id: "te-1" }],
    [{ id: "mj-1" }],
    [{ id: "rv-1" }],
    [{ id: "fr-1" }],
    [{ id: "st-1" }],
    [{ id: "rd-1" }],
  ];
  let selectIndex = 0;
  let deleteIndex = 0;

  const db: any = {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const rows = selectRows[selectIndex++] ?? [];
          if (selectIndex === 2) {
            return {
              orderBy: vi.fn(() => Promise.resolve(rows)),
            };
          }
          return Promise.resolve(rows);
        }),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => Promise.resolve([{ id: "ar-1" }])),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(() => ({
        returning: vi.fn(() => Promise.resolve(deleteRows[deleteIndex++] ?? [])),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: any) => Promise<unknown>) => fn(db)),
  };

  return db;
}

beforeEach(() => {
  vi.clearAllMocks();
  setRetentionFlag(true);
});

describe("autoTeamRetentionService", () => {
  it("summarizes eligible expired rows for cleanup", async () => {
    const db = makeFakeDb();
    mockGetDb.mockResolvedValue(db);

    const summary = await getAutoTeamRetentionSummary({
      tenantId: "tenant-1",
      retentionDays: 7,
    });

    expect(summary.featureEnabled).toBe(true);
    expect(summary.eligibleRunCount).toBe(1);
    expect(summary.expiredCounts).toEqual({
      routeDecisions: 1,
      executionStages: 1,
      mediaJobs: 1,
      reviewRecords: 1,
      finalResults: 1,
      traceEvents: 1,
      artifactRefs: 1,
    });
  });

  it("performs idempotent cleanup inside a transaction when enabled", async () => {
    const db = makeFakeDb();
    mockGetDb.mockResolvedValue(db);

    const cleanup = await runAutoTeamRetentionCleanup({
      tenantId: "tenant-1",
      retentionDays: 7,
      dryRun: false,
    });

    expect(cleanup.dryRun).toBe(false);
    expect(cleanup.deletedCounts).toEqual({
      routeDecisions: 1,
      executionStages: 1,
      mediaJobs: 1,
      reviewRecords: 1,
      finalResults: 1,
      traceEvents: 1,
      artifactRefs: 1,
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.update).toHaveBeenCalledTimes(2);
  });

  it("returns dry-run visibility and skips deletes when the feature is off", async () => {
    setRetentionFlag(false);
    const db = makeFakeDb();
    mockGetDb.mockResolvedValue(db);

    const cleanup = await runAutoTeamRetentionCleanup({
      tenantId: "tenant-1",
      retentionDays: 7,
      dryRun: false,
    });

    expect(cleanup.dryRun).toBe(true);
    expect(cleanup.deletedCounts).toEqual({
      routeDecisions: 0,
      executionStages: 0,
      mediaJobs: 0,
      reviewRecords: 0,
      finalResults: 0,
      traceEvents: 0,
      artifactRefs: 0,
    });
    expect(db.delete).not.toHaveBeenCalled();
  });
});
