import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";

import { getDb, type DrizzleDB } from "../db";

export type MigrationEvidenceStatus = "OBSERVED" | "NOT_CONFIGURED" | "UNAVAILABLE" | "PERMISSION_DENIED" | "ERROR";
export type MigrationEvidence = {
  status: MigrationEvidenceStatus;
  source: string;
  observedAt: string;
  value: {
    environment: string;
    databaseIdentity: string;
    expectedMigrationHead: { tag: string; hash: string } | null;
    observedAppliedHead: { hash: string; appliedAt: number | null } | null;
    pendingMigrations: Array<{ tag: string; hash: string }>;
    failedMigration: null;
    failureTracking: "not_recorded_by_drizzle_ledger";
    latestExecution: { hash: string; result: "APPLIED"; executedAt: number | null } | null;
  } | null;
  reason?: string;
};

type MigrationJournal = { entries?: Array<{ tag?: unknown }> };
type AppliedMigration = { hash: string; created_at: number | string | null };
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
  const expectedHead = input.expected.at(-1) ?? null;
  return {
    status: "OBSERVED",
    source: "drizzle.__drizzle_migrations",
    observedAt: (input.observedAt ?? new Date()).toISOString(),
    value: {
      environment: input.environment,
      databaseIdentity: input.databaseIdentity,
      expectedMigrationHead: expectedHead,
      observedAppliedHead: latest ? { hash: latest.hash, appliedAt: latest.created_at === null ? null : Number(latest.created_at) } : null,
      pendingMigrations: input.expected.filter(migration => !appliedHashes.has(migration.hash)),
      failedMigration: null,
      failureTracking: "not_recorded_by_drizzle_ledger",
      latestExecution: latest ? { hash: latest.hash, result: "APPLIED", executedAt: latest.created_at === null ? null : Number(latest.created_at) } : null,
    },
  };
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
    const appliedRows = await db.execute(sql<Array<AppliedMigration>>`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC`);
    return projectDrizzleMigrationEvidence({
      environment: input.environment ?? process.env.NODE_ENV ?? "unknown",
      databaseIdentity,
      expected,
      applied: appliedRows,
      observedAt: input.now,
    });
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
