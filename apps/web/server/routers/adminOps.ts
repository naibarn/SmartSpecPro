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

export const adminOpsRouter = router({
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
      if (!db) return { summary: { totalRequests: 0, errorRate: 0, avgLatencyMs: 0, p95LatencyMs: 0 }, byProvider: [] };

      const { providerUsageLog } = await import('../../drizzle/schema');
      const { sql, gte, count } = await import('drizzle-orm');

      const since = new Date();
      since.setHours(since.getHours() - hours);

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
      };
    }),

  /**
   * Jobs Health Panel - Cloud Tasks event metrics
   */
  jobsHealth: domainAdminProcedure
    .query(async () => {
      const { getDb } = await import('../db');
      const db = await getDb();
      if (!db) return { countsByStatus: {}, recentFailures: [] };

      const { cloudTaskEvents } = await import('../../drizzle/schema');
      const { sql, count, desc } = await import('drizzle-orm');

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
      };
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

      if (db) {
        const { providerUsageLog } = await import('../../drizzle/schema');
        const { sql, gte, count, isNotNull } = await import('drizzle-orm');

        const since = new Date();
        since.setHours(since.getHours() - 24);

        const errors = await db.select({
          errorType: providerUsageLog.errorType,
          count: count(providerUsageLog.id).as('count'),
        })
          .from(providerUsageLog)
          .where(sql`${providerUsageLog.createdAt} >= ${since} AND ${providerUsageLog.errorType} IS NOT NULL`)
          .groupBy(providerUsageLog.errorType)
          .orderBy(sql`COUNT(${providerUsageLog.id}) DESC`)
          .limit(10);

        recentErrors = errors.map(e => ({
          errorType: e.errorType || 'unknown',
          count: Number(e.count),
        }));
      }

      return {
        rateLimitKeys: rateLimitHits.slice(0, 20),
        recentErrors,
        totalRateLimitKeys: rateLimitHits.reduce((sum, r) => sum + r.count, 0),
      };
    }),
});
