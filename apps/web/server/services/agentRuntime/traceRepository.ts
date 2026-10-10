import { and, desc, eq, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import {
  agentRuntimeTraces,
  autoTeamTraceEvents,
} from "../../../drizzle/schema";
import { getDb } from "../../db";
import type {
  AgentRuntimeTraceRepository,
  RuntimeTracePersistenceRecord,
  TeamTraceProjectionRecord,
} from "./traceService";

/** Persistence adapter for the existing generic runtime trace archive. */
export const agentRuntimeTraceRepository: AgentRuntimeTraceRepository = {
  async upsertRuntimeTrace(record: RuntimeTracePersistenceRecord): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    await db.insert(agentRuntimeTraces).values({
      tenantId: record.tenantId,
      surface: record.surface,
      roomId: record.roomId,
      // Runtime sequence numbers are request scoped. Keep runId null here so
      // independent requests cannot collide on the archive's run/sequence key.
      runId: null,
      traceId: record.traceId ?? record.requestId,
      eventId: record.eventId,
      sequence: record.sequence,
      eventName: record.eventName,
      sourceComponent: record.sourceComponent,
      summary: record.eventName.slice(0, 500),
      redactedMetadataJson: record.redactedPayload,
      runtimeSdkVersion: record.sdkVersion,
      runtimeAdapterVersion: record.adapterVersion,
      idempotencyKey: createHash("sha256")
        .update(`${record.surface}:${record.requestId}:${record.idempotencyKey}`)
        .digest("hex"),
    }).onConflictDoNothing({
      target: [agentRuntimeTraces.tenantId, agentRuntimeTraces.idempotencyKey],
    });
  },

  async upsertTeamTraceEvent(record: TeamTraceProjectionRecord): Promise<void> {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const idempotencyKey = createHash("sha256")
      .update(`agent-runtime:${record.runId}:${record.eventId}`)
      .digest("hex");

    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`auto-team-trace:${record.tenantId}:${record.runId}`}, 0))`);
      const [existing] = await tx
        .select({ id: autoTeamTraceEvents.id })
        .from(autoTeamTraceEvents)
        .where(and(
          eq(autoTeamTraceEvents.tenantId, record.tenantId),
          eq(autoTeamTraceEvents.runId, record.runId),
          eq(autoTeamTraceEvents.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (existing) return;

      const [last] = await tx
        .select({ sequence: autoTeamTraceEvents.sequence })
        .from(autoTeamTraceEvents)
        .where(and(
          eq(autoTeamTraceEvents.tenantId, record.tenantId),
          eq(autoTeamTraceEvents.runId, record.runId),
        ))
        .orderBy(desc(autoTeamTraceEvents.sequence))
        .limit(1);

      await tx.insert(autoTeamTraceEvents).values({
        tenantId: record.tenantId,
        roomId: record.roomId,
        runId: record.runId,
        traceEventId: record.eventId.slice(0, 120),
        sequence: (last?.sequence ?? 0) + 1,
        eventName: record.eventName.slice(0, 160),
        sourceComponent: "agent_runtime",
        severity: "info",
        summary: record.eventName.slice(0, 500),
        // Task Control receives only bounded identifiers. Runtime payloads can
        // contain model or user content and remain in the redacted archive only.
        redactedMetadataJson: {
          eventId: record.eventId.slice(0, 255),
          traceId: record.traceId?.slice(0, 255) ?? null,
          stepKey: record.stepKey?.slice(0, 180) ?? null,
          attemptId: record.attemptId?.slice(0, 120) ?? null,
        },
        idempotencyKey,
      }).onConflictDoNothing();
    });
  },
};
