export const AGENT_EXPERIENCE_SCHEMA_VERSION = "2026-06-22-v1" as const;

export type AgentExperienceSchemaVersion = typeof AGENT_EXPERIENCE_SCHEMA_VERSION;

export type AgentExperienceEventSource =
  | "agency"
  | "team"
  | "chat"
  | "artifact"
  | "approval"
  | "cost"
  | "debug"
  | "fixture";

export type AgentExperienceSurface =
  | "agency_chat"
  | "team_room"
  | "direct_chat"
  | "artifact_panel"
  | "admin_debug"
  | "fixture_preview"
  | "unknown";

export type AgentExperienceVisibility = "public" | "tenant" | "private_internal" | "debug_only";
export type AgentExperienceRedaction = "none" | "summary" | "metadata_only" | "redacted";

export type AgentArtifactFormat =
  | "markdown"
  | "json"
  | "html"
  | "image"
  | "video"
  | "table"
  | "code"
  | "unknown";

export type AgentWorkflowStepStatus = "started" | "in_progress" | "completed" | "failed" | "cancelled";
export type AgentApprovalDecision = "approved" | "denied" | "expired" | "cancelled" | "pending";

export type SmartSpecAgentEventType =
  | "session.started"
  | "message.delta"
  | "message.done"
  | "tool.start"
  | "tool.progress"
  | "tool.done"
  | "tool.error"
  | "approval.request"
  | "approval.decision"
  | "artifact.created"
  | "artifact.updated"
  | "workflow.step"
  | "cost.estimate"
  | "cost.finalized"
  | "debug.trace"
  | "error";

export interface SmartSpecAgentEventEnvelope {
  schemaVersion: AgentExperienceSchemaVersion;
  id: string;
  type: SmartSpecAgentEventType;
  source: AgentExperienceEventSource;
  surface: AgentExperienceSurface;
  visibility: AgentExperienceVisibility;
  redaction: AgentExperienceRedaction;
  timestamp: string;
  sourceEventId?: string;
  sequence?: number;
  tenantId?: string;
  userId?: string;
  actorType?: "user" | "assistant" | "system" | "tool" | "agent";
  actorId?: string;
  teamId?: string;
  roomId?: string;
  runId?: string;
  conversationId?: string;
  messageId?: string;
  workId?: string;
  traceId?: string;
  correlationId?: string;
}

export interface MessageAgentEvent {
  text?: string;
  delta?: string;
  messageId?: string;
  role?: "assistant" | "user" | "system" | "tool";
}

export interface ToolAgentEvent {
  toolName?: string;
  toolCallId?: string;
  status?: AgentWorkflowStepStatus;
  summary?: string;
  errorCode?: string;
}

export interface ArtifactAgentEvent {
  artifactId: string;
  title?: string;
  format: AgentArtifactFormat;
  version?: string | number;
  preview?: string;
  sizeBytes?: number;
}

export interface ApprovalAgentEvent {
  approvalId: string;
  status: AgentApprovalDecision;
  sourceDecision?: string;
  risk?: string;
  expiresAt?: string;
  auditUrl?: string;
}

export interface WorkflowAgentEvent {
  stepId?: string;
  label?: string;
  status: AgentWorkflowStepStatus;
}

export interface CostAgentEvent {
  amount?: number;
  currency?: string;
  approximate?: boolean;
  finalized?: boolean;
  source?: "server" | "estimate";
}

export interface DebugAgentEvent {
  reason?: string;
  fields?: Record<string, string | number | boolean | null>;
}

export type SmartSpecAgentEventPayload =
  | { kind: "message"; message: MessageAgentEvent }
  | { kind: "tool"; tool: ToolAgentEvent }
  | { kind: "artifact"; artifact: ArtifactAgentEvent }
  | { kind: "approval"; approval: ApprovalAgentEvent }
  | { kind: "workflow"; workflow: WorkflowAgentEvent }
  | { kind: "cost"; cost: CostAgentEvent }
  | { kind: "debug"; debug: DebugAgentEvent }
  | { kind: "empty" };

export type SmartSpecAgentEvent = SmartSpecAgentEventEnvelope & {
  payload: SmartSpecAgentEventPayload;
};

export type AgentExperienceDroppedReason =
  | "malformed"
  | "missing_identity"
  | "unsupported_schema"
  | "unsupported_event"
  | "unauthorized_visibility"
  | "private_internal"
  | "redacted_secret"
  | "tenant_mismatch"
  | "unsafe_payload";

export interface AgentExperienceDroppedEvent {
  reason: AgentExperienceDroppedReason;
  source?: AgentExperienceEventSource;
  sourceEventId?: string;
  eventType?: string;
  message: string;
}

export interface AgentExperienceParseResult {
  events: SmartSpecAgentEvent[];
  dropped: AgentExperienceDroppedEvent[];
}

export type AgentExperienceIntentType =
  | "approval.approve"
  | "approval.deny"
  | "artifact.open"
  | "artifact.download"
  | "artifact.copy_link"
  | "debug.expand"
  | "workflow.retry"
  | "workflow.stop";

export interface AgentExperienceIntent {
  type: AgentExperienceIntentType;
  eventId: string;
  tenantId?: string;
  runId?: string;
  artifactId?: string;
  approvalId?: string;
  reason?: string;
}

export interface AgentExperienceIntentResult {
  accepted: boolean;
  reason?: string;
}

export function createAgentEventId(prefix: string, sourceEventId?: string | number): string {
  const suffix = sourceEventId == null ? "unknown" : String(sourceEventId);
  return `${prefix}:${suffix}`;
}
