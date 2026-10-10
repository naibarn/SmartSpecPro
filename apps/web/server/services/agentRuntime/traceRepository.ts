import { createHash } from "node:crypto";

import { agentRuntimeTraces } from "../../../drizzle/schema";
import { getDb } from "../../db";
import { emitAutoTeamTraceEvent } from "../autoTeamTraceEventService";
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
    await emitAutoTeamTraceEvent({
      tenantId: record.tenantId,
      roomId: record.roomId,
      runId: record.runId,
      traceEventId: record.eventId.slice(0, 120),
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
      idempotencyKey: `agent-runtime:${record.runId}:${record.eventId}`.slice(
        0,
        255,
      ),
    });
  },
};
