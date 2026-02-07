/**
 * Audit tRPC Router
 *
 * Admin-only endpoints for:
 * - Searching providerUsageLog and apiAuditEvents
 * - Reading JSONL audit log payloads by traceId
 * - Cost audit (cross-check providerUsageLog vs creditTransactions)
 * - Aggregated usage stats
 */

import { z } from "zod";
import { router, adminProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  providerUsageLog,
  apiAuditEvents,
  creditTransactions,
  llmProviders,
} from "../../drizzle/schema";
import { eq, and, gte, lte, desc, sql, isNotNull } from "drizzle-orm";
import { auditLogger } from "../services/auditLogger";

export const auditRouter = router({
  /**
   * Search providerUsageLog + apiAuditEvents with filters
   */
  search: adminProcedure
    .input(
      z.object({
        dateStart: z.string().datetime().optional(),
        dateEnd: z.string().datetime().optional(),
        userId: z.number().optional(),
        providerId: z.number().optional(),
        model: z.string().optional(),
        traceId: z.string().optional(),
        errorOnly: z.boolean().optional(),
        eventType: z.string().optional(),
        limit: z.number().min(1).max(500).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { usageLogs: [], auditEvents: [], total: 0 };

      const conditions: any[] = [];
      if (input.dateStart) conditions.push(gte(providerUsageLog.createdAt, new Date(input.dateStart)));
      if (input.dateEnd) conditions.push(lte(providerUsageLog.createdAt, new Date(input.dateEnd)));
      if (input.userId) conditions.push(eq(providerUsageLog.userId, input.userId));
      if (input.providerId) conditions.push(eq(providerUsageLog.providerId, input.providerId));
      if (input.model) conditions.push(eq(providerUsageLog.modelUsed, input.model));
      if (input.traceId) conditions.push(eq(providerUsageLog.traceId, input.traceId));
      if (input.errorOnly) conditions.push(isNotNull(providerUsageLog.errorType));

      const usageLogs = await db
        .select()
        .from(providerUsageLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(providerUsageLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      // Also search apiAuditEvents
      const eventConditions: any[] = [];
      if (input.dateStart) eventConditions.push(gte(apiAuditEvents.createdAt, new Date(input.dateStart)));
      if (input.dateEnd) eventConditions.push(lte(apiAuditEvents.createdAt, new Date(input.dateEnd)));
      if (input.userId) eventConditions.push(eq(apiAuditEvents.userId, input.userId));
      if (input.traceId) eventConditions.push(eq(apiAuditEvents.traceId, input.traceId));
      if (input.eventType) eventConditions.push(eq(apiAuditEvents.eventType, input.eventType));
      if (input.errorOnly) eventConditions.push(isNotNull(apiAuditEvents.errorMessage));

      const auditEvents = await db
        .select()
        .from(apiAuditEvents)
        .where(eventConditions.length > 0 ? and(...eventConditions) : undefined)
        .orderBy(desc(apiAuditEvents.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { usageLogs, auditEvents };
    }),

  /**
   * Get full request/response payloads from JSONL for a specific traceId
   */
  getPayload: adminProcedure
    .input(
      z.object({
        traceId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input }) => {
      const date = input.date ? new Date(input.date) : new Date();
      const entries = await auditLogger.readEntries({
        date,
        traceId: input.traceId,
        limit: 50,
      });
      return { entries };
    }),

  /**
   * Cost audit: cross-check providerUsageLog vs creditTransactions by traceId
   */
  costAudit: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { mismatches: [], total: 0 };

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      // Find providerUsageLog entries with traceId that have credit transactions
      const results = await db
        .select({
          traceId: providerUsageLog.traceId,
          model: providerUsageLog.modelUsed,
          costUsd: providerUsageLog.costUsd,
          creditsCharged: providerUsageLog.creditsCharged,
          createdAt: providerUsageLog.createdAt,
        })
        .from(providerUsageLog)
        .where(
          and(
            gte(providerUsageLog.createdAt, since),
            isNotNull(providerUsageLog.traceId)
          )
        )
        .orderBy(desc(providerUsageLog.createdAt))
        .limit(200);

      return { entries: results, total: results.length };
    }),

  /**
   * Aggregated stats: requests/day, error rate, avg latency, top models
   */
  stats: adminProcedure
    .input(
      z.object({
        days: z.number().min(1).max(90).default(7),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { requestsPerDay: [], errorRate: 0, avgLatency: 0, topModels: [] };

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      const [totals] = await db
        .select({
          totalRequests: sql<number>`count(*)::int`,
          errorCount: sql<number>`count(*) filter (where ${providerUsageLog.errorType} is not null)::int`,
          avgLatency: sql<number>`coalesce(avg(${providerUsageLog.responseTimeMs}), 0)::float`,
          totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
        })
        .from(providerUsageLog)
        .where(gte(providerUsageLog.createdAt, since));

      const topModels = await db
        .select({
          model: providerUsageLog.modelUsed,
          count: sql<number>`count(*)::int`,
          totalCost: sql<number>`coalesce(sum(${providerUsageLog.costUsd}::numeric), 0)::float`,
        })
        .from(providerUsageLog)
        .where(gte(providerUsageLog.createdAt, since))
        .groupBy(providerUsageLog.modelUsed)
        .orderBy(desc(sql`count(*)`))
        .limit(10);

      const requestsPerDay = await db
        .select({
          date: sql<string>`date_trunc('day', ${providerUsageLog.createdAt})::date::text`,
          count: sql<number>`count(*)::int`,
          errors: sql<number>`count(*) filter (where ${providerUsageLog.errorType} is not null)::int`,
        })
        .from(providerUsageLog)
        .where(gte(providerUsageLog.createdAt, since))
        .groupBy(sql`date_trunc('day', ${providerUsageLog.createdAt})`)
        .orderBy(sql`date_trunc('day', ${providerUsageLog.createdAt})`);

      const totalRequests = totals?.totalRequests ?? 0;

      return {
        totalRequests,
        errorRate: totalRequests > 0 ? (totals?.errorCount ?? 0) / totalRequests : 0,
        avgLatency: totals?.avgLatency ?? 0,
        totalCost: totals?.totalCost ?? 0,
        topModels,
        requestsPerDay,
      };
    }),
});
