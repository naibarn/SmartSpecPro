import type { AgentRuntimeTraceEvent } from "../../../shared/agentRuntime/runtimeEvents";
import { AgentRuntimeTraceEventSchema } from "../../../shared/agentRuntime/runtimeEvents";
import type { AgentRuntimeSurface } from "../../../shared/agentRuntime/types";
import { redactRuntimeMetadata } from "./redaction";

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
  severity: "info" | "warn" | "error";
  summary: string;
  redactedPayload: Record<string, unknown>;
}

function toTaskControlMilestone(eventName: string): {
  eventName: string;
  severity: TeamTraceProjectionRecord["severity"];
  summary: string;
} | null {
  switch (eventName) {
    case "response.completed":
      return {
        eventName: "task.step_completed",
        severity: "info",
        summary: "Task step completed.",
      };
    case "response.failed":
      return {
        eventName: "task.step_failed",
        severity: "error",
        summary: "Task step needs recovery.",
      };
    case "runtime.cancelled":
      return {
        eventName: "task.step_cancelled",
        severity: "warn",
        summary: "Task step was cancelled.",
      };
    default:
      return null;
  }
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

export function redactTracePayload(
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return redactRuntimeMetadata(payload);
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

    const milestone = toTaskControlMilestone(event.eventName);
    if (input.surface === "team" && input.runId && input.roomId && milestone) {
      await input.repository.upsertTeamTraceEvent?.({
        tenantId: input.tenantId,
        runId: input.runId,
        roomId: input.roomId,
        eventId: event.eventId,
        stepKey: event.stepKey ?? null,
        attemptId: event.attemptId ?? null,
        traceId: event.traceId ?? null,
        sequence: event.sequence,
        eventName: milestone.eventName,
        severity: milestone.severity,
        summary: milestone.summary,
        redactedPayload: redactTracePayload(event.redactedPayload),
      });
    }
  }

  return {
    persisted: uniqueEvents.length,
    duplicatesSkipped,
  };
}
