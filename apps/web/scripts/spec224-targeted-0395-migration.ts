import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg, { type Client as PgClient } from "pg";
import { evaluateMigrationAttempt } from "../server/services/migrationExecutionReceiptPolicy";
import { DRIZZLE_MIGRATION_ADVISORY_LOCK } from "../server/services/migrationExecutionLock";

const { Client } = pg;
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationDirectory = path.join(appRoot, "drizzle");

export const SPEC224_0395_TARGET = Object.freeze({
  tag: "0395_spec224_external_runtime_job_type",
  expectedFingerprint: "sha256:522c1764a431a6eb0a8f13502ca8905ee65f0783b063ca6c2ccd746205351b0f",
  environment: "production",
  database: "smartspec",
  schema: "public",
  role: "smartspec",
  confirmation: "apply-spec224-0395-to-confirmed-production-database",
  lockKey: DRIZZLE_MIGRATION_ADVISORY_LOCK,
});

type ExpectedMigration = { tag: string; hash: string; when: number };
type AppliedMigration = { hash: string; created_at: string | number | null };
type DatabaseFacts = {
  database: string;
  schema: string;
  role: string;
  serverAddress: string;
  serverPort: number | null;
  clusterName: string;
  serverVersion: string;
  sessionRoleMatches: boolean;
  writableSession: boolean;
  migrationRoleCanAlterEnum: boolean;
  canInspectMigrationActivity: boolean;
};

type PreflightInput = {
  facts: DatabaseFacts;
  actualFingerprint: string;
  environment: string;
  enumExists: boolean;
  enumLabels: string[];
  migrations: ExpectedMigration[];
  applied: AppliedMigration[];
  activeMigrationCandidates: number;
};

export type Spec224Targeted0395Preflight =
  | { status: "READY"; target: ExpectedMigration; predecessorHashMismatches: number }
  | { status: "ALREADY_APPLIED"; target: ExpectedMigration; predecessorHashMismatches: number }
  | { status: "BLOCKED"; reasons: string[] };

export function fingerprintDatabase(facts: DatabaseFacts): string {
  const parts = [
    facts.serverAddress || "unknown-address",
    facts.serverPort == null ? "unknown-port" : String(facts.serverPort),
    facts.clusterName || "unknown-cluster",
    facts.database || "unknown-database",
    facts.schema || "unknown-schema",
    facts.role || "unknown-role",
    facts.serverVersion || "unknown-version",
  ];
  return `sha256:${createHash("sha256").update(parts.join("\u0000")).digest("hex")}`;
}

export function evaluateSpec224Targeted0395Preflight(input: PreflightInput): Spec224Targeted0395Preflight {
  const reasons: string[] = [];
  const targetIndex = input.migrations.findIndex(migration => migration.tag === SPEC224_0395_TARGET.tag);
  const target = input.migrations[targetIndex];
  if (!target || targetIndex < 1) return { status: "BLOCKED", reasons: ["target_migration_not_in_journal"] };

  if (input.environment !== SPEC224_0395_TARGET.environment) reasons.push("environment_mismatch");
  if (input.actualFingerprint !== SPEC224_0395_TARGET.expectedFingerprint) reasons.push("database_fingerprint_mismatch");
  if (input.facts.database !== SPEC224_0395_TARGET.database) reasons.push("database_name_mismatch");
  if (input.facts.schema !== SPEC224_0395_TARGET.schema) reasons.push("database_schema_mismatch");
  if (input.facts.role !== SPEC224_0395_TARGET.role) reasons.push("database_role_mismatch");
  if (!input.facts.sessionRoleMatches) reasons.push("session_role_switch_forbidden");
  if (!input.facts.writableSession) reasons.push("database_session_read_only");
  if (!input.facts.migrationRoleCanAlterEnum) reasons.push("migration_role_cannot_alter_enum");
  if (!input.facts.canInspectMigrationActivity) reasons.push("migration_activity_visibility_unverified");
  if (!input.enumExists) reasons.push("worker_runtime_type_missing");
  if (!input.enumLabels.includes("local_llm_worker")) reasons.push("worker_runtime_type_baseline_label_missing");
  if (input.activeMigrationCandidates !== 0) reasons.push("concurrent_migration_detected");

  const targetRows = input.applied.filter(row => Number(row.created_at) === target.when);
  if (targetRows.length > 1) reasons.push("target_migration_ledger_duplicate");
  if (targetRows.length === 1 && targetRows[0].hash !== target.hash) reasons.push("target_migration_hash_mismatch");
  if (input.applied.some(row => row.hash === target.hash && Number(row.created_at) !== target.when)) {
    reasons.push("target_hash_recorded_at_wrong_timestamp");
  }

  const laterRows = input.applied.filter(row => Number(row.created_at) > target.when);
  if (laterRows.length > 0) reasons.push("ledger_already_ahead_of_target");

  let predecessorHashMismatches = 0;
  const expectedPredecessors = input.migrations.slice(0, targetIndex);
  for (const migration of expectedPredecessors) {
    const rows = input.applied.filter(row => Number(row.created_at) === migration.when);
    if (rows.length !== 1) {
      reasons.push(rows.length === 0 ? "pending_migration_before_target" : "duplicate_predecessor_ledger_timestamp");
      continue;
    }
    if (rows[0].hash !== migration.hash) predecessorHashMismatches += 1;
  }

  const knownTimestamps = new Set(input.migrations.slice(0, targetIndex + 1).map(migration => migration.when));
  if (input.applied.some(row => {
    const createdAt = Number(row.created_at);
    return createdAt < target.when && !knownTimestamps.has(createdAt);
  })) reasons.push("unknown_ledger_timestamp_before_target");

  if (input.enumLabels.includes("external_runtime")) {
    if (targetRows.length === 1 && targetRows[0].hash === target.hash && reasons.length === 0) {
      return { status: "ALREADY_APPLIED", target, predecessorHashMismatches };
    }
    reasons.push("enum_present_but_migration_not_consistently_recorded");
  } else if (targetRows.length === 1 && targetRows[0].hash === target.hash) {
    reasons.push("ledger_applied_but_enum_postcondition_missing");
  }

  if (reasons.length > 0) return { status: "BLOCKED", reasons: [...new Set(reasons)] };
  return { status: "READY", target, predecessorHashMismatches };
}

function requiredEnvironment(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`MIGRATION_CONTEXT_MISSING_${name}`);
  return value;
}

function writeExternalReceipt(metadata: Record<string, unknown>, receiptPath: string) {
  mkdirSync(path.dirname(receiptPath), { recursive: true, mode: 0o700 });
  try { chmodSync(path.dirname(receiptPath), 0o700); } catch { /* retain restrictive permissions where supported */ }
  appendFileSync(receiptPath, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", mode: 0o600 });
  try { chmodSync(receiptPath, 0o600); } catch { /* best effort on non-POSIX systems */ }
}

async function readExpectedMigrations(): Promise<ExpectedMigration[]> {
  const journal = JSON.parse(await readFile(path.join(migrationDirectory, "meta", "_journal.json"), "utf8")) as {
    entries?: Array<{ tag?: string; when?: number }>;
  };
  if (!Array.isArray(journal.entries)) throw new Error("DRIZZLE_MIGRATION_JOURNAL_INVALID");
  return Promise.all(journal.entries.map(async entry => {
    if (typeof entry.tag !== "string" || !Number.isSafeInteger(entry.when)) throw new Error("DRIZZLE_MIGRATION_JOURNAL_INVALID");
    const content = await readFile(path.join(migrationDirectory, `${entry.tag}.sql`));
    return { tag: entry.tag, when: entry.when as number, hash: createHash("sha256").update(content).digest("hex") };
  }));
}

async function readFacts(client: PgClient): Promise<{ facts: DatabaseFacts; fingerprint: string }> {
  const result = await client.query<{
    database: string; schema: string; role: string; server_address: string | null; server_port: number | null;
    cluster_name: string | null; server_version: string; session_role_matches: boolean; writable_session: boolean;
    migration_role_can_alter_enum: boolean; can_inspect_migration_activity: boolean;
  }>(`SELECT current_database() AS database, current_schema() AS schema, current_user AS role,
      inet_server_addr()::text AS server_address, inet_server_port() AS server_port,
      current_setting('cluster_name', true) AS cluster_name, current_setting('server_version') AS server_version,
      session_user = current_user AS session_role_matches,
      current_setting('transaction_read_only') = 'off' AS writable_session,
      EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'worker_runtime_type'
          AND (t.typowner = (SELECT oid FROM pg_roles WHERE rolname = current_user)
            OR (SELECT rolsuper FROM pg_roles WHERE rolname = current_user))) AS migration_role_can_alter_enum,
      ((SELECT rolsuper FROM pg_roles WHERE rolname = current_user)
        OR pg_has_role(current_user, 'pg_read_all_stats', 'member')) AS can_inspect_migration_activity`);
  const row = result.rows[0];
  if (!row) throw new Error("DATABASE_IDENTITY_UNAVAILABLE");
  const facts: DatabaseFacts = {
    database: row.database,
    schema: row.schema,
    role: row.role,
    serverAddress: row.server_address ?? "unknown-address",
    serverPort: row.server_port,
    clusterName: row.cluster_name ?? "unknown-cluster",
    serverVersion: row.server_version,
    sessionRoleMatches: row.session_role_matches,
    writableSession: row.writable_session,
    migrationRoleCanAlterEnum: row.migration_role_can_alter_enum,
    canInspectMigrationActivity: row.can_inspect_migration_activity,
  };
  return { facts, fingerprint: fingerprintDatabase(facts) };
}

async function readPreflight(client: PgClient, migrations: ExpectedMigration[], environment: string) {
  const enumResult = await client.query<{ exists: boolean; labels: string[] | null }>(`
    SELECT EXISTS (
      SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'worker_runtime_type'
    ) AS exists,
    (SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
      JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typname = 'worker_runtime_type') AS labels`);
  const ledgerExists = await client.query<{ exists: boolean }>(`SELECT to_regclass('drizzle.__drizzle_migrations') IS NOT NULL AS exists`);
  if (!ledgerExists.rows[0]?.exists) throw new Error("DRIZZLE_MIGRATION_LEDGER_MISSING");
  const applied = await client.query<AppliedMigration>(`SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY created_at ASC NULLS FIRST, id ASC`);
  const activity = await client.query<{ active_candidates: number | string }>(`
    SELECT count(*)::int AS active_candidates FROM pg_stat_activity
    WHERE pid <> pg_backend_pid() AND state <> 'idle'
      AND (application_name ILIKE '%migrat%' OR query ILIKE '%__drizzle_migrations%' OR query ILIKE '%worker_runtime_type%')`);
  const auditExists = await client.query<{ exists: boolean }>(`SELECT to_regclass('public.api_audit_events') IS NOT NULL AS exists`);
  if (!auditExists.rows[0]?.exists) throw new Error("MIGRATION_AUDIT_TABLE_MISSING");
  const { facts, fingerprint } = await readFacts(client);
  const result = evaluateSpec224Targeted0395Preflight({
    facts,
    actualFingerprint: fingerprint,
    environment,
    enumExists: Boolean(enumResult.rows[0]?.exists),
    enumLabels: enumResult.rows[0]?.labels ?? [],
    migrations,
    applied: applied.rows,
    activeMigrationCandidates: Number(activity.rows[0]?.active_candidates ?? -1),
  });
  return { result, facts, fingerprint, enumLabels: enumResult.rows[0]?.labels ?? [], appliedCount: applied.rowCount ?? 0 };
}

async function writeDbReceipt(client: PgClient, metadata: Record<string, unknown>) {
  await client.query(`
    INSERT INTO public.api_audit_events ("traceId", "eventType", provider, endpoint, statusCode, metadata)
    VALUES ($1, 'migration_execution_receipt', 'drizzle', 'spec224-targeted-0395', $2, $3::json)
    ON CONFLICT DO NOTHING`, [randomUUID().replaceAll("-", "").slice(0, 32), metadata.phase === "SETTLED" && metadata.result === "FAILED" ? 500 : 200, JSON.stringify(metadata)]);
}

export async function runSpec224Targeted0395Migration(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const databaseUrl = requiredEnvironment("DATABASE_URL", env);
  const sourceSha = requiredEnvironment("GITHUB_SHA", env);
  const actor = requiredEnvironment("GITHUB_ACTOR", env);
  const workflowRef = requiredEnvironment("GITHUB_REF", env);
  const authorizationReference = requiredEnvironment("MIGRATION_AUTHORIZATION_REF", env);
  const confirmation = requiredEnvironment("SPEC224_0395_CONFIRMATION", env);
  const expectedFingerprint = requiredEnvironment("SPEC224_0395_EXPECTED_FINGERPRINT", env);
  const idempotencyKey = requiredEnvironment("MIGRATION_IDEMPOTENCY_KEY", env);
  const databaseTargetId = requiredEnvironment("DATABASE_TARGET_ID", env);
  const environment = requiredEnvironment("DEPLOY_ENVIRONMENT", env);
  if (workflowRef !== "refs/heads/main" || !/^[a-f0-9]{40}$/.test(sourceSha)) throw new Error("MIGRATION_SOURCE_NOT_CANONICAL_MAIN");
  if (environment !== SPEC224_0395_TARGET.environment) throw new Error("MIGRATION_ENVIRONMENT_NOT_PRODUCTION");
  if (confirmation !== SPEC224_0395_TARGET.confirmation) throw new Error("MIGRATION_CONFIRMATION_INVALID");
  if (expectedFingerprint !== SPEC224_0395_TARGET.expectedFingerprint) throw new Error("MIGRATION_TARGET_FINGERPRINT_NOT_ALLOWLISTED");
  if (databaseTargetId !== `smartaihub:production:${SPEC224_0395_TARGET.expectedFingerprint}`) throw new Error("MIGRATION_TARGET_ID_INVALID");
  if (authorizationReference.length < 8 || authorizationReference.length > 200) throw new Error("MIGRATION_AUTHORIZATION_REFERENCE_INVALID");

  const migrations = await readExpectedMigrations();
  const target = migrations.find(migration => migration.tag === SPEC224_0395_TARGET.tag);
  if (!target) throw new Error("TARGET_MIGRATION_NOT_IN_JOURNAL");
  const migrationSql = (await readFile(path.join(migrationDirectory, `${target.tag}.sql`), "utf8")).replaceAll("--> statement-breakpoint", "").trim();
  if (migrationSql !== `ALTER TYPE \"public\".\"worker_runtime_type\" ADD VALUE IF NOT EXISTS 'external_runtime';`) {
    throw new Error("TARGET_MIGRATION_CONTENT_NOT_ALLOWLISTED");
  }

  const client = new Client({ connectionString: databaseUrl, application_name: "smartaihub-spec224-targeted-0395" });
  const base = {
    schemaVersion: "migration-execution-receipt.v1",
    idempotencyKey,
    attemptNumber: 1,
    tenantId: null,
    projectId: "SmartAIHub",
    authorityScope: "PLATFORM_WIDE",
    environment,
    databaseTargetId,
    migrationProvider: "drizzle",
    migrationRange: { from: "0394_project_wiki_pages_mini_app", to: target.tag },
    expectedMigrationHead: target.tag,
    expectedMigrationHash: target.hash,
    requestedMigrationSet: [target.tag],
    sourceSha,
    deploymentId: process.env.GITHUB_RUN_ID ?? null,
    executionId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : idempotencyKey,
    startedAt: new Date().toISOString(),
    actor,
    authorizationReference,
  };
  const receiptFile = requiredEnvironment("MIGRATION_RECEIPT_FILE", env);
  let transactionOpen = false;
  let lockAcquired = false;
  let connected = false;

  try {
    await client.connect();
    connected = true;
    const lockResult = await client.query<{ acquired: boolean }>(`SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired`, [SPEC224_0395_TARGET.lockKey]);
    lockAcquired = lockResult.rows[0]?.acquired === true;
    if (!lockAcquired) throw new Error("MIGRATION_LOCK_BUSY");

    const initial = await readPreflight(client, migrations, environment);
    if (initial.fingerprint !== expectedFingerprint) throw new Error("DATABASE_FINGERPRINT_MISMATCH");
    const priorRows = await client.query<{ metadata: Record<string, unknown> | null }>(`
      SELECT "metadata" FROM public.api_audit_events
      WHERE "eventType" = 'migration_execution_receipt'
        AND "metadata"->>'idempotencyKey' = $1
      ORDER BY "createdAt" ASC, "id" ASC`, [idempotencyKey]);
    const priorReceipts = priorRows.rows.flatMap(row => row.metadata ? [row.metadata] : []);
    const decision = priorReceipts.length
      ? evaluateMigrationAttempt({ receipts: priorReceipts, payload: {
          environment,
          databaseTargetId,
          sourceSha,
          expectedMigrationHead: target.tag,
          requestedMigrationSet: [target.tag],
        } })
      : "START";
    if (decision === "IDEMPOTENCY_CONFLICT") throw new Error("MIGRATION_IDEMPOTENCY_CONFLICT");
    if (decision === "IN_PROGRESS") throw new Error("MIGRATION_ATTEMPT_IN_PROGRESS");
    if (decision === "ALREADY_FAILED") throw new Error("MIGRATION_ATTEMPT_ALREADY_FAILED");
    if (decision === "ALREADY_SUCCEEDED") {
      if (initial.result.status !== "ALREADY_APPLIED") throw new Error("MIGRATION_RECEIPT_DB_MISMATCH");
      return;
    }

    const attemptNumber = decision === "START" ? 1 : Math.max(0, ...priorReceipts.map(receipt => Number(receipt.attemptNumber) || 0)) + 1;
    const attemptBase = { ...base, attemptNumber, executionId: `${base.executionId}:${attemptNumber}` };
    const started = { ...attemptBase, phase: "STARTED" };
    writeExternalReceipt({ ...started, databaseFingerprint: initial.fingerprint, preflight: initial.result }, receiptFile);
    await writeDbReceipt(client, { ...started, databaseFingerprint: initial.fingerprint, preflight: initial.result });

    if (initial.result.status === "ALREADY_APPLIED") {
      const settled = { ...attemptBase, phase: "SETTLED", result: "SUCCEEDED", outcome: "VERIFIED_ALREADY_APPLIED", databaseFingerprint: initial.fingerprint, enumLabels: initial.enumLabels, completedAt: new Date().toISOString() };
      await writeDbReceipt(client, settled);
      try { writeExternalReceipt(settled, receiptFile); } catch { console.error("MIGRATION_EXTERNAL_RECEIPT_WRITE_FAILED"); }
      return;
    }
    if (initial.result.status !== "READY") throw new Error(`MIGRATION_PREFLIGHT_BLOCKED:${initial.result.reasons.join(",")}`);

    await client.query("BEGIN");
    transactionOpen = true;
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '30s'");
    const transactionLock = await client.query<{ acquired: boolean }>(`SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS acquired`, [SPEC224_0395_TARGET.lockKey]);
    if (transactionLock.rows[0]?.acquired !== true) throw new Error("MIGRATION_TRANSACTION_LOCK_BUSY");

    const lockedPreflight = await readPreflight(client, migrations, environment);
    if (lockedPreflight.fingerprint !== expectedFingerprint || lockedPreflight.result.status !== "READY") {
      throw new Error(`MIGRATION_PREFLIGHT_CHANGED:${lockedPreflight.result.status === "BLOCKED" ? lockedPreflight.result.reasons.join(",") : lockedPreflight.result.status}`);
    }
    await client.query(migrationSql);
    await client.query(`INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)`, [target.hash, target.when]);

    const postcondition = await client.query<{ labels: string[] | null }>(`
      SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
      FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace JOIN pg_enum e ON e.enumtypid = t.oid
      WHERE n.nspname = 'public' AND t.typname = 'worker_runtime_type' GROUP BY t.oid`);
    if (!postcondition.rows[0]?.labels?.includes("external_runtime")) throw new Error("ENUM_POSTCONDITION_FAILED");
    const targetLedger = await client.query<{ count: number | string }>(`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations WHERE hash = $1 AND created_at = $2`, [target.hash, target.when]);
    if (Number(targetLedger.rows[0]?.count) !== 1) throw new Error("MIGRATION_LEDGER_POSTCONDITION_FAILED");

    const settled = {
      ...attemptBase,
      phase: "SETTLED",
      result: "SUCCEEDED",
      outcome: "APPLIED_AND_VERIFIED",
      databaseFingerprint: lockedPreflight.fingerprint,
      predecessorHashMismatches: lockedPreflight.result.predecessorHashMismatches,
      enumLabels: postcondition.rows[0].labels,
      appliedHash: target.hash,
      appliedHead: target.tag,
      completedAt: new Date().toISOString(),
    };
    await writeDbReceipt(client, settled);
    await client.query("COMMIT");
    transactionOpen = false;
    try { writeExternalReceipt(settled, receiptFile); } catch { console.error("MIGRATION_EXTERNAL_RECEIPT_WRITE_FAILED"); }
  } catch (error) {
    if (transactionOpen) {
      try { await client.query("ROLLBACK"); } catch { /* preserve the original failure category */ }
      transactionOpen = false;
    }
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 64) : "TARGETED_MIGRATION_FAILED";
    const message = error instanceof Error ? error.message.slice(0, 240) : "unknown";
    const failed = { ...base, phase: "SETTLED", result: "FAILED", failureCategory: errorCode, failureCode: message, completedAt: new Date().toISOString() };
    try { writeExternalReceipt(failed, receiptFile); } catch { /* database audit remains authoritative where reachable */ }
    if (connected) {
      try { await writeDbReceipt(client, failed); } catch { /* preserve the original failure */ }
    }
    throw new Error(`SPEC224_TARGETED_0395_FAILED:${errorCode}`);
  } finally {
    if (lockAcquired) {
      try { await client.query(`SELECT pg_advisory_unlock(hashtextextended($1, 0))`, [SPEC224_0395_TARGET.lockKey]); } catch { /* session close releases the lock */ }
    }
    await client.end().catch(() => undefined);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  runSpec224Targeted0395Migration().catch(error => {
    const code = error instanceof Error ? error.message.split(":")[0] : "SPEC224_TARGETED_0395_FAILED";
    console.error(code);
    process.exitCode = 1;
  });
}
