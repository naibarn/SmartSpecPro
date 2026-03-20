import crypto from "crypto";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  inviteCodes,
  inviteCodeUsage,
  users,
  systemSettings,
  deviceFingerprints,
} from "../../drizzle/schema";
import type { InviteCode } from "../../drizzle/schema";
import { addCredits } from "./creditService";
import { auditLogger } from "./auditLogger";

// ---------- Code generation ----------

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion

export function generateUniqueCode(length = 8): string {
  const bytes = crypto.randomBytes(length);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_CHARS[bytes[i]! % CODE_CHARS.length];
  }
  return code;
}

// ---------- System settings helpers ----------

async function getSettingValue(
  category: string,
  key: string,
  defaultValue: string,
): Promise<string> {
  try {
    const db = await getDb();
    if (!db) return defaultValue;
    const [setting] = await db
      .select()
      .from(systemSettings)
      .where(
        and(
          eq(systemSettings.category, category),
          eq(systemSettings.key, key),
        ),
      )
      .limit(1);
    return setting?.value ?? defaultValue;
  } catch {
    return defaultValue;
  }
}

export async function getRegistrationMode(): Promise<"open" | "invite_only"> {
  const mode = await getSettingValue("registration", "registration_mode", "open");
  return mode === "invite_only" ? "invite_only" : "open";
}

export async function getUserInviteEnabled(): Promise<boolean> {
  const val = await getSettingValue("registration", "user_invite_enabled", "false");
  return val === "true";
}

export async function getUserReferralBonusCredits(): Promise<number> {
  const val = await getSettingValue("registration", "user_referral_bonus_credits", "50");
  return parseInt(val, 10) || 50;
}

export async function getMaxRegistrationsPerDevice(): Promise<number> {
  const val = await getSettingValue("registration", "max_registrations_per_device", "2");
  return parseInt(val, 10) || 2;
}

export async function getAuthMethodsConfig(): Promise<{
  email: boolean;
  google: boolean;
  github: boolean;
}> {
  const val = await getSettingValue(
    "registration",
    "allowed_auth_methods",
    '["email","google","github"]',
  );
  try {
    const methods: string[] = JSON.parse(val);
    return {
      email: methods.includes("email"),
      google: methods.includes("google"),
      github: methods.includes("github"),
    };
  } catch {
    return { email: true, google: true, github: true };
  }
}

// ---------- Validation ----------

export interface ValidateResult {
  valid: boolean;
  codeId?: number;
  codeData?: InviteCode;
  error?: string;
}

export async function validateInviteCode(
  code: string,
  tenantId?: string | null,
): Promise<ValidateResult> {
  const db = await getDb();
  if (!db) return { valid: false, error: "Database unavailable" };

  const conditions = [eq(inviteCodes.code, code.toUpperCase().trim())];
  // Scope to tenant: match codes belonging to this tenant OR global (null tenant)
  // When tenantId is null (unauthenticated), restrict to global codes only
  if (tenantId) {
    conditions.push(
      or(eq(inviteCodes.tenantId, tenantId), isNull(inviteCodes.tenantId))!,
    );
  } else {
    conditions.push(isNull(inviteCodes.tenantId));
  }

  const [inviteCode] = await db
    .select()
    .from(inviteCodes)
    .where(and(...conditions))
    .limit(1);

  if (!inviteCode) {
    return { valid: false, error: "Invalid invite code" };
  }

  if (!inviteCode.isActive) {
    return { valid: false, error: "Invite code is no longer active" };
  }

  if (inviteCode.expiresAt && inviteCode.expiresAt < new Date()) {
    return { valid: false, error: "Invite code has expired" };
  }

  if (
    inviteCode.maxUses !== null &&
    inviteCode.currentUses >= inviteCode.maxUses
  ) {
    return { valid: false, error: "Invite code has reached its usage limit" };
  }

  return { valid: true, codeId: inviteCode.id, codeData: inviteCode };
}

// ---------- Registration checks ----------

export async function checkRegistrationAllowed(
  inviteCode?: string,
  tenantId?: string | null,
): Promise<{ allowed: boolean; codeId?: number; codeData?: InviteCode; error?: string }> {
  const mode = await getRegistrationMode();

  if (mode === "open") {
    // Open mode: invite code is optional; invalid code does NOT block registration
    if (inviteCode) {
      const result = await validateInviteCode(inviteCode, tenantId);
      if (result.valid) {
        return { allowed: true, codeId: result.codeId, codeData: result.codeData };
      }
      // Invalid code in open mode: allow registration but ignore the code
      console.warn(`[InviteCode] Invalid code "${inviteCode}" in open mode — ignoring`);
      return { allowed: true };
    }
    return { allowed: true };
  }

  // Invite-only mode: code is required
  if (!inviteCode) {
    return { allowed: false, error: "Registration requires an invite code" };
  }

  const result = await validateInviteCode(inviteCode, tenantId);
  return { allowed: result.valid, ...result };
}

export async function checkDeviceFraudLimit(
  fingerprintHash: string | undefined,
  ipAddress: string | undefined,
): Promise<{ allowed: boolean; reason?: string }> {
  if (!fingerprintHash && !ipAddress) return { allowed: true };

  const db = await getDb();
  if (!db) return { allowed: true };

  const maxPerDevice = await getMaxRegistrationsPerDevice();
  if (maxPerDevice <= 0) return { allowed: true }; // 0 = disabled

  // Check fingerprint-based limit (primary)
  if (fingerprintHash) {
    const [result] = await db
      .select({ count: sql<number>`count(distinct ${deviceFingerprints.userId})::int` })
      .from(deviceFingerprints)
      .where(eq(deviceFingerprints.fingerprintHash, fingerprintHash));

    if (result && result.count >= maxPerDevice) {
      return {
        allowed: false,
        reason: `Device has already been used to register ${result.count} accounts`,
      };
    }
  }

  // IP-based limit — always checked (higher threshold since IPs can be shared)
  if (ipAddress) {
    const ipLimit = maxPerDevice * 3; // 3x the device limit for IP-based check
    const [result] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.registrationIp, ipAddress));

    if (result && result.count >= ipLimit) {
      return {
        allowed: false,
        reason: `Too many registrations from this network`,
      };
    }
  }

  return { allowed: true };
}

// ---------- Process invite code usage ----------

export async function processInviteCodeUsage(
  codeId: number,
  newUserId: number,
): Promise<{ success: boolean; error?: string }> {
  const db = await getDb();
  if (!db) return { success: false, error: "Database unavailable" };

  try {
    return await db.transaction(async (tx) => {
      // Lock and read the code first for self-referral check
      const [code] = await tx
        .select()
        .from(inviteCodes)
        .where(
          and(
            eq(inviteCodes.id, codeId),
            eq(inviteCodes.isActive, true),
            or(
              isNull(inviteCodes.maxUses),
              lt(inviteCodes.currentUses, inviteCodes.maxUses),
            ),
          ),
        )
        .for("update")
        .limit(1);

      if (!code) {
        return { success: false, error: "Invite code is no longer valid" };
      }

      // Self-referral prevention (checked BEFORE increment)
      if (code.ownerId === newUserId) {
        return { success: false, error: "Cannot use your own invite code" };
      }

      // Atomically increment usage count
      const [updated] = await tx
        .update(inviteCodes)
        .set({
          currentUses: sql`${inviteCodes.currentUses} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(inviteCodes.id, codeId))
        .returning();

      // Record usage
      let creditsGivenToUser = 0;
      let creditsGivenToOwner = 0;

      // Give bonus credits to new user
      if (updated.bonusCreditsForNewUser > 0) {
        creditsGivenToUser = updated.bonusCreditsForNewUser;
      }

      // Give referral bonus to code owner (for user-type codes)
      if (updated.bonusCreditsForOwner > 0) {
        creditsGivenToOwner = updated.bonusCreditsForOwner;
      }

      // Insert usage record
      await tx.insert(inviteCodeUsage).values({
        inviteCodeId: codeId,
        registeredUserId: newUserId,
        creditsGivenToUser,
        creditsGivenToOwner,
      });

      // Update user's referral link
      await tx
        .update(users)
        .set({ referredByInviteCodeId: codeId })
        .where(eq(users.id, newUserId));

      // Auto-deactivate if at limit (.returning() gives post-update value)
      if (
        updated.maxUses !== null &&
        updated.currentUses >= updated.maxUses
      ) {
        await tx
          .update(inviteCodes)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(inviteCodes.id, codeId));
      }

      auditLogger.log({
        eventType: "invite_code_used",
        userId: newUserId,
        metadata: { inviteCodeId: codeId, code: code.code, codeType: code.type },
      });

      return { success: true };
    });
  } catch (err) {
    console.error("[InviteCode] processInviteCodeUsage error:", err);
    return { success: false, error: "Failed to process invite code" };
  }
}

/**
 * Give invite code bonuses AFTER the transaction is committed.
 * Called separately because addCredits has its own transaction.
 */
export async function giveInviteCodeBonuses(
  codeId: number,
  newUserId: number,
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const [code] = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.id, codeId))
    .limit(1);

  if (!code) return;

  // Idempotency: check if bonuses were already given for this code+user
  const [existingUsage] = await db
    .select({ id: inviteCodeUsage.id })
    .from(inviteCodeUsage)
    .where(
      and(
        eq(inviteCodeUsage.inviteCodeId, codeId),
        eq(inviteCodeUsage.registeredUserId, newUserId),
      ),
    )
    .limit(1);

  if (!existingUsage) {
    console.warn(`[InviteCode] No usage record for code ${codeId} / user ${newUserId} — skipping bonuses`);
    return;
  }

  // Skip entire bonus flow for zero-bonus codes (no credits to give)
  if (code.bonusCreditsForNewUser <= 0 && code.bonusCreditsForOwner <= 0) {
    return;
  }

  // Atomic claim: mark usage record as "processing" BEFORE giving credits.
  // Uses -1 as in-progress sentinel. The WHERE condition ensures only one
  // concurrent caller wins the race.
  const [claimed] = await db
    .update(inviteCodeUsage)
    .set({
      creditsGivenToUser: -1,
      creditsGivenToOwner: -1,
    })
    .where(
      and(
        eq(inviteCodeUsage.id, existingUsage.id),
        eq(inviteCodeUsage.creditsGivenToUser, 0),
        eq(inviteCodeUsage.creditsGivenToOwner, 0),
      ),
    )
    .returning({ id: inviteCodeUsage.id });

  if (!claimed) {
    console.log(`[InviteCode] Bonuses already claimed for code ${codeId} / user ${newUserId} — skipping`);
    return;
  }

  let actualUserCredits = 0;
  let actualOwnerCredits = 0;

  // Bonus for new user
  if (code.bonusCreditsForNewUser > 0) {
    try {
      await addCredits({
        userId: newUserId,
        amount: code.bonusCreditsForNewUser,
        type: "bonus",
        description: `Invite code bonus (${code.label || code.code})`,
        sourceType: "admin",
        metadata: { inviteCodeId: codeId, inviteCode: code.code },
        referenceId: `invite-newuser-${codeId}-${newUserId}`,
      });
      actualUserCredits = code.bonusCreditsForNewUser;
    } catch (err) {
      console.error("[InviteCode] Failed to give new user bonus:", err);
    }
  }

  // Referral bonus for code owner
  if (code.bonusCreditsForOwner > 0) {
    try {
      await addCredits({
        userId: code.ownerId,
        amount: code.bonusCreditsForOwner,
        type: "bonus",
        description: `Referral bonus: user registered with your code ${code.code}`,
        sourceType: "admin",
        metadata: {
          inviteCodeId: codeId,
          inviteCode: code.code,
          referredUserId: newUserId,
        },
        referenceId: `invite-referral-${codeId}-${newUserId}`,
      });
      actualOwnerCredits = code.bonusCreditsForOwner;
    } catch (err) {
      console.error("[InviteCode] Failed to give owner referral bonus:", err);
    }
  }

  // Update usage record with actual credit amounts (replace -1 sentinel)
  try {
    await db
      .update(inviteCodeUsage)
      .set({
        creditsGivenToUser: actualUserCredits,
        creditsGivenToOwner: actualOwnerCredits,
      })
      .where(eq(inviteCodeUsage.id, existingUsage.id));
  } catch (err) {
    console.error("[InviteCode] Failed to update usage credits record:", err);
    // -1 sentinels remain — will show as -1 in stats but prevent double-claim
  }
}

// ---------- User invite code ----------

export async function getUserInviteCode(
  userId: number,
  tenantId?: string | null,
): Promise<InviteCode | null> {
  const db = await getDb();
  if (!db) return null;

  const enabled = await getUserInviteEnabled();
  if (!enabled) return null;

  // Check for existing user code (scoped by tenant)
  const lookupConditions = [eq(inviteCodes.ownerId, userId), eq(inviteCodes.type, "user")];
  if (tenantId) {
    lookupConditions.push(eq(inviteCodes.tenantId, tenantId));
  } else {
    lookupConditions.push(isNull(inviteCodes.tenantId));
  }
  const [existing] = await db
    .select()
    .from(inviteCodes)
    .where(and(...lookupConditions))
    .limit(1);

  if (existing) return existing;

  // Auto-create a new code for this user
  const referralBonus = await getUserReferralBonusCredits();

  // Generate unique code with retry
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateUniqueCode(8);
    try {
      const [created] = await db
        .insert(inviteCodes)
        .values({
          code,
          type: "user",
          tenantId: tenantId || null,
          ownerId: userId,
          bonusCreditsForOwner: referralBonus,
          bonusCreditsForNewUser: 0,
        })
        .returning();
      return created ?? null;
    } catch (err: any) {
      // Unique constraint violation — retry with different code
      if (err?.code === "23505") continue;
      throw err;
    }
  }

  return null;
}
