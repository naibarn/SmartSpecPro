import { auditLogger, type AuditEventType } from "./auditLogger";

export type CreditContextMetric =
  | "credit_context_created"
  | "credit_context_reused"
  | "credit_transaction_context_linked"
  | "credit_transaction_context_unattributed"
  | "credit_transaction_context_ambiguous"
  | "credit_transaction_context_reconciliation_required"
  | "credit_context_cross_tenant_rejected"
  | "credit_context_idempotency_conflict"
  | "credit_context_state_transition"
  | "credit_context_audit_log_failure"
  | "credit_context_integrity_exception";

const MAX_FIELD_LENGTH = 160;

function safeField(value: unknown): string | number | boolean | null {
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  return value.slice(0, MAX_FIELD_LENGTH);
}

export function emitCreditContextMetric(
  metric: CreditContextMetric,
  fields: Record<string, unknown> = {},
): void {
  const safe = Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, safeField(value)]),
  );
  console.info(`[credit-context] ${metric}`, safe);
}

export function auditCreditContextEvent(input: {
  eventType?: string;
  contextId?: string | null;
  transactionId?: number | null;
  tenantId?: string | null;
  userId?: number | null;
  oldState?: string | null;
  newState?: string | null;
  reason?: string | null;
  resolverVersion?: string | null;
  traceId?: string | null;
}): void {
  try {
    auditLogger.log({
      eventType: (input.eventType ?? "credit_context_state_transition") as AuditEventType,
      traceId: input.traceId ?? undefined,
      userId: input.userId ?? undefined,
      metadata: {
        contextId: safeField(input.contextId),
        transactionId: safeField(input.transactionId),
        tenantId: safeField(input.tenantId),
        oldState: safeField(input.oldState),
        newState: safeField(input.newState),
        reason: safeField(input.reason),
        resolverVersion: safeField(input.resolverVersion),
      },
    });
  } catch (error) {
    emitCreditContextMetric("credit_context_audit_log_failure", {
      error: error instanceof Error ? error.name : "unknown",
      tenantId: input.tenantId,
    });
  }
}
