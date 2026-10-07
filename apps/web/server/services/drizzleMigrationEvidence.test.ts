import { describe, expect, it, vi } from "vitest";

import { getDrizzleMigrationEvidence, projectDrizzleMigrationEvidence } from "./drizzleMigrationEvidence";

describe("Drizzle migration evidence", () => {
  it("projects expected/applied heads, pending files, and latest successful execution", () => {
    const result = projectDrizzleMigrationEvidence({
      environment: "test",
      databaseIdentity: "smartaihub_test/public",
      expected: [{ tag: "0001_first", hash: "a" }, { tag: "0002_second", hash: "b" }],
      applied: [{ hash: "a", created_at: 100 }],
      observedAt: new Date("2026-10-07T12:00:00.000Z"),
    });
    expect(result).toMatchObject({ status: "OBSERVED", source: "drizzle.__drizzle_migrations", value: {
      databaseIdentity: "smartaihub_test/public",
      expectedMigrationHead: { tag: "0002_second", hash: "b" },
      observedAppliedHead: { tag: "0001_first", hash: "a", appliedAt: 100 },
      pendingMigrations: [{ tag: "0002_second", hash: "b" }],
      currentState: "PARTIALLY_APPLIED",
      failureHistory: "FAILURE_HISTORY_UNAVAILABLE",
      failedMigration: {
        state: "UNKNOWN",
        source: "drizzle.__drizzle_migrations",
        migration: null,
        observedAt: null,
        reason: "failed_attempts_not_recorded_by_source",
      },
      failureTracking: "NOT_TRACKED",
      latestExecution: { tag: "0001_first", hash: "a", result: "APPLIED", executedAt: 100 },
    } });
  });

  it("distinguishes applied, pending, partial, and unknown migration current state", () => {
    const expected = [{ tag: "0001_first", hash: "a" }, { tag: "0002_second", hash: "b" }];
    const project = (applied: Array<{ hash: string; created_at: number | null }>) => projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public", expected, applied }).value;
    expect(project([{ hash: "a", created_at: 1 }, { hash: "b", created_at: 2 }])?.currentState).toBe("APPLIED");
    expect(project([])?.currentState).toBe("PENDING");
    expect(project([{ hash: "a", created_at: 1 }])?.currentState).toBe("PARTIALLY_APPLIED");
    expect(project([{ hash: "legacy-unknown", created_at: 1 }])?.currentState).toBe("UNKNOWN");
    expect(project([])?.failureHistory).toBe("FAILURE_HISTORY_UNAVAILABLE");
  });

  it("reports an unconfigured database without reading credentials", async () => {
    const getDb = vi.fn(() => { throw new Error("must not access database"); });
    vi.doMock("../db", () => ({ getDb }));
    const previous = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      await expect(getDrizzleMigrationEvidence()).resolves.toMatchObject({ status: "NOT_CONFIGURED", value: null });
      expect(getDb).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previous;
    }
  });

  it("does not leak provider connection errors and distinguishes permission denial", async () => {
    const denied = Object.assign(new Error("secret connection string"), { code: "42501" });
    await expect(getDrizzleMigrationEvidence({ db: { execute: vi.fn().mockRejectedValue(denied) } as never }))
      .resolves.toMatchObject({ status: "PERMISSION_DENIED", reason: "42501", value: null });
  });
});
