import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createAgentEventId,
  type AgentExperienceDroppedEvent,
  type AgentExperienceParseResult,
  type AgentExperienceSurface,
  type AgentExperienceVisibility,
  type SmartSpecAgentEvent,
  type SmartSpecAgentEventPayload,
  type SmartSpecAgentEventType,
} from "../events";
import { validateSmartSpecAgentEvent } from "../schemas";

export interface AgencyStreamLikeEvent {
  event?: string;
  id?: string | number;
  ts?: string;
  data?: Record<string, unknown>;
}

export interface AgencyStreamAdapterContext {
  tenantId: string;
  userId?: string;
  conversationId?: string;
  runId?: string;
  surface?: AgentExperienceSurface;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isoTimestamp(value: unknown): string {
  const text = stringValue(value);
  return text && !Number.isNaN(Date.parse(text)) ? text : new Date(0).toISOString();
}

function drop(event: AgencyStreamLikeEvent, message: string): AgentExperienceDroppedEvent {
  return {
    reason: "unsupported_event",
    source: "agency",
    sourceEventId: event.id == null ? undefined : String(event.id),
    eventType: event.event,
    message,
  };
}

function eventPayload(eventName: string, data: Record<string, unknown>): {
  type: SmartSpecAgentEventType;
  payload: SmartSpecAgentEventPayload;
  visibility?: AgentExperienceVisibility;
} | null {
  switch (eventName) {
    case "meta":
    case "run_started":
      return {
        type: "session.started",
        payload: { kind: "workflow", workflow: { status: "started", label: "Run started" } },
      };
    case "text_delta":
    case "token":
      return {
        type: "message.delta",
        payload: { kind: "message", message: { delta: stringValue(data.delta) ?? stringValue(data.token) ?? "" } },
      };
    case "message_done":
    case "assistant_done":
      return {
        type: "message.done",
        payload: { kind: "message", message: { text: stringValue(data.text), role: "assistant" } },
      };
    case "tool_start":
    case "tool_call":
      return {
        type: "tool.start",
        payload: {
          kind: "tool",
          tool: {
            toolCallId: stringValue(data.toolCallId),
            toolName: stringValue(data.toolName),
            status: "started",
            summary: stringValue(data.message),
          },
        },
      };
    case "tool_progress":
      return {
        type: "tool.progress",
        payload: {
          kind: "tool",
          tool: {
            toolCallId: stringValue(data.toolCallId),
            status: "in_progress",
            summary: stringValue(data.message) ?? stringValue(data.status),
          },
        },
      };
    case "tool_end":
    case "tool_result": {
      const isError = data.status === "error" || typeof data.error === "string";
      return {
        type: isError ? "tool.error" : "tool.done",
        payload: {
          kind: "tool",
          tool: {
            toolCallId: stringValue(data.toolCallId),
            status: isError ? "failed" : "completed",
            summary: stringValue(data.result) ?? stringValue(data.message),
            errorCode: stringValue(data.error),
          },
        },
      };
    }
    case "approval_required":
      return {
        type: "approval.request",
        payload: {
          kind: "approval",
          approval: {
            approvalId: stringValue(data.approvalKey) ?? stringValue(data.approvalId) ?? "unknown",
            status: "pending",
            risk: stringValue(data.risk),
          },
        },
      };
    case "preview_ready":
      return {
        type: "artifact.created",
        payload: {
          kind: "artifact",
          artifact: {
            artifactId: stringValue(data.artifactId) ?? stringValue(data.previewId) ?? "unknown",
            title: stringValue(data.title),
            format: "unknown",
            preview: stringValue(data.summary),
          },
        },
      };
    case "run_complete":
    case "run_finished":
      return {
        type: "workflow.step",
        payload: { kind: "workflow", workflow: { status: "completed", label: "Run completed" } },
      };
    case "guardrail_trigger":
      return {
        type: data.action === "blocked" ? "error" : "debug.trace",
        visibility: data.action === "blocked" ? "tenant" : "debug_only",
        payload: {
          kind: "debug",
          debug: {
            reason: stringValue(data.guardrailName) ?? "guardrail_trigger",
            fields: { action: stringValue(data.action) ?? "unknown" },
          },
        },
      };
    case "error":
      return {
        type: "error",
        payload: { kind: "debug", debug: { reason: stringValue(data.code) ?? "error" } },
      };
    default:
      return null;
  }
}

function buildEvent(
  source: AgencyStreamLikeEvent,
  context: AgencyStreamAdapterContext,
  mapped: NonNullable<ReturnType<typeof eventPayload>>,
  index: number,
): SmartSpecAgentEvent {
  const data = source.data ?? {};
  return {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: createAgentEventId("agency", source.id ?? index),
    type: mapped.type,
    source: "agency",
    surface: context.surface ?? "agency_chat",
    visibility: mapped.visibility ?? "tenant",
    redaction: mapped.type === "debug.trace" ? "metadata_only" : "summary",
    timestamp: isoTimestamp(source.ts),
    sourceEventId: source.id == null ? undefined : String(source.id),
    sequence: index,
    tenantId: context.tenantId,
    userId: context.userId,
    actorType: "assistant",
    actorId: stringValue(data.agentName),
    runId: stringValue(data.runId) ?? context.runId,
    conversationId: context.conversationId,
    payload: mapped.payload,
  };
}

export function agencyStreamToAgentEvents(
  events: AgencyStreamLikeEvent[],
  context: AgencyStreamAdapterContext,
): AgentExperienceParseResult {
  return events.reduce<AgentExperienceParseResult>((acc, event, index) => {
    if (!event || typeof event.event !== "string" || typeof event.data !== "object" || event.data === null) {
      acc.dropped.push({ reason: "malformed", source: "agency", message: "Malformed Agency stream event" });
      return acc;
    }

    const mapped = eventPayload(event.event, event.data);
    if (!mapped) {
      acc.dropped.push(drop(event, "Unsupported Agency stream event"));
      return acc;
    }

    const validated = validateSmartSpecAgentEvent(buildEvent(event, context, mapped, index));
    acc.events.push(...validated.events);
    acc.dropped.push(...validated.dropped);
    return acc;
  }, { events: [], dropped: [] });
}
