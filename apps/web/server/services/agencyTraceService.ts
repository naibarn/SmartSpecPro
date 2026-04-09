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

const TRACE_SECRET_PATTERNS = [
  /sk-[a-zA-Z0-9]{20,}/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
  /Authorization:\s*\S+(?:\s+\S+)?/gi,
  /postgresql:\/\/[^\s]+/gi,
];

function scrubTraceString(value: string): string {
  return TRACE_SECRET_PATTERNS.reduce(
    (current, pattern) => current.replace(pattern, "[REDACTED]"),
    value,
  );
}

function scrubTraceValue(value: unknown): unknown {
  if (typeof value === "string") {
    return scrubTraceString(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubTraceValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entryValue]) => [
        key,
        scrubTraceValue(entryValue),
      ]),
    );
  }
  return value;
}

function inferHybridSummary(trace: Record<string, unknown>): Record<string, unknown> | null {
  const spans = Array.isArray(trace.spans) ? trace.spans : [];
  const engines = new Set<string>();
  const subgraphIds = new Set<string>();
  const bridgeIds = new Set<string>();
  let boundaryCount = 0;

  for (const span of spans) {
    if (!span || typeof span !== "object") continue;
    const typedSpan = span as Record<string, unknown>;
    const metadata = (typedSpan.metadata && typeof typedSpan.metadata === "object")
      ? typedSpan.metadata as Record<string, unknown>
      : {};
    if (typeof metadata.engine === "string" && metadata.engine.length > 0) {
      engines.add(metadata.engine);
    }
    if (typeof metadata.subgraphId === "string" && metadata.subgraphId.length > 0) {
      subgraphIds.add(metadata.subgraphId);
    }
    if (
      typedSpan.type === "bridge"
      || metadata.phase === "bridge"
      || metadata.boundaryTransition === true
    ) {
      boundaryCount += 1;
      bridgeIds.add(
        typeof metadata.bridgeId === "string" && metadata.bridgeId.length > 0
          ? metadata.bridgeId
          : String(typedSpan.spanId ?? `bridge_${boundaryCount}`),
      );
    }
  }

  if (engines.size === 0 && subgraphIds.size === 0 && boundaryCount === 0 && bridgeIds.size === 0) {
    return null;
  }

  return {
    engineMix: [...engines],
    subgraphIds: [...subgraphIds],
    subgraphCount: subgraphIds.size,
    boundaryCount,
    bridgeCount: bridgeIds.size,
  };
}

export function normalizeTraceForPersistence(
  trace: Record<string, unknown>,
): Record<string, unknown> {
  const scrubbed = scrubTraceValue(trace) as Record<string, unknown>;
  if (scrubbed.hybridSummary) {
    return scrubbed;
  }

  const inferredHybridSummary = inferHybridSummary(scrubbed);
  if (!inferredHybridSummary) {
    return scrubbed;
  }

  return {
    ...scrubbed,
    hybridSummary: inferredHybridSummary,
  };
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
    trace: normalizeTraceForPersistence(payload.trace),
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
    hybridSummary: Record<string, unknown> | null;
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
        trace: agencyRunTraces.trace,
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
    traces: traces.map((trace) => ({
      id: trace.id,
      runId: trace.runId,
      status: trace.status,
      durationMs: trace.durationMs,
      totalTokens: trace.totalTokens,
      totalCost: trace.totalCost,
      createdAt: trace.createdAt,
      hybridSummary:
        trace.trace && typeof trace.trace === "object"
          ? ((trace.trace as Record<string, unknown>).hybridSummary as Record<string, unknown> | null) ?? null
          : null,
    })),
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
