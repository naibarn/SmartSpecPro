import type { AgentExperienceDroppedEvent, SmartSpecAgentEvent } from "./events";

export interface AgentExperienceRedactionOptions {
  debugAllowed?: boolean;
  maxMetadataValueLength?: number;
}

export interface AgentExperienceRenderFilterResult {
  events: SmartSpecAgentEvent[];
  dropped: AgentExperienceDroppedEvent[];
}

const SECRET_PATTERNS = [
  /sk-[a-z0-9_-]{12,}/i,
  /oauth[_-]?token/i,
  /x-amz-signature/i,
  /api[_-]?key/i,
  /mcp[_-]?session/i,
  /r2:\/\/|s3:\/\//i,
];

function redactText(value: string, maxLength: number): string {
  if (SECRET_PATTERNS.some((pattern) => pattern.test(value))) return "[redacted]";
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function sanitizeDebugEvent(event: SmartSpecAgentEvent, maxLength: number): SmartSpecAgentEvent {
  if (event.payload.kind !== "debug") return event;
  const fields = event.payload.debug.fields ?? {};
  const sanitizedFields = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [
      key,
      typeof value === "string" ? redactText(value, maxLength) : value,
    ]),
  );

  return {
    ...event,
    redaction: "metadata_only",
    payload: {
      kind: "debug",
      debug: {
        reason: event.payload.debug.reason,
        fields: sanitizedFields,
      },
    },
  };
}

export function filterAgentExperienceEventsForRenderer(
  events: SmartSpecAgentEvent[],
  options: AgentExperienceRedactionOptions = {},
): AgentExperienceRenderFilterResult {
  const maxLength = options.maxMetadataValueLength ?? 120;
  const result: AgentExperienceRenderFilterResult = { events: [], dropped: [] };

  for (const event of events) {
    if (event.visibility === "private_internal") {
      result.dropped.push({
        reason: "private_internal",
        source: event.source,
        sourceEventId: event.sourceEventId,
        eventType: event.type,
        message: "Private/internal event hidden from renderer",
      });
      continue;
    }

    if (event.visibility === "debug_only" && options.debugAllowed !== true) {
      result.dropped.push({
        reason: "unauthorized_visibility",
        source: event.source,
        sourceEventId: event.sourceEventId,
        eventType: event.type,
        message: "Debug event hidden without permission",
      });
      continue;
    }

    result.events.push(sanitizeDebugEvent(event, maxLength));
  }

  return result;
}

export function assertNoSensitiveDebugValue(value: unknown): boolean {
  if (typeof value === "string") return !SECRET_PATTERNS.some((pattern) => pattern.test(value));
  if (Array.isArray(value)) return value.every(assertNoSensitiveDebugValue);
  if (typeof value === "object" && value !== null) {
    return Object.values(value).every(assertNoSensitiveDebugValue);
  }
  return true;
}
