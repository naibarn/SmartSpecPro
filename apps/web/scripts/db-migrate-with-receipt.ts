import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiAuditEvents } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import pg from "pg";
import { evaluateMigrationAttempt } from "../server/services/migrationExecutionReceiptPolicy";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../server/services/migrationExecutionLock";
import { closeDb, getDb } from "../server/db";
import { hasDatabaseErrorCode } from "./migrationReceiptHelpers";
import { selectDevMigrationProfile, validateDevActiveSchemaTarget } from "./devActiveSchemaBaseline";
import {
  evaluateScopedPendingMigrations,
  fingerprintMigrationDatabase,
  parseExpectedPendingTags,
  type ScopedMigration,
} from "./scopedMigrationPreflight";

const { Client } = pg;

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const phaseKey = process.env.MIGRATION_IDEMPOTENCY_KEY?.trim() || randomUUID();
const startedAt = new Date();
const sourceSha = process.env.GITHUB_SHA ?? process.env.SOURCE_SHA ?? "unknown";
const environment = process.env.DEPLOY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown";
const databaseTargetId = process.env.DATABASE_TARGET_ID ?? (() => {
  const url = process.env.DATABASE_URL ?? "";
  const safeIdentity = url ? createHash("sha256").update(new URL(url).host + new URL(url).pathname).digest("hex").slice(0, 20) : "unconfigured";
  return `database:${safeIdentity}`;
})();

async function migrationSet(profile: "canonical" | "dev-active-baseline" = "canonical") {
  const migrationDirectory = profile === "canonical" ? "drizzle" : "drizzle/dev-active-baseline/migrations";
  const journal = JSON.parse(await readFile(path.join(appRoot, migrationDirectory, "meta/_journal.json"), "utf8")) as { entries?: Array<{ tag?: string; when?: number }> };
  if (!Array.isArray(journal.entries) || journal.entries.some(entry =>
    typeof entry.tag !== "string" || !Number.isSafeInteger(entry.when))) {
    throw new Error("DRIZZLE_MIGRATION_JOURNAL_INVALID");
  }
  return Promise.all(journal.entries.map(async entry => {
    const content = await readFile(path.join(appRoot, migrationDirectory, `${entry.tag}.sql`));
    return { tag: entry.tag as string, when: entry.when as number, hash: createHash("sha256").update(content).digest("hex") };
  }));
}

async function assertScopedMigrationRequest(lockClient: InstanceType<typeof Client>, migrations: ScopedMigration[]) {
  const expectedTags = parseExpectedPendingTags(process.env.MIGRATION_EXPECTED_PENDING_TAGS);
  if (!expectedTags) return null;
  const authorizationReference = process.env.MIGRATION_AUTHORIZATION_REF?.trim() ?? "";
  if (authorizationReference.length < 8 || authorizationReference.length > 200) {
    throw new Error("MIGRATION_AUTHORIZATION_REFERENCE_INVALID");
  }
  if (process.env.DEPLOY_ENVIRONMENT !== "production" || process.env.GITHUB_REF !== "refs/heads/main") {
    throw new Error("SCOPED_MIGRATION_NOT_CANONICAL_PRODUCTION");
  }

  const expectedFingerprint = process.env.MIGRATION_EXPECTED_DATABASE_FINGERPRINT?.trim() ?? "";
  if (!/^sha256:[a-f0-9]{64}$/.test(expectedFingerprint)) throw new Error("MIGRATION_EXPECTED_DATABASE_FINGERPRINT_INVALID");
  const factsResult = await lockClient.query<{
    database: string; schema: string; role: string; server_address: string | null; server_port: number | null;
    cluster_name: string | null; server_version: string;
  }>(`SELECT current_database() AS database, current_schema() AS schema, current_user AS role,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      current_setting('cluster_name', true) AS cluster_name, current_setting('server_version') AS server_version`);
  const facts = factsResult.rows[0];
  if (!facts) throw new Error("MIGRATION_DATABASE_IDENTITY_UNAVAILABLE");
  const actualFingerprint = fingerprintMigrationDatabase({
    serverAddress: facts.server_address,
    serverPort: facts.server_port,
    clusterName: facts.cluster_name,
    database: facts.database,
    schema: facts.schema,
    role: facts.role,
    serverVersion: facts.server_version,
  });
  if (actualFingerprint !== expectedFingerprint) throw new Error("MIGRATION_DATABASE_FINGERPRINT_MISMATCH");
  const expectedTargetId = `smartaihub:production:${expectedFingerprint}`;
  if (process.env.DATABASE_TARGET_ID !== expectedTargetId) throw new Error("MIGRATION_DATABASE_TARGET_ID_MISMATCH");

  const appliedResult = await lockClient.query<{ created_at: number | string | null }>(
    "SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC",
  );
  const latestCreatedAt = appliedResult.rows.at(-1)?.created_at;
  if (appliedResult.rows.length && latestCreatedAt == null) throw new Error("MIGRATION_LEDGER_TIMESTAMP_INVALID");
  const latestAppliedAt = appliedResult.rows.length ? Number(latestCreatedAt) : null;
  if (latestAppliedAt !== null && !Number.isSafeInteger(latestAppliedAt)) throw new Error("MIGRATION_LEDGER_TIMESTAMP_INVALID");
  const result = evaluateScopedPendingMigrations({ journal: migrations, latestAppliedAt, expectedTags });
  if (result.status === "BLOCKED") throw new Error(`SCOPED_MIGRATION_PREFLIGHT_${result.reason.toUpperCase()}`);
  return expectedTags;
}

async function readAppliedHead(db: ReturnType<typeof getDb>, tags: Array<{ tag: string; hash: string }>) {
  let rows;
  try {
    rows = await db.execute(sql`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC`);
  } catch (error) {
    if (hasDatabaseErrorCode(error, "42P01")) return { tag: null, hash: null };
    throw error;
  }
  const latest = (rows as unknown as Array<{ hash: string; created_at: number | string | null }>).at(-1);
  if (!latest) return { tag: null, hash: null };
  return { tag: tags.find(migration => migration.hash === latest.hash)?.tag ?? null, hash: latest.hash };
}

async function hasAuditReceiptTable(db: ReturnType<typeof getDb>): Promise<boolean> {
  const rows = await db.execute(sql`SELECT to_regclass('public.api_audit_events') IS NOT NULL AS available`);
  return Boolean((rows as unknown as Array<{ available?: boolean }>)[0]?.available);
}

function externalReceiptPath() {
  const defaultDirectory = process.env.RUNNER_TEMP || path.join(process.env.HOME || ".", ".local", "state", "smartspecpro", "artifacts", "migration-receipts");
  return process.env.MIGRATION_RECEIPT_FILE?.trim() || path.join(defaultDirectory, `migration-${phaseKey}.jsonl`);
}

function appendExternalReceipt(metadata: Record<string, unknown>) {
  const receiptPath = externalReceiptPath();
  mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  try { chmodSync(path.dirname(receiptPath), 0o700); } catch { /* preserve existing restrictive directory mode */ }
  appendFileSync(receiptPath, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(receiptPath, 0o600); } catch { /* best effort on platforms without POSIX modes */ }
}

function readExternalReceipts(): Array<Record<string, unknown>> {
  const file = externalReceiptPath();
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).flatMap(line => {
    try { const parsed = JSON.parse(line); return parsed.idempotencyKey === phaseKey ? [parsed] : []; }
    catch { return []; }
  });
}

async function writeDbReceipt(db: ReturnType<typeof getDb>, metadata: Record<string, unknown>) {
  if (!await hasAuditReceiptTable(db)) return false;
  await db.insert(apiAuditEvents).values({
    traceId: randomUUID().replaceAll("-", "").slice(0, 32), eventType: "migration_execution_receipt", provider: "drizzle",
    endpoint: "db:migrate", statusCode: metadata.phase === "SETTLED" && metadata.result === "FAILED" ? 500 : 200,
    errorMessage: typeof metadata.failureCategory === "string" ? metadata.failureCategory : null,
    metadata,
  }).onConflictDoNothing();
  return true;
}

function runDrizzle(profile: "canonical" | "dev-active-baseline"): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return runCommand("migrate", profile);
}

function runCommand(command: "generate" | "migrate", profile: "canonical" | "dev-active-baseline" = "canonical"): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise(resolve => {
    const args = ["exec", "drizzle-kit", command];
    if (profile === "dev-active-baseline") args.push("--config=drizzle-dev-active-baseline.config.ts");
    const child = spawn("pnpm", args, { cwd: appRoot, env: process.env, stdio: "inherit" });
    child.once("error", () => resolve({ code: 127, signal: null }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main(profile: "canonical" | "dev-active-baseline") {
  const isPush = process.argv.includes("push");
  if (isPush) {
    const generated = await runCommand("generate");
    if (generated.code !== 0 || generated.signal) {
      process.exitCode = generated.code ?? 1;
      return;
    }
  }
  const db = getDb();
  const migrations = await migrationSet(profile);
  const scopedExpectedTags = parseExpectedPendingTags(process.env.MIGRATION_EXPECTED_PENDING_TAGS);
  const beforeApplied = await readAppliedHead(db, migrations);
  const base = {
    schemaVersion: "migration-execution-receipt.v1",
    phase: "STARTED",
    idempotencyKey: phaseKey,
    tenantId: null,
    projectId: "SmartSpecPro",
    authorityScope: "PLATFORM_WIDE",
    environment,
    databaseTargetId,
    migrationProvider: "drizzle",
    migrationProfile: profile,
    expectedMigrationHead: migrations.at(-1)?.tag ?? null,
    expectedMigrationHash: migrations.at(-1)?.hash ?? null,
    requestedMigrationSet: scopedExpectedTags ?? migrations.map(({ tag }) => tag),
    beforeAppliedHead: beforeApplied.tag,
    beforeAppliedHash: beforeApplied.hash,
    sourceSha,
    deploymentId: process.env.GITHUB_RUN_ID ?? null,
    executionId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : phaseKey,
    startedAt: startedAt.toISOString(),
    actor: process.env.GITHUB_ACTOR ?? "deployment-runner",
    authorizationReference: process.env.MIGRATION_AUTHORIZATION_REF?.trim() || null,
  };
  const externalReceipts = readExternalReceipts();
  const dbReceipts = await readDbReceipts(db, phaseKey);
  const priorReceipts = [...externalReceipts, ...dbReceipts];
  const priorDecision = priorReceipts.length ? evaluateMigrationAttempt({ receipts: priorReceipts, payload: base }) : "START";
  if (priorDecision === "IDEMPOTENCY_CONFLICT") {
    appendExternalReceipt({ ...base, phase: "SETTLED", result: "FAILED", completedAt: new Date().toISOString(), failureCategory: "IDEMPOTENCY_CONFLICT" });
    await closeDb();
    throw new Error("MIGRATION_IDEMPOTENCY_CONFLICT");
  }
  if (priorDecision === "ALREADY_SUCCEEDED" || priorDecision === "ALREADY_FAILED") {
    process.exitCode = priorDecision === "ALREADY_SUCCEEDED" ? 0 : 1;
    await closeDb();
    return;
  }
  if (priorDecision === "IN_PROGRESS") {
    process.exitCode = 75;
    await closeDb();
    return;
  }
  const recovering = priorDecision === "RESUME_STALE" || priorDecision === "RETRY_FAILED";
  const attemptNumber = priorDecision === "START" ? 1 : Math.max(0, ...priorReceipts.map(receipt => Number(receipt.attemptNumber) || 0)) + 1;
  const attemptBase = { ...base, attemptNumber, executionId: `${base.executionId}:${attemptNumber}` };
  const startReceipt = { ...attemptBase, phase: "STARTED" };
  if (priorDecision === "START" || priorDecision === "RESUME_STALE" || priorDecision === "RETRY_FAILED") {
    appendExternalReceipt(startReceipt);
    await writeDbReceipt(db, startReceipt);
  }
  let outcome: { code: number | null; signal: NodeJS.Signals | null } = { code: 1, signal: null };
  try {
    outcome = await runDrizzle(profile);
    const succeeded = outcome.code === 0 && outcome.signal === null;
    const afterApplied = await readAppliedHead(db, migrations);
    const settled = { ...attemptBase, phase: "SETTLED", result: succeeded ? recovering ? "RECOVERED" : "SUCCEEDED" : outcome.signal ? "INTERRUPTED" : "FAILED",
        completedAt: new Date().toISOString(), appliedHead: afterApplied.tag, appliedHash: afterApplied.hash,
        failureCategory: succeeded ? null : outcome.signal ? "INTERRUPTED" : "EXECUTION_FAILED",
        failureCode: succeeded ? null : `EXIT_${outcome.code ?? outcome.signal ?? "UNKNOWN"}` };
    appendExternalReceipt(settled);
    await writeDbReceipt(db, startReceipt);
    await writeDbReceipt(db, settled);
    if (!succeeded) process.exitCode = outcome.code ?? 1;
  } catch (error) {
    const settled = { ...attemptBase, phase: "SETTLED", result: "FAILED", completedAt: new Date().toISOString(),
        failureCategory: "EXECUTION_FAILED", failureCode: error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 64) : "UNKNOWN" };
    appendExternalReceipt(settled);
    await writeDbReceipt(db, startReceipt);
    await writeDbReceipt(db, settled);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}

async function readDbReceipts(db: ReturnType<typeof getDb>, key: string): Promise<Array<Record<string, unknown>>> {
  if (!await hasAuditReceiptTable(db)) return [];
  const rows = await db.execute(sql`SELECT "metadata" FROM "api_audit_events" WHERE "eventType" = 'migration_execution_receipt' AND "metadata"->>'idempotencyKey' = ${key} ORDER BY "createdAt" ASC, "id" ASC`);
  return (rows as unknown as Array<{ metadata: Record<string, unknown> | null }>).flatMap(row => row.metadata ? [row.metadata] : []);
}

async function mainWithMigrationLock() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("Database not configured. Set DATABASE_URL before calling db:migrate.");
  const lockClient = new Client({ connectionString: databaseUrl, application_name: "smartaihub-db-migrate" });
  let lockAcquired = false;
  try {
    await lockClient.connect();
    const lock = await lockClient.query<{ acquired: boolean }>(
      `SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`,
      [DRIZZLE_MIGRATION_ADVISORY_LOCK],
    );
    lockAcquired = lock.rows[0]?.acquired === true;
    if (!lockAcquired) {
      process.exitCode = 75;
      return;
    }
    const canonicalMigrations = await migrationSet("canonical");
    await assertScopedMigrationRequest(lockClient, canonicalMigrations);
    const identity = await lockClient.query<{ database_name: string; application_table_count: string }>(
      `SELECT current_database() AS database_name,
        (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
           AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e'))::text AS application_table_count`,
    );
    const database = identity.rows[0];
    if (!database) throw new Error("MIGRATION_DATABASE_IDENTITY_UNAVAILABLE");
    const ledgerCheck = await lockClient.query<{ exists: boolean }>(
      "SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists",
    );
    const devBaselineMigrations = await migrationSet("dev-active-baseline");
    const existingLedger = ledgerCheck.rows[0]?.exists
      ? (await lockClient.query<{ hash: string; created_at: number | string | null }>(
          "SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC",
        )).rows
      : [];
    const migrationCount = existingLedger.length;
    const baselineApplied = existingLedger.some(row => row.hash === devBaselineMigrations[0]?.hash);
    let profile: "canonical" | "dev-active-baseline" = "canonical";
    const devBaselineWasRequested = process.env.SMARTSPEC_DEV_DATABASE_MODE === "development" ||
      process.env.SMARTSPEC_ENVIRONMENT === "development";
    if (devBaselineWasRequested) validateDevActiveSchemaTarget(process.env);
    if (devBaselineWasRequested) {
      profile = selectDevMigrationProfile({
        nodeEnv: process.env.NODE_ENV ?? "",
        environment: process.env.SMARTSPEC_ENVIRONMENT ?? "",
        databaseMode: process.env.SMARTSPEC_DEV_DATABASE_MODE ?? "",
        databaseName: database.database_name,
        applicationTableCount: Number(database.application_table_count),
        migrationCount,
        baselineApplied,
      });
    }
    await main(profile);
  } finally {
    if (lockAcquired) {
      try {
        await lockClient.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [DRIZZLE_MIGRATION_ADVISORY_LOCK]);
      } catch { /* the connection close releases the session lock */ }
    }
    await lockClient.end().catch(() => undefined);
  }
}

await mainWithMigrationLock();
