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
import {
  getSpecialTieInForensicEvent,
  listSpecialTieInForensicEvents,
} from "../services/verticalDramaSpecialTieInForensics";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isDatabaseUnavailableError(error: unknown): boolean {
  return getErrorMessage(error).toLowerCase().includes("database unavailable");
}

type AuditSearchInput = {
  dateStart?: string;
  dateEnd?: string;
  userId?: number;
  providerId?: number;
  provider?: string;
  model?: string;
  traceId?: string;
  errorOnly?: boolean;
  eventType?: string;
  requestType?: string;
  limit: number;
  offset: number;
  timelineLimit: number;
  timelineOffset: number;
};

type AuditTimelineRow = {
  id: string;
  source: "llm" | "media" | "system";
  timestamp: string | null;
  traceId: string | null;
  userId: number | null;
  provider: string | null;
  model: string | null;
  subject: string | null;
  contextLabel: string | null;
  eventType: string | null;
  requestType: string | null;
  statusCode: number | null;
  errorType: string | null;
  errorMessage: string | null;
  creditsCharged: number | null;
  costUsd: number | null;
  responseTimeMs: number | null;
  endpoint: string | null;
  mediaTaskId: string | null;
  raw: unknown;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function numberOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildUsageConditions(input: AuditSearchInput) {
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
  return conditions;
}

function buildApiAuditConditions(input: AuditSearchInput) {
  const conditions: any[] = [];
  if (input.dateStart) conditions.push(gte(apiAuditEvents.createdAt, new Date(input.dateStart)));
  if (input.dateEnd) conditions.push(lte(apiAuditEvents.createdAt, new Date(input.dateEnd)));
  if (input.userId) conditions.push(eq(apiAuditEvents.userId, input.userId));
  if (input.provider) conditions.push(ilike(apiAuditEvents.provider, `%${input.provider}%`));
  if (input.model) conditions.push(ilike(apiAuditEvents.model, `%${input.model}%`));
  if (input.traceId) conditions.push(eq(apiAuditEvents.traceId, input.traceId));
  if (input.eventType) conditions.push(eq(apiAuditEvents.eventType, input.eventType));
  if (input.requestType) {
    conditions.push(
      or(
        eq(apiAuditEvents.mediaType, input.requestType),
        eq(apiAuditEvents.eventType, input.requestType),
      ),
    );
  }
  if (input.errorOnly) conditions.push(isNotNull(apiAuditEvents.errorMessage));
  return conditions;
}

function mapUsageRowToTimeline(row: any): AuditTimelineRow {
  return {
    id: `llm-${row.id}`,
    source: "llm",
    timestamp: row.createdAt ? String(row.createdAt) : null,
    traceId: textOrNull(row.traceId),
    userId: numberOrNull(row.userId),
    provider: textOrNull(row.providerName) ?? (row.providerId != null ? String(row.providerId) : null),
    model: textOrNull(row.modelUsed),
    subject: null,
    contextLabel: null,
    eventType: "llm",
    requestType: textOrNull(row.requestType),
    statusCode: numberOrNull(row.statusCode),
    errorType: textOrNull(row.errorType),
    errorMessage: textOrNull(row.errorMessage),
    creditsCharged: numberOrNull(row.creditsCharged),
    costUsd: numberOrNull(row.costUsd),
    responseTimeMs: numberOrNull(row.responseTimeMs),
    endpoint: null,
    mediaTaskId: null,
    raw: row,
  };
}

function mapApiAuditRowToTimeline(row: any): AuditTimelineRow {
  return {
    id: `media-${row.id}`,
    source: "media",
    timestamp: row.createdAt ? String(row.createdAt) : null,
    traceId: textOrNull(row.traceId),
    userId: numberOrNull(row.userId),
    provider: textOrNull(row.provider),
    model: textOrNull(row.model),
    subject: null,
    contextLabel: null,
    eventType: textOrNull(row.eventType),
    requestType: textOrNull(row.mediaType) ?? textOrNull(row.eventType),
    statusCode: numberOrNull(row.statusCode),
    errorType: textOrNull(row.errorMessage) ? "provider_error" : null,
    errorMessage: textOrNull(row.errorMessage),
    creditsCharged: numberOrNull(row.creditsCharged),
    costUsd: numberOrNull(row.costUsd),
    responseTimeMs: numberOrNull(row.responseTimeMs),
    endpoint: textOrNull(row.endpoint),
    mediaTaskId: textOrNull(row.mediaTaskId),
    raw: row,
  };
}

function mapSystemAuditRowToTimeline(row: any, idx: number): AuditTimelineRow {
  const metadata = asRecord(row.metadata);
  return {
    id: `system-${row.timestamp ?? idx}-${row.eventType ?? "event"}-${idx}`,
    source: "system",
    timestamp: textOrNull(row.timestamp),
    traceId: textOrNull(row.traceId),
    userId: numberOrNull(row.userId),
    provider: null,
    model: null,
    subject: textOrNull(metadata?.blueprintId) ?? textOrNull(metadata?.templateId) ?? textOrNull(metadata?.teamId),
    contextLabel: textOrNull(metadata?.category) ?? textOrNull(metadata?.tenantId),
    eventType: textOrNull(row.eventType),
    requestType: textOrNull(row.requestType),
    statusCode: numberOrNull(row.statusCode),
    errorType: textOrNull(row.errorType),
    errorMessage: textOrNull(row.errorMessage),
    creditsCharged: numberOrNull(row.creditsCharged),
    costUsd: numberOrNull(row.costUsd),
    responseTimeMs: numberOrNull(row.timing?.totalMs),
    endpoint: textOrNull(row.endpoint),
    mediaTaskId: null,
    raw: row,
  };
}

export function buildMergedTimelineRows(input: {
  usageRows: any[];
  auditRows: any[];
  systemRows: any[];
  timelineOffset: number;
  timelineLimit: number;
}): AuditTimelineRow[] {
  return [
    ...input.usageRows.map(mapUsageRowToTimeline),
    ...input.auditRows.map(mapApiAuditRowToTimeline),
    ...input.systemRows.map(mapSystemAuditRowToTimeline),
  ]
    .sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    })
    .slice(input.timelineOffset, input.timelineOffset + input.timelineLimit);
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
        timelineLimit: z.number().min(1).max(200).default(50),
        timelineOffset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      const usageConditions = buildUsageConditions(input);
      const apiAuditConditions = buildApiAuditConditions(input);
      const timelineCandidateLimit = input.timelineOffset + input.timelineLimit;

      let usageLogs: any[] = [];
      try {
        if (!db) throw new Error("database unavailable");
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
          .where(usageConditions.length > 0 ? and(...usageConditions) : undefined)
          .orderBy(desc(providerUsageLog.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      } catch (error) {
        if (!isDatabaseUnavailableError(error)) {
          console.warn('[audit.search] provider_usage_log query failed', { error: getErrorMessage(error) });
        }
      }

      // Also search apiAuditEvents
      let auditEvents: any[] = [];
      try {
        if (!db) throw new Error("database unavailable");
        auditEvents = await db
          .select()
          .from(apiAuditEvents)
          .where(apiAuditConditions.length > 0 ? and(...apiAuditConditions) : undefined)
          .orderBy(desc(apiAuditEvents.createdAt))
          .limit(input.limit)
          .offset(input.offset);
      } catch (error) {
        if (!isDatabaseUnavailableError(error)) {
          console.warn('[audit.search] api_audit_events query failed', { error: getErrorMessage(error) });
        }
      }

      const systemSearch = await readSystemAuditEntriesForSearch(input);
      const systemEvents = systemSearch.entries.slice(input.offset, input.offset + input.limit);

      let usageTimelineRows: any[] = [];
      let usageTimelineTotal = 0;
      try {
        if (!db) throw new Error("database unavailable");
        usageTimelineRows = await db
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
          .where(usageConditions.length > 0 ? and(...usageConditions) : undefined)
          .orderBy(desc(providerUsageLog.createdAt))
          .limit(timelineCandidateLimit)
          .offset(0);

        const [usageCountRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(providerUsageLog)
          .leftJoin(llmProviders, eq(providerUsageLog.providerId, llmProviders.id))
          .where(usageConditions.length > 0 ? and(...usageConditions) : undefined);
        usageTimelineTotal = Number(usageCountRow?.count ?? 0);
      } catch {
        usageTimelineRows = [];
        usageTimelineTotal = 0;
      }

      let auditTimelineRows: any[] = [];
      let auditTimelineTotal = 0;
      try {
        if (!db) throw new Error("database unavailable");
        auditTimelineRows = await db
          .select()
          .from(apiAuditEvents)
          .where(apiAuditConditions.length > 0 ? and(...apiAuditConditions) : undefined)
          .orderBy(desc(apiAuditEvents.createdAt))
          .limit(timelineCandidateLimit)
          .offset(0);

        const [auditCountRow] = await db
          .select({ count: sql<number>`count(*)` })
          .from(apiAuditEvents)
          .where(apiAuditConditions.length > 0 ? and(...apiAuditConditions) : undefined);
        auditTimelineTotal = Number(auditCountRow?.count ?? 0);
      } catch {
        auditTimelineRows = [];
        auditTimelineTotal = 0;
      }

      const mergedTimelineRows = buildMergedTimelineRows({
        usageRows: usageTimelineRows,
        auditRows: auditTimelineRows,
        systemRows: systemSearch.entries,
        timelineOffset: input.timelineOffset,
        timelineLimit: input.timelineLimit,
      });

      return {
        usageLogs,
        auditEvents,
        systemEvents,
        timelineRows: mergedTimelineRows,
        timelineTotal: usageTimelineTotal + auditTimelineTotal + systemSearch.total,
        systemEventsMeta: systemSearch.meta,
      };
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
   * Admin-only forensic timeline for one exact special tie-in correlation.
   * Raw request/response bodies are intentionally excluded from this list.
   */
  specialTieInDebugTimeline: adminProcedure
    .input(
      z.object({
        episodeId: z.number().int().positive().optional(),
        jobId: z.string().min(1).max(64).optional(),
        traceId: z.string().min(1).max(128).optional(),
        tenantId: z.string().min(1).max(36).optional(),
        userId: z.number().int().positive().optional(),
        limit: z.number().int().min(1).max(200).default(100),
      }).refine(value => value.episodeId !== undefined || value.jobId !== undefined || value.traceId !== undefined, {
        message: "An exact episodeId, jobId, or traceId is required",
      })
    )
    .query(async ({ input }) => {
      const rows = await listSpecialTieInForensicEvents(input);
      return rows.map(({ requestPayload, responsePayload, ...summary }) => summary);
    }),

  /** Admin-only detail endpoint for one durable, already-redacted forensic event. */
  specialTieInDebugEvent: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input }) => getSpecialTieInForensicEvent(input.id)),

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

const TEAM_SYSTEM_AUDIT_EVENT_TYPES = [
  "team_created",
  "team_blueprint_created",
  "team_template_cloned",
] as const;

function buildAuditSearchDates(input: {
  dateStart?: string;
  dateEnd?: string;
}): {
  dates: Date[];
  meta: {
    defaultWindowApplied: boolean;
    searchedDayCount: number;
  };
} {
  const defaultWindowDays = 14;
  const end = input.dateEnd ? new Date(input.dateEnd) : new Date();
  const start = input.dateStart
    ? new Date(input.dateStart)
    : addDays(end, -(defaultWindowDays - 1));

  const normalizedStart = Number.isNaN(start.getTime()) ? addDays(end, -(defaultWindowDays - 1)) : start;
  const normalizedEnd = Number.isNaN(end.getTime()) ? new Date() : end;
  const dates: Date[] = [];

  const cursor = new Date(Date.UTC(
    normalizedStart.getUTCFullYear(),
    normalizedStart.getUTCMonth(),
    normalizedStart.getUTCDate(),
  ));
  const finalDate = new Date(Date.UTC(
    normalizedEnd.getUTCFullYear(),
    normalizedEnd.getUTCMonth(),
    normalizedEnd.getUTCDate(),
  ));

  while (cursor <= finalDate) {
    dates.push(new Date(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  if (dates.length === 0) {
    dates.push(new Date());
  }

  return {
    dates,
    meta: {
      defaultWindowApplied: !input.dateStart && !input.dateEnd,
      searchedDayCount: dates.length,
    },
  };
}

async function readSystemAuditEntriesForSearch(input: {
  dateStart?: string;
  dateEnd?: string;
  userId?: number;
  provider?: string;
  model?: string;
  traceId?: string;
  errorOnly?: boolean;
  eventType?: string;
  requestType?: string;
  limit: number;
  offset: number;
  timelineLimit: number;
  timelineOffset: number;
}): Promise<{
  entries: any[];
  total: number;
  meta: {
    defaultWindowApplied: boolean;
    searchedDayCount: number;
  };
}> {
  if (input.provider || input.model) {
    return {
      entries: [],
      total: 0,
      meta: {
        defaultWindowApplied: false,
        searchedDayCount: 0,
      },
    };
  }

  const requestedSystemEventTypes = input.eventType
    ? TEAM_SYSTEM_AUDIT_EVENT_TYPES.filter((eventType) => eventType === input.eventType)
    : TEAM_SYSTEM_AUDIT_EVENT_TYPES;

  if (requestedSystemEventTypes.length === 0) {
    return {
      entries: [],
      total: 0,
      meta: {
        defaultWindowApplied: false,
        searchedDayCount: 0,
      },
    };
  }

  if (input.requestType && input.requestType !== "all") {
    return {
      entries: [],
      total: 0,
      meta: {
        defaultWindowApplied: false,
        searchedDayCount: 0,
      },
    };
  }

  const merged = new Map<string, any>();
  const { dates, meta } = buildAuditSearchDates(input);

  for (const date of dates) {
    for (const eventType of requestedSystemEventTypes) {
      const entries = await auditLogger.readEntries({
        date,
        eventType,
        traceId: input.traceId,
        userId: input.userId,
        limit: null,
        sortOrder: "desc",
      });

      for (const entry of entries) {
        if (input.errorOnly && !entry.errorMessage && (entry.statusCode == null || entry.statusCode < 400)) {
          continue;
        }

        const key = [
          entry.timestamp ?? "",
          entry.eventType ?? "",
          entry.traceId ?? "",
          entry.userId ?? "",
          JSON.stringify(entry.metadata ?? {}),
        ].join("|");

        if (!merged.has(key)) {
          merged.set(key, entry);
        }
      }
    }
  }

  const entries = [...merged.values()]
    .sort((a, b) => {
      const ta = a?.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b?.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

  return {
    entries,
    total: entries.length,
    meta,
  };
}

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
