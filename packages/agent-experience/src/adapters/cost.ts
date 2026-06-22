import {
  AGENT_EXPERIENCE_SCHEMA_VERSION,
  createAgentEventId,
  type AgentExperienceParseResult,
  type SmartSpecAgentEvent,
} from "../events";
import { validateSmartSpecAgentEvent } from "../schemas";

export interface CostRecordLike {
  costId?: string;
  tenantId?: string;
  runId?: string;
  amount?: number;
  currency?: string;
  approximate?: boolean;
  finalized?: boolean;
  serverOwned?: boolean;
}

export function costRecordToAgentEvents(record: CostRecordLike): AgentExperienceParseResult {
  if (!record.costId || !record.tenantId) {
    return {
      events: [],
      dropped: [{ reason: "missing_identity", source: "cost", message: "Cost id and tenant id are required" }],
    };
  }
  if (record.finalized === true && record.serverOwned !== true) {
    return {
      events: [],
      dropped: [{ reason: "unsafe_payload", source: "cost", sourceEventId: record.costId, message: "Finalized cost requires server-owned data" }],
    };
  }

  const event: SmartSpecAgentEvent = {
    schemaVersion: AGENT_EXPERIENCE_SCHEMA_VERSION,
    id: createAgentEventId("cost", record.costId),
    type: record.finalized ? "cost.finalized" : "cost.estimate",
    source: "cost",
    surface: "agency_chat",
    visibility: "tenant",
    redaction: "summary",
    timestamp: new Date(0).toISOString(),
    sourceEventId: record.costId,
    tenantId: record.tenantId,
    runId: record.runId,
    payload: {
      kind: "cost",
      cost: {
        amount: record.amount,
        currency: record.currency,
        approximate: record.approximate ?? record.finalized !== true,
        finalized: record.finalized === true,
        source: record.finalized ? "server" : "estimate",
      },
    },
  };

  return validateSmartSpecAgentEvent(event);
}
