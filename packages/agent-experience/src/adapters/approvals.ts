import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createAgentEventId,
  type AgentApprovalDecision,
  type AgentExperienceParseResult,
  type SmartSpecAgentEvent,
} from "../events";
import { validateSmartSpecAgentEvent } from "../schemas";

export interface ApprovalRecordLike {
  approvalId?: string;
  id?: string;
  tenantId?: string;
  runId?: string;
  actorId?: string;
  status?: string;
  decision?: string;
  backendConfirmed?: boolean;
  risk?: string;
  expiresAt?: string;
  auditUrl?: string;
}

function normalizeDecision(value?: string): AgentApprovalDecision {
  if (value === "rejected") return "denied";
  if (value === "approved" || value === "denied" || value === "expired" || value === "cancelled") return value;
  return "pending";
}

export function approvalRecordToAgentEvents(record: ApprovalRecordLike): AgentExperienceParseResult {
  const approvalId = record.approvalId ?? record.id;
  if (!approvalId || !record.tenantId) {
    return {
      events: [],
      dropped: [{ reason: "missing_identity", source: "approval", message: "Approval id and tenant id are required" }],
    };
  }

  const sourceDecision = record.decision ?? record.status;
  const decision = normalizeDecision(sourceDecision);
  if (decision !== "pending" && record.backendConfirmed !== true) {
    return {
      events: [],
      dropped: [{ reason: "missing_identity", source: "approval", sourceEventId: approvalId, message: "Approval decisions require backend confirmation" }],
    };
  }

  const event: SmartSpecAgentEvent = {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: createAgentEventId("approval", approvalId),
    type: decision === "pending" ? "approval.request" : "approval.decision",
    source: "approval",
    surface: "agency_chat",
    visibility: "tenant",
    redaction: "summary",
    timestamp: new Date(0).toISOString(),
    sourceEventId: approvalId,
    tenantId: record.tenantId,
    runId: record.runId,
    actorId: record.actorId,
    payload: {
      kind: "approval",
      approval: {
        approvalId,
        status: decision,
        sourceDecision,
        risk: record.risk,
        expiresAt: record.expiresAt,
        auditUrl: record.auditUrl,
      },
    },
  };

  return validateSmartSpecAgentEvent(event);
}
