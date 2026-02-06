/**
 * Queue Management tRPC Router
 *
 * Provides admin endpoints for:
 * - Queue status monitoring
 * - Rate limiter status
 * - Failed job management
 * - Queue pause/resume
 * - Statistics and history
 */

import { z } from 'zod';
import { router, adminProcedure } from '../_core/trpc';
import { getRedisStatus, isRedisAvailable } from '../services/redis';
import {
  getAllLimiterCounts,
  getLimiterStats,
  getAllLimiterStats,
  resetLimiter,
  clearWaitingJobs,
  PROVIDER_LIMITS,
  MEDIA_PROVIDER_LIMITS,
  getAllModelUsageStats,
  getTopModels,
  getProviderModelStats,
  // Media provider stats
  getAllMediaUsageStats,
  getMediaProviderStats,
  getMediaStatsByType,
  getTopMediaModels,
  getAllMediaLimiterStats,
} from '../services/llmRateLimiter';
import {
  QUEUE_NAMES,
  getQueueCounts,
  getAllQueueStats,
  getFailedJobs,
  retryFailedJobs,
  clearStaleJobs,
  pauseQueue,
  resumeQueue,
  isQueuePaused,
  getQueueHistory,
  getAggregatedHistory,
} from '../services/llmQueue';

export const queuesRouter = router({
  /**
   * Get overall system status
   */
  getSystemStatus: adminProcedure.query(async () => {
    const redis = getRedisStatus();
    const limiterStats = getAllLimiterStats();
    const queueStats = getAllQueueStats();

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
   * Get all queue statuses
   */
  getQueueStatus: adminProcedure.query(async () => {
    if (!isRedisAvailable()) {
      return {
        available: false,
        queues: [],
      };
    }

    const queueNames = Object.values(QUEUE_NAMES);
    const queues = await Promise.all(
      queueNames.map(async (name) => {
        const counts = await getQueueCounts(name);
        const stats = getAllQueueStats().find(s => s.name === name);
        const paused = await isQueuePaused(name);

        return {
          name,
          counts: counts || { waiting: 0, active: 0, delayed: 0, failed: 0, completed: 0 },
          stats: stats || null,
          paused,
        };
      })
    );

    return {
      available: true,
      queues,
    };
  }),

  /**
   * Get failed jobs from a queue
   */
  getFailedJobs: adminProcedure
    .input(z.object({
      queue: z.string(),
      start: z.number().default(0),
      end: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const jobs = await getFailedJobs(input.queue, input.start, input.end);
      if (!jobs) {
        return { jobs: [] };
      }

      return {
        jobs: jobs.map(job => ({
          id: job.id,
          name: job.name,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn,
          finishedOn: job.finishedOn,
        })),
      };
    }),

  /**
   * Retry failed jobs
   */
  retryJobs: adminProcedure
    .input(z.object({
      queue: z.string(),
      jobIds: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const retried = await retryFailedJobs(input.queue, input.jobIds);
      return { retried };
    }),

  /**
   * Clear stale/stuck jobs
   */
  clearStaleJobs: adminProcedure
    .input(z.object({
      queue: z.string(),
      olderThanMs: z.number().default(300000), // 5 minutes default
    }))
    .mutation(async ({ input }) => {
      const cleared = await clearStaleJobs(input.queue, input.olderThanMs);
      return { cleared };
    }),

  /**
   * Pause a queue
   */
  pauseQueue: adminProcedure
    .input(z.object({
      queue: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = await pauseQueue(input.queue);
      return { success };
    }),

  /**
   * Resume a queue
   */
  resumeQueue: adminProcedure
    .input(z.object({
      queue: z.string(),
    }))
    .mutation(async ({ input }) => {
      const success = await resumeQueue(input.queue);
      return { success };
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
    return {
      configs: Object.entries(PROVIDER_LIMITS).map(([provider, config]) => ({
        provider,
        ...config,
      })),
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
});
