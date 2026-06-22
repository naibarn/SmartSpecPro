import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createAgentEventId,
  type AgentExperienceDroppedEvent,
  type AgentExperienceParseResult,
  type AgentExperienceRedaction,
  type AgentExperienceSurface,
  type AgentExperienceVisibility,
  type SmartSpecAgentEvent,
  type SmartSpecAgentEventPayload,
  type SmartSpecAgentEventType,
} from "../events";
import { validateSmartSpecAgentEvent } from "../schemas";

export interface RunStreamLikeEvent {
  eventId: string;
  eventType: string;
  tenantId: string;
  teamId: string;
  roomId: string;
  runId: string;
  ts: string;
  actorType: "user" | "assistant" | "system" | "tool" | "agent";
  actorId: string;
  visibility: "transparent" | "milestone" | "summary_only" | "private_internal" | "debug_only";
  data: Record<string, unknown>;
}

export interface RunStreamAdapterOptions {
  surface?: AgentExperienceSurface;
  includeDebugEvents?: boolean;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function visibilityOf(event: RunStreamLikeEvent): AgentExperienceVisibility {
  if (event.visibility === "private_internal") return "private_internal";
  if (event.visibility === "debug_only") return "debug_only";
  if (event.visibility === "summary_only") return "tenant";
  return "tenant";
}

function redactionOf(event: RunStreamLikeEvent): AgentExperienceRedaction {
  if (event.visibility === "summary_only") return "summary";
  if (event.visibility === "private_internal" || event.visibility === "debug_only") return "metadata_only";
  return "summary";
}

function drop(event: RunStreamLikeEvent, reason: AgentExperienceDroppedEvent["reason"], message: string): AgentExperienceDroppedEvent {
  return {
    reason,
    source: "team",
    sourceEventId: event.eventId,
    eventType: event.eventType,
    message,
  };
}

function mapRunEvent(event: RunStreamLikeEvent): {
  type: SmartSpecAgentEventType;
  payload: SmartSpecAgentEventPayload;
} | null {
  const type = event.eventType.toLowerCase();
  const data = event.data;

  if (type.includes("message_delta") || type.includes("token")) {
    return { type: "message.delta", payload: { kind: "message", message: { delta: stringValue(data.delta) ?? stringValue(data.text) ?? "" } } };
  }
  if (type.includes("message_done") || type.includes("message_completed")) {
    return { type: "message.done", payload: { kind: "message", message: { text: stringValue(data.text), role: "assistant" } } };
  }
  if (type.includes("tool_start")) {
    return { type: "tool.start", payload: { kind: "tool", tool: { toolCallId: stringValue(data.toolCallId), toolName: stringValue(data.toolName), status: "started" } } };
  }
  if (type.includes("tool_progress")) {
    return { type: "tool.progress", payload: { kind: "tool", tool: { toolCallId: stringValue(data.toolCallId), status: "in_progress", summary: stringValue(data.message) } } };
  }
  if (type.includes("tool_error")) {
    return { type: "tool.error", payload: { kind: "tool", tool: { toolCallId: stringValue(data.toolCallId), status: "failed", summary: stringValue(data.message) } } };
  }
  if (type.includes("tool_done") || type.includes("tool_result")) {
    return { type: "tool.done", payload: { kind: "tool", tool: { toolCallId: stringValue(data.toolCallId), status: "completed", summary: stringValue(data.result) } } };
  }
  if (type.includes("approval")) {
    return {
      type: "approval.request",
      payload: { kind: "approval", approval: { approvalId: stringValue(data.approvalId) ?? event.eventId, status: "pending", risk: stringValue(data.risk) } },
    };
  }
  if (type.includes("artifact")) {
    return {
      type: "artifact.created",
      payload: { kind: "artifact", artifact: { artifactId: stringValue(data.artifactId) ?? event.eventId, format: "unknown", title: stringValue(data.title) } },
    };
  }
  if (type.includes("stage") || type.includes("step") || type.includes("workflow") || type.startsWith("history:")) {
    return {
      type: "workflow.step",
      payload: { kind: "workflow", workflow: { stepId: stringValue(data.stepId), label: stringValue(data.label) ?? event.eventType, status: "in_progress" } },
    };
  }
  return null;
}

function buildEvent(
  event: RunStreamLikeEvent,
  mapped: NonNullable<ReturnType<typeof mapRunEvent>>,
  options: RunStreamAdapterOptions,
): SmartSpecAgentEvent {
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: createAgentEventId("team", event.eventId),
    type: mapped.type,
    source: "team",
    surface: options.surface ?? "team_room",
    visibility: visibilityOf(event),
    redaction: redactionOf(event),
    timestamp: event.ts,
    sourceEventId: event.eventId,
    tenantId: event.tenantId,
    teamId: event.teamId,
    roomId: event.roomId,
    runId: event.runId,
    actorType: event.actorType,
    actorId: event.actorId,
    payload: mapped.payload,
  };
}

export function runStreamToAgentEvents(
  events: RunStreamLikeEvent[],
  options: RunStreamAdapterOptions = {},
): AgentExperienceParseResult {
  return events.reduce<AgentExperienceParseResult>((acc, event) => {
    if (event.visibility === "private_internal" && options.includeDebugEvents !== true) {
      acc.dropped.push(drop(event, "private_internal", "Private/internal Team event hidden from normal renderer output"));
      return acc;
    }

    const mapped = mapRunEvent(event);
    if (!mapped) {
      if (options.includeDebugEvents) {
        const debugEvent: SmartSpecAgentEvent = {
          schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
          id: createAgentEventId("team-debug", event.eventId),
          type: "debug.trace",
          source: "team",
          surface: options.surface ?? "team_room",
          visibility: "debug_only",
          redaction: "metadata_only",
          timestamp: event.ts,
          sourceEventId: event.eventId,
          tenantId: event.tenantId,
          teamId: event.teamId,
          roomId: event.roomId,
          runId: event.runId,
          actorType: event.actorType,
          actorId: event.actorId,
          payload: { kind: "debug", debug: { reason: "unknown_event", fields: { eventType: event.eventType } } },
        };
        const validated = validateSmartSpecAgentEvent(debugEvent);
        acc.events.push(...validated.events);
        acc.dropped.push(...validated.dropped);
      } else {
        acc.dropped.push(drop(event, "unsupported_event", "Unknown Team run event"));
      }
      return acc;
    }

    const validated = validateSmartSpecAgentEvent(buildEvent(event, mapped, options));
    acc.events.push(...validated.events);
    acc.dropped.push(...validated.dropped);
    return acc;
  }, { events: [], dropped: [] });
}
