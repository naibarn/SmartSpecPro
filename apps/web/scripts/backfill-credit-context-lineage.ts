import { and, asc, eq, gt, isNull, lte, max, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { creditContextBackfillRuns, creditTransactions } from "../drizzle/schema";
import { getDb } from "../server/db";
import { linkCreditTransactionContext } from "../server/services/creditContextWriter";
import type { CreditContextRef } from "../shared/creditContextContracts";

export interface CreditContextBackfillOptions {
  apply: boolean;
  batchSize: number;
  startId?: number;
  runId?: string;
  pauseAfterBatch?: boolean;
  tenantId?: string;
  userId?: number;
  operatorId?: string;
}

export interface CreditContextBackfillResult {
  runId: string;
  scanThroughTransactionId: number;
  lastTransactionId: number | null;
  scanned: number;
  linked: number;
  skipped: number;
  deferred: number;
  dryRun: boolean;
}

export function parseCreditContextBackfillArgs(argv: string[]): CreditContextBackfillOptions {
  const value = (name: string) => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  return {
    apply: argv.includes("--apply"),
    batchSize: Math.min(Math.max(Number(value("--batch-size") ?? 100), 1), 1000),
    startId: value("--start-id") ? Number(value("--start-id")) : undefined,
    runId: value("--run-id"),
    pauseAfterBatch: argv.includes("--pause-after-batch"),
    tenantId: value("--tenant-id"),
    userId: value("--user-id") ? Number(value("--user-id")) : undefined,
    operatorId: value("--operator-id") ?? "credit-context-backfill",
  };
}

export function candidateContext(metadata: unknown): CreditContextRef | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const record = metadata as Record<string, unknown>;
  const seriesId = record.seriesId ?? record.series_id;
  if (typeof seriesId !== "string" && typeof seriesId !== "number") return null;
  if (!String(seriesId).trim()) return null;
  return { contextType: "series", sourceType: "vertical_drama_series", sourceId: String(seriesId).trim() };
}

export async function runCreditContextBackfill(options: CreditContextBackfillOptions): Promise<CreditContextBackfillResult> {
  const db = await getDb();
  const scopeConditions = [
    options.tenantId ? eq(creditTransactions.tenantId, options.tenantId) : isNull(creditTransactions.tenantId),
    options.userId ? eq(creditTransactions.userId, options.userId) : undefined,
  ].filter(Boolean) as Array<any>;
  const [maximum] = await db.select({ value: max(creditTransactions.id) }).from(creditTransactions).where(and(...scopeConditions));
  const runId = options.runId ?? randomUUID();
  const mode = options.apply ? "apply" : "dry_run";
  const operatorId = options.operatorId ?? "credit-context-backfill";
  const leaseExpiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const [existing] = await db.select().from(creditContextBackfillRuns).where(eq(creditContextBackfillRuns.id, runId)).limit(1);
  if (existing && (existing.tenantId !== (options.tenantId ?? null) || existing.userId !== (options.userId ?? null))) {
    throw new Error("Backfill run scope cannot be changed when resuming");
  }
  if (existing && existing.mode !== mode) {
    throw new Error("Backfill run mode cannot be changed when resuming");
  }
  if (existing && (existing.schemaVersion !== "0264" || existing.resolverVersion !== "1")) {
    throw new Error("Backfill run contract version cannot be changed when resuming");
  }
  const scanThroughTransactionId = existing?.scanThroughTransactionId ?? Number(maximum?.value ?? 0);
  const [active] = await db.select({ id: creditContextBackfillRuns.id })
    .from(creditContextBackfillRuns)
    .where(and(
      eq(creditContextBackfillRuns.status, "running"),
      or(isNull(creditContextBackfillRuns.leaseExpiresAt), gt(creditContextBackfillRuns.leaseExpiresAt, new Date())),
      options.tenantId ? eq(creditContextBackfillRuns.tenantId, options.tenantId) : isNull(creditContextBackfillRuns.tenantId),
      options.userId ? eq(creditContextBackfillRuns.userId, options.userId) : isNull(creditContextBackfillRuns.userId),
    )).limit(1);
  if (active && active.id !== runId) {
    throw new Error("An active credit context backfill already owns this scope");
  }
  if (!existing) {
    await db.insert(creditContextBackfillRuns).values({ id: runId, mode, status: "running", schemaVersion: "0264", resolverVersion: "1", scanThroughTransactionId, lastTransactionId: options.startId ?? 0, tenantId: options.tenantId ?? null, userId: options.userId ?? null, batchSize: options.batchSize, operatorId, leaseOwner: operatorId, leaseExpiresAt });
  } else if (existing.status === "running" && existing.leaseOwner !== operatorId && existing.leaseExpiresAt && existing.leaseExpiresAt > new Date()) {
    throw new Error("An active credit context backfill already owns this run");
  } else {
    await db.update(creditContextBackfillRuns).set({ leaseOwner: operatorId, leaseExpiresAt, updatedAt: new Date() }).where(eq(creditContextBackfillRuns.id, runId));
  }
  const cursor = existing?.lastTransactionId ?? options.startId ?? 0;
  const conditions = [gt(creditTransactions.id, cursor), lte(creditTransactions.id, scanThroughTransactionId), ...scopeConditions];
  const transactions = await db.select().from(creditTransactions).where(and(...conditions)).orderBy(asc(creditTransactions.id)).limit(options.batchSize);
  let linked = 0;
  let skipped = 0;
  let deferred = 0;
  for (const transaction of transactions) {
    const ref = candidateContext(transaction.metadata);
    if (!ref || !transaction.tenantId) {
      skipped += 1;
      continue;
    }
    if (!options.apply) {
      linked += 1;
      continue;
    }
    try {
      await linkCreditTransactionContext({ transactionId: transaction.id, ref, scope: { tenantId: transaction.tenantId, userId: transaction.userId }, provenance: "historical_verified", reasonCode: "structured_series_id" });
      linked += 1;
    } catch {
      deferred += 1;
    }
  }
  const lastTransactionId = transactions.at(-1)?.id ?? cursor;
  const completed = transactions.length < options.batchSize || options.pauseAfterBatch;
  const previousCounters = existing?.countersJson && typeof existing.countersJson === "object" && !Array.isArray(existing.countersJson)
    ? existing.countersJson as Record<string, unknown>
    : {};
  const counterValue = (key: string) => {
    const value = previousCounters[key];
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
  };
  await db.update(creditContextBackfillRuns).set({ lastTransactionId, status: completed ? (options.pauseAfterBatch ? "paused" : "completed") : "running", updatedAt: new Date(), completedAt: completed && !options.pauseAfterBatch ? new Date() : null, leaseExpiresAt: completed ? null : new Date(Date.now() + 15 * 60 * 1000), countersJson: { scanned: counterValue("scanned") + transactions.length, linked: counterValue("linked") + linked, skipped: counterValue("skipped") + skipped, deferred: counterValue("deferred") + deferred } }).where(eq(creditContextBackfillRuns.id, runId));
  const result = { runId, scanThroughTransactionId, lastTransactionId: transactions.length ? lastTransactionId : null, scanned: transactions.length, linked, skipped, deferred, dryRun: !options.apply };
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1]?.endsWith("backfill-credit-context-lineage.ts")) {
  runCreditContextBackfill(parseCreditContextBackfillArgs(process.argv.slice(2))).catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
