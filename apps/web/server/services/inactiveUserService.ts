import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { getDb } from "../db";
import { users, inviteCodes, systemSettings } from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";

/**
 * Checks for users registered via admin invite codes who haven't used
 * any credits within the configured inactivity window, and disables them.
 *
 * Runs as a scheduled daily job.
 */
export async function checkAndDisableInactiveUsers(): Promise<{
  disabled: number;
  checked: number;
}> {
  const db = await getDb();
  if (!db) return { disabled: 0, checked: 0 };

  // Read inactivity limit from system settings
  let inactiveDaysLimit = 0;
  try {
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, "registration"),
          eq(systemSettings.key, "invite_inactive_days_limit"),
        ),
      )
      .limit(1);
    inactiveDaysLimit = parseInt(setting?.value || "0", 10) || 0;
  } catch {
    /* use default */
  }

  if (inactiveDaysLimit <= 0) {
    return { disabled: 0, checked: 0 };
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - inactiveDaysLimit);

  // Grace period: don't disable users who registered recently.
  // Users must have been registered for at least graceDays before being eligible.
  // This means a user registered 5 days ago won't be disabled even if inactiveDaysLimit=3.
  // Grace = max(inactiveDaysLimit, 7) — so at minimum 7 days after registration.
  const graceDays = Math.max(inactiveDaysLimit, 7);
  const graceCutoff = new Date();
  graceCutoff.setDate(graceCutoff.getDate() - graceDays);

  // Find users who:
  // 1. Were referred by an invite code (have referredByInviteCodeId)
  // 2. That invite code is admin-type
  // 3. Haven't used credits (lastCreditUsedAt is null or older than cutoff)
  // 4. Are not already disabled
  // 5. Registered before the grace period
  const candidateUsers = await db
    .select({
      userId: users.id,
      lastCreditUsedAt: users.lastCreditUsedAt,
      createdAt: users.createdAt,
    })
    .from(users)
    .innerJoin(inviteCodes, eq(users.referredByInviteCodeId, inviteCodes.id))
    .where(
      and(
        isNotNull(users.referredByInviteCodeId),
        eq(inviteCodes.type, "admin"),
        eq(users.isDisabled, false),
        lt(users.createdAt, graceCutoff), // registered before grace period
        or(
          isNull(users.lastCreditUsedAt),
          lt(users.lastCreditUsedAt, cutoffDate),
        ),
      ),
    );

  if (candidateUsers.length === 0) {
    return { disabled: 0, checked: candidateUsers.length };
  }

  // Disable them
  const userIds = candidateUsers.map((u) => u.userId);
  const result = await db
    .update(users)
    .set({
      isDisabled: true,
      disabledReason: "inactive",
      updatedAt: new Date(),
    })
    .where(
      and(
        inArray(users.id, userIds),
        eq(users.isDisabled, false), // double-check to avoid race
      ),
    )
    .returning({ id: users.id });

  for (const u of result) {
    auditLogger.log({
      eventType: "user_disabled_inactive",
      userId: u.id,
      metadata: { reason: "inactive", inactiveDaysLimit, graceDays },
    });
  }

  console.log(
    `[InactiveUser] Disabled ${result.length} users for inactivity (limit: ${inactiveDaysLimit} days)`,
  );

  return { disabled: result.length, checked: candidateUsers.length };
}

/**
 * Admin reactivates a disabled user.
 */
export async function reactivateUser(
  userId: number,
  adminId: number,
  adminTenantId?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  const [user] = await db
    .select({
      id: users.id,
      isDisabled: users.isDisabled,
      registeredDomain: users.registeredDomain,
      currentTenantId: users.currentTenantId,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!user) {
    return { success: false, error: "User not found" };
  }

  if (!user.isDisabled) {
    return { success: false, error: "User is not disabled" };
  }

  // Tenant isolation: domain admins can only reactivate users in their own tenant
  // Super admins (adminTenantId = null) can reactivate any user
  // Note: currentTenantId is integer but tenantId is varchar — compare as strings
  if (adminTenantId) {
    const userTenant = user.currentTenantId != null ? String(user.currentTenantId) : null;
    // Block if user has no tenant (null) or belongs to a different tenant
    if (!userTenant || userTenant !== String(adminTenantId)) {
      return { success: false, error: "Cannot reactivate user from another tenant" };
    }
  }

  await db
    .update(users)
    .set({
      isDisabled: false,
      disabledReason: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  auditLogger.log({
    eventType: "user_reactivated",
    userId,
    metadata: { adminId, reactivatedAt: new Date().toISOString() },
  });

  console.log(
    `[InactiveUser] Admin ${adminId} reactivated user ${userId}`,
  );

  return { success: true };
}
