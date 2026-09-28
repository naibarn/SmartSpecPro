import { and, eq, gt, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { creditContexts, creditTransactionContexts, creditTransactions } from "../drizzle/schema";
import { getDb } from "../server/db";

export async function auditCreditContextLineage() {
  const db = await getDb();
  const [orphanLinks] = await db.select({ count: sql<number>`count(*)` }).from(creditTransactionContexts).leftJoin(creditContexts, eq(creditContexts.id, creditTransactionContexts.contextId)).where(isNull(creditContexts.id));
  const [missingTenant] = await db.select({ count: sql<number>`count(*)` }).from(creditTransactions).where(and(isNull(creditTransactions.tenantId), eq(creditTransactions.type, "usage")));
  const [multiplePrimary] = await db.select({ count: sql<number>`count(*)` }).from(sql`(SELECT "transactionId" FROM "credit_transaction_contexts" WHERE "isPrimary" = true GROUP BY "transactionId" HAVING count(*) > 1) AS duplicate_primary`);
  const [tenantMismatch] = await db.select({ count: sql<number>`count(*)` })
    .from(creditTransactionContexts)
    .innerJoin(creditTransactions, eq(creditTransactions.id, creditTransactionContexts.transactionId))
    .innerJoin(creditContexts, eq(creditContexts.id, creditTransactionContexts.contextId))
    .where(and(isNotNull(creditTransactions.tenantId), ne(creditTransactions.tenantId, creditContexts.tenantId)));
  const [userMismatch] = await db.select({ count: sql<number>`count(*)` })
    .from(creditTransactionContexts)
    .innerJoin(creditTransactions, eq(creditTransactions.id, creditTransactionContexts.transactionId))
    .innerJoin(creditContexts, eq(creditContexts.id, creditTransactionContexts.contextId))
    .where(and(eq(creditTransactionContexts.isPrimary, true), isNotNull(creditContexts.ownerUserId), ne(creditTransactions.userId, creditContexts.ownerUserId)));
  const [stateDrift] = await db.select({ count: sql<number>`count(*)` }).from(creditContexts).where(or(
    and(eq(creditContexts.attributionStatus, "linked"), isNull(creditContexts.displayNameSnapshot)),
    and(eq(creditContexts.resolutionState, "resolved"), isNull(creditContexts.rootContextId)),
  ));
  const [integrityExceptions] = await db.select({ count: sql<number>`count(*)` }).from(creditTransactions).where(or(
    and(eq(creditTransactions.type, "usage"), gt(creditTransactions.amount, -1)),
    and(eq(creditTransactions.type, "refund"), isNull(creditTransactions.reversalOfTransactionId)),
  ));
  const [directTotals] = await db.select({
    chargedCredits: sql<number>`coalesce(sum(case when "type" = 'usage' and "amount" < 0 then -"amount" else 0 end), 0)`,
    refundedCredits: sql<number>`coalesce(sum(case when "type" = 'refund' and "amount" > 0 then "amount" else 0 end), 0)`,
    transactionCount: sql<number>`count(*)`,
  }).from(creditTransactions);
  const result = {
    orphanLinkCount: Number(orphanLinks?.count ?? 0),
    multiplePrimaryTransactionCount: Number(multiplePrimary?.count ?? 0),
    crossTenantLinkCount: Number(tenantMismatch?.count ?? 0),
    crossUserPrimaryLinkCount: Number(userMismatch?.count ?? 0),
    stateDriftCount: Number(stateDrift?.count ?? 0),
    integrityExceptionCount: Number(integrityExceptions?.count ?? 0),
    usageMissingTenantCount: Number(missingTenant?.count ?? 0),
    directLedgerTotals: {
      chargedCredits: Number(directTotals?.chargedCredits ?? 0),
      refundedCredits: Number(directTotals?.refundedCredits ?? 0),
      transactionCount: Number(directTotals?.transactionCount ?? 0),
    },
    generatedAt: new Date().toISOString(),
  };
  console.log(JSON.stringify(result));
  return result;
}

if (process.argv[1]?.endsWith("audit-credit-context-lineage.ts")) auditCreditContextLineage().catch(error => { console.error(error); process.exitCode = 1; });
