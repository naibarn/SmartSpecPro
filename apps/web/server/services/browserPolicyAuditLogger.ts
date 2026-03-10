import { createHash } from "node:crypto";

import type { BrowserPolicyDecisionEnvelope } from "../../shared/browserPolicy";

export type BrowserPolicyApprovalState =
  | "approved"
  | "pending"
  | "context_changed"
  | "revoked"
  | "expired"
  | "rejected";

export type BrowserPolicyOutcome = "blocked" | "executed" | "failed";

export interface BrowserPolicyAuditEvent {
  eventType: "browser_policy_decision";
  timestamp: string;
  traceId?: string;
  tenantId: string;
  userId?: number;
  workflowId?: number | null;
  executionId?: string;
  actionType: string;
  actionClass: BrowserPolicyDecisionEnvelope["actionClass"];
  pageSensitivity: BrowserPolicyDecisionEnvelope["pageSensitivity"];
  decision: BrowserPolicyDecisionEnvelope["decision"];
  reasonCodes: string[];
  approvalState: BrowserPolicyApprovalState;
  outcome: BrowserPolicyOutcome;
  evidence: BrowserPolicyDecisionEnvelope["evidence"];
  integrity: {
    previousEventHash: string | null;
    eventHash: string;
  };
}

export interface BrowserPolicyAuditDbRecord {
  traceId?: string;
  tenantId: string;
  userId?: number;
  workflowId?: number | null;
  executionId?: string;
  actionType: string;
  actionClass: BrowserPolicyDecisionEnvelope["actionClass"];
  pageSensitivity: BrowserPolicyDecisionEnvelope["pageSensitivity"];
  decision: BrowserPolicyDecisionEnvelope["decision"];
  reasonCodes: string[];
  approvalState: BrowserPolicyApprovalState;
  outcome: BrowserPolicyOutcome;
  evidence: BrowserPolicyDecisionEnvelope["evidence"];
  integrity: {
    previousEventHash: string | null;
    eventHash: string;
  };
  createdAt: string;
}

function buildIntegrityHash(input: {
  timestamp: string;
  traceId?: string;
  tenantId: string;
  executionId?: string;
  actionType: string;
  decision: string;
  reasonCodes: string[];
  approvalState: BrowserPolicyApprovalState;
  outcome: BrowserPolicyOutcome;
  evidence: BrowserPolicyDecisionEnvelope["evidence"];
  previousEventHash: string | null;
}): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        timestamp: input.timestamp,
        traceId: input.traceId,
        tenantId: input.tenantId,
        executionId: input.executionId,
        actionType: input.actionType,
        decision: input.decision,
        reasonCodes: input.reasonCodes,
        approvalState: input.approvalState,
        outcome: input.outcome,
        evidence: input.evidence,
        previousEventHash: input.previousEventHash,
      }),
    )
    .digest("hex");
}

export function buildBrowserPolicyAuditArtifacts(input: {
  decision: BrowserPolicyDecisionEnvelope;
  approvalState: BrowserPolicyApprovalState;
  outcome: BrowserPolicyOutcome;
  previousEventHash?: string | null;
  rawDomSnippet?: string;
  fullScreenshotBase64?: string;
}): {
  jsonlEvent: BrowserPolicyAuditEvent;
  dbRecord: BrowserPolicyAuditDbRecord;
} {
  void input.rawDomSnippet;
  void input.fullScreenshotBase64;

  const timestamp = new Date().toISOString();
  const previousEventHash = input.previousEventHash ?? null;
  const eventHash = buildIntegrityHash({
    timestamp,
    traceId: input.decision.traceId,
    tenantId: input.decision.tenantId,
    executionId: input.decision.executionId,
    actionType: input.decision.actionType,
    decision: input.decision.decision,
    reasonCodes: input.decision.reasonCodes,
    approvalState: input.approvalState,
    outcome: input.outcome,
    evidence: input.decision.evidence,
    previousEventHash,
  });

  const jsonlEvent: BrowserPolicyAuditEvent = {
    eventType: "browser_policy_decision",
    timestamp,
    traceId: input.decision.traceId,
    tenantId: input.decision.tenantId,
    userId: input.decision.userId,
    workflowId: input.decision.workflowId ?? null,
    executionId: input.decision.executionId,
    actionType: input.decision.actionType,
    actionClass: input.decision.actionClass,
    pageSensitivity: input.decision.pageSensitivity,
    decision: input.decision.decision,
    reasonCodes: [...input.decision.reasonCodes],
    approvalState: input.approvalState,
    outcome: input.outcome,
    evidence: input.decision.evidence,
    integrity: {
      previousEventHash,
      eventHash,
    },
  };

  return {
    jsonlEvent,
    dbRecord: {
      traceId: jsonlEvent.traceId,
      tenantId: jsonlEvent.tenantId,
      userId: jsonlEvent.userId,
      workflowId: jsonlEvent.workflowId,
      executionId: jsonlEvent.executionId,
      actionType: jsonlEvent.actionType,
      actionClass: jsonlEvent.actionClass,
      pageSensitivity: jsonlEvent.pageSensitivity,
      decision: jsonlEvent.decision,
      reasonCodes: [...jsonlEvent.reasonCodes],
      approvalState: jsonlEvent.approvalState,
      outcome: jsonlEvent.outcome,
      evidence: jsonlEvent.evidence,
      integrity: jsonlEvent.integrity,
      createdAt: timestamp,
    },
  };
}

export function verifyBrowserPolicyAuditChain(
  events: BrowserPolicyAuditEvent[],
): { valid: boolean; failedAtTraceId: string | null } {
  let previousEventHash: string | null = null;

  for (const event of events) {
    const expectedHash = buildIntegrityHash({
      timestamp: event.timestamp,
      traceId: event.traceId,
      tenantId: event.tenantId,
      executionId: event.executionId,
      actionType: event.actionType,
      decision: event.decision,
      reasonCodes: event.reasonCodes,
      approvalState: event.approvalState,
      outcome: event.outcome,
      evidence: event.evidence,
      previousEventHash,
    });

    if (
      event.integrity.previousEventHash !== previousEventHash
      || event.integrity.eventHash !== expectedHash
    ) {
      return { valid: false, failedAtTraceId: event.traceId ?? null };
    }

    previousEventHash = event.integrity.eventHash;
  }

  return { valid: true, failedAtTraceId: null };
}
