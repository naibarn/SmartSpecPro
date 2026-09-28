import { and, eq } from "drizzle-orm";
import { creditContexts } from "../../drizzle/schema";
import type { CreditContextScope } from "../../shared/creditContextContracts";
import { auditCreditContextEvent, emitCreditContextMetric } from "./creditContextAudit";
import { getDb } from "../db";

export type CreditContextSourceStatus = "resolved" | "missing" | "temporarily_unavailable";

export async function reconcileCreditContextLifecycle(input: {
  contextId: string;
  scope: CreditContextScope;
  sourceStatus: CreditContextSourceStatus;
  reason?: string;
}) {
  if (input.sourceStatus === "temporarily_unavailable") {
    return { changed: false, state: "unchanged" as const };
  }
  const db = await getDb();
  const [context] = await db.select().from(creditContexts)
    .where(and(eq(creditContexts.id, input.contextId), eq(creditContexts.tenantId, input.scope.tenantId)))
    .limit(1);
  if (!context) return { changed: false, state: "not_found" as const };
  if (input.sourceStatus === "missing") {
    if (context.resolutionState === "archived") return { changed: false, state: "archived" as const };
    await db.update(creditContexts).set({ resolutionState: "archived", attributionStatus: "linked", archivedAt: new Date(), updatedAt: new Date() })
      .where(eq(creditContexts.id, context.id));
    emitCreditContextMetric("credit_context_state_transition", { contextId: context.id, tenantId: context.tenantId, oldState: context.resolutionState, newState: "archived" });
    auditCreditContextEvent({ eventType: "credit_context_archived", contextId: context.id, tenantId: context.tenantId, userId: input.scope.userId, oldState: context.resolutionState, newState: "archived", reason: input.reason });
    return { changed: true, state: "archived" as const };
  }
  return { changed: false, state: context.resolutionState };
}

export async function manuallyCorrectCreditContext(input: {
  contextId: string;
  scope: CreditContextScope;
  displayNameSnapshot: string;
  reason: string;
}) {
  if (!input.scope.actorId) throw new Error("Context correction requires an authorized actor");
  const name = input.displayNameSnapshot.trim().slice(0, 255);
  const reason = input.reason.trim().slice(0, 160);
  if (!name || !reason) throw new Error("Context correction requires a name and reason");
  const db = await getDb();
  const [context] = await db.select().from(creditContexts)
    .where(and(eq(creditContexts.id, input.contextId), eq(creditContexts.tenantId, input.scope.tenantId)))
    .limit(1);
  if (!context) throw new Error("Credit context not found");
  if (context.resolutionState !== "ambiguous" && context.resolutionState !== "unresolved" && context.resolutionState !== "archived") {
    throw new Error("Only unresolved, ambiguous, or archived contexts can be corrected");
  }
  await db.update(creditContexts).set({ displayNameSnapshot: name, resolutionState: "historical_resolved", attributionStatus: "linked", updatedAt: new Date() })
    .where(eq(creditContexts.id, context.id));
  auditCreditContextEvent({ eventType: "credit_context_corrected", contextId: context.id, tenantId: context.tenantId, userId: input.scope.actorId, oldState: context.resolutionState, newState: "historical_resolved", reason });
  return { contextId: context.id, resolutionState: "historical_resolved" as const };
}
