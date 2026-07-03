/**
 * User Management tRPC Router
 * Admin-only routes for managing users
 */

import crypto from "crypto";
import { z } from "zod";
import { router, adminProcedure, protectedProcedure, domainAdminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { creditTransactions, groupMembers, llmProviders, userGroups, users, workers } from "../../drizzle/schema";
import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import { addCredits, deductCredits, type TransactionType } from "../services/creditService";
import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
import { browserPolicyUserProfileSchema } from "../../shared/browserPolicy";
import { SUPPORTED_LANGUAGES } from "../../shared/i18n";
import {
  connectedWorkerRecordSchema,
  connectedWorkerSharingModeSchema,
  getWorkerAccessPermissionScopesForPreset,
  normalizeWorkerAccessKeysPreferences,
  normalizeWorkerAccessPermissionScopes,
  workerAccessKeyRecordSchema,
  workerAccessPermissionPresetSchema,
  workerAccessPermissionScopeSchema,
  workerAccessQuotaPolicySchema,
  workerLlmRoutingModeSchema,
  type ConnectedWorkerRecord,
  type ConnectedWorkerSharingMode,
} from "../../shared/workerAccessKeys";
import {
  getWorkerRuntimeDefinition,
  workerStatusSchema,
  workerRuntimeTypeSchema,
} from "../../shared/workerRuntime";
import {
  resolveEffectiveUserAutomationPolicy,
  updateUserBrowserPolicyProfile,
} from "../services/browserPolicyUserSettings";
import {
  getPrivateVaultPinVersion,
  hashPrivateVaultPin,
  issuePrivateVaultAccessToken,
  sanitizeUserPreferences,
  validatePrivateVaultAccessToken,
  verifyPrivateVaultPin,
} from "../services/privateVaultService";
import { createWorkerRegistrationToken } from "../services/workerAuthService";
import { revokeJti } from "../_core/revocation";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  localAiPreferencesSchema,
  mergeLocalAiPreferences,
  sanitizeUserPreferencesWithLocalAi,
} from "../services/localAiPreferences";
import {
  buildSafetyProfilePreferences,
  getEffectiveSafetyProfileFromPrefs,
  validateSafetyProfileInput,
} from "../services/ageSafetyProfileService";
import {
  getSecurityPinVersion,
  hashSecurityPin,
  isSecurityPinEnabled,
  isSecurityPinLocked,
  normalizeSecurityPinPrefs,
  recordSecurityPinFailure,
  recordSecurityPinSuccess,
  verifySecurityPin,
} from "../services/securityPinService";
import {
  getPolicyDayKey,
  issueProtectedSurfaceToken,
  type ProtectedSurfaceScope,
} from "../services/protectedSurfaceTokenService";
import {
  DEFAULT_AGE_SAFETY_POLICY,
  getPolicySnapshotHash,
  resolveJurisdictionPreset,
} from "../../shared/ageSafetyPolicy";
import { getTenantFeatureFlags } from "../services/tenantFeatureFlagService";

// Zod schemas
const userFiltersSchema = z.object({
  search: z.string().optional(),
  role: z.enum(["user", "admin", "domain_admin"]).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  registeredDomain: z.string().optional(), // Filter by domain for domain admins
  limit: z.number().min(1).max(100).default(50),
  offset: z.number().min(0).default(0),
});

const updateUserSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: z.enum(["user", "admin", "domain_admin"]).optional(),
  plan: z.enum(["free", "starter", "pro", "enterprise"]).optional(),
  registeredDomain: z.string().optional(),
  isDisabled: z.boolean().optional(),
});

const creditAdjustmentSchema = z.object({
  userId: z.number(),
  amount: z.number().min(1),
  type: z.enum(["bonus", "refund", "adjustment", "subscription"]),
  description: z.string().min(1).max(512),
  referenceId: z.string().optional(),
});

const privateVaultPinSchema = z.string().trim().regex(/^\d+$/).min(4).max(12);
const setPrivateVaultPinSchema = z.object({
  currentPin: privateVaultPinSchema.optional(),
  newPin: privateVaultPinSchema,
  confirmPin: privateVaultPinSchema,
});
const unlockPrivateVaultSchema = z.object({
  pin: privateVaultPinSchema,
});
const disablePrivateVaultSchema = z.object({
  currentPin: privateVaultPinSchema,
});
const updateSafetyProfileSchema = z.object({
  dateOfBirth: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  countryOfResidence: z.string().trim().min(2).max(3),
});
const setSecurityPinSchema = z.object({
  currentPin: privateVaultPinSchema.optional(),
  newPin: privateVaultPinSchema,
  confirmPin: privateVaultPinSchema,
});
const unlockProtectedSurfaceSchema = z.object({
  pin: privateVaultPinSchema,
  scopes: z
    .array(z.enum([
      "profile:birthdate:update",
      "profile:country:update",
      "private-chat:access",
      "age-policy:temporary-adult",
      "generated-asset:restricted-view",
    ]))
    .min(1)
    .max(5)
    .default(["age-policy:temporary-adult"]),
});

const updatePreferencesSchema = z.object({
  translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
  translationModel: z.string().max(100).optional(),
  displayLocale: z.enum(SUPPORTED_LANGUAGES).optional(),
  localAi: localAiPreferencesSchema.partial().optional(),
});

const createWorkerAccessKeySchema = z.object({
  label: z.string().trim().min(1).max(120),
  runtimeType: workerRuntimeTypeSchema,
  llmRoutingMode: workerLlmRoutingModeSchema.default("auto"),
  preferredProviderId: z.number().int().positive().nullable().optional(),
  permissionPreset: workerAccessPermissionPresetSchema.default("readonly"),
  permissionScopes: z.array(workerAccessPermissionScopeSchema).default([]),
  quotaHourly: workerAccessQuotaPolicySchema.shape.quotaHourly,
  quotaDaily: workerAccessQuotaPolicySchema.shape.quotaDaily,
  quotaWeekly: workerAccessQuotaPolicySchema.shape.quotaWeekly,
  quotaMonthly: workerAccessQuotaPolicySchema.shape.quotaMonthly,
  expiresInDays: z.number().int().positive().nullable().optional(),
});

const revokeWorkerAccessKeySchema = z.object({
  keyId: z.string().min(1),
});

const updateConnectedWorkerSharingSchema = z.object({
  workerId: z.string().min(1),
  sharingMode: connectedWorkerSharingModeSchema,
  groupIds: z.array(z.number().int().positive()).max(50).default([]),
});

const userPreferencesOutputSchema = z
  .object({
    translationLanguage: z.enum(SUPPORTED_LANGUAGES).optional(),
    translationModel: z.string().max(100).optional(),
    displayLocale: z.enum(SUPPORTED_LANGUAGES).optional(),
    workerAccessKeys: z.array(workerAccessKeyRecordSchema).default([]),
    privateVault: z
      .object({
        enabled: z.boolean().optional(),
        pinVersion: z.number().optional(),
        pinUpdatedAt: z.string().optional(),
      })
      .optional(),
    localAi: localAiPreferencesSchema.optional(),
  })
  .passthrough();

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function deriveConnectedWorkerType(worker: {
  externalReference: string;
  runtimeType: z.infer<typeof workerRuntimeTypeSchema>;
}): { workerTypeKey: string; workerTypeLabel: string } {
  if (worker.externalReference.startsWith("worker-app://") || worker.runtimeType === "desktop_zeroclaw_managed") {
    return {
      workerTypeKey: "smart_ai_hub_worker_app",
      workerTypeLabel: "Smart AI Hub Worker App",
    };
  }
  if (worker.runtimeType === "hermes_agent_gateway") {
    return {
      workerTypeKey: "hermes_gateway_worker",
      workerTypeLabel: "Hermes Gateway Worker",
    };
  }
  if (worker.runtimeType === "openclaw_gateway") {
    return {
      workerTypeKey: "openclaw_gateway_worker",
      workerTypeLabel: "OpenClaw Gateway Worker",
    };
  }
  if (worker.runtimeType === "nemoclaw_sandbox") {
    return {
      workerTypeKey: "nemoclaw_sandbox_worker",
      workerTypeLabel: "NemoClaw Sandbox Worker",
    };
  }
  return {
    workerTypeKey: "hiclaw_cluster_worker",
    workerTypeLabel: "HiClaw Cluster Worker",
  };
}

function normalizeConnectedWorkerSharing(
  worker: {
    workerMode: string;
    capabilitiesJson: unknown;
  },
  groupNameById: Map<number, string>,
): Pick<ConnectedWorkerRecord, "sharingMode" | "sharedGroups"> {
  const capabilities = asObject(worker.capabilitiesJson);
  const workerApp = asObject(capabilities.workerApp);
  const runtimeMetadata = asObject(capabilities.runtimeMetadata);
  const sharingPolicy = asObject(runtimeMetadata.workerSharingPolicy);
  const rawMode = [
    sharingPolicy.mode,
    workerApp.ownerSharingMode,
    workerApp.sharingMode,
  ].find((value) => typeof value === "string" && value.trim().length > 0);

  let sharingMode: ConnectedWorkerSharingMode = "private";
  switch (String(rawMode ?? "").trim().toLowerCase()) {
    case "group":
    case "groups":
    case "group_pool":
      sharingMode = "groups";
      break;
    case "tenant":
    case "tenant_pool":
      sharingMode = "tenant";
      break;
    case "private":
    case "private_owner":
      sharingMode = "private";
      break;
    default:
      sharingMode = worker.workerMode === "per_user" ? "private" : "tenant";
      break;
  }

  const rawGroupIds = Array.isArray(sharingPolicy.groupIds)
    ? sharingPolicy.groupIds
    : Array.isArray(workerApp.sharedGroupIds)
      ? workerApp.sharedGroupIds
      : [];
  const sharedGroups = rawGroupIds
    .map((value) => Number(value))
    .filter((value, index, list) => Number.isInteger(value) && value > 0 && list.indexOf(value) === index)
    .map((id) => ({
      id,
      name: groupNameById.get(id) ?? `Group ${id}`,
    }));

  return {
    sharingMode,
    sharedGroups,
  };
}

const CONNECTED_WORKER_ONLINE_STALE_MS = 2 * 60 * 1000;

function normalizeConnectedWorkerStatus(worker: {
  status: z.infer<typeof workerStatusSchema>;
  lastSeenAt: Date | string | null;
}): z.infer<typeof workerStatusSchema> {
  if (worker.status === "disabled" || worker.status === "draining") {
    return worker.status;
  }
  if (!worker.lastSeenAt) {
    return "offline";
  }
  const lastSeenMs = new Date(worker.lastSeenAt).getTime();
  if (!Number.isFinite(lastSeenMs)) {
    return "offline";
  }
  return Date.now() - lastSeenMs <= CONNECTED_WORKER_ONLINE_STALE_MS
    ? worker.status
    : "offline";
}

export const usersRouter = router({
  /**
   * Admin: List all users with pagination and filters
   */
  list: adminProcedure
    .input(userFiltersSchema)
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];

      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`),
            like(users.openId, `%${input.search}%`)
          )
        );
      }

      if (input.role) {
        conditions.push(eq(users.role, input.role));
      }

      if (input.plan) {
        conditions.push(eq(users.plan, input.plan));
      }

      if (input.registeredDomain) {
        conditions.push(eq(users.registeredDomain, input.registeredDomain));
      }

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Get users — explicit columns to exclude password, twoFactorSecret, recoveryCodes
      const USER_SAFE_FIELDS = {
        id: users.id, openId: users.openId, name: users.name,
        email: users.email, role: users.role, credits: users.credits,
        plan: users.plan, loginMethod: users.loginMethod,
        registeredDomain: users.registeredDomain, isDisabled: users.isDisabled,
        disabledReason: users.disabledReason,
        createdAt: users.createdAt, lastSignedIn: users.lastSignedIn,
      };
      let query = db.select(USER_SAFE_FIELDS).from(users);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const userList = await query
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        users: userList.map((u) => ({
          id: u.id,
          openId: u.openId,
          name: u.name,
          email: u.email,
          role: u.role,
          credits: u.credits,
          plan: u.plan,
          loginMethod: u.loginMethod,
          registeredDomain: u.registeredDomain,
          isDisabled: u.isDisabled,
          createdAt: u.createdAt,
          lastSignedIn: u.lastSignedIn,
        })),
        total: Number(countResult.count),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Admin: Get single user by ID
   */
  get: adminProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.id))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      // Get recent transactions
      const transactions = await db
        .select()
        .from(creditTransactions)
        .where(eq(creditTransactions.userId, input.id))
        .orderBy(desc(creditTransactions.createdAt))
        .limit(20);

      return {
        user: {
          id: user.id,
          openId: user.openId,
          name: user.name,
          email: user.email,
          role: user.role,
          credits: user.credits,
          plan: user.plan,
          loginMethod: user.loginMethod,
          registeredDomain: user.registeredDomain,
          isDisabled: user.isDisabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastSignedIn: user.lastSignedIn,
        },
        recentTransactions: transactions.map((t) => ({
          id: t.id,
          amount: t.amount,
          type: t.type,
          description: t.description,
          balanceAfter: t.balanceAfter,
          referenceId: t.referenceId,
          createdAt: t.createdAt,
          metadata: t.metadata,
        })),
      };
    }),

  /**
   * Admin: Update user details
   */
  update: adminProcedure
    .input(
      z.object({
        id: z.number(),
        data: updateUserSchema,
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const updateData: Record<string, any> = {};

      if (input.data.name !== undefined) updateData.name = input.data.name;
      if (input.data.email !== undefined) updateData.email = input.data.email;
      if (input.data.role !== undefined) updateData.role = input.data.role;
      if (input.data.plan !== undefined) updateData.plan = input.data.plan;
      if (input.data.registeredDomain !== undefined) updateData.registeredDomain = input.data.registeredDomain;
      if (input.data.isDisabled !== undefined) updateData.isDisabled = input.data.isDisabled;

      if (Object.keys(updateData).length === 0) {
        throw new Error("No fields to update");
      }

      await db.update(users).set(updateData).where(eq(users.id, input.id));

      return { success: true };
    }),

  /**
   * Admin: Add credits to user (with transaction logging)
   */
  addCredits: adminProcedure
    .input(creditAdjustmentSchema)
    .mutation(async ({ input, ctx }) => {
      const result = await addCredits({
        userId: input.userId,
        amount: input.amount,
        type: input.type as TransactionType,
        description: input.description,
        referenceId: input.referenceId,
        metadata: {
          adminId: ctx.user.id,
          adminName: ctx.user.name || ctx.user.email,
          action: "admin_add_credits",
        },
      });

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    }),

  /**
   * Admin: Deduct credits from user (with transaction logging)
   * Used for corrections/adjustments
   */
  deductCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        amount: z.number().min(1),
        description: z.string().min(1).max(512),
        referenceId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const result = await deductCredits({
        userId: input.userId,
        amount: input.amount,
        description: input.description,
        sourceType: "admin",
        metadata: {
          adminId: ctx.user.id,
          adminName: ctx.user.name || ctx.user.email,
          action: "admin_deduct_credits",
          referenceId: input.referenceId,
        },
      });

      return {
        success: true,
        newBalance: result.newBalance,
        transactionId: result.transactionId,
      };
    }),

  /**
   * Admin: Set user credits to specific amount
   * Creates adjustment transaction to reach target balance
   */
  setCredits: adminProcedure
    .input(
      z.object({
        userId: z.number(),
        targetCredits: z.number().min(0),
        reason: z.string().min(1).max(512),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get current balance
      const [user] = await db
        .select({ credits: users.credits })
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!user) {
        throw new Error("User not found");
      }

      const currentCredits = user.credits;
      const difference = input.targetCredits - currentCredits;

      if (difference === 0) {
        return {
          success: true,
          newBalance: currentCredits,
          message: "No change needed",
        };
      }

      const description = `Admin adjustment: ${input.reason} (${currentCredits} → ${input.targetCredits})`;

      if (difference > 0) {
        // Add credits
        const result = await addCredits({
          userId: input.userId,
          amount: difference,
          type: "adjustment",
          description,
          metadata: {
            adminId: ctx.user.id,
            adminName: ctx.user.name || ctx.user.email,
            action: "admin_set_credits",
            previousBalance: currentCredits,
            targetBalance: input.targetCredits,
          },
        });
        return {
          success: true,
          newBalance: result.newBalance,
          transactionId: result.transactionId,
        };
      } else {
        // Deduct credits
        const result = await deductCredits({
          userId: input.userId,
          amount: Math.abs(difference),
          description,
          sourceType: "admin",
          metadata: {
            adminId: ctx.user.id,
            adminName: ctx.user.name || ctx.user.email,
            action: "admin_set_credits",
            previousBalance: currentCredits,
            targetBalance: input.targetCredits,
          },
        });
        return {
          success: true,
          newBalance: result.newBalance,
          transactionId: result.transactionId,
        };
      }
    }),

  /**
   * Admin: Get user statistics
   */
  stats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [stats] = await db.select({
      totalUsers: sql<number>`COUNT(*)`,
      totalAdmins: sql<number>`SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END)`,
      totalCredits: sql<number>`SUM(credits)`,
      freeUsers: sql<number>`SUM(CASE WHEN plan = 'free' THEN 1 ELSE 0 END)`,
      starterUsers: sql<number>`SUM(CASE WHEN plan = 'starter' THEN 1 ELSE 0 END)`,
      proUsers: sql<number>`SUM(CASE WHEN plan = 'pro' THEN 1 ELSE 0 END)`,
      enterpriseUsers: sql<number>`SUM(CASE WHEN plan = 'enterprise' THEN 1 ELSE 0 END)`,
      activeToday: sql<number>`SUM(CASE WHEN DATE("lastSignedIn") = CURRENT_DATE THEN 1 ELSE 0 END)`,
      activeThisWeek: sql<number>`SUM(CASE WHEN "lastSignedIn" >= CURRENT_TIMESTAMP - INTERVAL '7 days' THEN 1 ELSE 0 END)`,
      activeThisMonth: sql<number>`SUM(CASE WHEN "lastSignedIn" >= CURRENT_TIMESTAMP - INTERVAL '30 days' THEN 1 ELSE 0 END)`,
    }).from(users);

    // Get recent signups
    const recentSignups = await db
      .select({
        date: sql<string>`DATE("createdAt")`,
        count: sql<number>`COUNT(*)`,
      })
      .from(users)
      .where(sql`"createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'`)
      .groupBy(sql`DATE("createdAt")`)
      .orderBy(desc(sql`DATE("createdAt")`));

    return {
      totalUsers: Number(stats.totalUsers) || 0,
      totalAdmins: Number(stats.totalAdmins) || 0,
      totalCredits: Number(stats.totalCredits) || 0,
      byPlan: {
        free: Number(stats.freeUsers) || 0,
        starter: Number(stats.starterUsers) || 0,
        pro: Number(stats.proUsers) || 0,
        enterprise: Number(stats.enterpriseUsers) || 0,
      },
      activity: {
        today: Number(stats.activeToday) || 0,
        thisWeek: Number(stats.activeThisWeek) || 0,
        thisMonth: Number(stats.activeThisMonth) || 0,
      },
      recentSignups: recentSignups.map((r) => ({
        date: r.date,
        count: Number(r.count),
      })),
    };
  }),

  /**
   * Admin: Search users by email or name
   */
  search: adminProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const results = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          credits: users.credits,
          plan: users.plan,
        })
        .from(users)
        .where(
          or(
            like(users.name, `%${input.query}%`),
            like(users.email, `%${input.query}%`)
          )
        )
        .limit(10);

      return results;
    }),

  /**
   * Delete own account (for authenticated users)
   */
  deleteAccount: protectedProcedure
    .input(z.object({
      confirmEmail: z.string().email(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Verify the email matches the logged-in user
      if (input.confirmEmail.toLowerCase() !== ctx.user.email?.toLowerCase()) {
        throw new Error("Email confirmation does not match your account email");
      }

      // Prevent admins from deleting their own accounts through this endpoint
      if (ctx.user.role === "admin") {
        throw new Error("Admin accounts cannot be deleted through this endpoint. Please contact support.");
      }

      const userId = ctx.user.id;

      // Delete user's data in order (due to foreign key constraints)
      // 1. Delete credit transactions
      await db.delete(creditTransactions).where(eq(creditTransactions.userId, userId));

      // 2. Delete the user
      await db.delete(users).where(eq(users.id, userId));

      return { success: true, message: "Account deleted successfully" };
    }),

  /**
   * Get current user's profile (for any authenticated user)
   */
  me: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.user.id))
      .limit(1);

    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      credits: user.credits,
      plan: user.plan,
      registeredDomain: user.registeredDomain,
      createdAt: user.createdAt,
      lastSignedIn: user.lastSignedIn,
    };
  }),

  /**
   * Domain Admin: Toggle user enabled/disabled status
   * Domain admins can only toggle users in their domain
   */
  toggleUserStatus: domainAdminProcedure
    .input(z.object({ userId: z.number() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Get target user
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.userId))
        .limit(1);

      if (!targetUser) {
        throw new Error("User not found");
      }

      // If domain admin (not full admin), check they can only manage users in their domain
      if (ctx.user.role === 'domain_admin') {
        if (targetUser.registeredDomain !== ctx.user.registeredDomain) {
          throw new Error("You can only manage users in your domain");
        }
        // Domain admins cannot disable other domain admins or full admins
        if (targetUser.role === 'domain_admin' || targetUser.role === 'admin') {
          throw new Error("You cannot disable other admins");
        }
      }

      // Toggle status
      await db
        .update(users)
        .set({ isDisabled: !targetUser.isDisabled })
        .where(eq(users.id, input.userId));

      return {
        success: true,
        newStatus: !targetUser.isDisabled
      };
    }),

  /**
   * Domain Admin: Get statistics for their domain
   */
  domainStats: domainAdminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");

    // If domain admin, filter by their domain
    const domainFilter = ctx.user.role === 'domain_admin'
      ? eq(users.registeredDomain, ctx.user.registeredDomain || '')
      : undefined;

    const [stats] = await db.select({
      totalUsers: sql<number>`COUNT(*)`,
      activeUsers: sql<number>`SUM(CASE WHEN "isDisabled" = false THEN 1 ELSE 0 END)`,
      disabledUsers: sql<number>`SUM(CASE WHEN "isDisabled" = true THEN 1 ELSE 0 END)`,
      totalCredits: sql<number>`SUM(credits)`,
    }).from(users).where(domainFilter);

    return {
      totalUsers: Number(stats.totalUsers) || 0,
      activeUsers: Number(stats.activeUsers) || 0,
      disabledUsers: Number(stats.disabledUsers) || 0,
      totalCredits: Number(stats.totalCredits) || 0,
      domain: ctx.user.role === 'domain_admin' ? ctx.user.registeredDomain : null,
    };
  }),

  /**
   * Domain Admin: List users in their domain
   * Domain admins can only see users registered in their domain
   */
  listByDomain: domainAdminProcedure
    .input(z.object({
      search: z.string().optional(),
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const conditions = [];

      // Force filter by domain admin's domain
      if (ctx.user.role === 'domain_admin') {
        conditions.push(eq(users.registeredDomain, ctx.user.registeredDomain || ''));
      }

      if (input.search) {
        conditions.push(
          or(
            like(users.name, `%${input.search}%`),
            like(users.email, `%${input.search}%`)
          )
        );
      }

      // Get total count
      const [countResult] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(users)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      // Get users — explicit columns to exclude password, twoFactorSecret, recoveryCodes
      const USER_SAFE_FIELDS = {
        id: users.id, openId: users.openId, name: users.name,
        email: users.email, role: users.role, credits: users.credits,
        plan: users.plan, loginMethod: users.loginMethod,
        registeredDomain: users.registeredDomain, isDisabled: users.isDisabled,
        disabledReason: users.disabledReason,
        createdAt: users.createdAt, lastSignedIn: users.lastSignedIn,
      };
      let query = db.select(USER_SAFE_FIELDS).from(users);

      if (conditions.length > 0) {
        query = query.where(and(...conditions)) as typeof query;
      }

      const userList = await query
        .orderBy(desc(users.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return {
        users: userList.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          credits: u.credits,
          plan: u.plan,
          isDisabled: u.isDisabled,
          createdAt: u.createdAt,
          lastSignedIn: u.lastSignedIn,
        })),
        total: Number(countResult.count),
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /**
   * Domain Admin: Transfer own credits to a user in the same domain
   * Domain admins can only transfer from their own balance, not create credits
   */
  transferCredits: domainAdminProcedure
    .input(z.object({
      toUserId: z.number(),
      amount: z.number().min(1),
      note: z.string().max(512).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // 1. Get target user
      const [targetUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, input.toUserId))
        .limit(1);

      if (!targetUser) {
        throw new Error("User not found");
      }

      // 2. Verify target user is in same domain
      if (ctx.user.role === 'domain_admin' && targetUser.registeredDomain !== ctx.user.registeredDomain) {
        throw new Error("You can only transfer credits to users in your domain");
      }

      // 3. Cannot transfer to self
      if (targetUser.id === ctx.user.id) {
        throw new Error("Cannot transfer credits to yourself");
      }

      // 4. Check domain admin has enough credits
      if (ctx.user.credits < input.amount) {
        throw new Error("Insufficient credits for transfer");
      }

      // 5. Deduct from domain admin
      const deductResult = await deductCredits({
        userId: ctx.user.id,
        amount: input.amount,
        description: `Transfer to ${targetUser.email || targetUser.name}: ${input.note || 'Credit transfer'}`,
        sourceType: "admin",
        metadata: {
          action: 'domain_admin_transfer',
          toUserId: input.toUserId,
          toUserEmail: targetUser.email,
        },
      });

      // 6. Add to target user
      const addResult = await addCredits({
        userId: input.toUserId,
        amount: input.amount,
        type: 'bonus' as TransactionType,
        description: `Transfer from domain admin (${ctx.user.email || ctx.user.name}): ${input.note || 'Credit transfer'}`,
        metadata: {
          action: 'domain_admin_transfer',
          fromUserId: ctx.user.id,
          fromUserEmail: ctx.user.email,
        },
      });

      return {
        success: true,
        senderNewBalance: deductResult.newBalance,
        recipientNewBalance: addResult.newBalance,
      };
    }),

  // ============================================================
  // User Preferences
  // ============================================================

  getPreferences: protectedProcedure
    .output(userPreferencesOutputSchema)
    .query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return {};
    const [user] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const sanitizedBase = sanitizeUserPreferences(
      (user?.userPreferences as Record<string, any>) || {},
    );
    const workerPrefs = normalizeWorkerAccessKeysPreferences(sanitizedBase.workerAccessKeys);
    return sanitizeUserPreferencesWithLocalAi({
      ...sanitizedBase,
      workerAccessKeys: workerPrefs.workerAccessKeys,
    });
  }),

  updatePreferences: protectedProcedure
    .input(updatePreferencesSchema)
    .output(userPreferencesOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      // Merge with existing preferences
      const [existing] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const current = (existing?.userPreferences as Record<string, any>) || {};
      const updated = { ...current };

      if (input.translationLanguage !== undefined) updated.translationLanguage = input.translationLanguage;
      if (input.displayLocale !== undefined) updated.displayLocale = input.displayLocale;
      if (input.translationModel !== undefined) {
        updated.translationModel =
          (await resolveEnabledLlmModelId([input.translationModel])) || undefined;
      }
      if (input.localAi !== undefined) {
        updated.localAi = mergeLocalAiPreferences(current.localAi, input.localAi);
      }

      await db.update(users).set({ userPreferences: updated }).where(eq(users.id, ctx.user.id));
      const workerPrefs = normalizeWorkerAccessKeysPreferences(updated.workerAccessKeys);
      return sanitizeUserPreferencesWithLocalAi({
        ...sanitizeUserPreferences(updated),
        workerAccessKeys: workerPrefs.workerAccessKeys,
      });
    }),

  getSafetyProfileCompletionStatus: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("Database not available");
    const [row] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
    const profile = getEffectiveSafetyProfileFromPrefs(row?.userPreferences, new Date());
    const tenantId = String(ctx.tenantId ?? ctx.user.currentTenantId ?? "").trim();
    const flags = tenantId ? await getTenantFeatureFlags(tenantId) : null;
    return {
      gateRequired: Boolean(flags?.ageSafetyPolicyEnabled && flags?.ageSafetyProfileCompletionGate),
      complete: profile.complete,
      missingFields: profile.missingFields,
      actualAgeBand: profile.actualAgeBand,
      enforcementAgeBand: profile.enforcementAgeBand,
      countryOfResidence: profile.countryOfResidence,
      jurisdictionPresetId: profile.jurisdictionPresetId,
      profileVersion: profile.profileVersion,
      completedAt: profile.completedAt,
    };
  }),

  updateSafetyProfile: protectedProcedure
    .input(updateSafetyProfileSchema)
    .output(userPreferencesOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = new Date();
      const validation = validateSafetyProfileInput(input, now);
      if (!validation.ok) {
        throw new Error(validation.code);
      }

      const [row] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (row?.userPreferences as Record<string, unknown>) || {};
      const updated = buildSafetyProfilePreferences(currentPrefs, validation.normalized, now);
      await db.update(users).set({ userPreferences: updated as typeof users.$inferInsert["userPreferences"] }).where(eq(users.id, ctx.user.id));
      const workerPrefs = normalizeWorkerAccessKeysPreferences(updated.workerAccessKeys);
      return sanitizeUserPreferencesWithLocalAi({
        ...sanitizeUserPreferences(updated),
        workerAccessKeys: workerPrefs.workerAccessKeys,
      });
    }),

  setSecurityPin: protectedProcedure
    .input(setSecurityPinSchema)
    .output(userPreferencesOutputSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      if (input.newPin !== input.confirmPin) {
        throw new Error("PIN codes do not match");
      }

      const [row] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (row?.userPreferences as Record<string, unknown>) || {};
      const currentPin = normalizeSecurityPinPrefs(currentPrefs);
      if (currentPin?.enabled && currentPin.pinHash) {
        if (!input.currentPin) {
          throw new Error("Current PIN is required");
        }
        const currentValid = await verifySecurityPin(input.currentPin, currentPin.pinHash);
        if (!currentValid) {
          throw new Error("Current PIN is incorrect");
        }
      }

      const nextVersion = getSecurityPinVersion(currentPrefs) + 1;
      const updated = {
        ...currentPrefs,
        securityPin: {
          enabled: true,
          pinHash: await hashSecurityPin(input.newPin),
          pinVersion: nextVersion,
          pinUpdatedAt: new Date().toISOString(),
          failedAttempts: 0,
          lockedUntil: undefined,
        },
      } as Record<string, unknown>;
      await db.update(users).set({ userPreferences: updated }).where(eq(users.id, ctx.user.id));
      const workerPrefs = normalizeWorkerAccessKeysPreferences(updated.workerAccessKeys);
      return sanitizeUserPreferencesWithLocalAi({
        ...sanitizeUserPreferences(updated),
        workerAccessKeys: workerPrefs.workerAccessKeys,
      });
    }),

  unlockProtectedSurface: protectedProcedure
    .input(unlockProtectedSurfaceSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");
      const now = new Date();
      const tenantId = String(ctx.tenantId ?? ctx.user.currentTenantId ?? "").trim();
      if (!tenantId) {
        throw new Error("Tenant context is required");
      }

      const [row] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (row?.userPreferences as Record<string, unknown>) || {};
      const securityPin = normalizeSecurityPinPrefs(currentPrefs);
      if (!isSecurityPinEnabled(currentPrefs) || !securityPin?.pinHash) {
        throw new Error("Security PIN is not configured");
      }
      if (isSecurityPinLocked(currentPrefs, now)) {
        throw new Error("Security PIN is temporarily locked");
      }

      const valid = await verifySecurityPin(input.pin, securityPin.pinHash);
      if (!valid) {
        const failedPrefs = recordSecurityPinFailure(currentPrefs, now);
        await db.update(users).set({ userPreferences: failedPrefs as typeof users.$inferInsert["userPreferences"] }).where(eq(users.id, ctx.user.id));
        throw new Error("Invalid PIN");
      }

      const updatedPrefs = recordSecurityPinSuccess(currentPrefs);
      await db.update(users).set({ userPreferences: updatedPrefs as typeof users.$inferInsert["userPreferences"] }).where(eq(users.id, ctx.user.id));
      const profile = getEffectiveSafetyProfileFromPrefs(updatedPrefs, now);
      const preset = resolveJurisdictionPreset(profile.countryOfResidence, undefined, now);
      const token = issueProtectedSurfaceToken({
        userId: ctx.user.id,
        tenantId,
        pinVersion: getSecurityPinVersion(updatedPrefs),
        profileVersion: profile.profileVersion,
        policyVersion: DEFAULT_AGE_SAFETY_POLICY.policyVersion,
        jurisdictionPresetId: profile.jurisdictionPresetId,
        dayKey: getPolicyDayKey(now),
        scopes: input.scopes as ProtectedSurfaceScope[],
      });

      return {
        token,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        policyVersion: DEFAULT_AGE_SAFETY_POLICY.policyVersion,
        policySnapshotHash: getPolicySnapshotHash(DEFAULT_AGE_SAFETY_POLICY, preset),
        scopes: input.scopes,
      };
    }),

  listWorkerAccessKeys: protectedProcedure
    .output(z.object({
      keys: z.array(workerAccessKeyRecordSchema),
    }))
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { keys: [] };
      const [row] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const workerPrefs = normalizeWorkerAccessKeysPreferences({
        workerAccessKeys: ((row?.userPreferences as Record<string, unknown> | null | undefined)?.workerAccessKeys as unknown[]) ?? [],
      });
      return { keys: workerPrefs.workerAccessKeys };
    }),

  listConnectedWorkers: protectedProcedure
    .output(z.object({
      workers: z.array(connectedWorkerRecordSchema),
    }))
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) {
        throw new Error("Tenant context is required");
      }

      const [workerRows, activeGroups] = await Promise.all([
        db
          .select({
            id: workers.id,
            displayName: workers.displayName,
            externalReference: workers.externalReference,
            runtimeType: workers.runtimeType,
            workerMode: workers.workerMode,
            status: workers.status,
            machineId: workers.machineId,
            machineName: workers.machineName,
            runtimeVersion: workers.runtimeVersion,
            lastSeenAt: workers.lastSeenAt,
            teamId: workers.teamId,
            capabilitiesJson: workers.capabilitiesJson,
          })
          .from(workers)
          .where(and(eq(workers.tenantId, tenantId), eq(workers.registeredByUserId, ctx.user.id)))
          .orderBy(desc(workers.lastSeenAt), desc(workers.updatedAt)),
        db
          .select({
            id: userGroups.id,
            name: userGroups.name,
          })
          .from(userGroups)
          .leftJoin(
            groupMembers,
            and(
              eq(groupMembers.groupId, userGroups.id),
              eq(groupMembers.userId, ctx.user.id),
              eq(groupMembers.status, "active"),
            ),
          )
          .where(and(
            eq(userGroups.tenantId, tenantId),
            isNull(userGroups.deletedAt),
            or(eq(userGroups.ownerId, ctx.user.id), sql`${groupMembers.id} is not null`),
          )),
      ]);

      const groupNameById = new Map(activeGroups.map((group) => [group.id, group.name]));
      const connectedWorkers = workerRows.map((worker) => {
        const runtimeDefinition = getWorkerRuntimeDefinition(worker.runtimeType);
        const workerType = deriveConnectedWorkerType(worker);
        const sharing = normalizeConnectedWorkerSharing(worker, groupNameById);
        const runtimeMetadata = asObject(asObject(worker.capabilitiesJson).runtimeMetadata);
        const accessPolicy = asObject(runtimeMetadata.workerAccessPolicy);
        const preferredProviderName = typeof runtimeMetadata.preferredProviderName === "string"
          && runtimeMetadata.preferredProviderName.trim().length > 0
          ? runtimeMetadata.preferredProviderName.trim()
          : null;
        const permissionPreset = typeof accessPolicy.permissionPreset === "string"
          && accessPolicy.permissionPreset.trim().length > 0
          ? accessPolicy.permissionPreset.trim()
          : null;
        const permissionScopeCount = normalizeWorkerAccessPermissionScopes(accessPolicy.permissionScopes).length;
        const quotaParts = [
          typeof accessPolicy.quotaHourly === "number" && accessPolicy.quotaHourly > 0 ? `H${Math.floor(accessPolicy.quotaHourly)}` : null,
          typeof accessPolicy.quotaDaily === "number" && accessPolicy.quotaDaily > 0 ? `D${Math.floor(accessPolicy.quotaDaily)}` : null,
          typeof accessPolicy.quotaWeekly === "number" && accessPolicy.quotaWeekly > 0 ? `W${Math.floor(accessPolicy.quotaWeekly)}` : null,
          typeof accessPolicy.quotaMonthly === "number" && accessPolicy.quotaMonthly > 0 ? `M${Math.floor(accessPolicy.quotaMonthly)}` : null,
        ].filter((value): value is string => Boolean(value));

        return connectedWorkerRecordSchema.parse({
          workerId: worker.id,
          displayName: worker.displayName,
          externalReference: worker.externalReference,
          runtimeType: worker.runtimeType,
          runtimeLabel: runtimeDefinition.displayName,
          runtimeFamily: runtimeDefinition.familyName,
          workerTypeKey: workerType.workerTypeKey,
          workerTypeLabel: workerType.workerTypeLabel,
          workerMode: worker.workerMode,
          status: normalizeConnectedWorkerStatus(worker),
          machineId: worker.machineId ?? null,
          machineName: worker.machineName ?? null,
          runtimeVersion: worker.runtimeVersion ?? null,
          lastSeenAt: worker.lastSeenAt?.toISOString() ?? null,
          teamId: worker.teamId ?? null,
          sharingMode: sharing.sharingMode,
          sharedGroups: sharing.sharedGroups,
          preferredProviderName,
          permissionPreset,
          permissionScopeCount,
          quotaDisplayLabel: quotaParts.length > 0 ? quotaParts.join(" / ") : null,
        });
      });

      return { workers: connectedWorkers };
    }),

  updateConnectedWorkerSharing: protectedProcedure
    .input(updateConnectedWorkerSharingSchema)
    .output(z.object({
      worker: connectedWorkerRecordSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) {
        throw new Error("Tenant context is required");
      }
      if (input.sharingMode === "groups" && input.groupIds.length === 0) {
        throw new Error("Select at least one group before enabling group sharing");
      }

      const [workerRow] = await db
        .select({
          id: workers.id,
          displayName: workers.displayName,
          externalReference: workers.externalReference,
          runtimeType: workers.runtimeType,
          workerMode: workers.workerMode,
          status: workers.status,
          machineId: workers.machineId,
          machineName: workers.machineName,
          runtimeVersion: workers.runtimeVersion,
          lastSeenAt: workers.lastSeenAt,
          teamId: workers.teamId,
          capabilitiesJson: workers.capabilitiesJson,
        })
        .from(workers)
        .where(and(
          eq(workers.id, input.workerId),
          eq(workers.tenantId, tenantId),
          eq(workers.registeredByUserId, ctx.user.id),
        ))
        .limit(1);

      if (!workerRow) {
        throw new Error("Connected worker not found");
      }

      const normalizedGroupIds = Array.from(new Set(input.groupIds.map((value) => Math.floor(value))));
      const allowedGroups = normalizedGroupIds.length === 0
        ? []
        : await db
          .select({
            id: userGroups.id,
            name: userGroups.name,
          })
          .from(userGroups)
          .leftJoin(
            groupMembers,
            and(
              eq(groupMembers.groupId, userGroups.id),
              eq(groupMembers.userId, ctx.user.id),
              eq(groupMembers.status, "active"),
            ),
          )
          .where(and(
            eq(userGroups.tenantId, tenantId),
            isNull(userGroups.deletedAt),
            inArray(userGroups.id, normalizedGroupIds),
            or(eq(userGroups.ownerId, ctx.user.id), sql`${groupMembers.id} is not null`),
          ));

      if (normalizedGroupIds.length !== allowedGroups.length) {
        throw new Error("Some selected groups are unavailable for this worker");
      }

      const capabilities = asObject(workerRow.capabilitiesJson);
      const workerApp = asObject(capabilities.workerApp);
      const runtimeMetadata = asObject(capabilities.runtimeMetadata);
      const nextSharingMode = input.sharingMode === "groups"
        ? "group"
        : input.sharingMode;
      const nextCapabilities = {
        ...capabilities,
        workerApp: {
          ...workerApp,
          sharingMode: nextSharingMode,
          sharedGroupIds: input.sharingMode === "groups" ? normalizedGroupIds : [],
        },
        runtimeMetadata: {
          ...runtimeMetadata,
          workerSharingPolicy: {
            mode: input.sharingMode,
            groupIds: input.sharingMode === "groups" ? normalizedGroupIds : [],
            updatedAt: new Date().toISOString(),
            updatedByUserId: ctx.user.id,
          },
        },
      };

      const nextWorkerMode = input.sharingMode === "private"
        ? "per_user"
        : "shared_department";

      await db
        .update(workers)
        .set({
          workerMode: nextWorkerMode,
          capabilitiesJson: nextCapabilities,
          updatedAt: new Date(),
        })
        .where(eq(workers.id, workerRow.id));

      const runtimeDefinition = getWorkerRuntimeDefinition(workerRow.runtimeType);
      const workerType = deriveConnectedWorkerType(workerRow);
      const updatedWorker = connectedWorkerRecordSchema.parse({
        workerId: workerRow.id,
        displayName: workerRow.displayName,
        externalReference: workerRow.externalReference,
        runtimeType: workerRow.runtimeType,
        runtimeLabel: runtimeDefinition.displayName,
        runtimeFamily: runtimeDefinition.familyName,
        workerTypeKey: workerType.workerTypeKey,
        workerTypeLabel: workerType.workerTypeLabel,
        workerMode: nextWorkerMode,
        status: normalizeConnectedWorkerStatus(workerRow),
        machineId: workerRow.machineId ?? null,
        machineName: workerRow.machineName ?? null,
        runtimeVersion: workerRow.runtimeVersion ?? null,
        lastSeenAt: workerRow.lastSeenAt?.toISOString() ?? null,
        teamId: workerRow.teamId ?? null,
        sharingMode: input.sharingMode,
        sharedGroups: allowedGroups,
        preferredProviderName: typeof runtimeMetadata.preferredProviderName === "string"
          ? runtimeMetadata.preferredProviderName
          : null,
        permissionPreset: typeof asObject(runtimeMetadata.workerAccessPolicy).permissionPreset === "string"
          ? String(asObject(runtimeMetadata.workerAccessPolicy).permissionPreset)
          : null,
        permissionScopeCount: normalizeWorkerAccessPermissionScopes(asObject(runtimeMetadata.workerAccessPolicy).permissionScopes).length,
        quotaDisplayLabel: null,
      });

      return { worker: updatedWorker };
    }),

  createWorkerAccessKey: protectedProcedure
    .input(createWorkerAccessKeySchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [userRow] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = sanitizeUserPreferences((userRow?.userPreferences as Record<string, unknown>) || {});
      const workerPrefs = normalizeWorkerAccessKeysPreferences({
        workerAccessKeys: (currentPrefs.workerAccessKeys as unknown[]) ?? [],
      });

      if (input.llmRoutingMode === "pinned_provider" && !input.preferredProviderId) {
        throw new Error("preferredProviderId is required when llmRoutingMode is pinned_provider");
      }
      const permissionPreset = input.permissionPreset ?? "readonly";
      const permissionScopes = permissionPreset === "custom"
        ? normalizeWorkerAccessPermissionScopes(input.permissionScopes)
        : getWorkerAccessPermissionScopesForPreset(permissionPreset);
      if (permissionPreset === "custom" && permissionScopes.length === 0) {
        throw new Error("permissionScopes are required when permissionPreset is custom");
      }
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
      if (!tenantId) {
        throw new Error("Tenant context is required");
      }
      const keyId = `wrk_${Date.now()}_${crypto.randomBytes(8).toString("hex")}`;
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;
      const provider = input.preferredProviderId
        ? await db
          .select({ displayName: llmProviders.displayName, providerName: llmProviders.providerName })
          .from(llmProviders)
          .where(eq(llmProviders.id, input.preferredProviderId))
          .limit(1)
          .then((rows) => rows[0] ?? null)
        : null;
      if (input.preferredProviderId != null && !provider) {
        throw new Error(`LLM provider ${input.preferredProviderId} not found`);
      }
      const providerName = provider?.displayName ?? provider?.providerName ?? null;
      const token = createWorkerRegistrationToken({
        tenantId,
        registeredByUserId: ctx.user.id,
        runtimeType: input.runtimeType,
        llmRoutingMode: input.llmRoutingMode,
        preferredProviderId: input.preferredProviderId ?? null,
        preferredProviderName: providerName,
        permissionPreset,
        permissionScopes,
        quotaHourly: input.quotaHourly ?? null,
        quotaDaily: input.quotaDaily ?? null,
        quotaWeekly: input.quotaWeekly ?? null,
        quotaMonthly: input.quotaMonthly ?? null,
        jti: keyId,
      }, expiresAt ? Math.max(60, Math.floor((expiresAt.getTime() - Date.now()) / 1000)) : null);

      const keyRecord = workerAccessKeyRecordSchema.parse({
        keyId,
        label: input.label.trim(),
        runtimeType: input.runtimeType,
        llmRoutingMode: input.llmRoutingMode,
        preferredProviderId: input.preferredProviderId ?? null,
        preferredProviderName: providerName,
        permissionPreset,
        permissionScopes,
        quotaHourly: input.quotaHourly ?? null,
        quotaDaily: input.quotaDaily ?? null,
        quotaWeekly: input.quotaWeekly ?? null,
        quotaMonthly: input.quotaMonthly ?? null,
        tokenHint: token.slice(-8),
        createdAt: new Date().toISOString(),
        expiresAt: expiresAt?.toISOString() ?? null,
        revokedAt: null,
        lastUsedAt: null,
      });

      const nextKeys = [...workerPrefs.workerAccessKeys, keyRecord];
      const nextPrefs = {
        ...currentPrefs,
        workerAccessKeys: nextKeys,
      };
      await db.update(users).set({
        userPreferences: nextPrefs as typeof users.$inferInsert["userPreferences"],
      }).where(eq(users.id, ctx.user.id));

      return {
        rawToken: token,
        key: keyRecord,
        preferences: sanitizeUserPreferencesWithLocalAi({
          ...sanitizeUserPreferences(nextPrefs),
          workerAccessKeys: nextKeys,
        }),
      };
    }),

  revokeWorkerAccessKey: protectedProcedure
    .input(revokeWorkerAccessKeySchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [userRow] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = sanitizeUserPreferences((userRow?.userPreferences as Record<string, unknown>) || {});
      const workerPrefs = normalizeWorkerAccessKeysPreferences({
        workerAccessKeys: (currentPrefs.workerAccessKeys as unknown[]) ?? [],
      });
      const existing = workerPrefs.workerAccessKeys.find((key) => key.keyId === input.keyId);
      if (!existing) {
        throw new Error("Worker access key not found");
      }
      if (existing.revokedAt) {
        return {
          key: existing,
          preferences: sanitizeUserPreferencesWithLocalAi({
            ...sanitizeUserPreferences(currentPrefs),
            workerAccessKeys: workerPrefs.workerAccessKeys,
          }),
        };
      }

      const revokedAt = new Date().toISOString();
      const updatedKeys = workerPrefs.workerAccessKeys.map((key) =>
        key.keyId === input.keyId
          ? { ...key, revokedAt }
          : key,
      );
      const nextPrefs = {
        ...currentPrefs,
        workerAccessKeys: updatedKeys,
      };
      await db.update(users).set({
        userPreferences: nextPrefs as typeof users.$inferInsert["userPreferences"],
      }).where(eq(users.id, ctx.user.id));

      await revokeJti(existing.keyId, existing.expiresAt ? new Date(existing.expiresAt).getTime() : Date.now() + 10 * 365 * 24 * 60 * 60 * 1000);

      return {
        key: { ...existing, revokedAt },
        preferences: sanitizeUserPreferencesWithLocalAi({
          ...sanitizeUserPreferences(nextPrefs),
          workerAccessKeys: updatedKeys,
        }),
      };
    }),

  setPrivateVaultPin: protectedProcedure
    .input(setPrivateVaultPinSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      if (input.newPin !== input.confirmPin) {
        throw new Error("PIN codes do not match");
      }

      const [existing] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (existing?.userPreferences as Record<string, any>) || {};
      const currentVault = (currentPrefs.privateVault || {}) as Record<string, any>;
      const currentPinHash = typeof currentVault.pinHash === "string" ? currentVault.pinHash : "";

      if (currentPinHash) {
        if (!input.currentPin) {
          throw new Error("Current PIN is required to change the private vault PIN");
        }
        const currentValid = await verifyPrivateVaultPin(input.currentPin, currentPinHash);
        if (!currentValid) {
          throw new Error("Current PIN is incorrect");
        }
      }

      const nextVersion = (Number.isFinite(Number(currentVault.pinVersion)) ? Number(currentVault.pinVersion) : 0) + 1;
      const hashedPin = await hashPrivateVaultPin(input.newPin);
      const updated = {
        ...currentPrefs,
        privateVault: {
          enabled: true,
          pinHash: hashedPin,
          pinVersion: nextVersion,
          pinUpdatedAt: new Date().toISOString(),
        },
      };

      await db.update(users).set({ userPreferences: updated }).where(eq(users.id, ctx.user.id));
      return sanitizeUserPreferences(updated);
    }),

  disablePrivateVault: protectedProcedure
    .input(disablePrivateVaultSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (existing?.userPreferences as Record<string, any>) || {};
      const currentVault = (currentPrefs.privateVault || {}) as Record<string, any>;
      const currentPinHash = typeof currentVault.pinHash === "string" ? currentVault.pinHash : "";

      if (!currentPinHash) {
        throw new Error("Private vault PIN is not configured");
      }

      const currentValid = await verifyPrivateVaultPin(input.currentPin, currentPinHash);
      if (!currentValid) {
        throw new Error("Current PIN is incorrect");
      }

      const nextVersion = (Number.isFinite(Number(currentVault.pinVersion)) ? Number(currentVault.pinVersion) : 0) + 1;
      const updated = {
        ...currentPrefs,
        privateVault: {
          enabled: false,
          pinVersion: nextVersion,
          pinUpdatedAt: new Date().toISOString(),
        },
      };

      await db.update(users).set({ userPreferences: updated }).where(eq(users.id, ctx.user.id));
      return sanitizeUserPreferences(updated);
    }),

  unlockPrivateVault: protectedProcedure
    .input(unlockPrivateVaultSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const [existing] = await db.select({ userPreferences: users.userPreferences }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      const currentPrefs = (existing?.userPreferences as Record<string, any>) || {};
      const currentVault = (currentPrefs.privateVault || {}) as Record<string, any>;
      const pinHash = typeof currentVault.pinHash === "string" ? currentVault.pinHash : "";
      const enabled = currentVault.enabled === true && Boolean(pinHash);
      if (!enabled) {
        throw new Error("Private vault PIN is not configured");
      }

      const valid = await verifyPrivateVaultPin(input.pin, pinHash);
      if (!valid) {
        throw new Error("Invalid PIN");
      }

      const pinVersion = getPrivateVaultPinVersion({ privateVault: currentVault });
      const token = issuePrivateVaultAccessToken({
        userId: ctx.user.id,
        tenantId: String(ctx.user.currentTenantId ?? ctx.tenantId ?? ""),
        pinVersion,
      });

      return {
        token,
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        preferences: sanitizeUserPreferences(currentPrefs),
      };
    }),

  getAutomationPreferences: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = ctx.tenantId ?? String(ctx.user.currentTenantId ?? "").trim();
    if (!tenantId) {
      throw new Error("Tenant context is required");
    }

    return resolveEffectiveUserAutomationPolicy({
      tenantId,
      userId: ctx.user.id,
    });
  }),

  updateAutomationPreferences: protectedProcedure
    .input(browserPolicyUserProfileSchema.partial())
    .mutation(async ({ ctx, input }) => {
      const tenantId = ctx.tenantId ?? String(ctx.user.currentTenantId ?? "").trim();
      if (!tenantId) {
        throw new Error("Tenant context is required");
      }

      return updateUserBrowserPolicyProfile({
        tenantId,
        userId: ctx.user.id,
        profile: input,
      });
    }),
});
