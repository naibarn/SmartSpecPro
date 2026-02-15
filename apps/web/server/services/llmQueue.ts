/**
 * LLM Queue Service
 *
 * Handles background job processing for:
 * - Credit deduction after LLM calls (in-process, synchronous)
 * - Usage logging to database (in-process, synchronous)
 * - Multi-step skill processing (via Cloud Tasks)
 *
 * Migrated from BullMQ to in-process + Cloud Tasks.
 * Credit and usage jobs are fast DB operations (<50ms) and
 * don't need async queue semantics.
 */

import { debugLog, debugError } from '../_core/logger';

// Queue names (kept for backward compatibility with admin dashboard)
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

// Statistics (in-memory counters)
export interface QueueStats {
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

// Initialize stats on module load
function initQueueStats(name: string): void {
  if (!queueStats.has(name)) {
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
}

// Initialize all queue stats
for (const name of Object.values(QUEUE_NAMES)) {
  initQueueStats(name);
}

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
 * Add a credit deduction job — processes synchronously (in-process).
 */
export async function addCreditJob(data: CreditJob): Promise<string | null> {
  const startTime = Date.now();
  try {
    const { deductCreditsForModel } = await import('./creditService');
    await deductCreditsForModel(data);
    updateQueueStats(QUEUE_NAMES.CREDITS, 'completed', Date.now() - startTime);
    debugLog('Queue', `Credit deduction processed in-process for user ${data.userId}`);
    return 'sync';
  } catch (error: any) {
    updateQueueStats(QUEUE_NAMES.CREDITS, 'failed');
    debugError('Queue', 'Synchronous credit deduction failed', error);
    return null;
  }
}

/**
 * Add a usage logging job — processes synchronously (in-process).
 */
export async function addUsageJob(data: UsageJob): Promise<string | null> {
  const startTime = Date.now();
  try {
    debugLog('Queue', `Usage: user=${data.userId} conv=${data.conversationId} model=${data.model} in=${data.inputTokens} out=${data.outputTokens} credits=${data.creditsUsed}`);
    updateQueueStats(QUEUE_NAMES.USAGE, 'completed', Date.now() - startTime);
    return 'sync';
  } catch (error: any) {
    updateQueueStats(QUEUE_NAMES.USAGE, 'failed');
    debugError('Queue', 'Usage logging failed', error);
    return null;
  }
}

/**
 * Add a skill processing job — enqueues to Cloud Tasks workflow-tasks queue.
 */
export async function addSkillJob(data: SkillJob): Promise<string | null> {
  try {
    const { enqueueTask } = await import('./cloudTasks');
    const taskName = await enqueueTask({
      queueName: 'workflow-tasks',
      handlerPath: '/tasks/execute-skill-step',
      payload: {
        userId: data.userId,
        skillId: data.skillId,
        skillName: data.skillName,
        conversationId: data.conversationId,
        steps: data.steps,
        currentStep: data.currentStep,
        context: data.context,
      },
    });
    debugLog('Queue', `Skill job enqueued to Cloud Tasks: ${taskName}`);
    return taskName;
  } catch (error: any) {
    debugError('Queue', 'Failed to enqueue skill job to Cloud Tasks', error);
    return null;
  }
}

/**
 * Get queue statistics (in-memory counters).
 */
export function getQueueStats(queueName: string): QueueStats | null {
  return queueStats.get(queueName) || null;
}

/**
 * Get all queue statistics.
 */
export function getAllQueueStats(): QueueStats[] {
  return Array.from(queueStats.values());
}

/**
 * Get queue counts — returns in-memory counters.
 * Cloud Tasks queue depth is available via cloudTasksMetrics service.
 */
export async function getQueueCounts(queueName: string): Promise<{
  waiting: number;
  active: number;
  delayed: number;
  failed: number;
  completed: number;
} | null> {
  const stats = queueStats.get(queueName);
  if (!stats) return null;

  return {
    waiting: stats.waiting,
    active: stats.active,
    delayed: stats.delayed,
    failed: stats.failed,
    completed: stats.completed,
  };
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

async function takeHistorySnapshot(): Promise<void> {
  try {
    const queueData = getAllQueueStats().map(s => ({
      name: s.name,
      completed: s.completed,
      failed: s.failed,
      waiting: s.waiting,
      active: s.active,
    }));

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

    if (queueHistory.length >= MAX_HISTORY_ENTRIES) {
      queueHistory.splice(0, queueHistory.length - MAX_HISTORY_ENTRIES + 1);
    }
    queueHistory.push(entry);
  } catch (error) {
    debugError('Queue', 'Failed to take history snapshot', error);
  }
}

export function startHistoryCollection(): void {
  if (historyIntervalId) return;

  takeHistorySnapshot();
  historyIntervalId = setInterval(() => {
    takeHistorySnapshot();
  }, HISTORY_INTERVAL_MS);

  debugLog('Queue', 'History collection started');
}

export function stopHistoryCollection(): void {
  if (historyIntervalId) {
    clearInterval(historyIntervalId);
    historyIntervalId = null;
    debugLog('Queue', 'History collection stopped');
  }
}

export function getQueueHistory(minutes: number = 60): QueueHistoryEntry[] {
  const cutoff = new Date(Date.now() - minutes * 60 * 1000);
  return queueHistory.filter(entry => entry.timestamp >= cutoff);
}

export function getAggregatedHistory(
  minutes: number = 60,
  bucketSize: number = 5
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

  const bucketMs = bucketSize * 60 * 1000;
  const bucketMap = new Map<number, QueueHistoryEntry[]>();

  for (const entry of history) {
    const bucketKey = Math.floor(entry.timestamp.getTime() / bucketMs) * bucketMs;
    if (!bucketMap.has(bucketKey)) {
      bucketMap.set(bucketKey, []);
    }
    bucketMap.get(bucketKey)!.push(entry);
  }

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
