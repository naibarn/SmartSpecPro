/**
 * LLM Queue Service
 *
 * BullMQ-based background job processing for:
 * - Credit deduction after LLM calls
 * - Usage logging to database
 * - Multi-step skill processing (future)
 * - Media generation (future)
 */

import { Queue, Worker, Job, QueueEvents } from 'bullmq';
import { createRedisConnection, isRedisAvailable } from './redis';
import { debugLog, debugError } from '../_core/logger';

// Queue names
export const QUEUE_NAMES = {
  CREDITS: 'llm:credits',
  USAGE: 'llm:usage',
  SKILLS: 'llm:skills',
  MEDIA: 'llm:media',
} as const;

// Job types
export interface CreditJob {
  userId: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
  conversationId?: number;
  messageId?: number;
}

export interface UsageJob {
  userId: number;
  conversationId: number;
  messageId: number;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  creditsUsed: number;
  timestamp: Date;
}

export interface SkillStep {
  id: string;
  type: 'llm' | 'code' | 'api' | 'wait';
  config: Record<string, any>;
  dependsOn?: string[];
  status?: 'pending' | 'running' | 'completed' | 'failed';
  result?: any;
  error?: string;
}

export interface SkillJob {
  userId: number;
  skillId: string;
  skillName: string;
  conversationId: number;
  steps: SkillStep[];
  currentStep: number;
  context: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

// Queue instances (lazy initialization)
let creditQueue: Queue<CreditJob> | null = null;
let usageQueue: Queue<UsageJob> | null = null;
let skillQueue: Queue<SkillJob> | null = null;

// Workers
let creditWorker: Worker<CreditJob> | null = null;
let usageWorker: Worker<UsageJob> | null = null;
let skillWorker: Worker<SkillJob> | null = null;

// Queue events for monitoring
let creditEvents: QueueEvents | null = null;
let usageEvents: QueueEvents | null = null;
let skillEvents: QueueEvents | null = null;

// Statistics
interface QueueStats {
  name: string;
  completed: number;
  failed: number;
  waiting: number;
  active: number;
  delayed: number;
  lastProcessedAt: Date | null;
  avgProcessingTime: number;
  processingTimes: number[];
}

const queueStats: Map<string, QueueStats> = new Map();

/**
 * Initialize queue statistics
 */
function initQueueStats(name: string): void {
  queueStats.set(name, {
    name,
    completed: 0,
    failed: 0,
    waiting: 0,
    active: 0,
    delayed: 0,
    lastProcessedAt: null,
    avgProcessingTime: 0,
    processingTimes: [],
  });
}

/**
 * Update queue statistics
 */
function updateQueueStats(
  name: string,
  event: 'completed' | 'failed',
  processingTime?: number
): void {
  const stats = queueStats.get(name);
  if (!stats) return;

  if (event === 'completed') {
    stats.completed++;
  } else {
    stats.failed++;
  }

  stats.lastProcessedAt = new Date();

  if (processingTime !== undefined) {
    stats.processingTimes.push(processingTime);
    if (stats.processingTimes.length > 100) {
      stats.processingTimes.shift();
    }
    stats.avgProcessingTime = Math.round(
      stats.processingTimes.reduce((a, b) => a + b, 0) / stats.processingTimes.length
    );
  }
}

/**
 * Get the credit deduction queue
 */
export function getCreditQueue(): Queue<CreditJob> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!creditQueue) {
    const connection = createRedisConnection();
    creditQueue = new Queue<CreditJob>(QUEUE_NAMES.CREDITS, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: {
          age: 3600, // Keep for 1 hour
          count: 1000, // Keep last 1000
        },
        removeOnFail: {
          age: 86400, // Keep for 24 hours
        },
      },
    });

    initQueueStats(QUEUE_NAMES.CREDITS);
    debugLog('Queue', `Credit queue initialized`);
  }

  return creditQueue;
}

/**
 * Get the usage logging queue
 */
export function getUsageQueue(): Queue<UsageJob> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!usageQueue) {
    const connection = createRedisConnection();
    usageQueue = new Queue<UsageJob>(QUEUE_NAMES.USAGE, {
      connection,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 500,
        },
        removeOnComplete: {
          age: 1800, // Keep for 30 minutes
          count: 500,
        },
        removeOnFail: {
          age: 43200, // Keep for 12 hours
        },
      },
    });

    initQueueStats(QUEUE_NAMES.USAGE);
    debugLog('Queue', `Usage queue initialized`);
  }

  return usageQueue;
}

/**
 * Get the skill processing queue
 */
export function getSkillQueue(): Queue<SkillJob> | null {
  if (!isRedisAvailable()) {
    return null;
  }

  if (!skillQueue) {
    const connection = createRedisConnection();
    skillQueue = new Queue<SkillJob>(QUEUE_NAMES.SKILLS, {
      connection,
      defaultJobOptions: {
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: {
          age: 7200, // Keep for 2 hours
          count: 200,
        },
        removeOnFail: {
          age: 172800, // Keep for 48 hours
        },
      },
    });

    initQueueStats(QUEUE_NAMES.SKILLS);
    debugLog('Queue', `Skill queue initialized`);
  }

  return skillQueue;
}

/**
 * Start the credit deduction worker
 */
export async function startCreditWorker(): Promise<void> {
  if (!isRedisAvailable() || creditWorker) {
    return;
  }

  const connection = createRedisConnection();

  creditWorker = new Worker<CreditJob>(
    QUEUE_NAMES.CREDITS,
    async (job: Job<CreditJob>) => {
      const startTime = Date.now();
      const { userId, model, provider, inputTokens, outputTokens, costUsd } = job.data;

      debugLog('Queue', `Processing credit job ${job.id}`, { userId, model });

      try {
        const { deductCreditsForModel } = await import('./creditService');
        await deductCreditsForModel({
          userId,
          model,
          provider,
          inputTokens,
          outputTokens,
          costUsd,
        });

        const processingTime = Date.now() - startTime;
        updateQueueStats(QUEUE_NAMES.CREDITS, 'completed', processingTime);

        debugLog('Queue', `Credit job ${job.id} completed in ${processingTime}ms`);
        return { success: true, processingTime };
      } catch (error: any) {
        debugError('Queue', `Credit job ${job.id} failed`, error);
        updateQueueStats(QUEUE_NAMES.CREDITS, 'failed');
        throw error;
      }
    },
    {
      connection,
      concurrency: 5,
    }
  );

  creditWorker.on('failed', (job, err) => {
    console.error(`[Queue] Credit job ${job?.id} failed:`, err.message);
  });

  debugLog('Queue', 'Credit worker started');
}

/**
 * Start the usage logging worker
 */
export async function startUsageWorker(): Promise<void> {
  if (!isRedisAvailable() || usageWorker) {
    return;
  }

  const connection = createRedisConnection();

  usageWorker = new Worker<UsageJob>(
    QUEUE_NAMES.USAGE,
    async (job: Job<UsageJob>) => {
      const startTime = Date.now();
      const { userId, conversationId, messageId, model, provider, inputTokens, outputTokens, creditsUsed } = job.data;

      debugLog('Queue', `Processing usage job ${job.id}`);

      try {
        // Log usage to database (implement as needed)
        // For now, just log to console
        debugLog('Queue', `Usage: user=${userId} conv=${conversationId} model=${model} in=${inputTokens} out=${outputTokens} credits=${creditsUsed}`);

        const processingTime = Date.now() - startTime;
        updateQueueStats(QUEUE_NAMES.USAGE, 'completed', processingTime);

        return { success: true, processingTime };
      } catch (error: any) {
        debugError('Queue', `Usage job ${job.id} failed`, error);
        updateQueueStats(QUEUE_NAMES.USAGE, 'failed');
        throw error;
      }
    },
    {
      connection,
      concurrency: 10,
    }
  );

  debugLog('Queue', 'Usage worker started');
}

/**
 * Start the skill processing worker
 */
export async function startSkillWorker(): Promise<void> {
  if (!isRedisAvailable() || skillWorker) {
    return;
  }

  const connection = createRedisConnection();

  skillWorker = new Worker<SkillJob>(
    QUEUE_NAMES.SKILLS,
    async (job: Job<SkillJob>) => {
      const startTime = Date.now();
      const { userId, skillId, skillName, steps, currentStep, context } = job.data;

      debugLog('Queue', `Processing skill job ${job.id}: ${skillName} step ${currentStep}/${steps.length}`);

      try {
        // Process current step
        const step = steps[currentStep];
        if (!step) {
          return { success: true, completed: true };
        }

        // Mark step as running
        step.status = 'running';
        await job.updateProgress({ currentStep, stepStatus: 'running' });

        // Execute step based on type
        let result: any;
        switch (step.type) {
          case 'llm':
            // Execute LLM call
            result = await executeSkillLLMStep(step, context);
            break;
          case 'code':
            // Execute code step (sandboxed)
            result = await executeSkillCodeStep(step, context);
            break;
          case 'api':
            // Execute API call
            result = await executeSkillApiStep(step, context);
            break;
          case 'wait':
            // Wait for specified duration
            await new Promise(resolve => setTimeout(resolve, step.config.durationMs || 1000));
            result = { waited: true };
            break;
        }

        step.status = 'completed';
        step.result = result;

        // Check if more steps
        if (currentStep < steps.length - 1) {
          // Queue next step
          const queue = getSkillQueue();
          if (queue) {
            await queue.add(`${skillId}-step-${currentStep + 1}`, {
              ...job.data,
              currentStep: currentStep + 1,
              context: { ...context, [`step_${step.id}_result`]: result },
              updatedAt: new Date(),
            });
          }
        }

        const processingTime = Date.now() - startTime;
        updateQueueStats(QUEUE_NAMES.SKILLS, 'completed', processingTime);

        return { success: true, step: currentStep, result, processingTime };
      } catch (error: any) {
        debugError('Queue', `Skill job ${job.id} step ${currentStep} failed`, error);
        updateQueueStats(QUEUE_NAMES.SKILLS, 'failed');

        const step = steps[currentStep];
        if (step) {
          step.status = 'failed';
          step.error = error.message;
        }

        throw error;
      }
    },
    {
      connection,
      concurrency: 3,
    }
  );

  debugLog('Queue', 'Skill worker started');
}

// Skill step execution helpers (placeholders - implement as needed)
async function executeSkillLLMStep(step: SkillStep, context: Record<string, any>): Promise<any> {
  // TODO: Implement LLM step execution
  debugLog('Queue', `Executing LLM step: ${step.id}`);
  return { type: 'llm', config: step.config };
}

async function executeSkillCodeStep(step: SkillStep, context: Record<string, any>): Promise<any> {
  // TODO: Implement sandboxed code execution
  debugLog('Queue', `Executing code step: ${step.id}`);
  return { type: 'code', config: step.config };
}

async function executeSkillApiStep(step: SkillStep, context: Record<string, any>): Promise<any> {
  // TODO: Implement API call execution
  debugLog('Queue', `Executing API step: ${step.id}`);
  return { type: 'api', config: step.config };
}

/**
 * Add a credit deduction job
 */
export async function addCreditJob(data: CreditJob): Promise<string | null> {
  const queue = getCreditQueue();
  if (!queue) {
    // Fallback: process synchronously
    debugLog('Queue', 'Redis unavailable, processing credit synchronously');
    try {
      const { deductCreditsForModel } = await import('./creditService');
      await deductCreditsForModel(data);
      return 'sync';
    } catch (error: any) {
      debugError('Queue', 'Synchronous credit deduction failed', error);
      return null;
    }
  }

  const job = await queue.add('deduct', data);
  return job.id || null;
}

/**
 * Add a usage logging job
 */
export async function addUsageJob(data: UsageJob): Promise<string | null> {
  const queue = getUsageQueue();
  if (!queue) {
    // Fallback: just log
    debugLog('Queue', 'Redis unavailable, logging usage locally');
    return 'local';
  }

  const job = await queue.add('log', data);
  return job.id || null;
}

/**
 * Add a skill processing job
 */
export async function addSkillJob(data: SkillJob): Promise<string | null> {
  const queue = getSkillQueue();
  if (!queue) {
    return null;
  }

  const job = await queue.add(`${data.skillId}-start`, data);
  return job.id || null;
}

/**
 * Get queue statistics
 */
export function getQueueStats(queueName: string): QueueStats | null {
  return queueStats.get(queueName) || null;
}

/**
 * Get all queue statistics
 */
export function getAllQueueStats(): QueueStats[] {
  return Array.from(queueStats.values());
}

/**
 * Get queue counts (waiting, active, delayed, failed)
 */
export async function getQueueCounts(queueName: string): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
} | null> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return null;
  }

  const counts = await queue.getJobCounts();
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    delayed: counts.delayed || 0,
    failed: counts.failed || 0,
    completed: counts.completed || 0,
  };
}

/**
 * Get failed jobs from a queue
 */
export async function getFailedJobs(queueName: string, start = 0, end = 20): Promise<Job[] | null> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return null;
  }

  return queue.getFailed(start, end);
}

/**
 * Retry failed jobs
 */
export async function retryFailedJobs(queueName: string, jobIds?: string[]): Promise<number> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return 0;
  }

  const failed = await queue.getFailed();
  let retried = 0;

  for (const job of failed) {
    if (!jobIds || jobIds.includes(job.id!)) {
      await job.retry();
      retried++;
    }
  }

  return retried;
}

/**
 * Clear stuck/stale jobs
 */
export async function clearStaleJobs(queueName: string, olderThanMs = 300000): Promise<number> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return 0;
  }

  const active = await queue.getActive();
  const now = Date.now();
  let cleared = 0;

  for (const job of active) {
    const processedOn = job.processedOn || 0;
    if (now - processedOn > olderThanMs) {
      await job.moveToFailed(new Error('Job stale - cleared by admin'), 'stale');
      cleared++;
    }
  }

  return cleared;
}

/**
 * Pause a queue
 */
export async function pauseQueue(queueName: string): Promise<boolean> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return false;
  }

  await queue.pause();
  return true;
}

/**
 * Resume a queue
 */
export async function resumeQueue(queueName: string): Promise<boolean> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return false;
  }

  await queue.resume();
  return true;
}

/**
 * Check if a queue is paused
 */
export async function isQueuePaused(queueName: string): Promise<boolean> {
  let queue: Queue | null = null;

  switch (queueName) {
    case QUEUE_NAMES.CREDITS:
      queue = getCreditQueue();
      break;
    case QUEUE_NAMES.USAGE:
      queue = getUsageQueue();
      break;
    case QUEUE_NAMES.SKILLS:
      queue = getSkillQueue();
      break;
  }

  if (!queue) {
    return false;
  }

  return queue.isPaused();
}

/**
 * Initialize all queues and workers
 */
export async function initializeQueues(): Promise<void> {
  if (!isRedisAvailable()) {
    console.log('[Queue] Redis not available, queues disabled');
    return;
  }

  // Initialize queues
  getCreditQueue();
  getUsageQueue();
  getSkillQueue();

  // Start workers
  await startCreditWorker();
  await startUsageWorker();
  await startSkillWorker();

  // Start history collection
  startHistoryCollection();

  console.log('[Queue] All queues and workers initialized');
}

// ─── History Tracking ────────────────────────────────────────────────────────

export interface QueueHistoryEntry {
  timestamp: Date;
  queues: {
    name: string;
    completed: number;
    failed: number;
    waiting: number;
    active: number;
  }[];
  limiters: {
    provider: string;
    running: number;
    queued: number;
    done: number;
    failed: number;
  }[];
  models: {
    model: string;
    provider: string;
    requests: number;
    completed: number;
    failed: number;
    inputTokens: number;
    outputTokens: number;
  }[];
  totals: {
    totalCompleted: number;
    totalFailed: number;
    totalWaiting: number;
    totalActive: number;
  };
}

// In-memory history storage (keep last 24 hours at 1-minute intervals = 1440 entries)
const MAX_HISTORY_ENTRIES = 1440;
const HISTORY_INTERVAL_MS = 60000; // 1 minute
const queueHistory: QueueHistoryEntry[] = [];
let historyIntervalId: NodeJS.Timeout | null = null;

/**
 * Take a snapshot of current queue/limiter state for history
 */
async function takeHistorySnapshot(): Promise<void> {
  try {
    // Get queue stats
    const queueData = getAllQueueStats().map(s => ({
      name: s.name,
      completed: s.completed,
      failed: s.failed,
      waiting: s.waiting,
      active: s.active,
    }));

    // Get limiter stats (import dynamically to avoid circular dependency)
    let limiterData: { provider: string; running: number; queued: number; done: number; failed: number }[] = [];
    let modelData: { model: string; provider: string; requests: number; completed: number; failed: number; inputTokens: number; outputTokens: number }[] = [];
    try {
      const { getAllLimiterStats, getAllModelUsageStats } = await import('./llmRateLimiter');
      limiterData = getAllLimiterStats().map(s => ({
        provider: s.provider,
        running: s.running,
        queued: s.queued,
        done: s.done,
        failed: s.failed,
      }));
      modelData = getAllModelUsageStats().map(s => ({
        model: s.model,
        provider: s.provider,
        requests: s.requests,
        completed: s.completed,
        failed: s.failed,
        inputTokens: s.totalInputTokens,
        outputTokens: s.totalOutputTokens,
      }));
    } catch {
      // Rate limiter not available
    }

    const entry: QueueHistoryEntry = {
      timestamp: new Date(),
      queues: queueData,
      limiters: limiterData,
      models: modelData,
      totals: {
        totalCompleted: queueData.reduce((sum, q) => sum + q.completed, 0),
        totalFailed: queueData.reduce((sum, q) => sum + q.failed, 0),
        totalWaiting: queueData.reduce((sum, q) => sum + q.waiting, 0),
        totalActive: queueData.reduce((sum, q) => sum + q.active, 0),
      },
    };

    // Enforce hard limit before push (defense in depth)
    if (queueHistory.length >= MAX_HISTORY_ENTRIES) {
      queueHistory.splice(0, queueHistory.length - MAX_HISTORY_ENTRIES + 1);
    }
    queueHistory.push(entry);
  } catch (error) {
    debugError('Queue', 'Failed to take history snapshot', error);
  }
}

/**
 * Start periodic history collection
 */
export function startHistoryCollection(): void {
  if (historyIntervalId) return;

  // Take initial snapshot
  takeHistorySnapshot();

  // Schedule periodic snapshots
  historyIntervalId = setInterval(() => {
    takeHistorySnapshot();
  }, HISTORY_INTERVAL_MS);

  debugLog('Queue', 'History collection started');
}

/**
 * Stop history collection
 */
export function stopHistoryCollection(): void {
  if (historyIntervalId) {
    clearInterval(historyIntervalId);
    historyIntervalId = null;
    debugLog('Queue', 'History collection stopped');
  }
}

/**
 * Get queue history for a time range
 * @param minutes - Number of minutes of history to return (default: 60 = last hour)
 */
export function getQueueHistory(minutes: number = 60): QueueHistoryEntry[] {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return queueHistory.filter(entry => entry.timestamp >= cutoff);
}

/**
 * Get aggregated history stats for charting
 * Groups data into buckets for easier visualization
 */
export function getAggregatedHistory(
  minutes: number = 60,
  bucketSize: number = 5 // minutes per bucket
): {
  buckets: {
    timestamp: Date;
    completed: number;
    failed: number;
    avgWaiting: number;
    avgActive: number;
    limiterRequests: number;
  }[];
  summary: {
    totalCompleted: number;
    totalFailed: number;
    peakWaiting: number;
    peakActive: number;
    avgProcessingRate: number;
  };
} {
  const history = getQueueHistory(minutes);

  if (history.length === 0) {
    return {
      buckets: [],
      summary: {
        totalCompleted: 0,
        totalFailed: 0,
        peakWaiting: 0,
        peakActive: 0,
        avgProcessingRate: 0,
      },
    };
  }

  // Group into buckets
  const bucketMs = bucketSize * 60 * 1000;
  const bucketMap = new Map<number, QueueHistoryEntry[]>();

  for (const entry of history) {
    const bucketKey = Math.floor(entry.timestamp.getTime() / bucketMs) * bucketMs;
    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, []);
    }
    bucketMap.get(bucketKey)!.push(entry);
  }

  // Aggregate buckets
  const buckets = Array.from(bucketMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([timestamp, entries]) => {
      const lastEntry = entries[entries.length - 1];
      const firstEntry = entries[0];

      return {
        timestamp: new Date(timestamp),
        completed: lastEntry.totals.totalCompleted - firstEntry.totals.totalCompleted,
        failed: lastEntry.totals.totalFailed - firstEntry.totals.totalFailed,
        avgWaiting: Math.round(entries.reduce((sum, e) => sum + e.totals.totalWaiting, 0) / entries.length),
        avgActive: Math.round(entries.reduce((sum, e) => sum + e.totals.totalActive, 0) / entries.length),
        limiterRequests: entries.reduce((sum, e) =>
          sum + e.limiters.reduce((ls, l) => ls + l.done, 0), 0
        ) / entries.length,
      };
    });

  // Calculate summary
  const firstTotal = history[0]?.totals || { totalCompleted: 0, totalFailed: 0, totalWaiting: 0, totalActive: 0 };
  const lastTotal = history[history.length - 1]?.totals || firstTotal;

  return {
    buckets,
    summary: {
      totalCompleted: lastTotal.totalCompleted - firstTotal.totalCompleted,
      totalFailed: lastTotal.totalFailed - firstTotal.totalFailed,
      peakWaiting: Math.max(...history.map(h => h.totals.totalWaiting)),
      peakActive: Math.max(...history.map(h => h.totals.totalActive)),
      avgProcessingRate: buckets.length > 0
        ? Math.round(buckets.reduce((sum, b) => sum + b.completed, 0) / buckets.length)
        : 0,
    },
  };
}

/**
 * Graceful shutdown
 */
export async function shutdownQueues(): Promise<void> {
  console.log('[Queue] Shutting down queues...');
  stopHistoryCollection();

  const closePromises: Promise<void>[] = [];

  if (creditWorker) {
    closePromises.push(creditWorker.close());
  }
  if (usageWorker) {
    closePromises.push(usageWorker.close());
  }
  if (skillWorker) {
    closePromises.push(skillWorker.close());
  }

  if (creditQueue) {
    closePromises.push(creditQueue.close());
  }
  if (usageQueue) {
    closePromises.push(usageQueue.close());
  }
  if (skillQueue) {
    closePromises.push(skillQueue.close());
  }

  await Promise.all(closePromises);
  console.log('[Queue] All queues shut down');
}

// Handle process shutdown
process.on('SIGTERM', async () => {
  await shutdownQueues();
});

process.on('SIGINT', async () => {
  await shutdownQueues();
});
