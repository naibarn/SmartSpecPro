import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import {
  createKey,
  listKeys,
  revokeKey,
  updateKeySettings,
  suspendKey,
  unsuspendKey,
} from "../services/apiKeyService";
import { ALLOWED_API_SCOPES } from "../../shared/publicApiTypes";
import { getDb } from "../db";
import { publicApiAuditLog, apiWebhookEndpoints, apiKeys } from "../../drizzle/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Assert that a key belongs to the calling user (tenant-scoped). Throws NOT_FOUND otherwise. */
async function assertKeyOwnership(keyId: string, tenantId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const rows = await db
    .select({ userId: apiKeys.userId })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.tenantId, tenantId)))
    .limit(1);
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "API key not found" });
  if (rows[0].userId !== userId)
    throw new TRPCError({ code: "FORBIDDEN", message: "API key belongs to another user" });
}

/** Assert that a webhook belongs to the calling user via its apiKeyId. */
async function assertWebhookOwnership(webhookId: string, tenantId: string, userId: number) {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
  const rows = await db
    .select({ apiKeyUserId: apiKeys.userId, webhookTenantId: apiWebhookEndpoints.tenantId })
    .from(apiWebhookEndpoints)
    .leftJoin(apiKeys, eq(apiWebhookEndpoints.apiKeyId, apiKeys.id))
    .where(eq(apiWebhookEndpoints.id, webhookId))
    .limit(1);
  if (!rows[0] || rows[0].webhookTenantId !== tenantId)
    throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
  // If no apiKeyId, only admin can manage it (created outside user context)
  if (rows[0].apiKeyUserId !== null && rows[0].apiKeyUserId !== userId)
    throw new TRPCError({ code: "FORBIDDEN", message: "Webhook belongs to another user" });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const apiKeysRouter = router({
  // -------------------------------------------------------------------------
  // list — returns only the calling user's own keys
  // -------------------------------------------------------------------------
  list: protectedProcedure.query(async ({ ctx }) => {
    const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
    const { id: userId } = ctx.user;
    // Always scope to the calling user's keys — users manage only their own
    return listKeys(tenantId, userId);
  }),

  // -------------------------------------------------------------------------
  // create — generates new key owned by the calling user
  // -------------------------------------------------------------------------
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        scopes: z.array(z.string()).min(1),
        expiresInDays: z.number().int().min(1).max(3650).optional(),
        creditLimit: z.number().int().min(0).nullable().optional(),
        rateLimit: z.number().int().min(1).max(10000).optional(),
        quotaHourly: z.number().int().min(1).nullable().optional(),
        quotaDaily: z.number().int().min(1).nullable().optional(),
        quotaWeekly: z.number().int().min(1).nullable().optional(),
        quotaMonthly: z.number().int().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      const { id: userId } = ctx.user;

      const allowedSet = new Set(ALLOWED_API_SCOPES);
      for (const scope of input.scopes) {
        if (!allowedSet.has(scope as any)) {
          throw new TRPCError({ code: "FORBIDDEN", message: `Invalid scope: ${scope}` });
        }
      }

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : undefined;

      const result = await createKey(tenantId, userId, input.name, input.scopes, {
        expiresAt,
        creditLimit: input.creditLimit ?? undefined,
        rateLimit: input.rateLimit,
        quotaHourly: input.quotaHourly ?? null,
        quotaDaily: input.quotaDaily ?? null,
        quotaWeekly: input.quotaWeekly ?? null,
        quotaMonthly: input.quotaMonthly ?? null,
      });

      return { id: result.id, keyPrefix: result.keyPrefix, rawKey: result.rawKey, name: input.name, scopes: input.scopes };
    }),

  // -------------------------------------------------------------------------
  // updateSettings — user edits limits on their OWN key only
  // -------------------------------------------------------------------------
  updateSettings: protectedProcedure
    .input(
      z.object({
        keyId: z.string(),
        rateLimit: z.number().int().min(1).max(10000).optional(),
        creditLimit: z.number().int().min(0).nullable().optional(),
        quotaHourly: z.number().int().min(1).nullable().optional(),
        quotaDaily: z.number().int().min(1).nullable().optional(),
        quotaWeekly: z.number().int().min(1).nullable().optional(),
        quotaMonthly: z.number().int().min(1).nullable().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await assertKeyOwnership(input.keyId, tenantId, ctx.user.id);
      const { keyId, ...settings } = input;
      await updateKeySettings(keyId, tenantId, settings);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // revoke — user permanently deactivates their OWN key
  // -------------------------------------------------------------------------
  revoke: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await assertKeyOwnership(input.keyId, tenantId, ctx.user.id);
      await revokeKey(input.keyId, tenantId);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // getUsageStats — user views stats for their OWN key
  // -------------------------------------------------------------------------
  getUsageStats: protectedProcedure
    .input(z.object({ keyId: z.string(), days: z.number().int().min(1).max(90).default(7) }))
    .query(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await assertKeyOwnership(input.keyId, tenantId, ctx.user.id);

      const db = await getDb();
      if (!db) return { requestsPerDay: [], totalRequests: 0, totalCredits: 0, errorRate: 0, topEndpoints: [] };

      const cutoff = new Date(Date.now() - input.days * 86_400_000);

      const perDayRows = await db
        .select({
          date: sql<string>`date_trunc('day', ${publicApiAuditLog.createdAt})::date::text`,
          count: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${publicApiAuditLog.statusCode} >= 400)::int`,
          creditsUsed: sql<number>`coalesce(sum(${publicApiAuditLog.creditsUsed}), 0)::int`,
        })
        .from(publicApiAuditLog)
        .where(and(eq(publicApiAuditLog.apiKeyId, input.keyId), gte(publicApiAuditLog.createdAt, cutoff)))
        .groupBy(sql`date_trunc('day', ${publicApiAuditLog.createdAt})`)
        .orderBy(sql`date_trunc('day', ${publicApiAuditLog.createdAt})`);

      const topRows = await db
        .select({ path: publicApiAuditLog.path, count: sql<number>`count(*)::int` })
        .from(publicApiAuditLog)
        .where(and(eq(publicApiAuditLog.apiKeyId, input.keyId), gte(publicApiAuditLog.createdAt, cutoff)))
        .groupBy(publicApiAuditLog.path)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const totalRequests = perDayRows.reduce((s, r) => s + r.count, 0);
      const totalErrors = perDayRows.reduce((s, r) => s + r.errors, 0);
      const totalCredits = perDayRows.reduce((s, r) => s + r.creditsUsed, 0);

      return {
        requestsPerDay: perDayRows,
        totalRequests,
        totalCredits,
        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
        topEndpoints: topRows,
      };
    }),

  // -------------------------------------------------------------------------
  // listWebhooks — user views their OWN webhooks (via apiKeyId ownership)
  // -------------------------------------------------------------------------
  listWebhooks: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
    const userId = ctx.user.id;

    // Join through apiKeys to filter by userId
    const rows = await db
      .select({
        id: apiWebhookEndpoints.id,
        url: apiWebhookEndpoints.url,
        events: apiWebhookEndpoints.events,
        isActive: apiWebhookEndpoints.isActive,
        failureCount: apiWebhookEndpoints.failureCount,
        lastDeliveredAt: apiWebhookEndpoints.lastDeliveredAt,
        createdAt: apiWebhookEndpoints.createdAt,
      })
      .from(apiWebhookEndpoints)
      .innerJoin(apiKeys, eq(apiWebhookEndpoints.apiKeyId, apiKeys.id))
      .where(
        and(
          eq(apiWebhookEndpoints.tenantId, tenantId),
          eq(apiKeys.userId, userId),
        ),
      )
      .orderBy(desc(apiWebhookEndpoints.createdAt));

    return rows.map((r) => ({
      ...r,
      lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }),

  // -------------------------------------------------------------------------
  // deleteWebhook — user deletes their OWN webhook
  // -------------------------------------------------------------------------
  deleteWebhook: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await assertWebhookOwnership(input.webhookId, tenantId, ctx.user.id);
      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, input.webhookId));
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // reEnableWebhook — user re-enables their OWN dead-lettered webhook
  // -------------------------------------------------------------------------
  reEnableWebhook: protectedProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await assertWebhookOwnership(input.webhookId, tenantId, ctx.user.id);
      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: true, failureCount: 0, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, input.webhookId));
      return { success: true };
    }),

  // =========================================================================
  // ADMIN-ONLY — Security oversight: suspend/unsuspend any key, view all keys
  // =========================================================================

  // suspend — admin temporarily blocks any user's key
  suspend: adminProcedure
    .input(z.object({ keyId: z.string(), reason: z.string().max(500).optional() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await suspendKey(input.keyId, tenantId, ctx.user.id, input.reason);
      return { success: true };
    }),

  // unsuspend — admin lifts suspension
  unsuspend: adminProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await unsuspendKey(input.keyId, tenantId);
      return { success: true };
    }),

  // adminRevokeKey — admin force-revokes any user's key (emergency override)
  adminRevokeKey: adminProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      await revokeKey(input.keyId, tenantId);
      return { success: true };
    }),

  // adminListAllKeys — admin views ALL tenant keys for oversight/anomaly detection
  adminListAllKeys: adminProcedure.query(async ({ ctx }) => {
    const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
    return listKeys(tenantId, undefined); // no userId filter = all tenant keys
  }),

  // adminListAllWebhooks — admin views ALL tenant webhooks
  adminListAllWebhooks: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
    const rows = await db
      .select({
        id: apiWebhookEndpoints.id,
        url: apiWebhookEndpoints.url,
        events: apiWebhookEndpoints.events,
        isActive: apiWebhookEndpoints.isActive,
        failureCount: apiWebhookEndpoints.failureCount,
        lastDeliveredAt: apiWebhookEndpoints.lastDeliveredAt,
        createdAt: apiWebhookEndpoints.createdAt,
        apiKeyId: apiWebhookEndpoints.apiKeyId,
      })
      .from(apiWebhookEndpoints)
      .where(eq(apiWebhookEndpoints.tenantId, tenantId))
      .orderBy(desc(apiWebhookEndpoints.createdAt));
    return rows.map((r) => ({
      ...r,
      lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }),

  // adminGetTenantAuditLog — recent API activity across all keys (anomaly detection)
  adminGetTenantAuditLog: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(30).default(7) }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId) ?? "";
      const cutoff = new Date(Date.now() - input.days * 86_400_000);
      const rows = await db
        .select({
          apiKeyId: publicApiAuditLog.apiKeyId,
          method: publicApiAuditLog.method,
          path: publicApiAuditLog.path,
          statusCode: publicApiAuditLog.statusCode,
          creditsUsed: publicApiAuditLog.creditsUsed,
          latencyMs: publicApiAuditLog.latencyMs,
          createdAt: publicApiAuditLog.createdAt,
        })
        .from(publicApiAuditLog)
        .where(and(eq(publicApiAuditLog.tenantId, tenantId), gte(publicApiAuditLog.createdAt, cutoff)))
        .orderBy(desc(publicApiAuditLog.createdAt))
        .limit(500);
      return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
    }),
});
