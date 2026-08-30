import { CreditContextError, type CreditContextRef, type CreditContextScope } from "../../shared/creditContextContracts";
import { linkCreditTransactionContext } from "./creditContextWriter";
import { emitCreditContextMetric } from "./creditContextAudit";
import { resolveCreditContext } from "./creditContextResolver";

export function isCreditContextWriteEnabled(): boolean {
  return process.env.CREDIT_CONTEXT_WRITE_ENABLED === "true";
}

export function isCreditContextStrictRequired(): boolean {
  return process.env.CREDIT_CONTEXT_STRICT_REQUIRED === "true";
}

export async function validateCreditContextReference(input: {
  contextRef?: CreditContextRef | null;
  scope?: CreditContextScope;
}) {
  if (!input.contextRef || (!isCreditContextWriteEnabled() && !isCreditContextStrictRequired())) return null;
  if (!input.scope?.tenantId) {
    if (isCreditContextStrictRequired()) throw new Error("Tenant context is required for credit attribution");
    return null;
  }
  return resolveCreditContext(input.contextRef, input.scope);
}

/** Structured metadata is valid lineage evidence; free-form descriptions are not. */
export function inferCreditContextRefFromMetadata(metadata: Record<string, unknown> | undefined) {
  const explicit = metadata?.contextRef;
  if (explicit && typeof explicit === "object" && !Array.isArray(explicit)) {
    const ref = explicit as Record<string, unknown>;
    if (typeof ref.contextType === "string" && typeof ref.sourceType === "string" && (typeof ref.sourceId === "string" || typeof ref.sourceId === "number")) {
      return { contextType: ref.contextType, sourceType: ref.sourceType, sourceId: String(ref.sourceId) } as CreditContextRef;
    }
  }
  const value = metadata?.seriesId ?? metadata?.series_id;
  if (typeof value === "string" || typeof value === "number") {
    const sourceId = String(value).trim();
    if (sourceId) return { contextType: "series" as const, sourceType: "vertical_drama_series" as const, sourceId };
  }
  const conversationId = metadata?.conversationId;
  if (typeof conversationId === "string" || typeof conversationId === "number") {
    const sourceId = String(conversationId).trim();
    if (sourceId) return { contextType: "conversation" as const, sourceType: "conversation" as const, sourceId };
  }
  const skillRunId = metadata?.skillRunId;
  if (typeof skillRunId === "string" && skillRunId.trim()) return { contextType: "skill_execution" as const, sourceType: "skill_execution" as const, sourceId: skillRunId.trim() };
  const workerJobId = metadata?.workerJobId;
  if (typeof workerJobId === "string" && workerJobId.trim()) return { contextType: "worker_job" as const, sourceType: "worker_job" as const, sourceId: workerJobId.trim() };
  const mediaTaskId = metadata?.mediaTaskId;
  if (typeof mediaTaskId === "string" && mediaTaskId.trim()) return { contextType: "media_task" as const, sourceType: "media_task" as const, sourceId: mediaTaskId.trim() };
  return undefined;
}

export async function attachCreditContextToTransaction(input: {
  transactionId: number;
  contextRef?: CreditContextRef | null;
  scope?: CreditContextScope;
  relationType?: Parameters<typeof linkCreditTransactionContext>[0]["relationType"];
  isPrimary?: boolean;
  provenance?: Parameters<typeof linkCreditTransactionContext>[0]["provenance"];
}) {
  if (!isCreditContextWriteEnabled() && !isCreditContextStrictRequired()) {
    return { status: "disabled" as const };
  }
  if (!input.contextRef) {
    emitCreditContextMetric("credit_transaction_context_unattributed", { transactionId: input.transactionId, reason: "missing_context" });
    if (isCreditContextStrictRequired()) throw new Error("Credit context is required for this operation");
    return { status: "unattributed" as const };
  }
  if (!input.scope?.tenantId) {
    emitCreditContextMetric("credit_transaction_context_unattributed", { transactionId: input.transactionId, reason: "missing_tenant" });
    if (isCreditContextStrictRequired()) throw new Error("Tenant context is required for credit attribution");
    return { status: "unattributed" as const };
  }
  try {
    return await linkCreditTransactionContext({
      transactionId: input.transactionId,
      ref: input.contextRef,
      scope: input.scope,
      relationType: input.relationType,
      isPrimary: input.isPrimary,
      provenance: input.provenance,
    });
  } catch (error) {
    emitCreditContextMetric("credit_transaction_context_reconciliation_required", { transactionId: input.transactionId, reason: error instanceof Error ? error.name : "unknown" });
    if (error instanceof CreditContextError && error.code === "IDEMPOTENCY_CONFLICT") throw error;
    if (isCreditContextStrictRequired()) throw error;
    return { status: "unattributed" as const, reconciliationRequired: true };
  }
}
