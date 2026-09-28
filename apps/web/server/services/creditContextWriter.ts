import { and, eq } from "drizzle-orm";
import { creditContexts, creditTransactionContexts, creditTransactions } from "../../drizzle/schema";
import { CreditContextError, type CreditContextLinkRole, type CreditContextProvenance, type CreditContextRef, type CreditContextScope } from "../../shared/creditContextContracts";
import { resolveCreditContext } from "./creditContextResolver";
import { auditCreditContextEvent, emitCreditContextMetric } from "./creditContextAudit";
import { getDb } from "../db";

export interface CreditContextLinkInput {
  transactionId: number;
  ref: CreditContextRef;
  scope: CreditContextScope;
  relationType?: CreditContextLinkRole;
  isPrimary?: boolean;
  provenance?: CreditContextProvenance;
  reasonCode?: string;
}

async function persistResolvedContext(tx: any, resolved: Awaited<ReturnType<typeof resolveCreditContext>>) {
  const existingContext = await tx
    .select()
    .from(creditContexts)
    .where(and(eq(creditContexts.tenantId, resolved.tenantId), eq(creditContexts.contextKey, resolved.contextKey)))
    .limit(1);
  let context = existingContext[0];
  if (!context) {
    const parent = resolved.parent ? await persistResolvedContext(tx, resolved.parent) : null;
    const snapshot = {
      ...(resolved.snapshot ?? {}),
      ...(resolved.ref.stageLabel ? { stageLabel: resolved.ref.stageLabel.slice(0, 128) } : {}),
      ...(resolved.ref.attemptKey ? { attemptKey: resolved.ref.attemptKey.slice(0, 128) } : {}),
    };
    const inserted = await tx.insert(creditContexts).values({
      tenantId: resolved.tenantId,
      ownerUserId: resolved.ownerUserId,
      contextType: resolved.ref.contextType,
      sourceType: resolved.ref.sourceType,
      sourceId: String(resolved.ref.sourceId),
      contextKey: resolved.contextKey,
      parentContextId: parent?.id ?? null,
      rootContextId: parent?.rootContextId ?? parent?.id ?? null,
      displayNameSnapshot: resolved.snapshot?.label ?? resolved.displayName,
      displayTypeSnapshot: resolved.snapshot?.typeLabel ?? resolved.displayType,
      resolutionState: resolved.resolutionState,
      attributionStatus: resolved.attributionStatus,
      sourceRevision: resolved.ref.sourceRevision ?? null,
      snapshotJson: Object.keys(snapshot).length ? snapshot : null,
      resolverVersion: resolved.resolverVersion,
    }).returning();
    context = inserted[0];
    if (!context) throw new Error("Credit context was not created");
    if (!parent) {
      const [rootUpdated] = await tx.update(creditContexts)
        .set({ rootContextId: context.id })
        .where(eq(creditContexts.id, context.id))
        .returning();
      context = rootUpdated ?? context;
    }
    emitCreditContextMetric("credit_context_created", { contextId: context.id, tenantId: context.tenantId });
  } else {
    emitCreditContextMetric("credit_context_reused", { contextId: context.id, tenantId: context.tenantId });
  }
  return context;
}

export async function linkCreditTransactionContext(input: CreditContextLinkInput) {
  const resolved = await resolveCreditContext(input.ref, input.scope);
  const db = await getDb();
  const result = await db.transaction(async tx => {
    const [transaction] = await tx.select({ userId: creditTransactions.userId, tenantId: creditTransactions.tenantId, type: creditTransactions.type, amount: creditTransactions.amount })
      .from(creditTransactions)
      .where(eq(creditTransactions.id, input.transactionId))
      .limit(1);
    if (!transaction || (!transaction.tenantId && input.provenance !== "historical_verified" && input.provenance !== "manual_review") || (transaction.tenantId && transaction.tenantId !== input.scope.tenantId)) {
      throw new Error("Credit transaction is outside the tenant scope");
    }
    const relationType = input.relationType ?? (input.isPrimary === false ? "execution" : "primary_work");
    if (transaction.userId !== input.scope.userId && relationType !== "revenue_distribution") {
      throw new Error("Credit transaction is outside the user scope");
    }
    if (relationType === "reversal" && transaction.type !== "refund") throw new Error("Reversal links require refund transactions");
    if (relationType === "work_adjustment" && transaction.type !== "adjustment") throw new Error("Work adjustments require adjustment transactions");
    if (relationType === "primary_work" && transaction.type === "refund") throw new Error("Refunds require reversal links");
    if (relationType === "primary_work" && transaction.type === "usage" && transaction.amount >= 0) throw new Error("Usage attribution requires a negative debit");
    const context = await persistResolvedContext(tx, resolved);

    const requestedPrimary = input.isPrimary ?? true;
    if (requestedPrimary) {
      const [primary] = await tx.select({ contextId: creditTransactionContexts.contextId })
        .from(creditTransactionContexts)
        .where(and(eq(creditTransactionContexts.transactionId, input.transactionId), eq(creditTransactionContexts.isPrimary, true)))
        .limit(1);
      if (primary && primary.contextId !== context.id) {
        emitCreditContextMetric("credit_context_idempotency_conflict", { transactionId: input.transactionId, tenantId: input.scope.tenantId });
        throw new CreditContextError("IDEMPOTENCY_CONFLICT", "Transaction already has a different primary credit context");
      }
    }
    const insertedLink = await tx.insert(creditTransactionContexts).values({
      transactionId: input.transactionId,
      contextId: context.id,
      relationType,
      isPrimary: requestedPrimary,
      provenance: input.provenance ?? "new_explicit",
      reasonCode: input.reasonCode?.slice(0, 64),
      displayNameSnapshot: context.displayNameSnapshot,
    }).onConflictDoNothing().returning({ id: creditTransactionContexts.id });
    const [storedLink] = await tx.select({
      contextId: creditTransactionContexts.contextId,
      relationType: creditTransactionContexts.relationType,
      isPrimary: creditTransactionContexts.isPrimary,
    }).from(creditTransactionContexts).where(and(
      eq(creditTransactionContexts.transactionId, input.transactionId),
      eq(creditTransactionContexts.contextId, context.id),
      eq(creditTransactionContexts.relationType, relationType),
    )).limit(1);
    if (!storedLink || storedLink.isPrimary !== requestedPrimary) {
      emitCreditContextMetric("credit_context_idempotency_conflict", { transactionId: input.transactionId, tenantId: input.scope.tenantId });
      throw new CreditContextError("IDEMPOTENCY_CONFLICT", "Existing credit context link does not match the requested attribution");
    }
    emitCreditContextMetric("credit_transaction_context_linked", { transactionId: input.transactionId, contextId: context.id });
    auditCreditContextEvent({ eventType: "credit_context_linked", contextId: context.id, transactionId: input.transactionId, tenantId: input.scope.tenantId, userId: input.scope.userId, resolverVersion: resolved.resolverVersion });
    return { contextId: context.id, linkId: insertedLink[0]?.id ?? null, status: resolved.attributionStatus };
  });
  return result;
}
