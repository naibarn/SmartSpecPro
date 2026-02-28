/**
 * Creator Revenue Sharing Service
 *
 * Handles settlement of creator fees when someone runs another user's agency/workflow/skill.
 * Fee split: creator gets (100 - platformSharePct)%, platform keeps platformSharePct%.
 * Partial charge if runner has insufficient credits post-run.
 */

import { db } from "../db";
import { users, creditTransactions, creatorSettlements } from "../../drizzle/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";
import { getTraceId } from "./traceContext";
import { auditLogger } from "./auditLogger";

export type EntityType = "agency" | "workflow" | "skill";

export interface SettleCreatorFeeParams {
  runId: string;
  entityType: EntityType;
  entityId: string;
  runnerId: number;
  creatorId: number;
  tenantId: string;
  totalFee: number;
  platformSharePct: number;
}

export interface SettlementResult {
  status: "completed" | "partial" | "skipped";
  actualCharged: number;
  creatorShare: number;
  platformShare: number;
  debitTransactionId: number | null;
  creditTransactionId: number | null;
}

/**
 * Settle creator fee after a successful run.
 *
 * Algorithm:
 * 1. Skip if fee=0, runner===creator, or runner has 0 balance
 * 2. Partial charge if runner balance < totalFee
 * 3. Single DB transaction: deduct from runner + credit to creator + insert settlement
 * 4. Idempotent via `creator-fee:{runId}` key
 */
export async function settleCreatorFee(
  params: SettleCreatorFeeParams,
): Promise<SettlementResult> {
  const {
    runId,
    entityType,
    entityId,
    runnerId,
    creatorId,
    tenantId,
    totalFee,
    platformSharePct,
  } = params;

  const idempotencyKey = `creator-fee:${runId}`;

  // Skip conditions
  if (totalFee <= 0 || runnerId === creatorId) {
    return {
      status: "skipped",
      actualCharged: 0,
      creatorShare: 0,
      platformShare: 0,
      debitTransactionId: null,
      creditTransactionId: null,
    };
  }

  // Check for existing settlement (idempotency)
  const existing = await db
    .select()
    .from(creatorSettlements)
    .where(eq(creatorSettlements.idempotencyKey, idempotencyKey))
    .limit(1);

  if (existing.length > 0) {
    const s = existing[0];
    return {
      status: s.status as "completed" | "partial" | "skipped",
      actualCharged: s.actualCharged,
      creatorShare: s.creatorShare,
      platformShare: s.platformShare,
      debitTransactionId: s.debitTransactionId,
      creditTransactionId: s.creditTransactionId,
    };
  }

  // Check runner balance
  const [runner] = await db
    .select({ credits: users.credits })
    .from(users)
    .where(eq(users.id, runnerId))
    .limit(1);

  if (!runner || runner.credits <= 0) {
    // Record as skipped settlement
    await db.insert(creatorSettlements).values({
      runId,
      entityType,
      entityId,
      runnerId,
      creatorId,
      tenantId,
      totalFee,
      actualCharged: 0,
      creatorShare: 0,
      platformShare: 0,
      platformSharePct,
      status: "skipped",
      idempotencyKey,
    });

    return {
      status: "skipped",
      actualCharged: 0,
      creatorShare: 0,
      platformShare: 0,
      debitTransactionId: null,
      creditTransactionId: null,
    };
  }

  // Determine actual charge (partial if insufficient)
  const actualCharged = Math.min(totalFee, runner.credits);
  const status = actualCharged < totalFee ? "partial" : "completed";

  // Calculate split — Math.floor ensures creatorShare + platformShare === actualCharged
  const creatorShare = Math.floor(
    (actualCharged * (100 - platformSharePct)) / 100,
  );
  const platformShare = actualCharged - creatorShare;

  let debitTransactionId: number | null = null;
  let creditTransactionId: number | null = null;

  await db.transaction(async (tx) => {
    const traceId = getTraceId() ?? null;

    // 1. Deduct from runner (atomic — check balance in same statement)
    const [deductResult] = await tx
      .update(users)
      .set({ credits: sql`${users.credits} - ${actualCharged}` })
      .where(and(eq(users.id, runnerId), gte(users.credits, actualCharged)))
      .returning({ newBalance: users.credits });

    if (!deductResult) {
      // Race condition: balance changed between check and deduct
      // Re-check and try with whatever is available
      const [freshRunner] = await tx
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, runnerId))
        .limit(1);

      if (!freshRunner || freshRunner.credits <= 0) {
        // Insert skipped settlement within transaction
        await tx.insert(creatorSettlements).values({
          runId,
          entityType,
          entityId,
          runnerId,
          creatorId,
          tenantId,
          totalFee,
          actualCharged: 0,
          creatorShare: 0,
          platformShare: 0,
          platformSharePct,
          status: "skipped",
          idempotencyKey,
        });
        return;
      }

      // Should not happen in normal flow — throw to rollback
      throw new Error("Concurrent balance change during creator fee settlement");
    }

    // 2. Insert debit transaction for runner
    const [debitTx] = await tx
      .insert(creditTransactions)
      .values({
        userId: runnerId,
        amount: -actualCharged,
        type: "creator_fee",
        description: `Creator fee for ${entityType} run`,
        metadata: {
          entityType,
          entityId,
          runId,
          creatorId,
          platformSharePct,
        },
        balanceAfter: deductResult.newBalance,
        idempotencyKey: `${idempotencyKey}:debit`,
        traceId,
        sourceType: "agency",
      })
      .returning({ id: creditTransactions.id });

    debitTransactionId = debitTx?.id ?? null;

    // 3. Credit to creator (only the creator's share)
    if (creatorShare > 0) {
      const [creditResult] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${creatorShare}` })
        .where(eq(users.id, creatorId))
        .returning({ newBalance: users.credits });

      if (creditResult) {
        const [creditTx] = await tx
          .insert(creditTransactions)
          .values({
            userId: creatorId,
            amount: creatorShare,
            type: "creator_fee",
            description: `Creator revenue from ${entityType} run`,
            metadata: {
              entityType,
              entityId,
              runId,
              runnerId,
              platformSharePct,
              totalFee: actualCharged,
            },
            balanceAfter: creditResult.newBalance,
            idempotencyKey: `${idempotencyKey}:credit`,
            traceId,
            sourceType: "creator_revenue",
          })
          .returning({ id: creditTransactions.id });

        creditTransactionId = creditTx?.id ?? null;
      }
    }

    // 4. Insert settlement record
    await tx.insert(creatorSettlements).values({
      runId,
      entityType,
      entityId,
      runnerId,
      creatorId,
      tenantId,
      totalFee,
      actualCharged,
      creatorShare,
      platformShare,
      platformSharePct,
      debitTransactionId,
      creditTransactionId,
      status,
      idempotencyKey,
    });
  });

  // Audit log
  auditLogger.log({
    eventType: "creator_fee_settled",
    userId: runnerId,
    metadata: {
      runId,
      entityType,
      entityId,
      creatorId,
      totalFee,
      actualCharged,
      creatorShare,
      platformShare,
      status,
    },
  });

  return {
    status,
    actualCharged,
    creatorShare,
    platformShare,
    debitTransactionId,
    creditTransactionId,
  };
}

/**
 * Get creator earnings summary for a user.
 */
export async function getCreatorEarnings(
  creatorId: number,
  options?: {
    entityType?: EntityType;
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
  },
) {
  const { entityType, limit = 50, offset = 0, startDate, endDate } = options ?? {};

  const conditions = [eq(creatorSettlements.creatorId, creatorId)];

  if (entityType) {
    conditions.push(eq(creatorSettlements.entityType, entityType));
  }
  if (startDate) {
    conditions.push(gte(creatorSettlements.createdAt, startDate));
  }
  if (endDate) {
    const { lte } = await import("drizzle-orm");
    conditions.push(lte(creatorSettlements.createdAt, endDate));
  }

  const settlements = await db
    .select()
    .from(creatorSettlements)
    .where(and(...conditions))
    .orderBy(desc(creatorSettlements.createdAt))
    .limit(limit)
    .offset(offset);

  return settlements;
}

/**
 * Get creator dashboard aggregates.
 */
export async function getCreatorDashboard(creatorId: number) {
  const [totals] = await db
    .select({
      totalEarned: sql<number>`COALESCE(SUM("creatorShare"), 0)`,
      totalSettlements: sql<number>`COUNT(*)`,
      totalCharged: sql<number>`COALESCE(SUM("actualCharged"), 0)`,
    })
    .from(creatorSettlements)
    .where(eq(creatorSettlements.creatorId, creatorId));

  const [last30Days] = await db
    .select({
      earned: sql<number>`COALESCE(SUM("creatorShare"), 0)`,
      count: sql<number>`COUNT(*)`,
    })
    .from(creatorSettlements)
    .where(
      and(
        eq(creatorSettlements.creatorId, creatorId),
        gte(
          creatorSettlements.createdAt,
          sql`NOW() - INTERVAL '30 days'`,
        ),
      ),
    );

  const byEntity = await db
    .select({
      entityType: creatorSettlements.entityType,
      entityId: creatorSettlements.entityId,
      totalEarned: sql<number>`COALESCE(SUM("creatorShare"), 0)`,
      runCount: sql<number>`COUNT(*)`,
    })
    .from(creatorSettlements)
    .where(eq(creatorSettlements.creatorId, creatorId))
    .groupBy(creatorSettlements.entityType, creatorSettlements.entityId)
    .orderBy(sql`SUM("creatorShare") DESC`)
    .limit(20);

  const recent = await db
    .select()
    .from(creatorSettlements)
    .where(eq(creatorSettlements.creatorId, creatorId))
    .orderBy(desc(creatorSettlements.createdAt))
    .limit(10);

  return {
    totalEarned: Number(totals?.totalEarned) || 0,
    totalSettlements: Number(totals?.totalSettlements) || 0,
    totalCharged: Number(totals?.totalCharged) || 0,
    last30Days: {
      earned: Number(last30Days?.earned) || 0,
      count: Number(last30Days?.count) || 0,
    },
    byEntity: byEntity.map((e: { entityType: string; entityId: string; totalEarned: number; runCount: number }) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      totalEarned: Number(e.totalEarned),
      runCount: Number(e.runCount),
    })),
    recentSettlements: recent,
  };
}

/**
 * Admin: Get platform revenue stats.
 */
export async function getAdminRevenueStats(options?: {
  tenantId?: string;
  windowDays?: number;
}) {
  const { tenantId, windowDays = 30 } = options ?? {};

  const conditions = [
    gte(
      creatorSettlements.createdAt,
      sql`NOW() - INTERVAL '${sql.raw(String(windowDays))} days'`,
    ),
  ];

  if (tenantId) {
    conditions.push(eq(creatorSettlements.tenantId, tenantId));
  }

  const [totals] = await db
    .select({
      totalPlatformRevenue: sql<number>`COALESCE(SUM("platformShare"), 0)`,
      totalCreatorPayouts: sql<number>`COALESCE(SUM("creatorShare"), 0)`,
      totalCharged: sql<number>`COALESCE(SUM("actualCharged"), 0)`,
      settlementCount: sql<number>`COUNT(*)`,
    })
    .from(creatorSettlements)
    .where(and(...conditions));

  const topCreators = await db
    .select({
      creatorId: creatorSettlements.creatorId,
      totalEarned: sql<number>`COALESCE(SUM("creatorShare"), 0)`,
      runCount: sql<number>`COUNT(*)`,
    })
    .from(creatorSettlements)
    .where(and(...conditions))
    .groupBy(creatorSettlements.creatorId)
    .orderBy(sql`SUM("creatorShare") DESC`)
    .limit(10);

  const topEntities = await db
    .select({
      entityType: creatorSettlements.entityType,
      entityId: creatorSettlements.entityId,
      totalRevenue: sql<number>`COALESCE(SUM("actualCharged"), 0)`,
      runCount: sql<number>`COUNT(*)`,
    })
    .from(creatorSettlements)
    .where(and(...conditions))
    .groupBy(creatorSettlements.entityType, creatorSettlements.entityId)
    .orderBy(sql`SUM("actualCharged") DESC`)
    .limit(10);

  return {
    totalPlatformRevenue: Number(totals?.totalPlatformRevenue) || 0,
    totalCreatorPayouts: Number(totals?.totalCreatorPayouts) || 0,
    totalCharged: Number(totals?.totalCharged) || 0,
    settlementCount: Number(totals?.settlementCount) || 0,
    topCreators: topCreators.map((c: { creatorId: number; totalEarned: number; runCount: number }) => ({
      creatorId: c.creatorId,
      totalEarned: Number(c.totalEarned),
      runCount: Number(c.runCount),
    })),
    topEntities: topEntities.map((e: { entityType: string; entityId: string; totalRevenue: number; runCount: number }) => ({
      entityType: e.entityType,
      entityId: e.entityId,
      totalRevenue: Number(e.totalRevenue),
      runCount: Number(e.runCount),
    })),
  };
}
