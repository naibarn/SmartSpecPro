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
      observedAppliedHead: { hash: "a", appliedAt: 100 },
      pendingMigrations: [{ tag: "0002_second", hash: "b" }],
      failedMigration: {
        state: "UNKNOWN",
        source: "drizzle.__drizzle_migrations",
        migration: null,
        observedAt: null,
        reason: "failed_attempts_not_recorded_by_source",
      },
      failureTracking: "NOT_TRACKED",
      latestExecution: { hash: "a", result: "APPLIED", executedAt: 100 },
    } });
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
