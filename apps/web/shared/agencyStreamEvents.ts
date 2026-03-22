/**
 * Agency SSE Stream Event Types — shared between Node.js backend and React frontend.
 *
 * The Python orchestrator emits events to Redis pub/sub. The Node.js SSE route
 * proxies them to the client. The frontend hook consumes and parses them.
 */

// ── Event payload types ──────────────────────────────────────────────────────

export interface AgencyMetaEvent {
  event: "meta";
  id: string;
  ts: string;
  data: { runId: string; agencyId: string };
}

export interface AgencyTextDeltaEvent {
  event: "text_delta";
  id: string;
  ts: string;
  data: { agentName: string; delta: string };
}

export interface AgencyToolStartEvent {
  event: "tool_start";
  id: string;
  ts: string;
  data: { agentName: string; toolName: string; toolCallId: string };
}

export interface AgencyToolProgressEvent {
  event: "tool_progress";
  id: string;
  ts: string;
  data: { toolCallId: string; status: string; message: string };
}

export interface AgencyToolEndEvent {
  event: "tool_end";
  id: string;
  ts: string;
  data: { toolCallId: string; status: "success" | "error"; result?: string };
}

export interface AgencyAgentSwitchEvent {
  event: "agent_switch";
  id: string;
  ts: string;
  data: { from: string; to: string; reason?: string };
}

export interface AgencyGuardrailTriggerEvent {
  event: "guardrail_trigger";
  id: string;
  ts: string;
  data: {
    type: "input" | "output";
    guardrailName: string;
    action: string;
  };
}

export interface AgencyApprovalRequiredEvent {
  event: "approval_required";
  id: string;
  ts: string;
  data: {
    approvalKey: string;
    step: string;
    summary: string;
    agentName: string;
  };
}

export interface AgencyRunCompleteEvent {
  event: "run_complete";
  id: string;
  ts: string;
  data: { runId: string; usage: { tokens: number; cost: number } };
}

export interface AgencyErrorEvent {
  event: "error";
  id: string;
  ts: string;
  data: { code: string; message: string };
}

// ── Discriminated union ──────────────────────────────────────────────────────

export type AgencyStreamEvent =
  | AgencyMetaEvent
  | AgencyTextDeltaEvent
  | AgencyToolStartEvent
  | AgencyToolProgressEvent
  | AgencyToolEndEvent
  | AgencyAgentSwitchEvent
  | AgencyGuardrailTriggerEvent
  | AgencyApprovalRequiredEvent
  | AgencyRunCompleteEvent
  | AgencyErrorEvent;

export type AgencyStreamEventType = AgencyStreamEvent["event"];

/** All valid event type strings. */
export const AGENCY_STREAM_EVENT_TYPES: ReadonlySet<AgencyStreamEventType> =
  new Set([
    "meta",
    "text_delta",
    "tool_start",
    "tool_progress",
    "tool_end",
    "agent_switch",
    "guardrail_trigger",
    "approval_required",
    "run_complete",
    "error",
  ]);

/**
 * Safely parse a raw SSE data string into a typed AgencyStreamEvent.
 * Returns null for malformed or unrecognized events.
 */
export function parseAgencyStreamEvent(
  raw: string,
): AgencyStreamEvent | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.event === "string" &&
      typeof parsed.data === "object" &&
      parsed.data !== null &&
      AGENCY_STREAM_EVENT_TYPES.has(parsed.event as AgencyStreamEventType)
    ) {
      return parsed as AgencyStreamEvent;
    }
    return null;
  } catch {
    return null;
  }
}
