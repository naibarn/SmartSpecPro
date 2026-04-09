/**
 * Admin Ops Dashboard tRPC Router
 *
 * Provides admin endpoints for operational health monitoring:
 * - Traffic & Auth stats
 * - API Health metrics
 * - Jobs Health (Cloud Tasks)
 * - Kie AI Health (media callbacks)
 * - Storage Stats (R2)
 * - Security Stats (rate limiting)
 */

import { z } from 'zod';
import { router, domainAdminProcedure } from '../_core/trpc';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isProviderUsageLogUnavailableError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    (message.includes("provider_usage_log") && message.includes("does not exist")) ||
    (message.includes("provider_usage_log") && message.includes("no such table")) ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function isCloudTaskEventsMissingError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    (message.includes("cloud_task_events") && message.includes("does not exist")) ||
    (message.includes("cloud_task_events") && message.includes("no such table"))
  );
}

export const adminOpsRouter = router({
  workpackReleaseHealth: domainAdminProcedure.query(async ({ ctx }) => {
    const tenantId = String(ctx.tenantId ?? ctx.user?.currentTenantId ?? "");
    const { getWorkpackMonitoringSummary } = await import("../services/monitoringService");
    const { listWorkpackReadinessSummaries } = await import("../services/workpackReadinessService");
    const summary = await getWorkpackMonitoringSummary(tenantId);
    const readiness = await listWorkpackReadinessSummaries(tenantId);

    return {
      summary,
      readiness,
      blockers: readiness.filter((item) => item.gateResult !== "ready"),
    };
  }),

  /**
   * Traffic & Auth Panel - Daily user activity and login metrics
   */
  trafficStats: domainAdminProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
    }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 7;
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { daily: [], totals: { totalUsers: 0, activeToday: 0 } };

      const { users } = await import('../../drizzle/schema');
      const { sql, gte, count, countDistinct } = await import('drizzle-orm');

      const since = new Date();
      since.setDate(since.getDate() - days);

      // Daily active users based on lastSignedIn
      const dailyActive = await db.select({
        date: sql<string>`DATE("lastSignedIn")`.as('date'),
        userCount: countDistinct(users.id).as('user_count'),
      })
        .from(users)
        .where(gte(users.lastSignedIn, since))
        .groupBy(sql`DATE("lastSignedIn")`)
        .orderBy(sql`DATE("lastSignedIn")`);

      // Total users and active today
      const [totals] = await db.select({
        totalUsers: count(users.id).as('total_users'),
        activeToday: sql<number>`COUNT(*) FILTER (WHERE "lastSignedIn" >= CURRENT_DATE)`.as('active_today'),
      }).from(users);

      return {
        daily: dailyActive.map(d => ({
          date: d.date,
          userCount: Number(d.userCount),
        })),
        totals: {
          totalUsers: Number(totals?.totalUsers ?? 0),
          activeToday: Number(totals?.activeToday ?? 0),
        },
      };
    }),

  /**
   * API Health Panel - Provider usage, latency, and error rates
   */
  apiHealth: domainAdminProcedure
    .input(z.object({
      hours: z.number().min(1).max(72).default(24),
    }).optional())
    .query(async ({ input }) => {
      const hours = input?.hours ?? 24;
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) {
        return {
          summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, p95LatencyMs: 0 },
          byProvider: [],
          degraded: true,
          reason: 'database_unavailable',
        };
      }

      const { providerUsageLog } = await import('../../drizzle/schema');
      const { sql, gte, count } = await import('drizzle-orm');

      const since = new Date();
      since.setHours(since.getHours() - hours);

      try {
        // Aggregate provider usage metrics
        const metrics = await db.select({
          totalRequests: count(providerUsageLog.id).as('total_requests'),
          errorCount: sql<number>`COUNT(*) FILTER (WHERE "statusCode" >= 500)`.as('error_count'),
          avgLatencyMs: sql<number>`COALESCE(AVG("responseTimeMs"), 0)`.as('avg_latency_ms'),
          p95LatencyMs: sql<number>`COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "responseTimeMs"), 0)`.as('p95_latency_ms'),
        })
          .from(providerUsageLog)
          .where(gte(providerUsageLog.createdAt, since));

        const [summary] = metrics;

        // Per-provider breakdown
        const byProvider = await db.select({
          modelUsed: providerUsageLog.modelUsed,
          requestCount: count(providerUsageLog.id).as('request_count'),
          errorCount: sql<number>`COUNT(*) FILTER (WHERE "statusCode" >= 500)`.as('error_count'),
          avgLatencyMs: sql<number>`COALESCE(AVG("responseTimeMs"), 0)`.as('avg_latency_ms'),
          totalCostUsd: sql<number>`COALESCE(SUM("costUsd"::numeric), 0)`.as('total_cost_usd'),
        })
          .from(providerUsageLog)
          .where(gte(providerUsageLog.createdAt, since))
          .groupBy(providerUsageLog.modelUsed)
          .orderBy(sql`COUNT(${providerUsageLog.id}) DESC`)
          .limit(20);

        const totalReqs = Number(summary?.totalRequests ?? 0);
        const errorCnt = Number(summary?.errorCount ?? 0);

        return {
          summary: {
            totalRequests: totalReqs,
            errorRate: totalReqs > 0 ? Number(((errorCnt / totalReqs) * 100).toFixed(2)) : 0,
            avgLatencyMs: Math.round(Number(summary?.avgLatencyMs ?? 0)),
            p95LatencyMs: Math.round(Number(summary?.p95LatencyMs ?? 0)),
          },
          byProvider: byProvider.map(p => ({
            model: p.modelUsed,
            requests: Number(p.requestCount),
            errors: Number(p.errorCount),
            avgLatencyMs: Math.round(Number(p.avgLatencyMs)),
            totalCostUsd: Number(Number(p.totalCostUsd).toFixed(6)),
          })),
          degraded: false,
          reason: null as string | null,
        };
      } catch (error) {
        const unavailable = isProviderUsageLogUnavailableError(error);
        console.warn('[adminOps.apiHealth] falling back to empty metrics', {
          reason: unavailable ? 'provider_usage_log_unavailable' : 'query_failed',
          error: getErrorMessage(error),
        });
        return {
          summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, p95LatencyMs: 0 },
          byProvider: [],
          degraded: true,
          reason: unavailable ? 'provider_usage_log_unavailable' : 'query_failed',
        };
      }
    }),

  /**
   * Jobs Health Panel - Cloud Tasks event metrics
   */
  jobsHealth: domainAdminProcedure
    .query(async () => {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) {
        return {
          countsByStatus: {},
          recentFailures: [],
          degraded: true,
          reason: 'database_unavailable',
        };
      }

      const { cloudTaskEvents } = await import('../../drizzle/schema');
      const { sql, count, desc } = await import('drizzle-orm');

      try {
        // Counts by status
        const statusCounts = await db.select({
          status: cloudTaskEvents.status,
          count: count(cloudTaskEvents.id).as('count'),
        })
          .from(cloudTaskEvents)
          .groupBy(cloudTaskEvents.status);

        const countsByStatus: Record<string, number> = {};
        for (const row of statusCounts) {
          if (row.status) countsByStatus[row.status] = Number(row.count);
        }

        // Recent failures with error messages
        const recentFailures = await db.select({
          id: cloudTaskEvents.id,
          taskId: cloudTaskEvents.taskId,
          queueName: cloudTaskEvents.queueName,
          errorMessage: cloudTaskEvents.errorMessage,
          attemptCount: cloudTaskEvents.attemptCount,
          createdAt: cloudTaskEvents.createdAt,
        })
          .from(cloudTaskEvents)
          .where(sql`${cloudTaskEvents.status} IN ('failed', 'dead_letter')`)
          .orderBy(desc(cloudTaskEvents.createdAt))
          .limit(20);

        return {
          countsByStatus,
          recentFailures: recentFailures.map(f => ({
            id: f.id,
            taskId: f.taskId,
            queue: f.queueName,
            error: f.errorMessage,
            attempts: f.attemptCount,
            createdAt: f.createdAt?.toISOString(),
          })),
          degraded: false,
          reason: null as string | null,
        };
      } catch (error) {
        const missingTable = isCloudTaskEventsMissingError(error);
        console.warn('[adminOps.jobsHealth] falling back to empty metrics', {
          reason: missingTable ? 'cloud_task_events_table_missing' : 'query_failed',
          error: getErrorMessage(error),
        });
        return {
          countsByStatus: {},
          recentFailures: [],
          degraded: true,
          reason: missingTable ? 'cloud_task_events_table_missing' : 'query_failed',
        };
      }
    }),

  /**
   * Kie AI Health Panel - Media callback event metrics
   */
  kieAiHealth: domainAdminProcedure
    .input(z.object({
      hours: z.number().min(1).max(72).default(24),
    }).optional())
    .query(async ({ input }) => {
      const hours = input?.hours ?? 24;
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { summary: { total: 0, completed: 0, failed: 0, callbackRate: 0 }, dlqCount: 0 };

      const { mediaCallbackEvents, mediaCallbackDlq } = await import('../../drizzle/schema');
      const { sql, gte, count } = await import('drizzle-orm');

      const since = new Date();
      since.setHours(since.getHours() - hours);

      // Callback event summary
      const [eventSummary] = await db.select({
        total: count(mediaCallbackEvents.id).as('total'),
        completed: sql<number>`COUNT(*) FILTER (WHERE "status" = 'completed')`.as('completed'),
        failed: sql<number>`COUNT(*) FILTER (WHERE "status" = 'failed')`.as('failed'),
        processing: sql<number>`COUNT(*) FILTER (WHERE "status" = 'processing')`.as('processing'),
        pending: sql<number>`COUNT(*) FILTER (WHERE "status" = 'pending')`.as('pending'),
      })
        .from(mediaCallbackEvents)
        .where(gte(mediaCallbackEvents.createdAt, since));

      // DLQ count
      const [dlq] = await db.select({
        count: count(mediaCallbackDlq.id).as('count'),
      }).from(mediaCallbackDlq);

      const total = Number(eventSummary?.total ?? 0);
      const completed = Number(eventSummary?.completed ?? 0);

      return {
        summary: {
          total,
          completed,
          failed: Number(eventSummary?.failed ?? 0),
          processing: Number(eventSummary?.processing ?? 0),
          pending: Number(eventSummary?.pending ?? 0),
          callbackRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
        },
        dlqCount: Number(dlq?.count ?? 0),
      };
    }),

  /**
   * Storage Stats Panel - R2 storage usage with Redis caching
   */
  storageStats: domainAdminProcedure
    .query(async () => {
      // Check Redis cache first
      let redis: Awaited<ReturnType<typeof import('../services/redis').getRedisClient>> | null = null;
      try {
        const { getRedisClient } = await import('../services/redis');
        redis = getRedisClient();
      } catch {
        // Redis not available
      }

      const CACHE_KEY = 'admin:storage-stats';
      const CACHE_TTL = 300; // 5 minutes

      if (redis) {
        try {
          const cached = await redis.get(CACHE_KEY);
          if (cached) return JSON.parse(cached);
        } catch {
          // Cache miss or error
        }
      }

      // Query R2 storage stats
      const prefixes = ['temp/', 'renders/', 'gallery/'];
      const results: Record<string, { count: number; sizeBytes: number }> = {};

      try {
        const { S3Client, ListObjectsV2Command } = await import('@aws-sdk/client-s3');

        const s3 = new S3Client({
          region: 'auto',
          endpoint: process.env.R2_ENDPOINT || `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
          credentials: {
            accessKeyId: process.env.R2_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || '',
            secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || '',
          },
        });

        const bucket = process.env.R2_BUCKET || process.env.S3_BUCKET || 'smartspec-storage';

        for (const prefix of prefixes) {
          let totalCount = 0;
          let totalSize = 0;
          let continuationToken: string | undefined;

          // Paginate through objects (max 3 pages to avoid timeout)
          for (let page = 0; page < 3; page++) {
            const cmd = new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              MaxKeys: 1000,
              ContinuationToken: continuationToken,
            });

            const response = await s3.send(cmd);
            totalCount += response.KeyCount ?? 0;
            totalSize += (response.Contents ?? []).reduce((sum, obj) => sum + (obj.Size ?? 0), 0);

            if (!response.IsTruncated) break;
            continuationToken = response.NextContinuationToken;
          }

          results[prefix.replace('/', '')] = { count: totalCount, sizeBytes: totalSize };
        }
      } catch {
        // R2 not available - return empty stats
        for (const prefix of prefixes) {
          results[prefix.replace('/', '')] = { count: 0, sizeBytes: 0 };
        }
      }

      const stats = {
        prefixes: Object.entries(results).map(([name, data]) => ({
          name,
          objectCount: data.count,
          sizeGb: Number((data.sizeBytes / (1024 * 1024 * 1024)).toFixed(3)),
          sizeBytes: data.sizeBytes,
        })),
        totalObjects: Object.values(results).reduce((sum, d) => sum + d.count, 0),
        totalSizeGb: Number((Object.values(results).reduce((sum, d) => sum + d.sizeBytes, 0) / (1024 * 1024 * 1024)).toFixed(3)),
        cachedAt: new Date().toISOString(),
      };

      // Cache the result
      if (redis) {
        try {
          await redis.set(CACHE_KEY, JSON.stringify(stats), 'EX', CACHE_TTL);
        } catch {
          // Caching failed — no problem
        }
      }

      return stats;
    }),

  /**
   * Security Stats Panel - Rate limiting and request patterns
   */
  securityStats: domainAdminProcedure
    .query(async () => {
      let redis: Awaited<ReturnType<typeof import('../services/redis').getRedisClient>> | null = null;
      try {
        const { getRedisClient } = await import('../services/redis');
        redis = getRedisClient();
      } catch {
        // Redis not available
      }

      const rateLimitHits: { endpoint: string; count: number }[] = [];

      if (redis) {
        try {
          // Scan for rate limit keys
          let cursor = '0';
          const keys: string[] = [];
          do {
            const [nextCursor, foundKeys] = await redis.scan(cursor, 'MATCH', 'ratelimit:*', 'COUNT', 100);
            cursor = nextCursor;
            keys.push(...foundKeys);
          } while (cursor !== '0' && keys.length < 500);

          // Group by endpoint prefix
          const endpointCounts: Record<string, number> = {};
          for (const key of keys) {
            // key format: ratelimit:{namespace}:{identifier}
            const parts = key.split(':');
            const endpoint = parts[1] || 'unknown';
            endpointCounts[endpoint] = (endpointCounts[endpoint] || 0) + 1;
          }

          for (const [endpoint, count] of Object.entries(endpointCounts)) {
            rateLimitHits.push({ endpoint, count });
          }
          rateLimitHits.sort((a, b) => b.count - a.count);
        } catch {
          // Redis scan failed
        }
      }

      // Get recent auth failures from provider usage log
      const { getDb } = await import('../db');
      const db = await getDb();
      let recentErrors: { errorType: string; count: number }[] = [];
      let degraded = false;
      let reason: string | null = null;

      if (db) {
        try {
          const { providerUsageLog } = await import('../../drizzle/schema');
          const { sql, count, gte, isNotNull, and } = await import('drizzle-orm');

          const since = new Date();
          since.setHours(since.getHours() - 24);

          const errors = await db.select({
            errorType: providerUsageLog.errorType,
            count: count(providerUsageLog.id).as('count'),
          })
            .from(providerUsageLog)
            .where(and(gte(providerUsageLog.createdAt, since), isNotNull(providerUsageLog.errorType)))
            .groupBy(providerUsageLog.errorType)
            .orderBy(sql`COUNT(${providerUsageLog.id}) DESC`)
            .limit(10);

          recentErrors = errors.map(e => ({
            errorType: e.errorType || 'unknown',
            count: Number(e.count),
          }));
        } catch (error) {
          const unavailable = isProviderUsageLogUnavailableError(error);
          degraded = true;
          reason = unavailable ? 'provider_usage_log_unavailable' : 'query_failed';
          console.warn('[adminOps.securityStats] falling back to empty provider error metrics', {
            reason,
            error: getErrorMessage(error),
          });
        }
      } else {
        degraded = true;
        reason = 'database_unavailable';
      }

      return {
        rateLimitKeys: rateLimitHits.slice(0, 20),
        recentErrors,
        totalRateLimitKeys: rateLimitHits.reduce((sum, r) => sum + r.count, 0),
        degraded,
        reason,
      };
    }),

  /**
   * Daily LLM Usage - Per-model request/cost breakdown from provider_usage_log
   */
  dailyLlmUsage: domainAdminProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
    }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 7;
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { topModels: [], daily: [], totals: { requests: 0, cost: 0, inputTokens: 0, outputTokens: 0 } };

      const { providerUsageLog } = await import('../../drizzle/schema');
      const { sql, gte } = await import('drizzle-orm');

      const since = new Date();
      since.setDate(since.getDate() - days);

      try {
        // Step 1: Find top 5 models by request count
        const topModelsResult = await db.select({
          model: providerUsageLog.modelUsed,
          cnt: sql<number>`count(*)::int`.as('cnt'),
        })
          .from(providerUsageLog)
          .where(gte(providerUsageLog.createdAt, since))
          .groupBy(providerUsageLog.modelUsed)
          .orderBy(sql`count(*) DESC`)
          .limit(5);

        const topModels = topModelsResult.map(r => r.model);

        // Step 2: Daily breakdown with top 5 models + "Other" bucket
        // Build the IN list as raw SQL to avoid parameterized GROUP BY (PostgreSQL rejects params in GROUP BY)
        const escapedModels = topModels.map(m => `'${m.replace(/'/g, "''")}'`).join(', ');
        const modelCaseExpr = topModels.length > 0
          ? sql<string>`CASE WHEN "modelUsed" IN (${sql.raw(escapedModels)}) THEN "modelUsed" ELSE 'Other' END`
          : sql<string>`'Other'`;

        const dailyRows = await db.select({
          date: sql<string>`date_trunc('day', "createdAt")::date::text`.as('date'),
          model: modelCaseExpr.as('model'),
          requests: sql<number>`count(*)::int`.as('requests'),
          cost: sql<number>`coalesce(sum("costUsd"::numeric), 0)::float`.as('cost'),
          inputTokens: sql<number>`coalesce(sum("inputTokens"), 0)::int`.as('input_tokens'),
          outputTokens: sql<number>`coalesce(sum("outputTokens"), 0)::int`.as('output_tokens'),
        })
          .from(providerUsageLog)
          .where(gte(providerUsageLog.createdAt, since))
          .groupBy(sql.raw(`1, 2`))
          .orderBy(sql.raw(`1`));

        const totals = dailyRows.reduce((acc, r) => ({
          requests: acc.requests + r.requests,
          cost: acc.cost + r.cost,
          inputTokens: acc.inputTokens + r.inputTokens,
          outputTokens: acc.outputTokens + r.outputTokens,
        }), { requests: 0, cost: 0, inputTokens: 0, outputTokens: 0 });

        return {
          topModels,
          daily: dailyRows.map(r => ({
            date: r.date,
            model: r.model,
            requests: r.requests,
            cost: Number(r.cost.toFixed(6)),
            inputTokens: r.inputTokens,
            outputTokens: r.outputTokens,
          })),
          totals: {
            requests: totals.requests,
            cost: Number(totals.cost.toFixed(6)),
            inputTokens: totals.inputTokens,
            outputTokens: totals.outputTokens,
          },
        };
      } catch (error) {
        const unavailable = isProviderUsageLogUnavailableError(error);
        console.warn('[adminOps.dailyLlmUsage] falling back to empty', {
          reason: unavailable ? 'provider_usage_log_unavailable' : 'query_failed',
          error: getErrorMessage(error),
        });
        return { topModels: [], daily: [], totals: { requests: 0, cost: 0, inputTokens: 0, outputTokens: 0 } };
      }
    }),

  /**
   * Daily Media Usage - Per-mediaType request/cost breakdown from api_audit_events
   */
  dailyMediaUsage: domainAdminProcedure
    .input(z.object({
      days: z.number().min(1).max(30).default(7),
    }).optional())
    .query(async ({ input }) => {
      const days = input?.days ?? 7;
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { daily: [], totals: { requests: 0, cost: 0, credits: 0, byType: {} } };

      const { apiAuditEvents } = await import('../../drizzle/schema');
      const { sql, gte, and, eq, isNotNull } = await import('drizzle-orm');

      const since = new Date();
      since.setDate(since.getDate() - days);

      try {
        const dailyRows = await db.select({
          date: sql<string>`date_trunc('day', ${apiAuditEvents.createdAt})::date::text`.as('date'),
          mediaType: apiAuditEvents.mediaType,
          requests: sql<number>`count(*)::int`.as('requests'),
          cost: sql<number>`coalesce(sum(${apiAuditEvents.costUsd}::numeric), 0)::float`.as('cost'),
          credits: sql<number>`coalesce(sum(${apiAuditEvents.creditsCharged}), 0)::int`.as('credits'),
        })
          .from(apiAuditEvents)
          .where(and(
            eq(apiAuditEvents.eventType, 'media_response'),
            isNotNull(apiAuditEvents.mediaType),
            gte(apiAuditEvents.createdAt, since),
          ))
          .groupBy(sql`date_trunc('day', ${apiAuditEvents.createdAt})`, apiAuditEvents.mediaType)
          .orderBy(sql`date_trunc('day', ${apiAuditEvents.createdAt})`);

        const byType: Record<string, number> = {};
        let totalRequests = 0;
        let totalCost = 0;
        let totalCredits = 0;

        for (const r of dailyRows) {
          const mt = r.mediaType || 'unknown';
          byType[mt] = (byType[mt] || 0) + r.requests;
          totalRequests += r.requests;
          totalCost += r.cost;
          totalCredits += r.credits;
        }

        return {
          daily: dailyRows.map(r => ({
            date: r.date,
            mediaType: r.mediaType || 'unknown',
            requests: r.requests,
            cost: Number(r.cost.toFixed(6)),
            credits: r.credits,
          })),
          totals: {
            requests: totalRequests,
            cost: Number(totalCost.toFixed(6)),
            credits: totalCredits,
            byType,
          },
        };
      } catch (error) {
        console.warn('[adminOps.dailyMediaUsage] falling back to empty', {
          error: getErrorMessage(error),
        });
        return { daily: [], totals: { requests: 0, cost: 0, credits: 0, byType: {} } };
      }
    }),

  // ──────────────────────────────────────────────────────────────
  //  Centralized Pending Approval Counts & List
  // ──────────────────────────────────────────────────────────────

  pendingApprovalCounts: domainAdminProcedure.query(async () => {
    try {
      const { db: getDb } = await import('../db');
      const { skills, agencies, workflowTemplates } = await import('@db/schema');
      const { eq, count } = await import('drizzle-orm');

      const [skillRow] = await getDb
        .select({ cnt: count() })
        .from(skills)
        .where(eq(skills.visibility, 'pending_approval'));

      const [agencyRow] = await getDb
        .select({ cnt: count() })
        .from(agencies)
        .where(eq(agencies.visibility, 'pending_approval'));

      const [templateRow] = await getDb
        .select({ cnt: count() })
        .from(workflowTemplates)
        .where(eq(workflowTemplates.status, 'pending_review'));

      const s = Number(skillRow?.cnt ?? 0);
      const a = Number(agencyRow?.cnt ?? 0);
      const t = Number(templateRow?.cnt ?? 0);
      return { skills: s, agencies: a, templates: t, total: s + a + t };
    } catch {
      return { skills: 0, agencies: 0, templates: 0, total: 0 };
    }
  }),

  pendingApprovalList: domainAdminProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      type: z.enum(['skill', 'agency', 'template']).optional(),
    }))
    .query(async ({ input }) => {
      try {
        const { db: getDb } = await import('../db');
        const { skills, agencies, workflowTemplates, users } = await import('@db/schema');
        const { eq, asc, sql } = await import('drizzle-orm');

        type PendingItem = {
          type: 'skill' | 'agency' | 'template';
          id: string;
          name: string;
          description: string | null;
          ownerName: string | null;
          requestedAt: Date | null;
        };

        const items: PendingItem[] = [];

        // Single-type queries: use DB-level sorting + pagination
        if (input.type === 'skill') {
          const rows = await getDb
            .select({ id: skills.id, name: skills.name, description: skills.description, ownerName: users.name, requestedAt: skills.requestedPublishAt })
            .from(skills).leftJoin(users, eq(skills.createdBy, users.id))
            .where(eq(skills.visibility, 'pending_approval'))
            .orderBy(asc(skills.requestedPublishAt))
            .limit(input.limit).offset(input.offset);
          const [cnt] = await getDb.select({ c: sql<number>`count(*)` }).from(skills).where(eq(skills.visibility, 'pending_approval'));
          return { items: rows.map((r: typeof rows[number]) => ({ type: 'skill' as const, id: String(r.id), name: r.name || '', description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt })), total: Number(cnt?.c ?? 0) };
        }

        if (input.type === 'agency') {
          const rows = await getDb
            .select({ id: agencies.id, name: agencies.name, description: agencies.description, ownerName: users.name, requestedAt: agencies.requestedPublishAt })
            .from(agencies).leftJoin(users, eq(agencies.createdBy, users.id))
            .where(eq(agencies.visibility, 'pending_approval'))
            .orderBy(asc(agencies.requestedPublishAt))
            .limit(input.limit).offset(input.offset);
          const [cnt] = await getDb.select({ c: sql<number>`count(*)` }).from(agencies).where(eq(agencies.visibility, 'pending_approval'));
          return { items: rows.map((r: typeof rows[number]) => ({ type: 'agency' as const, id: r.id, name: r.name, description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt })), total: Number(cnt?.c ?? 0) };
        }

        if (input.type === 'template') {
          const rows = await getDb
            .select({ id: workflowTemplates.id, name: workflowTemplates.name, description: workflowTemplates.description, ownerName: users.name, requestedAt: workflowTemplates.requestedPublishAt })
            .from(workflowTemplates).leftJoin(users, eq(workflowTemplates.authorId, users.id))
            .where(eq(workflowTemplates.status, 'pending_review'))
            .orderBy(asc(workflowTemplates.requestedPublishAt))
            .limit(input.limit).offset(input.offset);
          const [cnt] = await getDb.select({ c: sql<number>`count(*)` }).from(workflowTemplates).where(eq(workflowTemplates.status, 'pending_review'));
          return { items: rows.map((r: typeof rows[number]) => ({ type: 'template' as const, id: String(r.id), name: r.name, description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt })), total: Number(cnt?.c ?? 0) };
        }

        // "All" tab: fetch from all 3 tables with DB-level sorting, merge + sort in memory
        const [skillRows, agencyRows, templateRows] = await Promise.all([
          getDb.select({ id: skills.id, name: skills.name, description: skills.description, ownerName: users.name, requestedAt: skills.requestedPublishAt })
            .from(skills).leftJoin(users, eq(skills.createdBy, users.id))
            .where(eq(skills.visibility, 'pending_approval'))
            .orderBy(asc(skills.requestedPublishAt)),
          getDb.select({ id: agencies.id, name: agencies.name, description: agencies.description, ownerName: users.name, requestedAt: agencies.requestedPublishAt })
            .from(agencies).leftJoin(users, eq(agencies.createdBy, users.id))
            .where(eq(agencies.visibility, 'pending_approval'))
            .orderBy(asc(agencies.requestedPublishAt)),
          getDb.select({ id: workflowTemplates.id, name: workflowTemplates.name, description: workflowTemplates.description, ownerName: users.name, requestedAt: workflowTemplates.requestedPublishAt })
            .from(workflowTemplates).leftJoin(users, eq(workflowTemplates.authorId, users.id))
            .where(eq(workflowTemplates.status, 'pending_review'))
            .orderBy(asc(workflowTemplates.requestedPublishAt)),
        ]);

        for (const r of skillRows) items.push({ type: 'skill', id: String(r.id), name: r.name || '', description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt });
        for (const r of agencyRows) items.push({ type: 'agency', id: r.id, name: r.name, description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt });
        for (const r of templateRows) items.push({ type: 'template', id: String(r.id), name: r.name, description: r.description, ownerName: r.ownerName, requestedAt: r.requestedAt });

        items.sort((a, b) => (a.requestedAt?.getTime() ?? 0) - (b.requestedAt?.getTime() ?? 0));

        const total = items.length;
        const paged = items.slice(input.offset, input.offset + input.limit);
        return { items: paged, total };
      } catch {
        return { items: [], total: 0 };
      }
    }),
});
