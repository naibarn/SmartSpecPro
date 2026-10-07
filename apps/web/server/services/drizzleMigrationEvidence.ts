import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

import { getDb, type DrizzleDB } from "../db";

export type MigrationEvidenceStatus = "OBSERVED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "PERMISSION_DENIED" | "ERROR";
export type MigrationExecutionState = "SUCCEEDED" | "FAILED" | "INTERRUPTED" | "IN_PROGRESS" | "RECOVERED" | "UNKNOWN";
export type MigrationReconciliationState = "CONSISTENT" | "PENDING" | "FAILED_NO_CHANGE" | "PARTIAL_APPLICATION" | "INTERRUPTED_STALE" | "RECEIPT_DB_MISMATCH" | "FAILURE_HISTORY_UNAVAILABLE";
export type MigrationFailureEvidence =
  | {
      state: "FAILED";
      source: string;
      migration: { tag: string; hash: string };
      observedAt: string;
      reason?: string;
    }
  | { state: "NONE"; source: string; migration: null; observedAt: string }
  | { state: "UNKNOWN"; source: string; migration: null; observedAt: null; reason: string };
export type MigrationEvidence = {
  status: MigrationEvidenceStatus;
  source: string;
  observedAt: string;
  value: {
    environment: string;
    databaseIdentity: string;
    expectedMigrationHead: { tag: string; hash: string } | null;
    observedAppliedHead: { tag: string | null; hash: string; appliedAt: number | null } | null;
    pendingMigrations: Array<{ tag: string; hash: string }>;
      currentState: "APPLIED" | "PENDING" | "PARTIALLY_APPLIED" | "FAILED" | "IN_PROGRESS" | "INTERRUPTED" | "UNKNOWN";
      failureHistory: "TRACKED" | "FAILURE_HISTORY_UNAVAILABLE";
    failedMigration: MigrationFailureEvidence;
    failureTracking: "TRACKED" | "NOT_TRACKED";
      latestExecution: { tag: string | null; hash: string; result: "APPLIED" | "FAILED" | "UNKNOWN"; executedAt: number | null } | null;
      executionReconciliation: { state: MigrationReconciliationState; receiptState: MigrationExecutionState | "NONE"; idempotencyKey: string | null; executionId: string | null; sourceSha: string | null; startedAt: string | null; completedAt: string | null; failureCategory: string | null };
  } | null;
  reason?: string;
};

type MigrationJournal = { entries?: Array<{ tag?: unknown }> };
type AppliedMigration = { hash: string; created_at: number | string | null };
export type MigrationExecutionReceipt = Record<string, unknown>;
type DbExecutor = Pick<DrizzleDB, "execute">;

/** Provider-neutral normalized migration source consumed by internal runtime evidence. */
export type MigrationEvidenceSource = {
  observe(input?: { db?: DbExecutor; now?: Date }): Promise<MigrationEvidence>;
};

const MIGRATION_DIRECTORY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");

function dbFailureStatus(error: unknown): MigrationEvidenceStatus {
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
  if (["42501", "28P01", "28000"].includes(code)) return "PERMISSION_DENIED";
  if (["ECONNREFUSED", "ETIMEDOUT", "08000", "08003", "08006"].includes(code)) return "UNAVAILABLE";
  return "ERROR";
}

export function projectDrizzleMigrationEvidence(input: {
  environment: string;
  databaseIdentity: string;
  expected: Array<{ tag: string; hash: string }>;
  applied: AppliedMigration[];
  observedAt?: Date;
}): MigrationEvidence {
  const applied = [...input.applied].sort((a, b) => Number(a.created_at ?? 0) - Number(b.created_at ?? 0));
  const appliedHashes = new Set(applied.map(row => row.hash));
  const latest = applied.at(-1) ?? null;
  const migrationTagByHash = new Map(input.expected.map(migration => [migration.hash, migration.tag]));
  const latestTag = latest ? migrationTagByHash.get(latest.hash) ?? null : null;
  const expectedHead = input.expected.at(-1) ?? null;
  const knownApplied = applied.filter(row => migrationTagByHash.has(row.hash));
  const unknownApplied = applied.some(row => !migrationTagByHash.has(row.hash));
  const pendingMigrations = input.expected.filter(migration => !appliedHashes.has(migration.hash));
  const currentState = unknownApplied ? "UNKNOWN" : pendingMigrations.length === 0 ? "APPLIED" : knownApplied.length === 0 ? "PENDING" : "PARTIALLY_APPLIED";
  return {
    status: "OBSERVED",
    source: "drizzle.__drizzle_migrations",
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    value: {
      environment: input.environment,
      databaseIdentity: input.databaseIdentity,
      expectedMigrationHead: expectedHead,
      observedAppliedHead: latest ? { tag: latestTag, hash: latest.hash, appliedAt: latest.created_at === null ? null : Number(latest.created_at) } : null,
      pendingMigrations,
      currentState,
      failureHistory: "FAILURE_HISTORY_UNAVAILABLE",
      failedMigration: {
        state: "UNKNOWN",
        source: "drizzle.__drizzle_migrations",
        migration: null,
        observedAt: null,
        reason: "failed_attempts_not_recorded_by_source",
      },
      failureTracking: "NOT_TRACKED",
      latestExecution: latest ? { tag: latestTag, hash: latest.hash, result: "APPLIED", executedAt: latest.created_at === null ? null : Number(latest.created_at) } : null,
      executionReconciliation: { state: "FAILURE_HISTORY_UNAVAILABLE", receiptState: "NONE", idempotencyKey: null,
        executionId: null, sourceSha: null, startedAt: null, completedAt: null, failureCategory: null },
    },
  };
}

function receiptString(receipt: MigrationExecutionReceipt, key: string): string | null {
  const value = receipt[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Combine authoritative Drizzle state with durable execution receipts without inventing legacy history. */
export function reconcileMigrationExecutionReceipts(input: {
  current: MigrationEvidence;
  receipts: MigrationExecutionReceipt[];
  now?: Date;
  staleAfterMs?: number;
}): MigrationEvidence {
  const value = input.current.value;
  if (!value || input.current.status !== "OBSERVED" || input.receipts.length === 0) return input.current;
  const receipts = input.receipts.filter(receipt => receipt.schemaVersion === "migration-execution-receipt.v1" &&
    receiptString(receipt, "idempotencyKey") && ["STARTED", "SETTLED"].includes(String(receipt.phase)));
  if (!receipts.length) return input.current;
  const sorted = [...receipts].sort((a, b) => Date.parse(receiptString(a, "startedAt") ?? "") - Date.parse(receiptString(b, "startedAt") ?? ""));
  const latest = sorted.at(-1)!;
  const key = receiptString(latest, "idempotencyKey");
  const attemptNumber = typeof latest.attemptNumber === "number" ? latest.attemptNumber : 0;
  const executionId = receiptString(latest, "executionId");
  const paired = sorted.filter(receipt => receiptString(receipt, "idempotencyKey") === key &&
    (typeof receipt.attemptNumber === "number" ? receipt.attemptNumber : 0) === attemptNumber);
  const settled = paired.find(receipt => receipt.phase === "SETTLED");
  const startedAt = receiptString(latest, "startedAt");
  const completedAt = settled ? receiptString(settled, "completedAt") : null;
  const actualHead = value.observedAppliedHead?.tag ?? null;
  const actualHash = value.observedAppliedHead?.hash ?? null;
  const expectedHead = value.expectedMigrationHead?.tag ?? null;
  const nowMs = (input.now ?? new Date()).getTime();
  const startMs = startedAt ? Date.parse(startedAt) : Number.NaN;
  const stale = Number.isFinite(startMs) && nowMs - startMs >= (input.staleAfterMs ?? 15 * 60_000);
  let receiptState: MigrationExecutionState;
  let reconciliationState: MigrationReconciliationState;
  let failureCategory: string | null = null;
  let currentState = value.currentState;
  if (!settled) {
    receiptState = stale ? "INTERRUPTED" : "IN_PROGRESS";
    reconciliationState = stale ? "INTERRUPTED_STALE" : "PENDING";
    currentState = stale ? "INTERRUPTED" : "IN_PROGRESS";
    if (stale) failureCategory = "STALE_NONTERMINAL_RECEIPT";
  } else {
    const result = receiptString(settled, "result");
    receiptState = result === "SUCCEEDED" || result === "APPLIED" ? "SUCCEEDED" : result === "RECOVERED" ? "RECOVERED" : result === "INTERRUPTED" ? "INTERRUPTED" : result === "FAILED" ? "FAILED" : "UNKNOWN";
    failureCategory = receiptString(settled, "failureCategory");
    const reportedAppliedHead = receiptString(settled, "appliedHead");
    const reportedAppliedHash = receiptString(settled, "appliedHash");
    if ((receiptState === "SUCCEEDED" || receiptState === "RECOVERED") && expectedHead && actualHead === expectedHead &&
        reportedAppliedHead === actualHead && reportedAppliedHash === actualHash) {
      reconciliationState = "CONSISTENT";
    } else if (receiptState === "SUCCEEDED" || receiptState === "RECOVERED") {
      reconciliationState = "RECEIPT_DB_MISMATCH";
      currentState = "UNKNOWN";
    } else if ((receiptState === "FAILED" || receiptState === "INTERRUPTED") && receiptString(settled, "beforeAppliedHead") === actualHead) {
      reconciliationState = "FAILED_NO_CHANGE";
      currentState = receiptState === "FAILED" ? "FAILED" : "INTERRUPTED";
    } else if ((receiptState === "FAILED" || receiptState === "INTERRUPTED") && value.currentState === "PARTIALLY_APPLIED") {
      reconciliationState = "PARTIAL_APPLICATION";
      currentState = "PARTIALLY_APPLIED";
    } else if (receiptState === "FAILED" || receiptState === "INTERRUPTED") {
      reconciliationState = "RECEIPT_DB_MISMATCH";
      currentState = "UNKNOWN";
    } else {
      reconciliationState = "RECEIPT_DB_MISMATCH";
      currentState = "UNKNOWN";
    }
  }
  return { ...input.current, value: { ...value, currentState, failureHistory: "TRACKED", failureTracking: "TRACKED",
    failedMigration: receiptState === "FAILED" || receiptState === "INTERRUPTED" ? {
      state: "FAILED", source: "api_audit_events.migration_execution_receipt",
      migration: { tag: value.expectedMigrationHead?.tag ?? "unknown", hash: value.expectedMigrationHead?.hash ?? "unknown" },
      observedAt: completedAt ?? startedAt, reason: failureCategory ?? receiptState,
    } : value.failedMigration,
    latestExecution: { tag: receiptString(settled ?? latest, "appliedHead") ?? receiptString(settled ?? latest, "expectedMigrationHead"), hash: receiptString(settled ?? latest, "appliedHash") ?? receiptString(settled ?? latest, "expectedMigrationHash") ?? "",
      result: receiptState === "SUCCEEDED" || receiptState === "RECOVERED" ? "APPLIED" : receiptState === "FAILED" || receiptState === "INTERRUPTED" ? "FAILED" : "UNKNOWN",
      executedAt: completedAt ? Date.parse(completedAt) : startedAt ? Date.parse(startedAt) : null },
    executionReconciliation: { state: reconciliationState, receiptState, idempotencyKey: key, executionId,
      sourceSha: receiptString(latest, "sourceSha"), startedAt, completedAt, failureCategory },
  } };
}

async function readExpectedMigrations(directory: string): Promise<Array<{ tag: string; hash: string }>> {
  const journal = JSON.parse(await readFile(path.join(directory, "meta", "_journal.json"), "utf8")) as MigrationJournal;
  if (!Array.isArray(journal.entries)) throw new Error("DRIZZLE_MIGRATION_JOURNAL_INVALID");
  const expected: Array<{ tag: string; hash: string }> = [];
  for (const entry of journal.entries) {
    if (typeof entry.tag !== "string" || !/^[A-Za-z0-9_-]{1,160}$/.test(entry.tag)) throw new Error("DRIZZLE_MIGRATION_TAG_INVALID");
    const content = await readFile(path.join(directory, `${entry.tag}.sql`));
    expected.push({ tag: entry.tag, hash: createHash("sha256").update(content).digest("hex") });
  }
  return expected;
}

/** Reads the application's configured PostgreSQL and Drizzle migration source without exposing DATABASE_URL. */
export async function getDrizzleMigrationEvidence(input: {
  db?: DbExecutor;
  migrationDirectory?: string;
  environment?: string;
  now?: Date;
} = {}): Promise<MigrationEvidence> {
  const observedAt = (input.now ?? new Date()).toISOString();
  if (!input.db && !process.env.DATABASE_URL?.trim())
    return { status: "NOT_CONFIGURED", source: "drizzle.__drizzle_migrations", observedAt, value: null, reason: "database_not_configured" };
  try {
    const db = input.db ?? getDb();
    const expected = await readExpectedMigrations(input.migrationDirectory ?? MIGRATION_DIRECTORY);
    const identityRows = await db.execute(sql<Array<{ database_name: string; schema_name: string }>>`SELECT current_database() AS database_name, current_schema() AS schema_name`);
    const databaseIdentity = `${identityRows[0]?.database_name ?? "unknown"}/${identityRows[0]?.schema_name ?? "unknown"}`;
    const appliedRows = (await db.execute(
      sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC`
    )) as unknown as AppliedMigration[];
    const current = projectDrizzleMigrationEvidence({
      environment: input.environment ?? process.env.NODE_ENV ?? "unknown",
      databaseIdentity,
      expected,
      applied: appliedRows,
      observedAt: input.now,
    });
    let receiptRows: Array<{ metadata: MigrationExecutionReceipt | null }> = [];
    try {
      receiptRows = (await db.execute(sql`SELECT "metadata" FROM "api_audit_events" WHERE "eventType" = 'migration_execution_receipt' AND coalesce("metadata"->>'migrationProvider', 'drizzle') = 'drizzle' ORDER BY "createdAt" ASC, "id" ASC`)) as unknown as Array<{ metadata: MigrationExecutionReceipt | null }>;
    } catch (error) {
      // Fresh databases do not have api_audit_events until its creating migration runs.
      if (!(error && typeof error === "object" && "code" in error && String(error.code) === "42P01")) throw error;
    }
    return reconcileMigrationExecutionReceipts({ current, receipts: receiptRows.flatMap(row => row.metadata ? [row.metadata] : []), now: input.now });
  } catch (error) {
    return {
      status: dbFailureStatus(error), source: "drizzle.__drizzle_migrations", observedAt, value: null,
      reason: error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 80) : error instanceof Error ? error.name : "unknown",
    };
  }
}

export const drizzleMigrationEvidenceSource: MigrationEvidenceSource = {
  observe: getDrizzleMigrationEvidence,
};
