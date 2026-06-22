import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  type AgentExperienceDroppedEvent,
  type AgentExperienceDroppedReason,
  type AgentExperienceEventSource,
  type AgentExperienceParseResult,
  type AgentExperienceRedaction,
  type AgentExperienceSurface,
  type AgentExperienceVisibility,
  type SmartSpecAgentEvent,
  type SmartSpecAgentEventType,
} from "./events";

const EVENT_TYPES = new Set<SmartSpecAgentEventType>([
  "session.started",
  "message.delta",
  "message.done",
  "tool.start",
  "tool.progress",
  "tool.done",
  "tool.error",
  "approval.request",
  "approval.decision",
  "artifact.created",
  "artifact.updated",
  "workflow.step",
  "cost.estimate",
  "cost.finalized",
  "debug.trace",
  "error",
]);

const SOURCES = new Set<AgentExperienceEventSource>([
  "agency",
  "team",
  "chat",
  "artifact",
  "approval",
  "cost",
  "debug",
  "fixture",
]);

const SURFACES = new Set<AgentExperienceSurface>([
  "agency_chat",
  "team_room",
  "direct_chat",
  "artifact_panel",
  "admin_debug",
  "fixture_preview",
  "unknown",
]);

const VISIBILITIES = new Set<AgentExperienceVisibility>([
  "public",
  "tenant",
  "private_internal",
  "debug_only",
]);

const REDACTIONS = new Set<AgentExperienceRedaction>([
  "none",
  "summary",
  "metadata_only",
  "redacted",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function drop(
  reason: AgentExperienceDroppedReason,
  message: string,
  input?: Record<string, unknown>,
): AgentExperienceDroppedEvent {
  return {
    reason,
    message,
    source: typeof input?.source === "string" && SOURCES.has(input.source as AgentExperienceEventSource)
      ? input.source as AgentExperienceEventSource
      : undefined,
    sourceEventId: typeof input?.sourceEventId === "string" ? input.sourceEventId : undefined,
    eventType: typeof input?.type === "string" ? input.type : undefined,
  };
}

export function validateSmartSpecAgentEvent(input: unknown): AgentExperienceParseResult {
  if (!isRecord(input)) {
    return { events: [], dropped: [drop("malformed", "Event must be an object")] };
  }

  if (input.schemaVersion !== AGENT_EXPERIENCE_SCHEMA_VERSION) {
    return { events: [], dropped: [drop("unsupported_schema", "Unsupported Agent Experience schema version", input)] };
  }

  if (typeof input.id !== "string" || input.id.trim().length === 0) {
    return { events: [], dropped: [drop("malformed", "Event id is required", input)] };
  }

  if (typeof input.type !== "string" || !EVENT_TYPES.has(input.type as SmartSpecAgentEventType)) {
    return { events: [], dropped: [drop("unsupported_event", "Unsupported Agent Experience event type", input)] };
  }

  if (typeof input.source !== "string" || !SOURCES.has(input.source as AgentExperienceEventSource)) {
    return { events: [], dropped: [drop("unsupported_event", "Unsupported Agent Experience source", input)] };
  }

  if (typeof input.surface !== "string" || !SURFACES.has(input.surface as AgentExperienceSurface)) {
    return { events: [], dropped: [drop("unsupported_event", "Unsupported Agent Experience surface", input)] };
  }

  if (typeof input.visibility !== "string" || !VISIBILITIES.has(input.visibility as AgentExperienceVisibility)) {
    return { events: [], dropped: [drop("unauthorized_visibility", "Unsupported Agent Experience visibility", input)] };
  }

  if (typeof input.redaction !== "string" || !REDACTIONS.has(input.redaction as AgentExperienceRedaction)) {
    return { events: [], dropped: [drop("malformed", "Unsupported Agent Experience redaction value", input)] };
  }

  if (typeof input.timestamp !== "string" || Number.isNaN(Date.parse(input.timestamp))) {
    return { events: [], dropped: [drop("malformed", "Valid event timestamp is required", input)] };
  }

  if (
    input.visibility !== "public"
    && (typeof input.tenantId !== "string" || input.tenantId.trim().length === 0)
  ) {
    return { events: [], dropped: [drop("missing_identity", "Tenant identity is required for non-public events", input)] };
  }

  if (!isRecord(input.payload) || typeof input.payload.kind !== "string") {
    return { events: [], dropped: [drop("malformed", "Event payload kind is required", input)] };
  }

  return { events: [input as unknown as SmartSpecAgentEvent], dropped: [] };
}

export function validateSmartSpecAgentEvents(inputs: unknown[]): AgentExperienceParseResult {
  return inputs.reduce<AgentExperienceParseResult>(
    (acc, input) => {
      const result = validateSmartSpecAgentEvent(input);
      acc.events.push(...result.events);
      acc.dropped.push(...result.dropped);
      return acc;
    },
    { events: [], dropped: [] },
  );
}
