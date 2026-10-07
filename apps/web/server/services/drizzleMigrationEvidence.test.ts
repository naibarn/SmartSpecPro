import { describe, expect, it, vi } from "vitest";

import { getDrizzleMigrationEvidence, projectDrizzleMigrationEvidence, reconcileMigrationExecutionReceipts } from "./drizzleMigrationEvidence";
import { evaluateMigrationAttempt } from "./migrationExecutionReceiptPolicy";

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

  it("reconciles successful receipts with applied DB state and detects receipt/DB mismatch", () => {
    const current = projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public",
      expected: [{ tag: "0001_first", hash: "a" }], applied: [{ hash: "a", created_at: 10 }] });
    const start = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey: "key-1", executionId: "run-1",
      phase: "STARTED", startedAt: "2026-10-07T12:00:00.000Z", expectedMigrationHead: "0001_first", sourceSha: "sha" };
    const settled = { ...start, phase: "SETTLED", result: "SUCCEEDED", completedAt: "2026-10-07T12:01:00.000Z",
      appliedHead: "0001_first", appliedHash: "a" };
    expect(reconcileMigrationExecutionReceipts({ current, receipts: [start, settled] }).value).toMatchObject({
      currentState: "APPLIED", failureHistory: "TRACKED", executionReconciliation: { state: "CONSISTENT", receiptState: "SUCCEEDED", idempotencyKey: "key-1" },
    });
    expect(reconcileMigrationExecutionReceipts({ current, receipts: [start, { ...settled, appliedHash: "different" }] }).value?.executionReconciliation.state).toBe("RECEIPT_DB_MISMATCH");
  });

  it("classifies fresh and stale nonterminal receipts", () => {
    const current = projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public",
      expected: [{ tag: "0001_first", hash: "a" }], applied: [] });
    const receipt = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey: "key-2", executionId: "run-2",
      phase: "STARTED", startedAt: "2026-10-07T12:00:00.000Z", expectedMigrationHead: "0001_first", sourceSha: "sha" };
    expect(reconcileMigrationExecutionReceipts({ current, receipts: [receipt], now: new Date("2026-10-07T12:01:00Z") }).value)
      .toMatchObject({ currentState: "IN_PROGRESS", executionReconciliation: { state: "PENDING", receiptState: "IN_PROGRESS" } });
    expect(reconcileMigrationExecutionReceipts({ current, receipts: [receipt], now: new Date("2026-10-07T13:00:00Z") }).value)
      .toMatchObject({ currentState: "INTERRUPTED", executionReconciliation: { state: "INTERRUPTED_STALE", receiptState: "INTERRUPTED" } });
  });

  it("reconciles the latest retry attempt instead of an earlier failure", () => {
    const current = projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public",
      expected: [{ tag: "0001_first", hash: "a" }], applied: [{ hash: "a", created_at: 10 }] });
    const first = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey: "key-retry", executionId: "run-1",
      attemptNumber: 1, phase: "STARTED", startedAt: "2026-10-07T12:00:00.000Z", expectedMigrationHead: "0001_first", sourceSha: "sha", beforeAppliedHead: null };
    const failed = { ...first, phase: "SETTLED", result: "FAILED", completedAt: "2026-10-07T12:01:00.000Z", failureCategory: "EXECUTION_FAILED" };
    const retry = { ...first, executionId: "run-2", attemptNumber: 2, startedAt: "2026-10-07T12:02:00.000Z" };
    const recovered = { ...retry, phase: "SETTLED", result: "RECOVERED", completedAt: "2026-10-07T12:03:00.000Z", appliedHead: "0001_first", appliedHash: "a" };
    expect(reconcileMigrationExecutionReceipts({ current, receipts: [first, failed, retry, recovered] }).value)
      .toMatchObject({ executionReconciliation: { state: "CONSISTENT", receiptState: "RECOVERED", idempotencyKey: "key-retry" } });
  });

  it("distinguishes failed without DB change from partial application", () => {
    const expected = [{ tag: "0001_first", hash: "a" }, { tag: "0002_second", hash: "b" }];
    const receipt = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey: "key-3", executionId: "run-3",
      phase: "STARTED", startedAt: "2026-10-07T12:00:00Z", expectedMigrationHead: "0002_second", beforeAppliedHead: null, sourceSha: "sha" };
    const settled = { ...receipt, phase: "SETTLED", result: "FAILED", completedAt: "2026-10-07T12:01:00Z", failureCategory: "EXECUTION_FAILED" };
    const unchanged = projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public", expected, applied: [] });
    expect(reconcileMigrationExecutionReceipts({ current: unchanged, receipts: [receipt, settled] }).value)
      .toMatchObject({ currentState: "FAILED", executionReconciliation: { state: "FAILED_NO_CHANGE", receiptState: "FAILED" } });
    const partial = projectDrizzleMigrationEvidence({ environment: "test", databaseIdentity: "db/public", expected, applied: [{ hash: "a", created_at: 1 }] });
    expect(reconcileMigrationExecutionReceipts({ current: partial, receipts: [receipt, settled] }).value)
      .toMatchObject({ currentState: "PARTIALLY_APPLIED", executionReconciliation: { state: "PARTIAL_APPLICATION" } });
  });

  it("makes retries idempotent and rejects a conflicting payload", () => {
    const payload = { environment: "production", databaseTargetId: "db:1", sourceSha: "sha", expectedMigrationHead: "0001", requestedMigrationSet: ["0001"] };
    const start = { ...payload, idempotencyKey: "request-1", phase: "STARTED", startedAt: "2026-10-07T12:00:00.000Z" };
    expect(evaluateMigrationAttempt({ receipts: [], payload })).toBe("START");
    expect(evaluateMigrationAttempt({ receipts: [start], payload, now: new Date("2026-10-07T12:01:00Z") })).toBe("IN_PROGRESS");
    expect(evaluateMigrationAttempt({ receipts: [start], payload, now: new Date("2026-10-07T13:00:00Z") })).toBe("RESUME_STALE");
    expect(evaluateMigrationAttempt({ receipts: [start, { ...start, phase: "SETTLED", result: "SUCCEEDED", completedAt: "2026-10-07T12:00:10.000Z" }], payload })).toBe("ALREADY_SUCCEEDED");
    expect(evaluateMigrationAttempt({ receipts: [start], payload: { ...payload, sourceSha: "other" } })).toBe("IDEMPOTENCY_CONFLICT");
    expect(evaluateMigrationAttempt({ receipts: [start, { ...start, phase: "SETTLED", result: "FAILED", completedAt: "2026-10-07T12:00:10.000Z" }], payload })).toBe("RETRY_FAILED");
    const failed = { ...start, phase: "SETTLED", result: "FAILED", completedAt: "2026-10-07T12:02:00.000Z" };
    const retry = { ...start, startedAt: "2026-10-07T12:03:00.000Z" };
    expect(evaluateMigrationAttempt({ receipts: [start, failed, retry], payload, now: new Date("2026-10-07T12:03:30.000Z") })).toBe("IN_PROGRESS");
    expect(evaluateMigrationAttempt({ receipts: [start, failed], payload })).toBe("RETRY_FAILED");
  });
});
