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
import { eq, and, gte, lte, desc, sql, isNotNull, ilike, or } from "drizzle-orm";
import { auditLogger } from "../services/auditLogger";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

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
        provider: z.string().optional(),
        model: z.string().optional(),
        traceId: z.string().optional(),
        errorOnly: z.boolean().optional(),
        eventType: z.string().optional(),
        requestType: z.string().optional(),
        limit: z.number().min(1).max(500).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { usageLogs: [], auditEvents: [], total: 0 };

      let usageLogs: any[] = [];
      try {
        const conditions: any[] = [];
        if (input.dateStart) conditions.push(gte(providerUsageLog.createdAt, new Date(input.dateStart)));
        if (input.dateEnd) conditions.push(lte(providerUsageLog.createdAt, new Date(input.dateEnd)));
        if (input.userId) conditions.push(eq(providerUsageLog.userId, input.userId));
        if (input.providerId) conditions.push(eq(providerUsageLog.providerId, input.providerId));
        if (input.provider) conditions.push(ilike(llmProviders.providerName, `%${input.provider}%`));
        if (input.model) conditions.push(ilike(providerUsageLog.modelUsed, `%${input.model}%`));
        if (input.traceId) conditions.push(eq(providerUsageLog.traceId, input.traceId));
        if (input.requestType) conditions.push(eq(providerUsageLog.requestType, input.requestType));
        if (input.errorOnly) {
          conditions.push(
            or(
              isNotNull(providerUsageLog.errorType),
              isNotNull(providerUsageLog.errorMessage),
            ),
          );
        }

        usageLogs = await db
          .select({
            id: providerUsageLog.id,
            userId: providerUsageLog.userId,
            providerId: providerUsageLog.providerId,
            providerName: sql<string>`coalesce(${llmProviders.providerName}, 'Unknown')`,
            modelUsed: providerUsageLog.modelUsed,
            inputTokens: providerUsageLog.inputTokens,
            outputTokens: providerUsageLog.outputTokens,
            costUsd: providerUsageLog.costUsd,
            creditsCharged: providerUsageLog.creditsCharged,
            responseTimeMs: providerUsageLog.responseTimeMs,
            statusCode: providerUsageLog.statusCode,
            errorType: providerUsageLog.errorType,
            errorMessage: providerUsageLog.errorMessage,
            traceId: providerUsageLog.traceId,
            requestType: providerUsageLog.requestType,
            wasFallback: providerUsageLog.wasFallback,
            fallbackFromProviderId: providerUsageLog.fallbackFromProviderId,
            createdAt: providerUsageLog.createdAt,
          })
          .from(providerUsageLog)
          .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(providerUsageLog.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      } catch (error) {
        console.warn('[audit.search] provider_usage_log query failed', { error: getErrorMessage(error) });
      }

      // Also search apiAuditEvents
      let auditEvents: any[] = [];
      try {
        const eventConditions: any[] = [];
        if (input.dateStart) eventConditions.push(gte(apiAuditEvents.createdAt, new Date(input.dateStart)));
        if (input.dateEnd) eventConditions.push(lte(apiAuditEvents.createdAt, new Date(input.dateEnd)));
        if (input.userId) eventConditions.push(eq(apiAuditEvents.userId, input.userId));
        if (input.provider) eventConditions.push(ilike(apiAuditEvents.provider, `%${input.provider}%`));
        if (input.model) eventConditions.push(ilike(apiAuditEvents.model, `%${input.model}%`));
        if (input.traceId) eventConditions.push(eq(apiAuditEvents.traceId, input.traceId));
        if (input.eventType) eventConditions.push(eq(apiAuditEvents.eventType, input.eventType));
        if (input.requestType) {
          eventConditions.push(
            or(
              eq(apiAuditEvents.mediaType, input.requestType),
              eq(apiAuditEvents.eventType, input.requestType),
            ),
          );
        }
        if (input.errorOnly) eventConditions.push(isNotNull(apiAuditEvents.errorMessage));

        auditEvents = await db
          .select()
          .from(apiAuditEvents)
          .where(eventConditions.length > 0 ? and(...eventConditions) : undefined)
          .orderBy(desc(apiAuditEvents.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      } catch (error) {
        console.warn('[audit.search] api_audit_events query failed', { error: getErrorMessage(error) });
      }

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
      const preferredDate = input.date
        ? new Date(`${input.date}T00:00:00.000Z`)
        : new Date();
      const entries = await readAuditEntriesWithFallback({
        traceId: input.traceId,
        preferredDate,
        limit: 100,
      });
      return { entries };
    }),

  /**
   * Search orchestration audit events from JSONL logs.
   * Filters by orchestration_* event types and supports date/traceId/userId filters.
   */
  orchestrationEvents: adminProcedure
    .input(
      z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        traceId: z.string().optional(),
        userId: z.number().optional(),
        eventType: z
          .enum([
            "orchestration_classify",
            "orchestration_pipeline",
            "orchestration_agent_step",
            "orchestration_quality_gate",
            "orchestration_param_extract",
            "orchestration_fallback",
          ])
          .optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const targetDate = input.date
        ? new Date(`${input.date}T00:00:00.000Z`)
        : new Date();

      // Read all orchestration events from JSONL
      const orchestrationTypes = [
        "orchestration_classify",
        "orchestration_pipeline",
        "orchestration_agent_step",
        "orchestration_quality_gate",
        "orchestration_param_extract",
        "orchestration_fallback",
      ];

      let allEntries: any[] = [];

      // Read target date ± 1 day
      for (const offset of [-1, 0, 1]) {
        const d = addDays(targetDate, offset);
        if (input.eventType) {
          // Filter by specific event type
          const entries = await auditLogger.readEntries({
            date: d,
            eventType: input.eventType,
            traceId: input.traceId,
            userId: input.userId,
            limit: input.limit,
          });
          allEntries.push(...entries);
        } else {
          // Fetch all orchestration event types
          for (const eventType of orchestrationTypes) {
            const entries = await auditLogger.readEntries({
              date: d,
              eventType,
              traceId: input.traceId,
              userId: input.userId,
              limit: Math.ceil(input.limit / orchestrationTypes.length),
            });
            allEntries.push(...entries);
          }
        }
      }

      // Sort by timestamp descending and deduplicate
      allEntries.sort((a, b) => {
        const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
        const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
        return tb - ta;
      });

      // Deduplicate by timestamp+eventType+traceId
      const seen = new Set<string>();
      allEntries = allEntries.filter((e) => {
        const key = `${e.timestamp}|${e.eventType}|${e.traceId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Compute summary stats
      const classifyEvents = allEntries.filter((e) => e.eventType === "orchestration_classify");
      const fallbackEvents = allEntries.filter((e) => e.eventType === "orchestration_fallback");
      const pipelineEvents = allEntries.filter((e) => e.eventType === "orchestration_pipeline");

      const avgLatency = classifyEvents.length > 0
        ? classifyEvents.reduce((sum: number, e: any) => sum + (e.metadata?.latencyMs ?? 0), 0) / classifyEvents.length
        : 0;

      const totalCredits = pipelineEvents.reduce(
        (sum: number, e: any) => sum + (e.metadata?.totalCreditsUsed ?? e.creditsCharged ?? 0),
        0,
      );

      const fallbackReasons: Record<string, number> = {};
      for (const e of fallbackEvents) {
        const reason = e.metadata?.reason ?? "unknown";
        fallbackReasons[reason] = (fallbackReasons[reason] ?? 0) + 1;
      }

      // Skill usage distribution
      const skillUsage: Record<string, number> = {};
      for (const e of classifyEvents) {
        const topSkill = e.metadata?.skills?.[0]?.skillId ?? e.skillSlug;
        if (topSkill) {
          skillUsage[topSkill] = (skillUsage[topSkill] ?? 0) + 1;
        }
      }

      return {
        entries: allEntries.slice(0, input.limit),
        stats: {
          totalEvents: allEntries.length,
          classifyCount: classifyEvents.length,
          fallbackCount: fallbackEvents.length,
          pipelineCount: pipelineEvents.length,
          avgClassifyLatencyMs: Math.round(avgLatency),
          totalCreditsUsed: totalCredits,
          fallbackReasons,
          topSkills: Object.entries(skillUsage)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([skillId, count]) => ({ skillId, count })),
        },
      };
    }),

  /**
   * Get full orchestration trace — all events for a single traceId
   */
  orchestrationTrace: adminProcedure
    .input(
      z.object({
        traceId: z.string(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
    )
    .query(async ({ input }) => {
      const preferredDate = input.date
        ? new Date(`${input.date}T00:00:00.000Z`)
        : new Date();
      const entries = await readAuditEntriesWithFallback({
        traceId: input.traceId,
        preferredDate,
        limit: 100,
      });
      // Filter to orchestration events only
      const orchestrationEntries = entries.filter((e: any) =>
        e.eventType?.startsWith("orchestration_"),
      );
      return { entries: orchestrationEntries, allEntries: entries };
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
      if (!db) return { entries: [], total: 0 };

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      try {
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
      } catch (error) {
        console.warn('[audit.costAudit] provider_usage_log query failed', { error: getErrorMessage(error) });
        return { entries: [], total: 0 };
      }
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
      const emptyResult = {
        totalRequests: 0,
        errorRate: 0,
        avgLatency: 0,
        totalCost: 0,
        topModels: [] as { model: string; count: number; totalCost: number }[],
        requestsPerDay: [] as { date: string; count: number; errors: number }[],
      };

      const db = await getDb();
      if (!db) return emptyResult;

      const since = new Date();
      since.setDate(since.getDate() - input.days);

      try {
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
      } catch (error) {
        console.warn('[audit.stats] provider_usage_log query failed, returning empty', { error: getErrorMessage(error) });
        return emptyResult;
      }
    }),
});

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

async function readAuditEntriesWithFallback(opts: {
  traceId: string;
  preferredDate: Date;
  limit?: number;
}): Promise<any[]> {
  const limit = opts.limit ?? 100;
  const seenDates = new Set<string>();
  const merged = new Map<string, any>();

  const collect = async (date: Date) => {
    const keyDate = toIsoDate(date);
    if (seenDates.has(keyDate)) return;
    seenDates.add(keyDate);

    const entries = await auditLogger.readEntries({
      date,
      traceId: opts.traceId,
      limit,
    });

    for (const entry of entries) {
      const key = [
        entry.timestamp ?? "",
        entry.eventType ?? "",
        entry.model ?? "",
        entry.statusCode ?? "",
        entry.requestType ?? "",
      ].join("|");
      if (!merged.has(key)) {
        merged.set(key, entry);
      }
    }
  };

  for (const offset of [-1, 0, 1]) {
    await collect(addDays(opts.preferredDate, offset));
  }

  if (merged.size === 0) {
    const today = new Date();
    for (let offset = 0; offset > -7; offset -= 1) {
      await collect(addDays(today, offset));
      if (merged.size >= limit) break;
    }
  }

  return [...merged.values()]
    .sort((a, b) => {
      const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    })
    .slice(0, limit);
}
