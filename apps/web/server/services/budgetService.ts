/**
 * Budget Service
 * Per-user monthly credit budget protection.
 * Checks budgets before deductions and tracks usage after.
 */

import { db } from "../db";
import { userCreditBudgets } from "../../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";

export interface BudgetCheckResult {
  allowed: boolean;
  reason?: "hard_cap";
  alert?: boolean;
  usagePct: number;
  monthlyLimit: number;
  creditsUsed: number;
}

/**
 * Get current month key in "YYYY-MM" format.
 */
export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/**
 * Fetch user's budget record. Returns null if no budget is configured.
 */
export async function getUserBudget(tenantId: string, userId: number) {
  const rows = await db
    .select()
    .from(userCreditBudgets)
    .where(
      and(
        eq(userCreditBudgets.tenantId, tenantId),
        eq(userCreditBudgets.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Check if a pending credit operation is allowed under the user's budget.
 * If no budget record exists, the operation is always allowed (unlimited).
 */
export async function checkBudget(
  tenantId: string,
  userId: number,
  pendingAmount: number,
): Promise<BudgetCheckResult> {
  const budget = await getUserBudget(tenantId, userId);

  if (!budget) {
    return { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 };
  }

  // Auto-reset if month has rolled over
  const currentMonth = getCurrentMonthKey();
  if (budget.budgetMonthKey !== currentMonth) {
    await resetBudgetIfNewMonth(tenantId, userId, currentMonth);
    // After reset, usage is 0
    if (budget.monthlyLimit <= 0) {
      return { allowed: true, usagePct: 0, monthlyLimit: 0, creditsUsed: 0 };
    }
    const pct = Math.round((pendingAmount / budget.monthlyLimit) * 100);
    const alert = pct >= budget.alertThresholdPct;
    if (pendingAmount > budget.monthlyLimit) {
      return { allowed: false, reason: "hard_cap", usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 };
    }
    return { allowed: true, alert, usagePct: pct, monthlyLimit: budget.monthlyLimit, creditsUsed: 0 };
  }

  // No enforcement if monthlyLimit is 0 (unlimited tracking)
  if (budget.monthlyLimit <= 0) {
    const pct = 0;
    return { allowed: true, usagePct: pct, monthlyLimit: 0, creditsUsed: budget.creditsUsedThisMonth };
  }

  const projectedUsage = budget.creditsUsedThisMonth + pendingAmount;
  const usagePct = Math.round((projectedUsage / budget.monthlyLimit) * 100);

  // Hard cap check
  if (projectedUsage > budget.monthlyLimit) {
    return {
      allowed: false,
      reason: "hard_cap",
      usagePct,
      monthlyLimit: budget.monthlyLimit,
      creditsUsed: budget.creditsUsedThisMonth,
    };
  }

  // Alert threshold check
  const alert = usagePct >= budget.alertThresholdPct && !budget.alertSent;

  return {
    allowed: true,
    alert,
    usagePct,
    monthlyLimit: budget.monthlyLimit,
    creditsUsed: budget.creditsUsedThisMonth,
  };
}

/**
 * Increment budget usage after a successful credit deduction.
 * Upserts: creates record if none exists.
 */
export async function incrementBudgetUsage(
  tenantId: string,
  userId: number,
  amount: number,
  monthlyLimit?: number,
): Promise<{ alertTriggered: boolean; hardCapReached: boolean }> {
  const currentMonth = getCurrentMonthKey();
  const budget = await getUserBudget(tenantId, userId);

  if (!budget) {
    // Create tracking record (monthlyLimit=0 means unlimited)
    await db.insert(userCreditBudgets).values({
      tenantId,
      userId,
      monthlyLimit: monthlyLimit ?? 0,
      creditsUsedThisMonth: amount,
      budgetMonthKey: currentMonth,
      alertThresholdPct: 80,
      alertSent: false,
      hardCapReached: false,
    });
    return { alertTriggered: false, hardCapReached: false };
  }

  // Reset if stale month
  if (budget.budgetMonthKey !== currentMonth) {
    await resetBudgetIfNewMonth(tenantId, userId, currentMonth);
    budget.creditsUsedThisMonth = 0;
    budget.alertSent = false;
    budget.hardCapReached = false;
  }

  const newUsage = budget.creditsUsedThisMonth + amount;
  const limit = budget.monthlyLimit;

  let alertTriggered = false;
  let hardCapReached = false;

  if (limit > 0) {
    const usagePct = Math.round((newUsage / limit) * 100);
    if (usagePct >= budget.alertThresholdPct && !budget.alertSent) {
      alertTriggered = true;
    }
    if (newUsage >= limit) {
      hardCapReached = true;
    }
  }

  await db
    .update(userCreditBudgets)
    .set({
      creditsUsedThisMonth: sql`${userCreditBudgets.creditsUsedThisMonth} + ${amount}`,
      alertSent: alertTriggered ? true : budget.alertSent,
      hardCapReached,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userCreditBudgets.tenantId, tenantId),
        eq(userCreditBudgets.userId, userId),
      ),
    );

  return { alertTriggered, hardCapReached };
}

/**
 * Reset budget counters when the month has rolled over.
 */
export async function resetBudgetIfNewMonth(
  tenantId: string,
  userId: number,
  currentMonthKey: string,
): Promise<void> {
  await db
    .update(userCreditBudgets)
    .set({
      creditsUsedThisMonth: 0,
      alertSent: false,
      hardCapReached: false,
      budgetMonthKey: currentMonthKey,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userCreditBudgets.tenantId, tenantId),
        eq(userCreditBudgets.userId, userId),
      ),
    );
}

/**
 * Set or update budget configuration for a user.
 */
export async function setBudgetConfig(
  tenantId: string,
  userId: number,
  config: { monthlyLimit: number; alertThresholdPct?: number },
): Promise<void> {
  if (config.monthlyLimit < 0) {
    throw new Error("monthlyLimit must be non-negative");
  }
  const threshold = config.alertThresholdPct ?? 80;
  if (threshold < 1 || threshold > 100) {
    throw new Error("alertThresholdPct must be between 1 and 100");
  }

  const currentMonth = getCurrentMonthKey();

  // Upsert: insert or update on conflict
  await db
    .insert(userCreditBudgets)
    .values({
      tenantId,
      userId,
      monthlyLimit: config.monthlyLimit,
      creditsUsedThisMonth: 0,
      budgetMonthKey: currentMonth,
      alertThresholdPct: threshold,
      alertSent: false,
      hardCapReached: false,
    })
    .onConflictDoUpdate({
      target: [userCreditBudgets.tenantId, userCreditBudgets.userId],
      set: {
        monthlyLimit: config.monthlyLimit,
        alertThresholdPct: threshold,
        updatedAt: new Date(),
      },
    });
}

/**
 * Remove budget limit (set to unlimited).
 */
export async function removeBudget(
  tenantId: string,
  userId: number,
): Promise<void> {
  await db
    .update(userCreditBudgets)
    .set({
      monthlyLimit: 0,
      hardCapReached: false,
      alertSent: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(userCreditBudgets.tenantId, tenantId),
        eq(userCreditBudgets.userId, userId),
      ),
    );
}
