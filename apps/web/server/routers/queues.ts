/**
 * Queue Management tRPC Router
 *
 * Provides admin endpoints for:
 * - Cloud Tasks queue metrics
 * - Rate limiter status (Bottleneck — unchanged)
 * - Failed task management via cloud_task_events
 * - Statistics and history
 */

import { z } from 'zod';
import { router, adminProcedure } from '../_core/trpc';
import { getRedisStatus, isRedisAvailable } from '../services/redis';
import { getAppRuntimeConfig, getPreferredInternalToken } from '../services/appRuntimeConfig';
import {
  getAllLimiterCounts,
  getLimiterStats,
  getAllLimiterStats,
  resetLimiter,
  clearWaitingJobs,
  DOCUMENT_OCR_PROVIDER_LIMITS,
  PROVIDER_LIMITS,
  MEDIA_PROVIDER_LIMITS,
  type ProviderLimitConfigView,
  getAllModelUsageStats,
  getTopModels,
  getProviderModelStats,
  getDocumentOcrLimiterStatus as getDocumentOcrLimiterStatusRows,
  // Media provider stats
  getAllMediaUsageStats,
  getMediaProviderStats,
  getMediaStatsByType,
  getTopMediaModels,
  getAllMediaLimiterStats,
} from '../services/llmRateLimiter';
import {
  QUEUE_NAMES,
  getAllQueueStats,
  getQueueHistory,
  getAggregatedHistory,
} from '../services/llmQueue';
import {
  getAllQueueMetrics,
  getDeadLetterCount,
  getFailedTaskEvents,
} from '../services/cloudTasksMetrics';
import { getQueueHealthStatus } from '../services/queueHealthMonitor';

export const queuesRouter = router({
  /**
   * Get overall system status
   */
  getSystemStatus: adminProcedure.query(async () => {
    const redis = getRedisStatus();
    const limiterStats = getAllLimiterStats();
    const queueStats = getAllQueueStats();

    // Get Cloud Tasks queue metrics
    let cloudTasksMetrics: Awaited<ReturnType<typeof getAllQueueMetrics>> = [];
    try {
      cloudTasksMetrics = await getAllQueueMetrics();
    } catch {
      // Cloud Tasks not available
    }

    return {
      redis,
      limiters: {
        count: limiterStats.length,
        totalRunning: limiterStats.reduce((sum, s) => sum + s.running, 0),
        totalQueued: limiterStats.reduce((sum, s) => sum + s.queued, 0),
        totalDone: limiterStats.reduce((sum, s) => sum + s.done, 0),
        totalFailed: limiterStats.reduce((sum, s) => sum + s.failed, 0),
      },
      queues: {
        count: queueStats.length,
        totalCompleted: queueStats.reduce((sum, s) => sum + s.completed, 0),
        totalFailed: queueStats.reduce((sum, s) => sum + s.failed, 0),
      },
      cloudTasks: {
        queues: cloudTasksMetrics.length,
        totalTasks: cloudTasksMetrics.reduce((sum, m) => sum + m.taskCount, 0),
      },
      timestamp: new Date().toISOString(),
    };
  }),

  /**
   * Get all rate limiter statuses
   */
  getLimiterStatus: adminProcedure.query(async () => {
    if (!isRedisAvailable()) {
      // Return in-memory stats only
      const stats = getAllLimiterStats();
      return {
        available: false,
        limiters: stats.map(s => ({
          provider: s.provider,
          config: PROVIDER_LIMITS[s.provider] || PROVIDER_LIMITS['default'],
          counts: {
            running: s.running,
            queued: s.queued,
            reservoir: null,
          },
          stats: s,
        })),
      };
    }

    const limiters = await getAllLimiterCounts();
    return {
      available: true,
      limiters,
    };
  }),

  /**
   * Get Cloud Tasks queue statuses (replaces BullMQ queue status)
   */
  getQueueStatus: adminProcedure.query(async () => {
    try {
      const metrics = await getAllQueueMetrics();
      const deadLetterCount = await getDeadLetterCount();
      const inMemoryStats = getAllQueueStats();

      return {
        available: true,
        queues: metrics.map(m => ({
          name: m.queueName,
          counts: {
            waiting: m.taskCount,
            active: 0,
            delayed: 0,
            failed: 0,
            completed: 0,
          },
          cloudTasks: m,
          stats: inMemoryStats.find(s => s.name === m.queueName) || null,
          paused: false,
        })),
        deadLetterCount,
      };
    } catch {
      // Fallback to in-memory stats if Cloud Tasks API is unavailable
      const queueNames = Object.values(QUEUE_NAMES);
      return {
        available: false,
        queues: queueNames.map(name => ({
          name,
          counts: { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
          cloudTasks: null,
          stats: getAllQueueStats().find(s => s.name === name) || null,
          paused: false,
        })),
        deadLetterCount: 0,
      };
    }
  }),

  /**
   * Get failed tasks from cloud_task_events table
   */
  getFailedJobs: adminProcedure
    .input(z.object({
      queue: z.string(),
      start: z.number().default(0),
      end: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const events = await getFailedTaskEvents(input.end);
      return {
        jobs: events
          .filter(e => !input.queue || e.queueName === input.queue)
          .map(e => ({
            id: e.taskId,
            name: e.queueName,
            data: e.payload,
            failedReason: e.errorMessage,
            attemptsMade: e.attemptCount,
            timestamp: e.createdAt,
            processedOn: e.createdAt,
            finishedOn: e.completedAt,
          })),
      };
    }),

  /**
   * Reset a rate limiter
   */
  resetLimiter: adminProcedure
    .input(z.object({
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      await resetLimiter(input.provider);
      return { success: true };
    }),

  /**
   * Clear waiting jobs in rate limiter
   */
  clearWaitingJobs: adminProcedure
    .input(z.object({
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      const cleared = await clearWaitingJobs(input.provider);
      return { cleared };
    }),

  /**
   * Get provider rate limit configurations
   */
  getProviderConfigs: adminProcedure.query(() => {
    const configs: ProviderLimitConfigView[] = [
      ...Object.entries(PROVIDER_LIMITS).map(([provider, config]) => ({
        provider,
        ...config,
      })),
      ...Object.entries(DOCUMENT_OCR_PROVIDER_LIMITS).map(([provider, config]) => ({
        provider,
        ...config,
      })),
    ];
    return {
      configs,
    };
  }),

  /**
   * Get document OCR limiter status
   */
  getDocumentOcrLimiterStatus: adminProcedure.query(async () => {
    const limiters = await getDocumentOcrLimiterStatusRows();
    return {
      limiters,
    };
  }),

  /**
   * Get queue names
   */
  getQueueNames: adminProcedure.query(() => {
    return {
      queues: Object.entries(QUEUE_NAMES).map(([key, name]) => ({
        key,
        name,
      })),
    };
  }),

  /**
   * Get raw queue history
   */
  getHistory: adminProcedure
    .input(z.object({
      minutes: z.number().min(1).max(1440).default(60),
    }).optional())
    .query(({ input }) => {
      const minutes = input?.minutes ?? 60;
      const history = getQueueHistory(minutes);
      return {
        entries: history.map(h => ({
          timestamp: h.timestamp.toISOString(),
          queues: h.queues,
          limiters: h.limiters,
          totals: h.totals,
        })),
        count: history.length,
        periodMinutes: minutes,
      };
    }),

  /**
   * Get aggregated history for charts
   */
  getAggregatedHistory: adminProcedure
    .input(z.object({
      minutes: z.number().min(5).max(1440).default(60),
      bucketSize: z.number().min(1).max(60).default(5),
    }).optional())
    .query(({ input }) => {
      const minutes = input?.minutes ?? 60;
      const bucketSize = input?.bucketSize ?? 5;
      const result = getAggregatedHistory(minutes, bucketSize);
      return {
        buckets: result.buckets.map(b => ({
          timestamp: b.timestamp.toISOString(),
          completed: b.completed,
          failed: b.failed,
          avgWaiting: b.avgWaiting,
          avgActive: b.avgActive,
          limiterRequests: Math.round(b.limiterRequests),
        })),
        summary: result.summary,
        periodMinutes: minutes,
        bucketSizeMinutes: bucketSize,
      };
    }),

  /**
   * Get all model usage statistics
   */
  getModelStats: adminProcedure.query(() => {
    const stats = getAllModelUsageStats();
    return {
      models: stats.map(s => ({
        model: s.model,
        provider: s.provider,
        requests: s.requests,
        completed: s.completed,
        failed: s.failed,
        totalInputTokens: s.totalInputTokens,
        totalOutputTokens: s.totalOutputTokens,
        successRate: s.requests > 0 ? Math.round((s.completed / s.requests) * 100) : 0,
        lastUsed: s.lastUsed > 0 ? new Date(s.lastUsed).toISOString() : null,
      })),
      totalModels: stats.length,
    };
  }),

  /**
   * Get top models by usage
   */
  getTopModels: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
    }).optional())
    .query(({ input }) => {
      const limit = input?.limit ?? 10;
      const top = getTopModels(limit);
      return {
        models: top.map(s => ({
          model: s.model,
          provider: s.provider,
          requests: s.requests,
          completed: s.completed,
          failed: s.failed,
          totalTokens: s.totalInputTokens + s.totalOutputTokens,
        })),
      };
    }),

  /**
   * Get model stats for a specific provider
   */
  getProviderModels: adminProcedure
    .input(z.object({
      provider: z.string(),
    }))
    .query(({ input }) => {
      const stats = getProviderModelStats(input.provider);
      return {
        provider: input.provider,
        models: stats.map(s => ({
          model: s.model,
          requests: s.requests,
          completed: s.completed,
          failed: s.failed,
          totalInputTokens: s.totalInputTokens,
          totalOutputTokens: s.totalOutputTokens,
        })),
      };
    }),

  // ─── Media Provider Stats ────────────────────────────────────────────────────

  /**
   * Get media provider rate limit configurations
   */
  getMediaProviderConfigs: adminProcedure.query(() => {
    return {
      configs: Object.entries(MEDIA_PROVIDER_LIMITS).map(([provider, config]) => ({
        provider,
        ...config,
      })),
    };
  }),

  /**
   * Get media provider limiter stats
   */
  getMediaLimiterStatus: adminProcedure.query(() => {
    const stats = getAllMediaLimiterStats();
    return {
      limiters: stats.map(s => ({
        provider: s.provider.replace('media:', ''), // Remove prefix for display
        running: s.running,
        queued: s.queued,
        done: s.done,
        failed: s.failed,
        avgWaitTime: s.avgWaitTime,
        lastRequestTime: s.lastRequestTime > 0 ? new Date(s.lastRequestTime).toISOString() : null,
      })),
    };
  }),

  /**
   * Get all media usage statistics
   */
  getMediaStats: adminProcedure.query(() => {
    const stats = getAllMediaUsageStats();
    return {
      models: stats.map(s => ({
        model: s.model,
        provider: s.provider,
        mediaType: s.mediaType,
        requests: s.requests,
        completed: s.completed,
        failed: s.failed,
        totalCreditsUsed: s.totalCreditsUsed,
        successRate: s.requests > 0 ? Math.round((s.completed / s.requests) * 100) : 0,
        lastUsed: s.lastUsed > 0 ? new Date(s.lastUsed).toISOString() : null,
      })),
      totalModels: stats.length,
    };
  }),

  /**
   * Get top media models by usage
   */
  getTopMediaModels: adminProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(10),
    }).optional())
    .query(({ input }) => {
      const limit = input?.limit ?? 10;
      const top = getTopMediaModels(limit);
      return {
        models: top.map(s => ({
          model: s.model,
          provider: s.provider,
          mediaType: s.mediaType,
          requests: s.requests,
          completed: s.completed,
          failed: s.failed,
          totalCreditsUsed: s.totalCreditsUsed,
        })),
      };
    }),

  /**
   * Get media stats for a specific provider
   */
  getMediaProviderModels: adminProcedure
    .input(z.object({
      provider: z.string(),
    }))
    .query(({ input }) => {
      const stats = getMediaProviderStats(input.provider);
      return {
        provider: input.provider,
        models: stats.map(s => ({
          model: s.model,
          mediaType: s.mediaType,
          requests: s.requests,
          completed: s.completed,
          failed: s.failed,
          totalCreditsUsed: s.totalCreditsUsed,
        })),
      };
    }),

  /**
   * Get media stats by media type (image/video/audio)
   */
  getMediaStatsByType: adminProcedure
    .input(z.object({
      mediaType: z.enum(['image', 'video', 'audio']),
    }))
    .query(({ input }) => {
      const stats = getMediaStatsByType(input.mediaType);
      return {
        mediaType: input.mediaType,
        models: stats.map(s => ({
          model: s.model,
          provider: s.provider,
          requests: s.requests,
          completed: s.completed,
          failed: s.failed,
          totalCreditsUsed: s.totalCreditsUsed,
        })),
        totals: {
          totalRequests: stats.reduce((sum, s) => sum + s.requests, 0),
          totalCompleted: stats.reduce((sum, s) => sum + s.completed, 0),
          totalFailed: stats.reduce((sum, s) => sum + s.failed, 0),
          totalCredits: stats.reduce((sum, s) => sum + s.totalCreditsUsed, 0),
        },
      };
    }),

  /**
   * Get Celery/Redis queue health status with anomaly alerts.
   * Includes queue lengths, active alerts, and 30-check history.
   */
  getQueueHealth: adminProcedure.query(async () => {
    return getQueueHealthStatus();
  }),

  // ── Scheduled Job Monitoring ────────────────────────────────────

  getScheduledJobs: adminProcedure.query(async () => {
    const runtime = await getAppRuntimeConfig();
    const token = await getPreferredInternalToken();
    const baseUrl = runtime.pythonBackendUrl;
    const resp = await fetch(`${baseUrl}/api/v1/scheduled-jobs/schedule`, {
      headers: { "X-Internal-Token": token },
    });
    if (!resp.ok) return { tasks: [], total: 0 };
    return resp.json();
  }),

  getScheduledJobRuns: adminProcedure
    .input(z.object({
      taskName: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const runtime = await getAppRuntimeConfig();
      const token = await getPreferredInternalToken();
      const baseUrl = runtime.pythonBackendUrl;
      const params = new URLSearchParams();
      if (input.taskName) params.set("task_name", input.taskName);
      if (input.status) params.set("status", input.status);
      params.set("limit", String(input.limit));
      params.set("offset", String(input.offset));
      const resp = await fetch(`${baseUrl}/api/v1/scheduled-jobs/runs?${params}`, {
        headers: { "X-Internal-Token": token },
      });
      if (!resp.ok) return { runs: [], total: 0 };
      return resp.json();
    }),

  getScheduledJobStats: adminProcedure.query(async () => {
    const runtime = await getAppRuntimeConfig();
    const token = await getPreferredInternalToken();
    const baseUrl = runtime.pythonBackendUrl;
    const resp = await fetch(`${baseUrl}/api/v1/scheduled-jobs/stats`, {
      headers: { "X-Internal-Token": token },
    });
    if (!resp.ok) return { stats: [] };
    return resp.json();
  }),
});
