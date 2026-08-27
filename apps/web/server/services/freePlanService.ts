import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";

import { getDb } from "../db";
import {
  billingSubscriptions,
  creditPackages,
  users,
  type CreditPackage,
  type User,
} from "../../drizzle/schema";
import { addCreditsWithinTransaction } from "./creditService";

export const FREE_PLAN_CODE = "free" as const;
const FREE_PACKAGE_TYPE = "subscription" as const;
const FREE_BILLING_PERIOD = "monthly" as const;
const CURRENT_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "pending_migration",
  "downgraded_to_free",
] as const;
const PAID_SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "pending_migration",
] as const;

type FreePlanAssignmentReason =
  | "signup"
  | "oauth_signup"
  | "existing_user_backfill"
  | "login_repair"
  | "email_completion";

export type FreePlanAssignmentResult =
  | {
      status: "assigned";
      userId: number;
      subscriptionId: number;
      creditsAdded: number;
    }
  | {
      status: "already_assigned";
      userId: number;
      subscriptionId: number;
      creditsAdded: number;
    }
  | {
      status: "skipped";
      userId: number;
      reason: "system_user" | "paid_entitlement" | "missing_user";
    };

export function isSystemManagedUser(
  user: Pick<User, "role" | "isSystemUser">
): boolean {
  return (
    user.role === "admin" ||
    user.role === "system_agent" ||
    user.isSystemUser === true
  );
}

export function shouldPreservePaidEntitlement(
  user: Pick<User, "plan">
): boolean {
  return user.plan !== FREE_PLAN_CODE;
}

export function addOneMonth(base: Date): Date {
  const originalDay = base.getUTCDate();
  const next = new Date(base);
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const lastDayOfTargetMonth = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)
  ).getUTCDate();
  next.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return next;
}

export function getDueMonthlyCycles(
  periodEnd: Date | null | undefined,
  now: Date
): Array<{ cycleStart: Date; cycleEnd: Date }> {
  if (!periodEnd) return [];

  const cycles: Array<{ cycleStart: Date; cycleEnd: Date }> = [];
  let cycleStart = new Date(periodEnd);
  while (cycleStart <= now) {
    const cycleEnd = addOneMonth(cycleStart);
    cycles.push({ cycleStart, cycleEnd });
    cycleStart = cycleEnd;
  }
  return cycles;
}

function packageSnapshot(pkg: CreditPackage) {
  return {
    packageId: pkg.id,
    packageCode: pkg.code,
    packageName: pkg.name,
    credits: pkg.credits,
    priceUsd: Number(pkg.priceUsd),
    billingPeriod: pkg.billingPeriod,
  };
}

export async function getFreePlanPackage(): Promise<CreditPackage> {
  const db = getDb();
  const [pkg] = await db
    .select()
    .from(creditPackages)
    .where(
      and(
        eq(creditPackages.code, FREE_PLAN_CODE),
        eq(creditPackages.packageType, FREE_PACKAGE_TYPE),
        eq(creditPackages.billingPeriod, FREE_BILLING_PERIOD),
        eq(creditPackages.isActive, true)
      )
    )
    .orderBy(asc(creditPackages.id))
    .limit(1);

  if (!pkg) {
    throw new Error("FREE_PLAN_PACKAGE_NOT_CONFIGURED");
  }
  if (Number(pkg.priceUsd) !== 0) {
    throw new Error("FREE_PLAN_PACKAGE_PRICE_MUST_BE_ZERO");
  }
  if (pkg.credits <= 0) {
    throw new Error("FREE_PLAN_PACKAGE_CREDITS_MUST_BE_POSITIVE");
  }
  return pkg;
}

async function hasPaidSubscription(tx: any, userId: number): Promise<boolean> {
  const [paid] = await tx
    .select({ id: billingSubscriptions.id })
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        inArray(billingSubscriptions.status, PAID_SUBSCRIPTION_STATUSES),
        ne(billingSubscriptions.planCode, FREE_PLAN_CODE)
      )
    )
    .limit(1);
  return Boolean(paid);
}

async function findCurrentFreeSubscription(
  tx: any,
  userId: number,
  packageId: number
) {
  const [subscription] = await tx
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.planCode, FREE_PLAN_CODE),
        inArray(billingSubscriptions.status, CURRENT_SUBSCRIPTION_STATUSES),
        or(
          eq(billingSubscriptions.packageId, packageId),
          isNull(billingSubscriptions.packageId)
        )
      )
    )
    .orderBy(
      desc(billingSubscriptions.updatedAt),
      desc(billingSubscriptions.id)
    )
    .limit(1);
  return subscription ?? null;
}

/**
 * Assign the active monthly Free package and its initial allowance to a user.
 * The advisory lock makes the operation safe when signup and repair/backfill
 * happen concurrently; the ledger idempotency key makes credit grants exact-once.
 */
export async function ensureFreePlanForUser(
  userId: number,
  options: { reason?: FreePlanAssignmentReason } = {}
): Promise<FreePlanAssignmentResult> {
  const db = getDb();
  const pkg = await getFreePlanPackage();
  const reason = options.reason ?? "login_repair";

  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);

    const [user] = await tx
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .for("update")
      .limit(1);

    if (!user) {
      return { status: "skipped", userId, reason: "missing_user" };
    }
    if (isSystemManagedUser(user)) {
      return { status: "skipped", userId, reason: "system_user" };
    }
    if (shouldPreservePaidEntitlement(user)) {
      return { status: "skipped", userId, reason: "paid_entitlement" };
    }
    if (await hasPaidSubscription(tx, userId)) {
      return { status: "skipped", userId, reason: "paid_entitlement" };
    }

    const now = new Date();
    const existing = await findCurrentFreeSubscription(tx, userId, pkg.id);
    let subscriptionId: number;
    let assigned = false;

    if (existing) {
      subscriptionId = existing.id;
      await tx
        .update(billingSubscriptions)
        .set({
          packageId: pkg.id,
          planCode: FREE_PLAN_CODE,
          status: "active",
          billingPeriod: FREE_BILLING_PERIOD,
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
          billingAnchorAt: existing.billingAnchorAt ?? now,
          currentPeriodStart: existing.currentPeriodStart ?? now,
          currentPeriodEnd: existing.currentPeriodEnd ?? addOneMonth(now),
          nextInvoiceAt: null,
          legacyPlanSnapshot: packageSnapshot(pkg),
          updatedAt: now,
        })
        .where(eq(billingSubscriptions.id, subscriptionId));
    } else {
      const [created] = await tx
        .insert(billingSubscriptions)
        .values({
          tenantId: user.currentTenantId,
          userId,
          packageId: pkg.id,
          planCode: FREE_PLAN_CODE,
          status: "active",
          source: "admin_created",
          billingPeriod: FREE_BILLING_PERIOD,
          renewalMode: "manual_invoice",
          autoRenewEnabled: false,
          billingAnchorAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: addOneMonth(now),
          nextInvoiceAt: null,
          legacyPlanSnapshot: packageSnapshot(pkg),
          migratedFromUserPlan: false,
        })
        .returning({ id: billingSubscriptions.id });
      subscriptionId = created.id;
      assigned = true;
    }

    await tx
      .update(users)
      .set({
        plan: FREE_PLAN_CODE,
        // The recurring Free subscription is the user's entitlement. It must
        // not be treated as the expiring signup/invite credit pool.
        freeCreditPolicyCancelledAt: now,
        updatedAt: now,
      })
      .where(eq(users.id, userId));

    const grant = await addCreditsWithinTransaction(tx, {
      userId,
      amount: pkg.credits,
      type: "subscription",
      description: `Free plan monthly allowance (${reason})`,
      referenceId: `free-plan:${subscriptionId}:initial`,
      idempotencyKey: `free-plan:${subscriptionId}:initial`,
      metadata: {
        packageId: pkg.id,
        packageCode: pkg.code,
        packageName: pkg.name,
        billingPeriod: FREE_BILLING_PERIOD,
        grantKind: "initial",
      },
      sourceType: "admin",
    });

    return {
      status: assigned ? "assigned" : "already_assigned",
      userId,
      subscriptionId,
      creditsAdded: grant.duplicate ? 0 : pkg.credits,
    };
  });
}

export async function backfillFreePlanAssignments(): Promise<{
  scanned: number;
  assigned: number;
  alreadyAssigned: number;
  skipped: number;
}> {
  const db = getDb();
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.plan, FREE_PLAN_CODE),
        ne(users.role, "admin"),
        ne(users.role, "system_agent"),
        or(eq(users.isSystemUser, false), isNull(users.isSystemUser))
      )
    )
    .orderBy(asc(users.id));

  let assigned = 0;
  let alreadyAssigned = 0;
  let skipped = 0;
  for (const row of rows) {
    const result = await ensureFreePlanForUser(row.id, {
      reason: "existing_user_backfill",
    });
    if (result.status === "assigned") assigned += 1;
    else if (result.status === "already_assigned") alreadyAssigned += 1;
    else skipped += 1;
  }

  return { scanned: rows.length, assigned, alreadyAssigned, skipped };
}

export async function runFreePlanMonthlyGrant(): Promise<{
  subscriptionsScanned: number;
  cyclesGranted: number;
  usersSkipped: number;
}> {
  const db = getDb();
  const pkg = await getFreePlanPackage();
  const subscriptions = await db
    .select({ id: billingSubscriptions.id })
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.packageId, pkg.id),
        eq(billingSubscriptions.planCode, FREE_PLAN_CODE),
        eq(billingSubscriptions.status, "active")
      )
    )
    .orderBy(asc(billingSubscriptions.id));

  let cyclesGranted = 0;
  let usersSkipped = 0;
  for (const row of subscriptions) {
    const result = await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${row.id})`);
      const [subscription] = await tx
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.id, row.id))
        .for("update")
        .limit(1);
      if (!subscription || subscription.status !== "active") return 0;

      const [user] = await tx
        .select({
          id: users.id,
          role: users.role,
          isSystemUser: users.isSystemUser,
        })
        .from(users)
        .where(eq(users.id, subscription.userId))
        .for("update")
        .limit(1);
      if (!user || isSystemManagedUser(user)) return -1;

      const now = new Date();
      const cycles = getDueMonthlyCycles(subscription.currentPeriodEnd, now);
      for (const cycle of cycles) {
        const grant = await addCreditsWithinTransaction(tx, {
          userId: user.id,
          amount: pkg.credits,
          type: "subscription",
          description: "Free plan monthly allowance",
          referenceId: `free-plan:${subscription.id}:${cycle.cycleStart.toISOString()}`,
          idempotencyKey: `free-plan:${subscription.id}:${cycle.cycleStart.toISOString()}`,
          metadata: {
            packageId: pkg.id,
            packageCode: pkg.code,
            packageName: pkg.name,
            billingPeriod: FREE_BILLING_PERIOD,
            grantKind: "monthly",
            cycleStart: cycle.cycleStart.toISOString(),
            cycleEnd: cycle.cycleEnd.toISOString(),
          },
          sourceType: "admin",
        });
        if (!grant.duplicate) cyclesGranted += 1;
      }

      if (cycles.length > 0) {
        const finalCycle = cycles[cycles.length - 1];
        await tx
          .update(billingSubscriptions)
          .set({
            currentPeriodStart: finalCycle.cycleStart,
            currentPeriodEnd: finalCycle.cycleEnd,
            billingAnchorAt:
              subscription.billingAnchorAt ?? finalCycle.cycleStart,
            nextInvoiceAt: null,
            updatedAt: now,
          })
          .where(eq(billingSubscriptions.id, subscription.id));
      }
      return 0;
    });
    if (result < 0) usersSkipped += 1;
  }

  return {
    subscriptionsScanned: subscriptions.length,
    cyclesGranted,
    usersSkipped,
  };
}
