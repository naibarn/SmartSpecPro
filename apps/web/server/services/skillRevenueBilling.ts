import { and, count, desc, eq, gte, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import { resolveSkillSlugAlias } from "./skillRegistry";
import {
  creditTransactions,
  skillRevenueDebts,
  skillRevenueSettlements,
  skills,
  tenants,
  users,
} from "../../drizzle/schema";

export const DEFAULT_TENANT_SKILL_CREDITS = 2;
export const DEFAULT_SKILL_OWNER_CREDITS = 0;

export type SkillBillingReconciliation = {
  unmappedUsageCount: number;
  unknownSkillSlugCount: number;
  incompleteSettlementCount: number;
  openDebtCount: number;
  openDebtCredits: number;
  unmappedSamples: Array<{ id: number; description: string | null; amount: number; createdAt: Date }>;
  unknownSkillSlugSamples: string[];
};

export type SkillRevenuePricing = {
  tenantCreditCost: number;
  skillOwnerCreditCost: number;
  totalCredits: number;
};

/** Resolve the only tenant scope a domain admin may use for revenue reports. */
export function resolveSkillRevenueReportTenantScope(input: {
  role: string;
  tenantId?: string | null;
  currentTenantId?: string | number | null;
}): string | null {
  if (input.role !== "domain_admin") return null;
  const tenantId = input.tenantId ?? input.currentTenantId;
  const normalized = tenantId == null ? "" : String(tenantId).trim();
  return normalized || null;
}

export type SkillRevenueCharge = SkillRevenuePricing & {
  configuredTotalCredits: number;
  actualWorkCredits: number | null;
  chargedTotalCredits: number;
  capApplied: boolean;
  pricingSource: "skill_config";
};

export type SkillRevenueSettlementResult = {
  runId: string;
  skillSlug: string;
  totalCredits: number;
  tenantCredits: number;
  skillOwnerCredits: number;
  tenantOwnerId: number | null;
  skillOwnerId: number | null;
  configuredTotalCredits: number;
  actualWorkCredits: number | null;
  chargedTotalCredits: number;
  capApplied: boolean;
  userTransactionId: number | null;
  tenantRevenueTransactionId: number | null;
  skillRevenueTransactionId: number | null;
  duplicate: boolean;
};

export function normalizeSkillRevenuePricing(input: {
  tenantCreditCost?: number | null;
  skillOwnerCreditCost?: number | null;
}): SkillRevenuePricing {
  const tenantCreditCost = input.tenantCreditCost ?? DEFAULT_TENANT_SKILL_CREDITS;
  const skillOwnerCreditCost = input.skillOwnerCreditCost ?? DEFAULT_SKILL_OWNER_CREDITS;
  if (
    !Number.isInteger(tenantCreditCost) ||
    !Number.isInteger(skillOwnerCreditCost) ||
    tenantCreditCost < 0 ||
    skillOwnerCreditCost < 0
  ) {
    throw new Error("Skill revenue credits must be non-negative integers");
  }
  return {
    tenantCreditCost,
    skillOwnerCreditCost,
    totalCredits: tenantCreditCost + skillOwnerCreditCost,
  };
}

export function buildSkillRevenueAllocations(input: {
  tenantOwnerId: number | null;
  skillOwnerId: number | null;
  tenantCredits: number;
  skillOwnerCredits: number;
}): Map<number, number> {
  const allocations = new Map<number, number>();
  if (input.tenantOwnerId && input.tenantCredits > 0) {
    allocations.set(input.tenantOwnerId, input.tenantCredits);
  }
  if (input.skillOwnerId && input.skillOwnerCredits > 0) {
    allocations.set(
      input.skillOwnerId,
      (allocations.get(input.skillOwnerId) ?? 0) + input.skillOwnerCredits,
    );
  }
  return allocations;
}

/** The configured price is an upper bound, never a charge above measured work. */
export function calculateSkillRevenueCharge(
  pricing: SkillRevenuePricing,
  actualWorkCredits?: number | null,
): SkillRevenueCharge {
  if (actualWorkCredits !== undefined && actualWorkCredits !== null &&
      (!Number.isInteger(actualWorkCredits) || actualWorkCredits < 0)) {
    throw new Error("Actual skill work credits must be a non-negative integer");
  }
  const configuredTotalCredits = pricing.totalCredits;
  const actual = actualWorkCredits ?? null;
  const chargedTotalCredits = actual === null
    ? configuredTotalCredits
    : Math.min(configuredTotalCredits, actual);
  // Preserve the configured split as closely as possible while keeping all
  // ledger values integer. The tenant receives the deterministic remainder.
  const ownerShare = configuredTotalCredits > 0
    ? Math.floor(chargedTotalCredits * pricing.skillOwnerCreditCost / configuredTotalCredits)
    : 0;
  const tenantShare = chargedTotalCredits - ownerShare;
  return {
    tenantCreditCost: tenantShare,
    skillOwnerCreditCost: ownerShare,
    totalCredits: chargedTotalCredits,
    configuredTotalCredits,
    actualWorkCredits: actual,
    chargedTotalCredits,
    capApplied: actual !== null && chargedTotalCredits < configuredTotalCredits,
    pricingSource: "skill_config",
  };
}

/** Read-only admin diagnostics; legacy rows are reported, never guessed/backfilled. */
export async function getSkillBillingReconciliation(): Promise<SkillBillingReconciliation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const skillUsage = and(eq(creditTransactions.sourceType, "skill"), eq(creditTransactions.type, "usage"));
  const canonicalSkillJoin = sql`${skills.slug} = CASE WHEN ${creditTransactions.skillSlug} = 'elevenlabs-beauty-dialogue' THEN 'elevenlabs-product-voiceover-dialogue' ELSE ${creditTransactions.skillSlug} END`;
  const [{ value: unmappedUsageCount }] = await db
    .select({ value: count(creditTransactions.id) })
    .from(creditTransactions)
    .where(and(skillUsage, isNull(creditTransactions.skillSlug)));
  const [{ value: unknownSkillSlugCount }] = await db
    .select({ value: count(creditTransactions.id) })
    .from(creditTransactions)
    .leftJoin(skills, canonicalSkillJoin)
    .where(and(skillUsage, isNotNull(creditTransactions.skillSlug), isNull(skills.id)));
  const [{ value: incompleteSettlementCount }] = await db
    .select({ value: count(skillRevenueSettlements.id) })
    .from(skillRevenueSettlements)
    .where(and(
      eq(skillRevenueSettlements.status, "settled"),
      or(
        and(gt(skillRevenueSettlements.totalCredits, 0), isNull(skillRevenueSettlements.userTransactionId)),
        and(gt(skillRevenueSettlements.tenantCredits, 0), isNull(skillRevenueSettlements.tenantRevenueTransactionId)),
        and(gt(skillRevenueSettlements.skillOwnerCredits, 0), isNull(skillRevenueSettlements.skillRevenueTransactionId)),
        ne(skillRevenueSettlements.totalCredits, skillRevenueSettlements.chargedTotalCredits),
      ),
    ));
  const [{ value: openDebtCount }] = await db
    .select({ value: count(skillRevenueDebts.id) })
    .from(skillRevenueDebts)
    .where(eq(skillRevenueDebts.status, "open"));
  const [{ value: openDebtCredits }] = await db
    .select({ value: sql<number>`coalesce(sum(${skillRevenueDebts.amount} - ${skillRevenueDebts.recoveredCredits}), 0)` })
    .from(skillRevenueDebts)
    .where(eq(skillRevenueDebts.status, "open"));
  const unmappedSamples = await db
    .select({
      id: creditTransactions.id,
      description: creditTransactions.description,
      amount: creditTransactions.amount,
      createdAt: creditTransactions.createdAt,
    })
    .from(creditTransactions)
    .where(and(skillUsage, isNull(creditTransactions.skillSlug)))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(20);
  const unknownSlugRows = await db
    .select({ skillSlug: creditTransactions.skillSlug })
    .from(creditTransactions)
    .leftJoin(skills, canonicalSkillJoin)
    .where(and(skillUsage, isNotNull(creditTransactions.skillSlug), isNull(skills.id)))
    .orderBy(desc(creditTransactions.createdAt))
    .limit(100);
  return {
    unmappedUsageCount: Number(unmappedUsageCount),
    unknownSkillSlugCount: Number(unknownSkillSlugCount),
    incompleteSettlementCount: Number(incompleteSettlementCount),
    openDebtCount: Number(openDebtCount),
    openDebtCredits: Number(openDebtCredits ?? 0),
    unmappedSamples,
    unknownSkillSlugSamples: Array.from(new Set(unknownSlugRows.map(row => row.skillSlug).filter((value): value is string => Boolean(value)))),
  };
}

function settlementResult(row: typeof skillRevenueSettlements.$inferSelect, duplicate: boolean): SkillRevenueSettlementResult {
  return {
    runId: row.runId,
    skillSlug: row.skillSlug,
    totalCredits: row.totalCredits,
    tenantCredits: row.tenantCredits,
    skillOwnerCredits: row.skillOwnerCredits,
    tenantOwnerId: row.tenantOwnerId,
    skillOwnerId: row.skillOwnerId,
    configuredTotalCredits: row.configuredTotalCredits,
    actualWorkCredits: row.actualWorkCredits,
    chargedTotalCredits: row.chargedTotalCredits,
    capApplied: row.capApplied,
    userTransactionId: row.userTransactionId,
    tenantRevenueTransactionId: row.tenantRevenueTransactionId,
    skillRevenueTransactionId: row.skillRevenueTransactionId,
    duplicate,
  };
}

function buildMetadata(input: {
  runId: string;
  skillSlug: string;
  skillName?: string;
  tenantCredits: number;
  skillOwnerCredits: number;
  totalCredits: number;
  configuredTotalCredits?: number;
  actualWorkCredits?: number | null;
  chargedTotalCredits?: number;
  capApplied?: boolean;
  role: "user_charge" | "tenant_revenue" | "skill_owner_revenue" | "reversal";
  extra?: Record<string, unknown>;
}) {
  return {
    ...(input.extra ?? {}),
    skillRunId: input.runId,
    skill: input.skillSlug,
    ...(input.skillName ? { skillName: input.skillName } : {}),
    billingBasis: "fixed_skill_run",
    tenantCredits: input.tenantCredits,
    skillOwnerCredits: input.skillOwnerCredits,
    totalSkillCredits: input.totalCredits,
    configuredSkillCredits: input.configuredTotalCredits ?? input.totalCredits,
    actualWorkCredits: input.actualWorkCredits ?? null,
    chargedSkillCredits: input.chargedTotalCredits ?? input.totalCredits,
    skillPriceCapApplied: input.capApplied ?? false,
    skillRevenueRole: input.role,
  };
}

async function lockUsers(tx: any, userIds: number[]) {
  const ids = Array.from(new Set(userIds)).sort((a, b) => a - b);
  if (ids.length === 0) return new Map<number, { id: number; credits: number; isDisabled: boolean }>();
  const rows = (await tx
    .select({ id: users.id, credits: users.credits, isDisabled: users.isDisabled })
    .from(users)
    .where(inArray(users.id, ids))
    .for("update")) as Array<{ id: number; credits: number; isDisabled: boolean }>;
  return new Map(rows.map((row: { id: number; credits: number; isDisabled: boolean }) => [row.id, row]));
}

/**
 * Atomically charges one user and grants the fixed skill-run split.
 * Existing rows are returned so retries cannot create additional ledger rows.
 */
export async function settleSkillRun(input: {
  runId: string;
  userId: number;
  tenantId?: string | null;
  skillSlug: string;
  /** Measured work charge from the provider/operation; the configured price caps it. */
  actualWorkCredits?: number | null;
  description?: string;
  metadata?: Record<string, unknown>;
}): Promise<SkillRevenueSettlementResult> {
  if (!input.runId.trim()) throw new Error("Skill run id is required");
  const skillSlug = resolveSkillSlugAlias(input.skillSlug.trim());
  if (!skillSlug) throw new Error("Skill slug is required");
  const effectiveTenantId = input.tenantId?.trim() || null;
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  return db.transaction(async (tx: any) => {
    const [existing] = await tx
      .select()
      .from(skillRevenueSettlements)
      .where(eq(skillRevenueSettlements.runId, input.runId))
      .for("update")
      .limit(1);
    if (existing) {
      if (
        existing.userId !== input.userId ||
        existing.skillSlug !== skillSlug ||
        existing.tenantId !== effectiveTenantId
      ) {
        throw new Error("Skill run id is already bound to a different execution");
      }
      if (existing.status === "reversed") {
        throw new Error("Skill run has already been refunded");
      }
      return settlementResult(existing, true);
    }

    const [skill] = await tx
      .select({
        id: skills.id,
        slug: skills.slug,
        name: skills.name,
        createdBy: skills.createdBy,
        tenantId: skills.tenantId,
        tenantCreditCost: skills.tenantCreditCost,
        skillOwnerCreditCost: skills.skillOwnerCreditCost,
      })
      .from(skills)
      .where(eq(skills.slug, skillSlug))
      .limit(1);
    if (!skill) throw new Error(`Skill '${input.skillSlug}' not found`);

    const pricing = normalizeSkillRevenuePricing(skill);
    const charge = calculateSkillRevenueCharge(pricing, input.actualWorkCredits);
    if (skill.tenantId && skill.tenantId !== effectiveTenantId) {
      throw new Error("Skill is not available in the active tenant");
    }
    let tenantOwnerId: number | null = null;
    if (charge.tenantCreditCost > 0) {
      if (!effectiveTenantId) throw new Error("Tenant context is required for skill revenue settlement");
      const [tenant] = await tx
        .select({ ownerId: tenants.ownerId })
        .from(tenants)
        .where(eq(tenants.id, effectiveTenantId))
        .limit(1);
      tenantOwnerId = tenant?.ownerId ?? null;
      if (!tenantOwnerId) throw new Error("Tenant owner is required for skill revenue settlement");
    }

    const skillOwnerId = charge.skillOwnerCreditCost > 0 ? skill.createdBy : null;
    if (charge.skillOwnerCreditCost > 0 && !skillOwnerId) {
      throw new Error("Skill owner is required for skill revenue settlement");
    }

    const [inserted] = await tx
      .insert(skillRevenueSettlements)
      .values({
        runId: input.runId,
        skillId: skill.id,
        skillSlug: skill.slug,
        tenantId: effectiveTenantId,
        userId: input.userId,
        tenantOwnerId,
        skillOwnerId,
        tenantCredits: charge.tenantCreditCost,
        skillOwnerCredits: charge.skillOwnerCreditCost,
        totalCredits: charge.chargedTotalCredits,
        configuredTotalCredits: charge.configuredTotalCredits,
        actualWorkCredits: charge.actualWorkCredits,
        chargedTotalCredits: charge.chargedTotalCredits,
        pricingSource: charge.pricingSource,
        capApplied: charge.capApplied,
      })
      .onConflictDoNothing({ target: skillRevenueSettlements.runId })
      .returning();

    // A concurrent retry may have inserted the same run between the initial
    // lookup and this insert. Treat that conflict as an idempotent duplicate
    // instead of surfacing a transient unique-constraint error to the caller.
    if (!inserted) {
      const [concurrent] = await tx
        .select()
        .from(skillRevenueSettlements)
        .where(eq(skillRevenueSettlements.runId, input.runId))
        .for("update")
        .limit(1);
      if (!concurrent) throw new Error("Skill run settlement could not be located after idempotent insert");
      if (
        concurrent.userId !== input.userId ||
        concurrent.skillSlug !== skillSlug ||
        concurrent.tenantId !== effectiveTenantId
      ) {
        throw new Error("Skill run id is already bound to a different execution");
      }
      if (concurrent.status === "reversed") {
        throw new Error("Skill run has already been refunded");
      }
      return settlementResult(concurrent, true);
    }

    const recipientCredits = buildSkillRevenueAllocations({
      tenantOwnerId,
      skillOwnerId,
      tenantCredits: charge.tenantCreditCost,
      skillOwnerCredits: charge.skillOwnerCreditCost,
    });

    const balances = await lockUsers(tx, [input.userId, ...recipientCredits.keys()]);
    const user = balances.get(input.userId);
    if (!user || user.isDisabled) throw new Error("User not found or disabled");
    if (user.credits < charge.chargedTotalCredits) {
      throw new Error(`Insufficient credits. Required: ${charge.chargedTotalCredits}`);
    }

    let userTransactionId: number | null = null;
    if (charge.chargedTotalCredits > 0) {
      const [userBalance] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} - ${charge.chargedTotalCredits}`, lastCreditUsedAt: new Date() })
        .where(and(eq(users.id, input.userId), gte(users.credits, charge.chargedTotalCredits)))
        .returning({ balanceAfter: users.credits });
      if (!userBalance) throw new Error(`Insufficient credits. Required: ${charge.chargedTotalCredits}`);
      const [userTransaction] = await tx
        .insert(creditTransactions)
        .values({
          userId: input.userId,
          amount: -charge.chargedTotalCredits,
          type: "usage",
          description: input.description ?? `Skill run: ${skill.name}`,
          balanceAfter: userBalance.balanceAfter,
          idempotencyKey: `skill-run:${input.runId}:user`,
          skillSlug: skill.slug,
          sourceType: "skill",
          metadata: buildMetadata({
            runId: input.runId,
            skillSlug: skill.slug,
            skillName: skill.name,
            tenantCredits: charge.tenantCreditCost,
            skillOwnerCredits: charge.skillOwnerCreditCost,
            totalCredits: charge.chargedTotalCredits,
            configuredTotalCredits: charge.configuredTotalCredits,
            actualWorkCredits: charge.actualWorkCredits,
            chargedTotalCredits: charge.chargedTotalCredits,
            capApplied: charge.capApplied,
            role: "user_charge",
            extra: input.metadata,
          }),
        })
        .returning({ id: creditTransactions.id });
      userTransactionId = userTransaction?.id ?? null;
    }

    let tenantRevenueTransactionId: number | null = null;
    let skillRevenueTransactionId: number | null = null;
    for (const [recipientId, amount] of recipientCredits) {
      const [balance] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${amount}` })
        .where(eq(users.id, recipientId))
        .returning({ balanceAfter: users.credits });
      if (!balance) throw new Error(`Revenue recipient ${recipientId} not found`);
      const role = recipientId === tenantOwnerId && recipientId === skillOwnerId
        ? "tenant_revenue"
        : recipientId === tenantOwnerId
          ? "tenant_revenue"
          : "skill_owner_revenue";
      const [revenueTransaction] = await tx
        .insert(creditTransactions)
        .values({
          userId: recipientId,
          amount,
          type: "creator_fee",
          description: `Skill revenue: ${skill.name}`,
          balanceAfter: balance.balanceAfter,
          idempotencyKey: `skill-run:${input.runId}:${role}`,
          skillSlug: skill.slug,
          sourceType: "creator_revenue",
          metadata: buildMetadata({
            runId: input.runId,
            skillSlug: skill.slug,
            skillName: skill.name,
            tenantCredits: charge.tenantCreditCost,
            skillOwnerCredits: charge.skillOwnerCreditCost,
            totalCredits: charge.chargedTotalCredits,
            configuredTotalCredits: charge.configuredTotalCredits,
            actualWorkCredits: charge.actualWorkCredits,
            chargedTotalCredits: charge.chargedTotalCredits,
            capApplied: charge.capApplied,
            role,
          }),
        })
        .returning({ id: creditTransactions.id });
      if (recipientId === tenantOwnerId) tenantRevenueTransactionId = revenueTransaction?.id ?? null;
      else skillRevenueTransactionId = revenueTransaction?.id ?? null;
    }

    const [settled] = await tx
      .update(skillRevenueSettlements)
      .set({ userTransactionId, tenantRevenueTransactionId, skillRevenueTransactionId, updatedAt: new Date() })
      .where(eq(skillRevenueSettlements.id, inserted.id))
      .returning();
    if (!settled) throw new Error("Skill revenue settlement could not be finalized");
    return settlementResult(settled, false);
  });
}

/** Reverse a settled skill run exactly once, including any already-issued revenue. */
export async function refundSkillRun(input: {
  runId: string;
  reason?: string;
}): Promise<{ refunded: boolean; userCredits: number; revenueCredits: number; revenueDebtCredits: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx: any) => {
    const [settlement] = await tx
      .select()
      .from(skillRevenueSettlements)
      .where(eq(skillRevenueSettlements.runId, input.runId))
      .for("update")
      .limit(1);
    if (!settlement || settlement.status === "reversed") {
      return { refunded: false, userCredits: 0, revenueCredits: 0, revenueDebtCredits: 0 };
    }

    const allocations = buildSkillRevenueAllocations({
      tenantOwnerId: settlement.tenantOwnerId,
      skillOwnerId: settlement.skillOwnerId,
      tenantCredits: settlement.tenantCredits,
      skillOwnerCredits: settlement.skillOwnerCredits,
    });
    const balances = await lockUsers(tx, [settlement.userId, ...allocations.keys()]);
    if (!balances.get(settlement.userId)) throw new Error("User not found for skill refund");

    const userRefundReference = settlement.userTransactionId
      ? `refund-${settlement.userTransactionId}`
      : null;
    const [existingUserRefund] = userRefundReference
      ? await tx.select({ id: creditTransactions.id }).from(creditTransactions).where(and(
          eq(creditTransactions.type, "refund"),
          eq(creditTransactions.referenceId, userRefundReference),
        )).limit(1)
      : [null];

    if (!existingUserRefund && settlement.totalCredits > 0) {
      const [balance] = await tx
        .update(users)
        .set({ credits: sql`${users.credits} + ${settlement.totalCredits}` })
        .where(eq(users.id, settlement.userId))
        .returning({ balanceAfter: users.credits });
      if (!balance) throw new Error("User not found for skill refund");
      const currentUser = balances.get(settlement.userId);
      if (currentUser) balances.set(settlement.userId, { ...currentUser, credits: balance.balanceAfter });
      await tx.insert(creditTransactions).values({
        userId: settlement.userId,
        amount: settlement.totalCredits,
        type: "refund",
        description: input.reason ?? `Skill run refund: ${settlement.skillSlug}`,
        referenceId: userRefundReference,
        idempotencyKey: `skill-run:${input.runId}:refund:user`,
        balanceAfter: balance.balanceAfter,
        skillSlug: settlement.skillSlug,
        sourceType: "skill",
        metadata: buildMetadata({
          runId: input.runId,
          skillSlug: settlement.skillSlug,
          tenantCredits: settlement.tenantCredits,
          skillOwnerCredits: settlement.skillOwnerCredits,
          totalCredits: settlement.totalCredits,
          role: "reversal",
        }),
      });
    }

    let revenueCreditsReversed = 0;
    let revenueDebtCredits = 0;
    for (const [recipientId, amount] of allocations) {
      const recipient = balances.get(recipientId);
      if (!recipient) throw new Error(`Revenue recipient ${recipientId} not found for refund`);
      const reversibleAmount = Math.min(amount, Math.max(0, recipient.credits));
      let balanceAfter = recipient.credits;
      if (reversibleAmount > 0) {
        const [balance] = await tx
          .update(users)
          .set({ credits: sql`${users.credits} - ${reversibleAmount}` })
          .where(and(eq(users.id, recipientId), gte(users.credits, reversibleAmount)))
          .returning({ balanceAfter: users.credits });
        if (!balance) throw new Error(`Revenue recipient ${recipientId} not found for refund`);
        balanceAfter = balance.balanceAfter;
      }
      if (reversibleAmount > 0) {
        await tx.insert(creditTransactions).values({
          userId: recipientId,
          amount: -reversibleAmount,
          type: "refund",
          description: `Skill revenue reversal: ${settlement.skillSlug}`,
          idempotencyKey: `skill-run:${input.runId}:refund:recipient:${recipientId}`,
          balanceAfter,
          skillSlug: settlement.skillSlug,
          sourceType: "creator_revenue",
          metadata: buildMetadata({
            runId: input.runId,
            skillSlug: settlement.skillSlug,
            tenantCredits: settlement.tenantCredits,
            skillOwnerCredits: settlement.skillOwnerCredits,
            totalCredits: settlement.totalCredits,
            role: "reversal",
            extra: { reversedCredits: reversibleAmount, unrecoveredCredits: amount - reversibleAmount },
          }),
        });
        revenueCreditsReversed += reversibleAmount;
      }
      const debtAmount = amount - reversibleAmount;
      if (debtAmount > 0) {
        await tx.insert(skillRevenueDebts).values({
          settlementId: settlement.id,
          recipientId,
          amount: debtAmount,
          recoveredCredits: 0,
          status: "open",
        });
        revenueDebtCredits += debtAmount;
      }
      balances.set(recipientId, { ...recipient, credits: balanceAfter });
    }

    await tx.update(skillRevenueSettlements)
      .set({ status: "reversed", reversedAt: new Date(), updatedAt: new Date() })
      .where(eq(skillRevenueSettlements.id, settlement.id));
    return {
      refunded: true,
      userCredits: existingUserRefund ? 0 : settlement.totalCredits,
      revenueCredits: revenueCreditsReversed,
      revenueDebtCredits,
    };
  });
}
