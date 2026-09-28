/**
 * Invite Code tRPC Router
 * Admin: manage invite codes, view usage, reactivate users
 * User: get personal referral code
 * Public: validate codes, get registration config
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  router,
  adminProcedure,
  domainAdminProcedure,
  protectedProcedure,
  publicProcedure,
} from "../_core/trpc";
import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
import { getDb } from "../db";
import { inviteCodes, inviteCodeUsage, users, deviceFingerprints } from "../../drizzle/schema";
import { and, desc, eq, isNull, or, sql, count } from "drizzle-orm";
import {
  generateUniqueCode,
  validateInviteCode,
  getAuthMethodsConfig,
  getRegistrationMode,
  getUserInviteCode,
  getUserInviteEnabled,
} from "../services/inviteCodeService";
import { reactivateUser } from "../services/inactiveUserService";

// Custom code validation: alphanumeric + hyphens, 4-32 chars
const customCodeSchema = z
  .string()
  .min(4)
  .max(32)
  .regex(/^[A-Za-z0-9-]+$/, "Only letters, numbers, and hyphens allowed")
  .transform((v) => v.toUpperCase());

/**
 * Build tenant-scoped SQL conditions for invite code queries.
 * - Super admin (role=admin, any tenantId): sees all codes
 * - Domain admin with tenantId: sees own tenant + global codes (read), own tenant only (write)
 * - Domain admin without tenantId: FORBIDDEN
 */
function buildTenantScope(
  ctx: { tenantId: string | null; user: { role: string } },
  mode: "read" | "write",
) {
  const isSuperAdmin = ctx.user.role === "admin";

  // Super admin without tenant → global access (no filter)
  if (isSuperAdmin && !ctx.tenantId) return [];

  // Domain admin without tenant → should not happen, block everything
  if (!ctx.tenantId) {
    return [eq(inviteCodes.tenantId, "__IMPOSSIBLE__")]; // returns empty set
  }

  // With tenantId: read = own tenant + global, write = own tenant only
  if (mode === "read") {
    return [or(eq(inviteCodes.tenantId, ctx.tenantId), isNull(inviteCodes.tenantId))!];
  }
  // Write mode: domain_admin can only modify their own tenant's codes
  if (!isSuperAdmin) {
    return [eq(inviteCodes.tenantId, ctx.tenantId)];
  }
  // Super admin with tenant: can modify own tenant + global codes (intentional — super admins manage all)
  return [or(eq(inviteCodes.tenantId, ctx.tenantId), isNull(inviteCodes.tenantId))!];
}

export function getInviteCodeStatsCutoff(now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - 30);
  return cutoff.toISOString();
}

export const inviteCodeRouter = router({
  // ============================================================
  // Public procedures (no auth required)
  // ============================================================

  /** Validate an invite code (for signup form real-time validation) */
  validate: publicProcedure
    .use(createRateLimitMiddleware({ namespace: "invite-validate", limit: 15, windowMs: 60_000 }))
    .input(z.object({ code: z.string().min(1).max(32).regex(/^[A-Za-z0-9-]+$/) }))
    .query(async ({ input, ctx }) => {
      const result = await validateInviteCode(input.code, ctx.tenantId);
      return {
        valid: result.valid,
        error: result.valid ? undefined : result.error,
        // Only show bonus after code is confirmed valid
        bonusCredits: result.valid ? (result.codeData?.bonusCreditsForNewUser ?? 0) : undefined,
      };
    }),

  /** Get registration configuration (mode + allowed auth methods) */
  getRegistrationConfig: publicProcedure.query(async () => {
    const [mode, authMethods] = await Promise.all([
      getRegistrationMode(),
      getAuthMethodsConfig(),
    ]);
    return { registrationMode: mode, allowedAuthMethods: authMethods };
  }),

  // ============================================================
  // User procedures (authenticated)
  // ============================================================

  /** Get user's personal invite code (auto-creates if referrals enabled) */
  getMyCode: protectedProcedure.query(async ({ ctx }) => {
    const code = await getUserInviteCode(ctx.user.id, ctx.tenantId);
    if (!code) {
      const enabled = await getUserInviteEnabled();
      return { enabled: false, code: null, message: enabled ? "Failed to generate code" : "User referrals are currently disabled" };
    }
    return { enabled: true, code };
  }),

  /** Get referral stats for user's code */
  getMyReferralStats: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { totalReferrals: 0, totalCreditsEarned: 0 };

    const codeConditions = [eq(inviteCodes.ownerId, ctx.user.id), eq(inviteCodes.type, "user")];
    if (ctx.tenantId) {
      codeConditions.push(eq(inviteCodes.tenantId, ctx.tenantId));
    } else {
      codeConditions.push(isNull(inviteCodes.tenantId));
    }
    const [userCode] = await db
      .select()
      .from(inviteCodes)
      .where(and(...codeConditions))
      .limit(1);

    if (!userCode) return { totalReferrals: 0, totalCreditsEarned: 0 };

    const [stats] = await db
      .select({
        totalReferrals: count(),
        totalCreditsEarned: sql<number>`COALESCE(SUM(${inviteCodeUsage.creditsGivenToOwner}), 0)::int`,
      })
      .from(inviteCodeUsage)
      .where(eq(inviteCodeUsage.inviteCodeId, userCode.id));

    return {
      totalReferrals: stats?.totalReferrals ?? 0,
      totalCreditsEarned: stats?.totalCreditsEarned ?? 0,
    };
  }),

  // ============================================================
  // Admin procedures
  // ============================================================

  /** Comprehensive invite code statistics for admin dashboard */
  getStats: domainAdminProcedure
    .use(createRateLimitMiddleware({ namespace: "invite-stats", limit: 20, windowMs: 60_000 }))
    .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    const tenantScope = buildTenantScope(ctx, "read");

    // 1. Summary counts
    const [summary] = await db
      .select({
        totalCodes: count(),
        activeCodes: sql<number>`count(*) filter (where ${inviteCodes.isActive} = true)::int`,
        expiredCodes: sql<number>`count(*) filter (where ${inviteCodes.expiresAt} is not null and ${inviteCodes.expiresAt} < now())::int`,
        exhaustedCodes: sql<number>`count(*) filter (where ${inviteCodes.maxUses} is not null and ${inviteCodes.currentUses} >= ${inviteCodes.maxUses})::int`,
        totalRegistrations: sql<number>`coalesce(sum(${inviteCodes.currentUses}), 0)::int`,
        adminCodes: sql<number>`count(*) filter (where ${inviteCodes.type} = 'admin')::int`,
        userCodes: sql<number>`count(*) filter (where ${inviteCodes.type} = 'user')::int`,
      })
      .from(inviteCodes)
      .where(tenantScope.length > 0 ? and(...tenantScope) : undefined);

    // 2. Total bonus credits given
    const usageJoinConditions = tenantScope.length > 0
      ? and(eq(inviteCodeUsage.inviteCodeId, inviteCodes.id), ...tenantScope)
      : eq(inviteCodeUsage.inviteCodeId, inviteCodes.id);

    const [creditStats] = await db
      .select({
        totalCreditsToUsers: sql<number>`coalesce(sum(${inviteCodeUsage.creditsGivenToUser}), 0)::int`,
        totalCreditsToOwners: sql<number>`coalesce(sum(${inviteCodeUsage.creditsGivenToOwner}), 0)::int`,
      })
      .from(inviteCodeUsage)
      .innerJoin(inviteCodes, usageJoinConditions);

    // 3. Top 10 codes by usage
    const topCodes = await db
      .select({
        id: inviteCodes.id,
        code: inviteCodes.code,
        label: inviteCodes.label,
        type: inviteCodes.type,
        currentUses: inviteCodes.currentUses,
        maxUses: inviteCodes.maxUses,
        bonusCreditsForNewUser: inviteCodes.bonusCreditsForNewUser,
        isActive: inviteCodes.isActive,
      })
      .from(inviteCodes)
      .where(tenantScope.length > 0 ? and(...tenantScope) : undefined)
      .orderBy(desc(inviteCodes.currentUses))
      .limit(10);

    // 4. Top 5 referrers (user-type codes)
    const topReferrers = await db
      .select({
        ownerId: inviteCodes.ownerId,
        ownerName: users.name,
        ownerEmail: users.email,
        code: inviteCodes.code,
        referralCount: inviteCodes.currentUses,
        bonusCreditsForOwner: inviteCodes.bonusCreditsForOwner,
      })
      .from(inviteCodes)
      .leftJoin(users, eq(inviteCodes.ownerId, users.id))
      .where(
        and(
          eq(inviteCodes.type, "user"),
          sql`${inviteCodes.currentUses} > 0`,
          ...(tenantScope.length > 0 ? tenantScope : []),
        ),
      )
      .orderBy(desc(inviteCodes.currentUses))
      .limit(5);

    // 5. Registration trend (last 30 days, daily)
    const thirtyDaysAgo = getInviteCodeStatsCutoff();

    const dailyTrend = await db
      .select({
        date: sql<string>`to_char(${inviteCodeUsage.createdAt}::date, 'YYYY-MM-DD')`,
        registrations: count(),
        creditsGiven: sql<number>`coalesce(sum(${inviteCodeUsage.creditsGivenToUser}), 0)::int`,
      })
      .from(inviteCodeUsage)
      .innerJoin(inviteCodes, eq(inviteCodeUsage.inviteCodeId, inviteCodes.id))
      .where(
        and(
          sql`${inviteCodeUsage.createdAt} >= ${thirtyDaysAgo}`,
          ...(tenantScope.length > 0 ? tenantScope : []),
        ),
      )
      .groupBy(sql`${inviteCodeUsage.createdAt}::date`)
      .orderBy(sql`${inviteCodeUsage.createdAt}::date`);

    // 6. Disabled/inactive user stats — scoped via the invite-code tenant so
    // this report remains authoritative even if a legacy user tenant value is
    // missing or stale.
    const disabledWhere = tenantScope.length > 0
      ? and(
          sql`${users.referredByInviteCodeId} is not null`,
          ...tenantScope,
        )
      : sql`${users.referredByInviteCodeId} is not null`;

    const [disabledStats] = await db
      .select({
        totalDisabled: sql<number>`count(*) filter (where ${users.isDisabled} = true)::int`,
        disabledInactive: sql<number>`count(*) filter (where ${users.disabledReason} = 'inactive')::int`,
        disabledFraud: sql<number>`count(*) filter (where ${users.disabledReason} = 'fraud')::int`,
        disabledManual: sql<number>`count(*) filter (where ${users.disabledReason} = 'admin_manual' or (${users.isDisabled} = true and ${users.disabledReason} is null))::int`,
      })
      .from(users)
      .innerJoin(inviteCodes, eq(users.referredByInviteCodeId, inviteCodes.id))
      .where(disabledWhere);

    // 7. Fraud detection stats — using Drizzle schema references (type-safe)
    const [fraudStats] = await db
      .select({
        devicesWithMultipleAccounts: sql<number>`count(*) filter (where cnt >= 2)::int`,
        devicesAtLimit: sql<number>`count(*) filter (where cnt >= 3)::int`,
      })
      .from(
        db
          .select({
            fp: deviceFingerprints.fingerprintHash,
            cnt: sql<number>`count(distinct ${deviceFingerprints.userId})::int`.as("cnt"),
          })
          .from(deviceFingerprints)
          .where(sql`${deviceFingerprints.firstSeenAt} >= ${thirtyDaysAgo}`)
          .groupBy(deviceFingerprints.fingerprintHash)
          .as("fp_counts"),
      );

    return {
      summary: {
        totalCodes: summary?.totalCodes ?? 0,
        activeCodes: summary?.activeCodes ?? 0,
        expiredCodes: summary?.expiredCodes ?? 0,
        exhaustedCodes: summary?.exhaustedCodes ?? 0,
        totalRegistrations: summary?.totalRegistrations ?? 0,
        adminCodes: summary?.adminCodes ?? 0,
        userCodes: summary?.userCodes ?? 0,
        totalCreditsToUsers: creditStats?.totalCreditsToUsers ?? 0,
        totalCreditsToOwners: creditStats?.totalCreditsToOwners ?? 0,
      },
      topCodes,
      topReferrers,
      dailyTrend,
      disabledStats: {
        totalDisabled: disabledStats?.totalDisabled ?? 0,
        inactive: disabledStats?.disabledInactive ?? 0,
        fraud: disabledStats?.disabledFraud ?? 0,
        manual: disabledStats?.disabledManual ?? 0,
      },
      fraudDetection: {
        devicesWithMultipleAccounts: fraudStats?.devicesWithMultipleAccounts ?? 0,
        devicesAtLimit: fraudStats?.devicesAtLimit ?? 0,
      },
    };
  }),

  /** List all invite codes with usage stats */
  list: domainAdminProcedure
    .input(
      z.object({
        type: z.enum(["admin", "user", "all"]).default("all"),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      }).optional(),
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const { type = "all", page = 1, limit = 50 } = input ?? {};
      const offset = (page - 1) * limit;

      const conditions = [...buildTenantScope(ctx, "read")];
      if (type !== "all") {
        conditions.push(eq(inviteCodes.type, type));
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [codes, [totalResult]] = await Promise.all([
        db
          .select({
            id: inviteCodes.id,
            code: inviteCodes.code,
            label: inviteCodes.label,
            type: inviteCodes.type,
            ownerId: inviteCodes.ownerId,
            ownerName: users.name,
            ownerEmail: users.email,
            bonusCreditsForNewUser: inviteCodes.bonusCreditsForNewUser,
            bonusCreditsForOwner: inviteCodes.bonusCreditsForOwner,
            maxUses: inviteCodes.maxUses,
            currentUses: inviteCodes.currentUses,
            expiresAt: inviteCodes.expiresAt,
            isActive: inviteCodes.isActive,
            description: inviteCodes.description,
            createdAt: inviteCodes.createdAt,
          })
          .from(inviteCodes)
          .leftJoin(users, eq(inviteCodes.ownerId, users.id))
          .where(whereClause)
          .orderBy(desc(inviteCodes.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ count: count() })
          .from(inviteCodes)
          .where(whereClause),
      ]);

      return {
        codes,
        total: totalResult?.count ?? 0,
        page,
        limit,
      };
    }),

  /** Create a new admin invite code */
  create: domainAdminProcedure
    .input(
      z.object({
        code: customCodeSchema.optional(),
        label: z.string().max(128).optional(),
        bonusCreditsForNewUser: z.number().min(0).max(1000000).default(0),
        expiresAt: z.string().datetime().optional(),
        maxUses: z.number().min(0).max(1000000).optional(), // 0 = unlimited
        description: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const code = input.code || generateUniqueCode(8);

      // Check uniqueness
      const [existing] = await db
        .select({ id: inviteCodes.id })
        .from(inviteCodes)
        .where(eq(inviteCodes.code, code))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Invite code "${code}" already exists`,
        });
      }

      const [created] = await db
        .insert(inviteCodes)
        .values({
          code,
          label: input.label || null,
          type: "admin",
          tenantId: ctx.tenantId || null,
          ownerId: ctx.user.id,
          bonusCreditsForNewUser: input.bonusCreditsForNewUser,
          bonusCreditsForOwner: 0,
          maxUses: input.maxUses && input.maxUses > 0 ? input.maxUses : null,
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          description: input.description || null,
        })
        .returning();

      return created;
    }),

  /** Update an existing invite code */
  update: domainAdminProcedure
    .input(
      z.object({
        id: z.number(),
        label: z.string().max(128).optional(),
        bonusCreditsForNewUser: z.number().min(0).max(1000000).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        maxUses: z.number().min(0).max(1000000).nullable().optional(),
        isActive: z.boolean().optional(),
        description: z.string().max(500).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const { id, ...updates } = input;
      const setFields: Partial<typeof inviteCodes.$inferInsert> & { updatedAt: Date } = {
        updatedAt: new Date(),
      };

      if (updates.label !== undefined) setFields.label = updates.label;
      if (updates.bonusCreditsForNewUser !== undefined)
        setFields.bonusCreditsForNewUser = updates.bonusCreditsForNewUser;
      if (updates.expiresAt !== undefined)
        setFields.expiresAt = updates.expiresAt ? new Date(updates.expiresAt) : null;
      if (updates.maxUses !== undefined)
        setFields.maxUses = updates.maxUses && updates.maxUses > 0 ? updates.maxUses : null;
      if (updates.isActive !== undefined) setFields.isActive = updates.isActive;
      if (updates.description !== undefined)
        setFields.description = updates.description;

      // Atomic tenant-scoped UPDATE (write mode: domain_admin can't touch global codes)
      const updateConditions = [eq(inviteCodes.id, id), eq(inviteCodes.type, "admin"), ...buildTenantScope(ctx, "write")];

      const [updated] = await db
        .update(inviteCodes)
        .set(setFields)
        .where(and(...updateConditions))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found or not accessible" });
      }

      return updated;
    }),

  /** Deactivate an invite code (soft delete) */
  delete: domainAdminProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Only deactivate admin-type codes (write mode: domain_admin can't touch global codes)
      const conditions = [eq(inviteCodes.id, input.id), eq(inviteCodes.type, "admin"), ...buildTenantScope(ctx, "write")];

      const [deactivated] = await db
        .update(inviteCodes)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(...conditions))
        .returning({ id: inviteCodes.id });

      if (!deactivated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Admin invite code not found" });
      }

      return { success: true };
    }),

  /** Get usage details for a specific invite code */
  getUsageDetails: domainAdminProcedure
    .input(z.object({ codeId: z.number() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];

      // Verify the code belongs to this tenant before returning usage data
      const tenantConditions = [eq(inviteCodes.id, input.codeId), ...buildTenantScope(ctx, "read")];
      const [codeExists] = await db
        .select({ id: inviteCodes.id })
        .from(inviteCodes)
        .where(and(...tenantConditions))
        .limit(1);
      if (!codeExists) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found" });
      }

      const usageList = await db
        .select({
          id: inviteCodeUsage.id,
          userId: inviteCodeUsage.registeredUserId,
          userName: users.name,
          userEmail: users.email,
          userIsDisabled: users.isDisabled,
          userDisabledReason: users.disabledReason,
          creditsGivenToUser: inviteCodeUsage.creditsGivenToUser,
          creditsGivenToOwner: inviteCodeUsage.creditsGivenToOwner,
          createdAt: inviteCodeUsage.createdAt,
        })
        .from(inviteCodeUsage)
        .leftJoin(users, eq(inviteCodeUsage.registeredUserId, users.id))
        .where(eq(inviteCodeUsage.inviteCodeId, input.codeId))
        .orderBy(desc(inviteCodeUsage.createdAt));

      return usageList;
    }),

  /** Admin reactivates a disabled user */
  reactivateUser: domainAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      return reactivateUser(input.userId, ctx.user.id, ctx.tenantId);
    }),
});
