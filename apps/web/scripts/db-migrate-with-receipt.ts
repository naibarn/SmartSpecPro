import { randomUUID, createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { apiAuditEvents } from "../drizzle/schema";
import { sql } from "drizzle-orm";
import { evaluateMigrationAttempt } from "../server/services/migrationExecutionReceiptPolicy";
import { closeDb, getDb } from "../server/db";
import { hasDatabaseErrorCode } from "./migrationReceiptHelpers";

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

async function migrationSet() {
  const journal = JSON.parse(await readFile(path.join(appRoot, "drizzle/meta/_journal.json"), "utf8")) as { entries?: Array<{ tag?: string }> };
  return Promise.all((journal.entries ?? []).flatMap(entry => typeof entry.tag === "string" ? [entry.tag] : []).map(async tag => {
    const content = await readFile(path.join(appRoot, "drizzle", `${tag}.sql`));
    return { tag, hash: createHash("sha256").update(content).digest("hex") };
  }));
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

function runDrizzle(): Promise<{ code: number | null; signal: NodeJS.Signals | null }> { return runCommand("migrate"); }

function runCommand(command: "generate" | "migrate"): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise(resolve => {
    const child = spawn("pnpm", ["exec", "drizzle-kit", command], { cwd: appRoot, env: process.env, stdio: "inherit" });
    child.once("error", () => resolve({ code: 127, signal: null }));
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

async function main() {
  const isPush = process.argv.includes("push");
  if (isPush) {
    const generated = await runCommand("generate");
    if (generated.code !== 0 || generated.signal) {
      process.exitCode = generated.code ?? 1;
      return;
    }
  }
  const db = getDb();
  const migrations = await migrationSet();
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
    expectedMigrationHead: migrations.at(-1)?.tag ?? null,
    expectedMigrationHash: migrations.at(-1)?.hash ?? null,
    requestedMigrationSet: migrations.map(({ tag }) => tag),
    beforeAppliedHead: beforeApplied.tag,
    beforeAppliedHash: beforeApplied.hash,
    sourceSha,
    deploymentId: process.env.GITHUB_RUN_ID ?? null,
    executionId: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_RUN_ID}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}` : phaseKey,
    startedAt: startedAt.toISOString(),
    actor: process.env.GITHUB_ACTOR ?? "deployment-runner",
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
    outcome = await runDrizzle();
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

await main();
