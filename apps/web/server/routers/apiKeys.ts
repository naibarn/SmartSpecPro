import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, and, gte, desc, sql, count } from "drizzle-orm";
import { protectedProcedure, adminProcedure, router } from "../_core/trpc";
import {
  createKey,
  listKeys,
  revokeKey,
} from "../services/apiKeyService";
import { ALLOWED_API_SCOPES } from "../../shared/publicApiTypes";
import { getDb } from "../db";
import { apiAuditEvents, apiWebhookEndpoints } from "../../drizzle/schema";

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const apiKeysRouter = router({
  // -------------------------------------------------------------------------
  // list — returns keys for current user (admin sees all tenant keys)
  // -------------------------------------------------------------------------
  list: protectedProcedure.query(async ({ ctx }) => {
    const { tenantId, id: userId, role } = ctx.user;
    const isAdmin = role === "admin" || role === "domain_admin";

    return listKeys(tenantId, isAdmin ? undefined : userId);
  }),

  // -------------------------------------------------------------------------
  // create — generates new key, returns rawKey exactly once
  // -------------------------------------------------------------------------
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        scopes: z.array(z.string()).min(1),
        expiresInDays: z.number().int().min(1).max(3650).optional(),
        creditLimit: z.number().int().min(0).nullable().optional(),
        rateLimit: z.number().int().min(1).max(10000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const { tenantId, id: userId } = ctx.user;

      // Validate scopes
      const allowedSet = new Set(ALLOWED_API_SCOPES);
      for (const scope of input.scopes) {
        if (!allowedSet.has(scope as any)) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Invalid scope: ${scope}`,
          });
        }
      }

      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86_400_000)
        : undefined;

      const result = await createKey(tenantId, userId, input.name, input.scopes, {
        expiresAt,
        creditLimit: input.creditLimit ?? undefined,
        rateLimit: input.rateLimit,
      });

      return {
        id: result.id,
        keyPrefix: result.keyPrefix,
        rawKey: result.rawKey,
        name: input.name,
        scopes: input.scopes,
      };
    }),

  // -------------------------------------------------------------------------
  // revoke — deactivates key (tenant-scoped)
  // -------------------------------------------------------------------------
  revoke: protectedProcedure
    .input(z.object({ keyId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const { tenantId } = ctx.user;
      await revokeKey(input.keyId, tenantId);
      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // getUsageStats — per-key analytics (admin only)
  // -------------------------------------------------------------------------
  getUsageStats: adminProcedure
    .input(
      z.object({
        keyId: z.string(),
        days: z.number().int().min(1).max(90).default(7),
      }),
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { requestsPerDay: [], totalRequests: 0, totalCredits: 0, errorRate: 0, topEndpoints: [] };

      const cutoff = new Date(Date.now() - input.days * 86_400_000);

      // Requests per day
      const perDayRows = await db
        .select({
          date: sql<string>`date_trunc('day', ${apiAuditEvents.createdAt})::date::text`,
          count: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${apiAuditEvents.statusCode} >= 400)::int`,
          creditsUsed: sql<number>`coalesce(sum(${apiAuditEvents.creditsUsed}), 0)::int`,
        })
        .from(apiAuditEvents)
        .where(
          and(
            eq(apiAuditEvents.apiKeyId, input.keyId),
            gte(apiAuditEvents.createdAt, cutoff),
          ),
        )
        .groupBy(sql`date_trunc('day', ${apiAuditEvents.createdAt})`)
        .orderBy(sql`date_trunc('day', ${apiAuditEvents.createdAt})`);

      // Top endpoints
      const topRows = await db
        .select({
          path: apiAuditEvents.path,
          count: sql<number>`count(*)::int`,
        })
        .from(apiAuditEvents)
        .where(
          and(
            eq(apiAuditEvents.apiKeyId, input.keyId),
            gte(apiAuditEvents.createdAt, cutoff),
          ),
        )
        .groupBy(apiAuditEvents.path)
        .orderBy(sql`count(*) desc`)
        .limit(10);

      const totalRequests = perDayRows.reduce((s, r) => s + r.count, 0);
      const totalErrors = perDayRows.reduce((s, r) => s + r.errors, 0);
      const totalCredits = perDayRows.reduce((s, r) => s + r.creditsUsed, 0);
      const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

      return {
        requestsPerDay: perDayRows,
        totalRequests,
        totalCredits,
        errorRate,
        topEndpoints: topRows,
      };
    }),

  // -------------------------------------------------------------------------
  // listWebhooks — tenant webhook endpoints (admin only)
  // -------------------------------------------------------------------------
  listWebhooks: adminProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

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
      .where(eq(apiWebhookEndpoints.tenantId, ctx.user.tenantId))
      .orderBy(desc(apiWebhookEndpoints.createdAt));

    return rows.map((r) => ({
      ...r,
      lastDeliveredAt: r.lastDeliveredAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    }));
  }),

  // -------------------------------------------------------------------------
  // deleteWebhook — soft delete (admin only)
  // -------------------------------------------------------------------------
  deleteWebhook: adminProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({ tenantId: apiWebhookEndpoints.tenantId })
        .from(apiWebhookEndpoints)
        .where(eq(apiWebhookEndpoints.id, input.webhookId));

      if (!rows[0] || rows[0].tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: false, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, input.webhookId));

      return { success: true };
    }),

  // -------------------------------------------------------------------------
  // reEnableWebhook — reset failureCount and activate (admin only)
  // -------------------------------------------------------------------------
  reEnableWebhook: adminProcedure
    .input(z.object({ webhookId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const rows = await db
        .select({ tenantId: apiWebhookEndpoints.tenantId })
        .from(apiWebhookEndpoints)
        .where(eq(apiWebhookEndpoints.id, input.webhookId));

      if (!rows[0] || rows[0].tenantId !== ctx.user.tenantId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      }

      await db
        .update(apiWebhookEndpoints)
        .set({ isActive: true, failureCount: 0, updatedAt: new Date() })
        .where(eq(apiWebhookEndpoints.id, input.webhookId));

      return { success: true };
    }),
});
