/**
 * Create HNSW Index on multimodal_memory_vectors (Section 12)
 *
 * Run AFTER the backfill script completes. Creating the index post-backfill
 * avoids index maintenance overhead during bulk inserts.
 *
 * Usage:
 *   pnpm exec tsx scripts/create-hnsw-index.ts
 *
 * Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction.
 */

import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { evaluateMigrationAttempt } from "../server/services/migrationExecutionReceiptPolicy";

export const HNSW_INDEX_SQL = [
  "CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_multimodal_memory_vectors_embedding",
  "ON multimodal_memory_vectors",
  "USING hnsw (embedding vector_cosine_ops)",
  "WITH (m = 16, ef_construction = 128)",
].join(" ");

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const sql = postgres(databaseUrl, { max: 1 });
  const idempotencyKey = process.env.MIGRATION_IDEMPOTENCY_KEY?.trim() || randomUUID();
  const migrationHash = createHash("sha256").update(HNSW_INDEX_SQL).digest("hex");
  const environment = process.env.DEPLOY_ENVIRONMENT ?? process.env.NODE_ENV ?? "unknown";
  const sourceSha = process.env.GITHUB_SHA ?? process.env.SOURCE_SHA ?? "unknown";
  const parsedUrl = new URL(databaseUrl);
  const databaseTargetId = `database:${createHash("sha256").update(`${parsedUrl.host}${parsedUrl.pathname}`).digest("hex").slice(0, 20)}`;
  const root = process.env.RUNNER_TEMP || path.join(process.env.HOME || ".", ".local", "state", "smartspecpro", "artifacts", "migration-receipts");
  const receiptFile = process.env.MIGRATION_RECEIPT_FILE?.trim() || path.join(root, `hnsw-${idempotencyKey}.jsonl`);
  const base = { schemaVersion: "migration-execution-receipt.v1", idempotencyKey, tenantId: null, projectId: "SmartSpecPro",
    authorityScope: "PLATFORM_WIDE", environment, databaseTargetId, migrationProvider: "postgres-maintenance",
    expectedMigrationHead: "idx_multimodal_memory_vectors_embedding", expectedMigrationHash: migrationHash,
    requestedMigrationSet: ["idx_multimodal_memory_vectors_embedding"], sourceSha,
    executionId: `${process.env.GITHUB_RUN_ID ?? idempotencyKey}:${process.env.GITHUB_RUN_ATTEMPT ?? "1"}`,
    deploymentId: process.env.GITHUB_RUN_ID ?? null, actor: process.env.GITHUB_ACTOR ?? process.env.USER ?? "migration-operator" };
  const append = (receipt: Record<string, unknown>) => {
    mkdirSync(path.dirname(receiptFile), { recursive: true, mode: 0o700 });
    try { chmodSync(path.dirname(receiptFile), 0o700); } catch { /* retain restrictive mode where supported */ }
    appendFileSync(receiptFile, `${JSON.stringify(receipt)}\n`, { encoding: "utf8", mode: 0o600 });
    try { chmodSync(receiptFile, 0o600); } catch { /* retain restrictive mode where supported */ }
  };
  const localReceipts = existsSync(receiptFile) ? readFileSync(receiptFile, "utf8").split("\n").filter(Boolean).flatMap(line => {
    try { const row = JSON.parse(line); return row.idempotencyKey === idempotencyKey ? [row] : []; }
    catch { return []; }
  }) : [];
  const auditTable = await sql<{ available: boolean }[]>`select to_regclass('public.api_audit_events') is not null as available`;
  const dbReceipts = auditTable[0]?.available ? await sql<{ metadata: Record<string, unknown> | null }[]>`
    select metadata from api_audit_events where "eventType" = 'migration_execution_receipt' and metadata->>'idempotencyKey' = ${idempotencyKey} order by "createdAt", id
  ` : [];
  const prior = [...localReceipts, ...dbReceipts.flatMap(row => row.metadata ? [row.metadata] : [])];
  const decision = prior.length ? evaluateMigrationAttempt({ receipts: prior, payload: base }) : "START";
  if (decision === "IDEMPOTENCY_CONFLICT") { await sql.end(); throw new Error("MIGRATION_IDEMPOTENCY_CONFLICT"); }
  if (decision === "ALREADY_SUCCEEDED") { await sql.end(); return; }
  if (decision === "ALREADY_FAILED") { await sql.end(); process.exitCode = 1; return; }
  if (decision === "IN_PROGRESS") { await sql.end(); process.exitCode = 75; return; }
  const recovering = decision === "RESUME_STALE" || decision === "RETRY_FAILED";
  const attemptNumber = decision === "START" ? 1 : Math.max(0, ...prior.map(row => Number(row.attemptNumber) || 0)) + 1;
  const attemptBase = { ...base, attemptNumber, executionId: `${base.executionId}:${attemptNumber}` };
  const writeDb = async (receipt: Record<string, unknown>) => {
    const available = await sql<{ available: boolean }[]>`select to_regclass('public.api_audit_events') is not null as available`;
    if (!available[0]?.available) return;
    await sql`
      insert into api_audit_events ("traceId", "eventType", provider, endpoint, statusCode, errorMessage, metadata)
      values (${randomUUID().replaceAll("-", "").slice(0, 32)}, 'migration_execution_receipt', 'postgres-maintenance', 'create-hnsw-index',
        ${receipt.phase === "SETTLED" && receipt.result === "FAILED" ? 500 : 200},
        ${typeof receipt.failureCategory === "string" ? receipt.failureCategory : null}, ${JSON.stringify(receipt)}::json)
      on conflict do nothing
    `;
  };
  const startedAt = new Date().toISOString();
  const startReceipt = { ...attemptBase, phase: "STARTED", startedAt };
  append(startReceipt);
  try { await writeDb(startReceipt); }
  catch { /* external STARTED receipt remains durable if the audit table is unavailable */ }
  const start = Date.now();
  try {
    console.log("[hnsw-index] Creating HNSW index on multimodal_memory_vectors.embedding...");
    await sql.unsafe(HNSW_INDEX_SQL);
    const rows = await sql<{ exists: boolean }[]>`select to_regclass('public.idx_multimodal_memory_vectors_embedding') is not null as exists`;
    if (!rows[0]?.exists) throw new Error("HNSW_INDEX_NOT_PRESENT_AFTER_CREATE");
    const settled = { ...attemptBase, phase: "SETTLED", result: recovering ? "RECOVERED" : "SUCCEEDED", completedAt: new Date().toISOString(),
      appliedHead: base.expectedMigrationHead, appliedHash: migrationHash, failureCategory: null };
    append(settled);
    await writeDb(settled);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`[hnsw-index] HNSW index created in ${elapsed} seconds.`);
  } catch (error) {
    const settled = { ...attemptBase, phase: "SETTLED", result: "FAILED", completedAt: new Date().toISOString(),
      failureCategory: "EXECUTION_FAILED", failureCode: error && typeof error === "object" && "code" in error ? String(error.code).slice(0, 80) : "UNKNOWN" };
    append(settled);
    await writeDb(settled).catch(() => undefined);
    throw error;
  } finally {
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error("[hnsw-index] Fatal error:", err);
    process.exit(1);
  });
}
