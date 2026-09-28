import {
  and,
  eq,
  isNotNull,
  isNull,
  lt,
  or,
} from "drizzle-orm";
import { getDb } from "../db";
import {
  creditTransactions,
  systemSettings,
  users,
} from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";

export const DEFAULT_FREE_CREDIT_INACTIVITY_DAYS = 15;
const DAY_MS = 24 * 60 * 60 * 1000;

type LifecycleUser = {
  id: number;
  role: string;
  credits: number;
  isDisabled: boolean;
  freeCreditGrantedAt: Date | null;
  freeCreditPolicyCancelledAt: Date | null;
  freeCreditNoticeSentAt: Date | null;
  lastCreditUsedAt: Date | null;
};

export type FreeCreditStatus = {
  eligible: boolean;
  noticeDue: boolean;
  daysRemaining: number | null;
  deadlineAt: string | null;
  grantedAt: string | null;
  activityAt: string | null;
  policyCancelled: boolean;
};

export type FreeCreditLifecycleResult = {
  status: FreeCreditStatus | null;
  disabled: boolean;
  databaseUnavailable: boolean;
};

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function laterDate(left: Date, right: Date): Date {
  return left.getTime() >= right.getTime() ? left : right;
}

export function calculateFreeCreditStatus(
  user: Pick<
    LifecycleUser,
    | "role"
    | "isDisabled"
    | "freeCreditGrantedAt"
    | "freeCreditPolicyCancelledAt"
    | "freeCreditNoticeSentAt"
    | "lastCreditUsedAt"
  >,
  now: Date,
  inactivityDays = DEFAULT_FREE_CREDIT_INACTIVITY_DAYS,
): FreeCreditStatus {
  const grantedAt = user.freeCreditGrantedAt;
  const policyCancelled = user.freeCreditPolicyCancelledAt !== null;
  const excludedRole = user.role !== "user";

  if (!grantedAt || policyCancelled || excludedRole || inactivityDays <= 0) {
    return {
      eligible: false,
      noticeDue: false,
      daysRemaining: null,
      deadlineAt: null,
      grantedAt: grantedAt?.toISOString() ?? null,
      activityAt: null,
      policyCancelled,
    };
  }

  const activityAt = user.lastCreditUsedAt && user.lastCreditUsedAt > grantedAt
    ? user.lastCreditUsedAt
    : grantedAt;
  const deadline = new Date(activityAt.getTime() + inactivityDays * DAY_MS);
  const remainingMs = deadline.getTime() - now.getTime();

  return {
    eligible: !user.isDisabled,
    noticeDue: false,
    daysRemaining: Math.max(0, Math.ceil(remainingMs / DAY_MS)),
    deadlineAt: deadline.toISOString(),
    grantedAt: grantedAt.toISOString(),
    activityAt: activityAt.toISOString(),
    policyCancelled: false,
  };
}

async function getConfiguredInactivityDays(): Promise<number> {
  try {
    const db = await getDb();
    if (!db) return DEFAULT_FREE_CREDIT_INACTIVITY_DAYS;
    const [setting] = await db
      .select({ value: systemSettings.value })
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, "registration"),
          eq(systemSettings.key, "invite_inactive_days_limit"),
        ),
      )
      .limit(1);
    if (setting?.value == null) return DEFAULT_FREE_CREDIT_INACTIVITY_DAYS;
    const days = Number.parseInt(setting.value, 10);
    return Number.isFinite(days) && days >= 0
      ? days
      : DEFAULT_FREE_CREDIT_INACTIVITY_DAYS;
  } catch {
    return DEFAULT_FREE_CREDIT_INACTIVITY_DAYS;
  }
}

const lifecycleColumns = {
  id: users.id,
  role: users.role,
  credits: users.credits,
  isDisabled: users.isDisabled,
  freeCreditGrantedAt: users.freeCreditGrantedAt,
  freeCreditPolicyCancelledAt: users.freeCreditPolicyCancelledAt,
  freeCreditNoticeSentAt: users.freeCreditNoticeSentAt,
  lastCreditUsedAt: users.lastCreditUsedAt,
};

/**
 * Enforce the free-credit policy and optionally claim today's warning.
 * The user row is locked for the whole decision so usage and purchase updates
 * serialize cleanly with expiry/reset.
 */
export async function enforceFreeCreditPolicyForUser(params: {
  userId: number;
  now?: Date;
  claimNotice?: boolean;
}): Promise<FreeCreditLifecycleResult> {
  const db = await getDb();
  if (!db) {
    return { status: null, disabled: false, databaseUnavailable: true };
  }

  const now = params.now ?? new Date();
  const inactivityDays = await getConfiguredInactivityDays();
  let disabledByExpiry = false;

  const result = await db.transaction(async (tx) => {
    const [user] = await tx
      .select(lifecycleColumns)
      .from(users)
      .where(eq(users.id, params.userId))
      .for("update")
      .limit(1);

    if (!user) return { status: null as FreeCreditStatus | null, disabled: false };

    const status = calculateFreeCreditStatus(user, now, inactivityDays);
    if (!status.eligible || !status.deadlineAt) {
      return { status, disabled: false };
    }

    if (new Date(status.deadlineAt).getTime() <= now.getTime()) {
      const resetAmount = Math.max(0, user.credits);
      const grantedAt = user.freeCreditGrantedAt;
      if (!grantedAt) return { status, disabled: false };
      const guards = [
        eq(users.id, user.id),
        eq(users.role, "user"),
        eq(users.isDisabled, false),
        eq(users.freeCreditGrantedAt, grantedAt),
        isNull(users.freeCreditPolicyCancelledAt),
        user.lastCreditUsedAt
          ? eq(users.lastCreditUsedAt, user.lastCreditUsedAt)
          : isNull(users.lastCreditUsedAt),
      ];

      const [updated] = await tx
        .update(users)
        .set({
          credits: 0,
          isDisabled: true,
          disabledReason: "inactive",
          updatedAt: now,
        })
        .where(and(...guards))
        .returning({ id: users.id });

      if (!updated) return { status, disabled: false };

      if (resetAmount > 0) {
        await tx.insert(creditTransactions).values({
          userId: user.id,
          amount: -resetAmount,
          type: "adjustment",
          description: "Free-credit inactivity reset",
          metadata: {
            reason: "free_credit_inactivity_reset",
            inactivityDays,
            deadlineAt: status.deadlineAt,
          },
          balanceAfter: 0,
        });
      }

      disabledByExpiry = true;
      return {
        status: {
          ...status,
          eligible: false,
          noticeDue: false,
          daysRemaining: 0,
        },
        disabled: true,
      };
    }

    if (!params.claimNotice) return { status, disabled: false };

    const [claimed] = await tx
      .update(users)
      .set({ freeCreditNoticeSentAt: now, updatedAt: now })
      .where(
        and(
          eq(users.id, user.id),
          eq(users.isDisabled, false),
          isNotNull(users.freeCreditGrantedAt),
          isNull(users.freeCreditPolicyCancelledAt),
          or(
            isNull(users.freeCreditNoticeSentAt),
            lt(users.freeCreditNoticeSentAt, startOfUtcDay(now)),
          ),
        ),
      )
      .returning({ id: users.id });

    return {
      status: { ...status, noticeDue: Boolean(claimed) },
      disabled: false,
    };
  });

  if (disabledByExpiry) {
    auditLogger.log({
      eventType: "user_disabled_inactive",
      userId: params.userId,
      metadata: {
        reason: "inactive",
        inactivityDays,
        resetCredits: true,
      },
    });
  }

  return {
    status: result.status,
    disabled: result.disabled,
    databaseUnavailable: false,
  };
}

/** Run the same policy used during authentication as a background backstop. */
export async function checkAndDisableInactiveFreeCreditUsers(): Promise<{
  disabled: number;
  checked: number;
}> {
  const db = await getDb();
  if (!db) return { disabled: 0, checked: 0 };
  if ((await getConfiguredInactivityDays()) <= 0) {
    return { disabled: 0, checked: 0 };
  }

  const candidates = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.role, "user"),
        eq(users.isDisabled, false),
        isNotNull(users.freeCreditGrantedAt),
        isNull(users.freeCreditPolicyCancelledAt),
      ),
    );

  let disabled = 0;
  for (const candidate of candidates) {
    const result = await enforceFreeCreditPolicyForUser({ userId: candidate.id });
    if (result.disabled) disabled += 1;
  }
  return { disabled, checked: candidates.length };
}
