import crypto from "crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  autoTeamTraceEvents,
  type AutoTeamTraceEventRow,
  type InsertAutoTeamTraceEventRow,
} from "../../drizzle/schema";
import type { AutoTeamRouteClass } from "../../shared/autoTeamExecution";

export interface AutoTeamTraceEventInput {
  tenantId: string;
  teamId?: string | null;
  roomId?: string | null;
  runId: string;
  stageId?: string | null;
  workItemId?: string | null;
  routeClass?: AutoTeamRouteClass | null;
  traceEventId?: string | null;
  eventName: string;
  sourceComponent: string;
  severity?: "debug" | "info" | "warn" | "error";
  summary?: string | null;
  redactedMetadataJson?: Record<string, unknown> | null;
  idempotencyKey?: string | null;
}

function now(): Date {
  return new Date();
}

function buildEventIdempotencyKey(input: AutoTeamTraceEventInput): string {
  return (
    input.idempotencyKey ??
    crypto
      .createHash("sha256")
      .update(
        [
          input.tenantId,
          input.runId,
          input.stageId ?? "",
          input.workItemId ?? "",
          input.traceEventId ?? "",
          input.eventName,
          input.sourceComponent,
          input.summary ?? "",
        ].join("|"),
      )
      .digest("hex")
  );
}

export async function emitAutoTeamTraceEvent(
  input: AutoTeamTraceEventInput,
): Promise<AutoTeamTraceEventRow> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const idempotencyKey = buildEventIdempotencyKey(input);
  return db.transaction(async tx => {
    // All Task Control trace writers share this per-run lock so retries cannot
    // allocate the same sequence or race the unique idempotency constraint.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`auto-team-trace:${input.tenantId}:${input.runId}`}, 0))`);
    const existing = await tx
      .select()
      .from(autoTeamTraceEvents)
      .where(
        and(
          eq(autoTeamTraceEvents.tenantId, input.tenantId),
          eq(autoTeamTraceEvents.runId, input.runId),
          eq(autoTeamTraceEvents.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    if (existing[0]) return existing[0];

    const [last] = await tx
      .select({ sequence: autoTeamTraceEvents.sequence })
      .from(autoTeamTraceEvents)
      .where(
        and(
          eq(autoTeamTraceEvents.tenantId, input.tenantId),
          eq(autoTeamTraceEvents.runId, input.runId),
        ),
      )
      .orderBy(desc(autoTeamTraceEvents.sequence))
      .limit(1);

    const nextSequence = (last?.sequence ?? 0) + 1;
    const traceEventId =
      input.traceEventId ??
      `${input.eventName}:${input.runId}:${nextSequence}:${Date.now()}`;

    const payload: InsertAutoTeamTraceEventRow = {
      tenantId: input.tenantId,
      teamId: input.teamId ?? null,
      roomId: input.roomId ?? null,
      runId: input.runId,
      stageId: input.stageId ?? null,
      workItemId: input.workItemId ?? null,
      traceEventId,
      sequence: nextSequence,
      eventName: input.eventName,
      sourceComponent: input.sourceComponent,
      severity: input.severity ?? "info",
      summary: input.summary ?? null,
      redactedMetadataJson: input.redactedMetadataJson ?? {},
      idempotencyKey,
      createdAt: now(),
    };

    const [inserted] = await tx.insert(autoTeamTraceEvents).values(payload).returning();
    return inserted;
  });
}

export async function listAutoTeamTraceEvents(
  tenantId: string,
  runId: string,
  limit = 25,
): Promise<AutoTeamTraceEventRow[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db
    .select()
    .from(autoTeamTraceEvents)
    .where(and(eq(autoTeamTraceEvents.tenantId, tenantId), eq(autoTeamTraceEvents.runId, runId)))
    .orderBy(desc(autoTeamTraceEvents.sequence))
    .limit(limit);
}
