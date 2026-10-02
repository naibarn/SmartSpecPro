/**
 * Orchestrator event publisher — persists real-time events for PostgreSQL-backed SSE.
 */

import crypto from "crypto";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface RunEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  ts: string;
  actorType: "user" | "assistant" | "system";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal";
  data: Record<string, unknown>;
  userId?: number;
}

export type EventCallback = (event: RunEvent) => void;

// ─── Event Validation ───────────────────────────────────────────────────────

export function validateEvent(event: Partial<RunEvent>): event is RunEvent {
  return !!(event.eventId && event.eventType && event.runId && event.teamId && event.ts);
}

// ─── Publish ────────────────────────────────────────────────────────────────

export async function publishEvent(
  event: RunEvent,
): Promise<void> {
  if (!validateEvent(event)) {
    throw new Error("Invalid event: missing required fields (eventId, eventType, runId, teamId, ts)");
  }

  const categoryByType: Record<string, "status_change" | "communication" | "tool_use" | "memory_op" | "artifact_op" | "handoff" | "approval" | "error"> = {
    status_change: "status_change",
    message: "communication",
    notification: "communication",
    tool_use: "tool_use",
    memory_op: "memory_op",
    artifact_op: "artifact_op",
    handoff: "handoff",
    approval: "approval",
    error: "error",
  };
  const { recordEvent } = await import("./monitoringService");
  await recordEvent({
    eventId: event.eventId,
    tenantId: event.tenantId,
    teamId: event.teamId,
    roomId: event.roomId,
    runId: event.runId,
    assistantId: event.actorId,
    eventType: event.eventType,
    eventCategory: categoryByType[event.eventType] ?? "communication",
    visibility: event.visibility,
    summary: event.eventType,
    detailJson: { realtimeEvent: event },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function createEvent(
  type: string,
  params: {
    tenantId: string;
    teamId: string;
    roomId: string;
    runId: string;
    actorType: RunEvent["actorType"];
    actorId: string;
    visibility?: RunEvent["visibility"];
    data?: Record<string, unknown>;
    userId?: number;
  },
): RunEvent {
  return {
    eventId: crypto.randomUUID(),
    eventType: type,
    tenantId: params.tenantId,
    teamId: params.teamId,
    roomId: params.roomId,
    runId: params.runId,
    ts: new Date().toISOString(),
    actorType: params.actorType,
    actorId: params.actorId,
    visibility: params.visibility ?? "transparent",
    data: params.data ?? {},
    userId: params.userId,
  };
}
