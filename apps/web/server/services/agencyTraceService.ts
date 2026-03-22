/**
 * Agency Trace Service — persists run traces to agency_run_traces table
 * and provides query helpers for the tRPC router.
 */

import { getDb } from "../db";
import { agencyRunTraces } from "../../drizzle/schema";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";
import crypto from "crypto";

interface TracePayload {
  runId: string;
  agencyId: string;
  tenantId: string;
  createdBy?: number | null;
  trace: Record<string, unknown>;
  durationMs?: number | null;
  totalTokens?: number | null;
  totalCost?: number | null;
  status?: string | null;
}

/**
 * Persist a run trace emitted by the Python orchestrator via SSE.
 * Called from agencyStream.ts when a trace_complete event arrives.
 */
export async function persistRunTrace(payload: TracePayload): Promise<void> {
  const db = await getDb();
  if (!db) {
    console.error("[AgencyTraceService] DB unavailable, dropping trace for runId:", payload.runId);
    return;
  }

  const id = crypto.randomUUID();

  await db.insert(agencyRunTraces).values({
    id,
    runId: payload.runId,
    agencyId: payload.agencyId,
    tenantId: payload.tenantId,
    createdBy: payload.createdBy ?? null,
    trace: payload.trace,
    durationMs: payload.durationMs ? Math.round(payload.durationMs) : null,
    totalTokens: payload.totalTokens ?? null,
    totalCost: payload.totalCost != null ? String(payload.totalCost) : null,
    status: payload.status ?? "unknown",
  });
}

/**
 * List run traces for an agency with optional filters.
 */
export async function listRunTraces(opts: {
  agencyId: string;
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{
  traces: Array<{
    id: string;
    runId: string;
    status: string | null;
    durationMs: number | null;
    totalTokens: number | null;
    totalCost: string | null;
    createdAt: Date;
  }>;
  total: number;
}> {
  const db = await getDb();
  if (!db) return { traces: [], total: 0 };

  const limit = Math.min(opts.limit ?? 20, 100);
  const offset = opts.offset ?? 0;

  const conditions = [
    eq(agencyRunTraces.agencyId, opts.agencyId),
    eq(agencyRunTraces.tenantId, opts.tenantId),
  ];

  if (opts.startDate) {
    conditions.push(gte(agencyRunTraces.createdAt, opts.startDate));
  }
  if (opts.endDate) {
    conditions.push(lte(agencyRunTraces.createdAt, opts.endDate));
  }
  if (opts.status) {
    conditions.push(eq(agencyRunTraces.status, opts.status));
  }

  const whereClause = and(...conditions);

  const [traces, countResult] = await Promise.all([
    db
      .select({
        id: agencyRunTraces.id,
        runId: agencyRunTraces.runId,
        status: agencyRunTraces.status,
        durationMs: agencyRunTraces.durationMs,
        totalTokens: agencyRunTraces.totalTokens,
        totalCost: agencyRunTraces.totalCost,
        createdAt: agencyRunTraces.createdAt,
      })
      .from(agencyRunTraces)
      .where(whereClause)
      .orderBy(desc(agencyRunTraces.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(agencyRunTraces)
      .where(whereClause),
  ]);

  return {
    traces,
    total: countResult[0]?.count ?? 0,
  };
}

/**
 * Get a single run trace with full JSONB trace data.
 * Enforces tenant isolation.
 */
export async function getRunTrace(
  traceId: string,
  tenantId: string,
): Promise<typeof agencyRunTraces.$inferSelect | null> {
  const db = await getDb();
  if (!db) return null;

  const [row] = await db
    .select()
    .from(agencyRunTraces)
    .where(
      and(
        eq(agencyRunTraces.id, traceId),
        eq(agencyRunTraces.tenantId, tenantId),
      ),
    )
    .limit(1);

  return row ?? null;
}

/**
 * Delete traces older than the given retention days for a specific tenant.
 * Returns count of deleted rows.
 */
export async function sweepExpiredTraces(
  tenantId: string,
  retentionDays: number,
): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);

  let totalDeleted = 0;
  const BATCH_SIZE = 1000;

  // Batched delete using CTE (PostgreSQL doesn't support LIMIT on DELETE)
  while (true) {
    const result = await db.execute(
      sql`WITH batch AS (
            SELECT id FROM agency_run_traces
            WHERE "tenantId" = ${tenantId}
              AND "createdAt" < ${cutoff}
            LIMIT ${BATCH_SIZE}
          )
          DELETE FROM agency_run_traces
          WHERE id IN (SELECT id FROM batch)`,
    );
    // drizzle returns rowCount on the result
    const deleted = (result as any).rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < BATCH_SIZE) break;
  }

  return totalDeleted;
}
