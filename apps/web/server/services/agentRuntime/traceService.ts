import type { AgentRuntimeTraceEvent } from "../../../shared/agentRuntime/runtimeEvents";
import { AgentRuntimeTraceEventSchema } from "../../../shared/agentRuntime/runtimeEvents";
import type { AgentRuntimeSurface } from "../../../shared/agentRuntime/types";

export interface RuntimeTracePersistenceRecord {
  tenantId: string;
  runId: string | null;
  roomId: string | null;
  surface: AgentRuntimeSurface;
  eventId: string;
  requestId: string;
  idempotencyKey: string;
  traceId: string | null;
  stepId: string | null;
  stepKey: string | null;
  attemptId: string | null;
  sequence: number;
  eventName: string;
  sourceComponent: string;
  sdkVersion: string;
  adapterVersion: string;
  redactedPayload: Record<string, unknown>;
}

export interface TeamTraceProjectionRecord {
  tenantId: string;
  runId: string;
  roomId: string;
  eventId: string;
  stepKey: string | null;
  attemptId: string | null;
  traceId: string | null;
  sequence: number;
  eventName: string;
  redactedPayload: Record<string, unknown>;
}

export interface AgentRuntimeTraceRepository {
  upsertRuntimeTrace(record: RuntimeTracePersistenceRecord): Promise<void>;
  upsertTeamTraceEvent?(record: TeamTraceProjectionRecord): Promise<void>;
}

export interface PersistAgentRuntimeTraceEventsInput {
  tenantId: string;
  runId?: string | null;
  roomId?: string | null;
  surface: AgentRuntimeSurface;
  events: AgentRuntimeTraceEvent[];
  repository: AgentRuntimeTraceRepository;
}

export interface PersistAgentRuntimeTraceEventsResult {
  persisted: number;
  duplicatesSkipped: number;
}

const TRACE_REDACTED_KEY_PATTERN =
  /(authorization|cookie|token|api[-_]?key|secret|signature|provider[_-]?api[_-]?key)/i;

function redactTracePayloadValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(item => redactTracePayloadValue(item));
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (TRACE_REDACTED_KEY_PATTERN.test(key)) {
        output[key] = "[REDACTED]";
      } else {
        output[key] = redactTracePayloadValue(nested);
      }
    }
    return output;
  }
  if (typeof value === "string") {
    return value
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [REDACTED]")
      .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]+\b/g, "[REDACTED]");
  }
  return value;
}

export function redactTracePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return redactTracePayloadValue(payload) as Record<string, unknown>;
}

export function dedupeTraceEvents(
  events: AgentRuntimeTraceEvent[],
): AgentRuntimeTraceEvent[] {
  const seen = new Set<string>();
  const deduped: AgentRuntimeTraceEvent[] = [];
  for (const event of events) {
    const key = `${event.eventId}:${event.sequence}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(event);
  }
  return deduped;
}

export async function persistAgentRuntimeTraceEvents(
  input: PersistAgentRuntimeTraceEventsInput,
): Promise<PersistAgentRuntimeTraceEventsResult> {
  const uniqueEvents = dedupeTraceEvents(
    input.events.map(event => AgentRuntimeTraceEventSchema.parse(event)),
  );
  const duplicatesSkipped = input.events.length - uniqueEvents.length;

  for (const event of uniqueEvents) {
    await input.repository.upsertRuntimeTrace({
      tenantId: input.tenantId,
      runId: input.runId ?? null,
      roomId: input.roomId ?? null,
      surface: input.surface,
      eventId: event.eventId,
      requestId: event.requestId,
      idempotencyKey: event.idempotencyKey,
      traceId: event.traceId ?? null,
      stepId: event.stepId ?? null,
      stepKey: event.stepKey ?? null,
      attemptId: event.attemptId ?? null,
      sequence: event.sequence,
      eventName: event.eventName,
      sourceComponent: event.sourceComponent,
      sdkVersion: event.sdkVersion,
      adapterVersion: event.adapterVersion,
      redactedPayload: redactTracePayload(event.redactedPayload),
    });

    if (input.surface === "team" && input.runId && input.roomId) {
      await input.repository.upsertTeamTraceEvent?.({
        tenantId: input.tenantId,
        runId: input.runId,
        roomId: input.roomId,
        eventId: event.eventId,
        stepKey: event.stepKey ?? null,
        attemptId: event.attemptId ?? null,
        traceId: event.traceId ?? null,
        sequence: event.sequence,
        eventName: event.eventName,
        redactedPayload: redactTracePayload(event.redactedPayload),
      });
    }
  }

  return {
    persisted: uniqueEvents.length,
    duplicatesSkipped,
  };
}
