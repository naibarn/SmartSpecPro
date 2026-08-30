import { and, eq } from "drizzle-orm";
import { getDb } from "../db";
import { users } from "../../drizzle/schema";
import { auditLogger } from "./auditLogger";
import { checkAndDisableInactiveFreeCreditUsers } from "./freeCreditInactivityService";

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
  const result = await checkAndDisableInactiveFreeCreditUsers();
  if (result.disabled > 0) {
    console.log(
      `[InactiveUser] Disabled ${result.disabled} users for free-credit inactivity (15-day policy)`,
    );
  }
  return result;
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
  // Keep the comparison string-based for compatibility with legacy rows while
  // the canonical schema stores both tenant identifiers as varchar values.
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
