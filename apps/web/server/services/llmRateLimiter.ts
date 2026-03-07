import crypto from "crypto";

/**
 * AI Provider Rate Limiter Service
 *
 * Uses Bottleneck with Redis reservoir for:
 * - Per-provider rate limiting (LLM and Media providers)
 * - Distributed state across multiple Node instances
 * - Per-model delay multipliers for free models
 * - Media generation request throttling
 *
 * Falls back to in-memory limiting if Redis is unavailable
 */

import Bottleneck from 'bottleneck';
import { getRedisClient, isRedisAvailable } from './redis';

// Provider-specific rate limit configurations
export interface ProviderLimitConfig {
  maxConcurrent: number;      // Max concurrent requests
  minTime: number;            // Min time between requests (ms)
  reservoir?: number;         // Max requests per interval
  reservoirRefreshInterval?: number; // Refresh interval (ms)
  freeModelMultiplier: number; // Delay multiplier for free models
  timeout?: number;           // Max wait time for slot (ms)
}

// Default configurations per provider
export const PROVIDER_LIMITS: Record<string, ProviderLimitConfig> = {
  'opencode-zen': {
    maxConcurrent: 2,
    minTime: 1500,
    reservoir: 10,
    reservoirRefreshInterval: 60000, // 10 per minute
    freeModelMultiplier: 2,
    timeout: 60000, // 60s max wait
  },
  'opencode': {
    maxConcurrent: 2,
    minTime: 1500,
    reservoir: 10,
    reservoirRefreshInterval: 60000,
    freeModelMultiplier: 2,
    timeout: 60000,
  },
  'openrouter': {
    maxConcurrent: 10,
    minTime: 50,
    reservoir: 100,
    reservoirRefreshInterval: 60000, // 100 per minute
    freeModelMultiplier: 1.5,
    timeout: 30000,
  },
  'anthropic': {
    maxConcurrent: 5,
    minTime: 100,
    reservoir: 50,
    reservoirRefreshInterval: 60000,
    freeModelMultiplier: 1,
    timeout: 30000,
  },
  'openai': {
    maxConcurrent: 10,
    minTime: 50,
    reservoir: 100,
    reservoirRefreshInterval: 60000,
    freeModelMultiplier: 1,
    timeout: 30000,
  },
  'groq': {
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 30,
    reservoirRefreshInterval: 60000,
    freeModelMultiplier: 1.5,
    timeout: 30000,
  },
  'default': {
    maxConcurrent: 5,
    minTime: 200,
    reservoir: 50,
    reservoirRefreshInterval: 60000,
    freeModelMultiplier: 1.5,
    timeout: 30000,
  },
};

// ─── Media Provider Rate Limit Configurations ────────────────────────────────

export type MediaType = 'image' | 'video' | 'audio';

export interface MediaProviderLimitConfig {
  maxConcurrent: number;      // Max concurrent requests
  minTime: number;            // Min time between requests (ms)
  reservoir?: number;         // Max requests per interval
  reservoirRefreshInterval?: number; // Refresh interval (ms)
  timeout?: number;           // Max wait time for slot (ms)
  // Media-specific settings
  videoMultiplier: number;    // Extra delay multiplier for video generation
  audioMultiplier: number;    // Extra delay multiplier for audio generation
}

export const MEDIA_PROVIDER_LIMITS: Record<string, MediaProviderLimitConfig> = {
  'kie.ai': {
    // Kie AI rate limit: 20 requests per 10 seconds, ~100+ concurrent tasks
    maxConcurrent: 50,        // Kie AI supports 100+ concurrent, use 50 for safety
    minTime: 500,             // 500ms between requests for smoother distribution
    reservoir: 20,
    reservoirRefreshInterval: 10000, // 20 per 10 seconds (per Kie AI spec)
    timeout: 300000,          // 5 min max wait (image gen can take 2-3+ min)
    videoMultiplier: 2,       // Video still needs more spacing
    audioMultiplier: 1.5,     // Audio is moderate
  },
  'replicate': {
    maxConcurrent: 5,
    minTime: 1000,
    reservoir: 50,
    reservoirRefreshInterval: 60000,
    timeout: 60000,
    videoMultiplier: 2,
    audioMultiplier: 1,
  },
  'stability': {
    maxConcurrent: 5,
    minTime: 500,
    reservoir: 60,
    reservoirRefreshInterval: 60000,
    timeout: 60000,
    videoMultiplier: 2,
    audioMultiplier: 1,
  },
  'elevenlabs': {
    maxConcurrent: 3,
    minTime: 1000,
    reservoir: 30,
    reservoirRefreshInterval: 60000,
    timeout: 60000,
    videoMultiplier: 1,
    audioMultiplier: 1.5,
  },
  'uvoice': {
    // UVoice public limit: 100 requests/minute
    maxConcurrent: 5,
    minTime: 600,
    reservoir: 100,
    reservoirRefreshInterval: 60000,
    timeout: 120000,
    videoMultiplier: 1,
    audioMultiplier: 1.2,
  },
  'byteplus_modelark': {
    // BytePlus ModelArk: Seedream (sync image) + Seedance (async video task creation)
    // Conservative defaults; Seedance task creation is lightweight but polling is separate
    maxConcurrent: 5,
    minTime: 1000,            // 1s between requests
    reservoir: 30,
    reservoirRefreshInterval: 60000, // 30 per minute
    timeout: 300000,          // 5 min max wait (video task polling can be long)
    videoMultiplier: 2,       // Extra spacing for async Seedance task creation
    audioMultiplier: 1,       // BytePlus ModelArk has no audio support
  },
  'default-media': {
    maxConcurrent: 3,
    minTime: 2000,
    reservoir: 30,
    reservoirRefreshInterval: 60000,
    timeout: 90000,
    videoMultiplier: 2,
    audioMultiplier: 1.5,
  },
};

// Limiter instances cache
const limiters: Map<string, Bottleneck> = new Map();

// Statistics tracking
export interface LimiterStats {
  provider: string;
  running: number;
  queued: number;
  done: number;
  failed: number;
  lastRequestTime: number;
  avgWaitTime: number;
  waitTimeSamples: number[];
}

const limiterStats: Map<string, LimiterStats> = new Map();

// Model-level usage tracking
export interface ModelUsageStats {
  model: string;
  provider: string;
  requests: number;
  completed: number;
  failed: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  lastUsed: number;
}

const modelUsageStats: Map<string, ModelUsageStats> = new Map();

// ─── Media Usage Tracking ────────────────────────────────────────────────────

export interface MediaUsageStats {
  model: string;
  provider: string;
  mediaType: MediaType;
  requests: number;
  completed: number;
  failed: number;
  totalCreditsUsed: number;
  lastUsed: number;
}

const mediaUsageStats: Map<string, MediaUsageStats> = new Map();

/**
 * Record media generation usage (called after each media request)
 */
export function recordMediaUsage(
  provider: string,
  model: string,
  mediaType: MediaType,
  success: boolean,
  creditsUsed: number = 0
): void {
  const key = `media:${provider.toLowerCase()}:${model}`;

  if (!mediaUsageStats.has(key)) {
    mediaUsageStats.set(key, {
      model,
      provider: provider.toLowerCase(),
      mediaType,
      requests: 0,
      completed: 0,
      failed: 0,
      totalCreditsUsed: 0,
      lastUsed: 0,
    });
  }

  const stats = mediaUsageStats.get(key)!;
  stats.requests++;
  if (success) {
    stats.completed++;
    stats.totalCreditsUsed += creditsUsed;
  } else {
    stats.failed++;
  }
  stats.lastUsed = Date.now();
}

/**
 * Get all media usage stats
 */
export function getAllMediaUsageStats(): MediaUsageStats[] {
  return Array.from(mediaUsageStats.values());
}

/**
 * Get media usage stats for a specific provider
 */
export function getMediaProviderStats(provider: string): MediaUsageStats[] {
  const providerKey = provider.toLowerCase();
  return Array.from(mediaUsageStats.values())
    .filter(s => s.provider === providerKey);
}

/**
 * Get media usage stats by media type
 */
export function getMediaStatsByType(mediaType: MediaType): MediaUsageStats[] {
  return Array.from(mediaUsageStats.values())
    .filter(s => s.mediaType === mediaType);
}

/**
 * Get top media models by usage
 */
export function getTopMediaModels(limit: number = 10): MediaUsageStats[] {
  return Array.from(mediaUsageStats.values())
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);
}

/**
 * Clear media usage stats (for testing)
 */
export function clearMediaUsageStats(): void {
  mediaUsageStats.clear();
}

/**
 * Record a model usage (called after each LLM request)
 */
export function recordModelUsage(
  provider: string,
  model: string,
  success: boolean,
  inputTokens: number = 0,
  outputTokens: number = 0
): void {
  const key = `${provider.toLowerCase()}:${model}`;

  if (!modelUsageStats.has(key)) {
    modelUsageStats.set(key, {
      model,
      provider: provider.toLowerCase(),
      requests: 0,
      completed: 0,
      failed: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      lastUsed: 0,
    });
  }

  const stats = modelUsageStats.get(key)!;
  stats.requests++;
  if (success) {
    stats.completed++;
    stats.totalInputTokens += inputTokens;
    stats.totalOutputTokens += outputTokens;
  } else {
    stats.failed++;
  }
  stats.lastUsed = Date.now();
}

/**
 * Get all model usage stats
 */
export function getAllModelUsageStats(): ModelUsageStats[] {
  return Array.from(modelUsageStats.values());
}

/**
 * Get model usage stats for a specific provider
 */
export function getProviderModelStats(provider: string): ModelUsageStats[] {
  const providerKey = provider.toLowerCase();
  return Array.from(modelUsageStats.values())
    .filter(s => s.provider === providerKey);
}

/**
 * Get top models by usage
 */
export function getTopModels(limit: number = 10): ModelUsageStats[] {
  return Array.from(modelUsageStats.values())
    .sort((a, b) => b.requests - a.requests)
    .slice(0, limit);
}

/**
 * Clear model usage stats (for testing)
 */
export function clearModelUsageStats(): void {
  modelUsageStats.clear();
}

/**
 * Get LLM provider limit configuration
 */
export function getProviderLimitConfig(providerName: string): ProviderLimitConfig {
  const key = providerName.toLowerCase();
  return PROVIDER_LIMITS[key] ?? PROVIDER_LIMITS['default'];
}

/**
 * Get media provider limit configuration
 */
export function getMediaProviderLimitConfig(providerName: string): MediaProviderLimitConfig {
  const key = providerName.toLowerCase();
  return MEDIA_PROVIDER_LIMITS[key] ?? MEDIA_PROVIDER_LIMITS['default-media'];
}

/**
 * Get or create a rate limiter for a provider
 */
export function getProviderLimiter(providerName: string): Bottleneck {
  const key = providerName.toLowerCase();

  if (limiters.has(key)) {
    return limiters.get(key)!;
  }

  const config = getProviderLimitConfig(key);
  let limiter: Bottleneck;

  if (isRedisAvailable()) {
    // Use Redis-backed limiter for distributed rate limiting
    console.log(`[LLMRateLimiter] Creating Redis-backed limiter for ${key}`);

    limiter = new Bottleneck({
      id: `llm-rate-${key}`,
      maxConcurrent: config.maxConcurrent,
      minTime: config.minTime,
      reservoir: config.reservoir,
      reservoirRefreshAmount: config.reservoir,
      reservoirRefreshInterval: config.reservoirRefreshInterval,
      timeout: config.timeout,

      // Redis configuration
      datastore: 'ioredis',
      clientOptions: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      clearDatastore: false, // Don't clear on startup
    });
  } else {
    // Fallback to in-memory limiter
    console.log(`[LLMRateLimiter] Creating in-memory limiter for ${key} (Redis unavailable)`);

    limiter = new Bottleneck({
      maxConcurrent: config.maxConcurrent,
      minTime: config.minTime,
      reservoir: config.reservoir,
      reservoirRefreshAmount: config.reservoir,
      reservoirRefreshInterval: config.reservoirRefreshInterval,
      timeout: config.timeout,
    });
  }

  // Initialize stats
  limiterStats.set(key, {
    provider: key,
    running: 0,
    queued: 0,
    done: 0,
    failed: 0,
    lastRequestTime: 0,
    avgWaitTime: 0,
    waitTimeSamples: [],
  });

  // Track statistics
  limiter.on('executing', () => {
    const stats = limiterStats.get(key)!;
    stats.running++;
    stats.lastRequestTime = Date.now();
  });

  limiter.on('done', () => {
    const stats = limiterStats.get(key)!;
    stats.running = Math.max(0, stats.running - 1);
    stats.done++;
  });

  limiter.on('failed', () => {
    const stats = limiterStats.get(key)!;
    stats.running = Math.max(0, stats.running - 1);
    stats.failed++;
  });

  limiter.on('queued', () => {
    const stats = limiterStats.get(key)!;
    stats.queued++;
  });

  limiter.on('depleted', () => {
    console.log(`[LLMRateLimiter] ${key}: Reservoir depleted, waiting for refresh`);
  });

  limiters.set(key, limiter);
  return limiter;
}

/**
 * Schedule a job with the rate limiter
 * Handles priority based on model type (free models get lower priority)
 */
export async function scheduleWithLimiter<T>(
  providerName: string,
  isFreeModel: boolean,
  fn: () => Promise<T>
): Promise<T> {
  const limiter = getProviderLimiter(providerName);
  const config = getProviderLimitConfig(providerName);

  // Calculate priority: 1-5 (lower = higher priority)
  // Paid models: priority 1-2
  // Free models: priority 4-5
  const priority = isFreeModel ? 5 : 1;

  // Calculate effective min time for free models
  const effectiveMinTime = isFreeModel
    ? Math.floor(config.minTime * config.freeModelMultiplier)
    : config.minTime;

  const startTime = Date.now();

  try {
    const result = await limiter.schedule(
      {
        priority,
        id: `${providerName}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`,
      },
      async () => {
        // Apply extra delay for free models
        if (isFreeModel && config.freeModelMultiplier > 1) {
          const extraDelay = effectiveMinTime - config.minTime;
          if (extraDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, extraDelay));
          }
        }

        return fn();
      }
    );

    // Track wait time
    const waitTime = Date.now() - startTime;
    updateWaitTimeStats(providerName.toLowerCase(), waitTime);

    return result;
  } catch (error: any) {
    // Check if it's a timeout error
    if (error.message?.includes('timed out')) {
      throw new Error(`Rate limiter timeout for ${providerName}: Request waited too long in queue`);
    }
    throw error;
  }
}

// ─── Media Provider Rate Limiting ────────────────────────────────────────────

/**
 * Get or create a rate limiter for a media provider
 * Uses 'media:' prefix to distinguish from LLM limiters
 */
export function getMediaProviderLimiter(providerName: string): Bottleneck {
  const key = `media:${providerName.toLowerCase()}`;

  if (limiters.has(key)) {
    return limiters.get(key)!;
  }

  const config = getMediaProviderLimitConfig(providerName);
  let limiter: Bottleneck;

  if (isRedisAvailable()) {
    console.log(`[MediaRateLimiter] Creating Redis-backed limiter for ${key}`);

    limiter = new Bottleneck({
      id: `media-rate-${providerName.toLowerCase()}`,
      maxConcurrent: config.maxConcurrent,
      minTime: config.minTime,
      reservoir: config.reservoir,
      reservoirRefreshAmount: config.reservoir,
      reservoirRefreshInterval: config.reservoirRefreshInterval,
      timeout: config.timeout,

      datastore: 'ioredis',
      clientOptions: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
      clearDatastore: false,
    });
  } else {
    console.log(`[MediaRateLimiter] Creating in-memory limiter for ${key} (Redis unavailable)`);

    limiter = new Bottleneck({
      maxConcurrent: config.maxConcurrent,
      minTime: config.minTime,
      reservoir: config.reservoir,
      reservoirRefreshAmount: config.reservoir,
      reservoirRefreshInterval: config.reservoirRefreshInterval,
      timeout: config.timeout,
    });
  }

  // Initialize stats
  limiterStats.set(key, {
    provider: key,
    running: 0,
    queued: 0,
    done: 0,
    failed: 0,
    lastRequestTime: 0,
    avgWaitTime: 0,
    waitTimeSamples: [],
  });

  // Track statistics
  limiter.on('executing', () => {
    const stats = limiterStats.get(key)!;
    stats.running++;
    stats.lastRequestTime = Date.now();
  });

  limiter.on('done', () => {
    const stats = limiterStats.get(key)!;
    stats.running = Math.max(0, stats.running - 1);
    stats.done++;
  });

  limiter.on('failed', () => {
    const stats = limiterStats.get(key)!;
    stats.running = Math.max(0, stats.running - 1);
    stats.failed++;
  });

  limiter.on('queued', () => {
    const stats = limiterStats.get(key)!;
    stats.queued++;
  });

  limiter.on('depleted', () => {
    console.log(`[MediaRateLimiter] ${key}: Reservoir depleted, waiting for refresh`);
  });

  limiters.set(key, limiter);
  return limiter;
}

/**
 * Schedule a media generation job with the rate limiter
 * Handles priority based on media type (video gets lower priority due to longer processing)
 */
export async function scheduleMediaWithLimiter<T>(
  providerName: string,
  mediaType: MediaType,
  fn: () => Promise<T>
): Promise<T> {
  const limiter = getMediaProviderLimiter(providerName);
  const config = getMediaProviderLimitConfig(providerName);

  // Calculate priority based on media type
  // Image: priority 2 (fast)
  // Audio: priority 3 (moderate)
  // Video: priority 5 (slow, resource-intensive)
  const priorityMap: Record<MediaType, number> = {
    image: 2,
    audio: 3,
    video: 5,
  };
  const priority = priorityMap[mediaType] || 3;

  // Calculate effective min time based on media type
  const multiplier = mediaType === 'video'
    ? config.videoMultiplier
    : mediaType === 'audio'
      ? config.audioMultiplier
      : 1;
  const effectiveMinTime = Math.floor(config.minTime * multiplier);

  const startTime = Date.now();
  const key = `media:${providerName.toLowerCase()}`;

  try {
    const result = await limiter.schedule(
      {
        priority,
        id: `media-${providerName}-${mediaType}-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`,
      },
      async () => {
        // Apply extra delay for video/audio if needed
        if (multiplier > 1) {
          const extraDelay = effectiveMinTime - config.minTime;
          if (extraDelay > 0) {
            await new Promise(resolve => setTimeout(resolve, extraDelay));
          }
        }

        return fn();
      }
    );

    // Track wait time
    const waitTime = Date.now() - startTime;
    updateWaitTimeStats(key, waitTime);

    return result;
  } catch (error: any) {
    if (error.message?.includes('timed out')) {
      throw new Error(`Media rate limiter timeout for ${providerName}: Request waited too long in queue`);
    }
    throw error;
  }
}

/**
 * Get all media limiter statistics (filters limiters with 'media:' prefix)
 */
export function getAllMediaLimiterStats(): LimiterStats[] {
  return Array.from(limiterStats.values())
    .filter(s => s.provider.startsWith('media:'));
}

/**
 * Update wait time statistics
 */
function updateWaitTimeStats(provider: string, waitTime: number): void {
  const stats = limiterStats.get(provider);
  if (!stats) return;

  stats.waitTimeSamples.push(waitTime);

  // Keep last 100 samples
  if (stats.waitTimeSamples.length > 100) {
    stats.waitTimeSamples.shift();
  }

  // Calculate average
  stats.avgWaitTime = Math.round(
    stats.waitTimeSamples.reduce((a, b) => a + b, 0) / stats.waitTimeSamples.length
  );
}

/**
 * Get limiter statistics for a provider
 */
export function getLimiterStats(providerName: string): LimiterStats | null {
  return limiterStats.get(providerName.toLowerCase()) || null;
}

/**
 * Get all limiter statistics
 */
export function getAllLimiterStats(): LimiterStats[] {
  return Array.from(limiterStats.values());
}

/**
 * Get current counts from a limiter
 */
export async function getLimiterCounts(providerName: string): Promise<{
  running: number;
  queued: number;
  reservoir: number | null;
} | null> {
  const key = providerName.toLowerCase();
  const limiter = limiters.get(key);

  if (!limiter) {
    return null;
  }

  const counts = await limiter.counts();
  const reservoir = await limiter.currentReservoir();

  return {
    running: counts.EXECUTING || 0,
    queued: counts.QUEUED || 0,
    reservoir,
  };
}

/**
 * Get status of all limiters
 */
export async function getAllLimiterCounts(): Promise<Array<{
  provider: string;
  config: ProviderLimitConfig;
  counts: {
    running: number;
    queued: number;
    reservoir: number | null;
  };
  stats: LimiterStats | null;
}>> {
  const results = [];

  for (const [provider, limiter] of Array.from(limiters.entries())) {
    const counts = await limiter.counts();
    const reservoir = await limiter.currentReservoir();

    results.push({
      provider,
      config: getProviderLimitConfig(provider),
      counts: {
        running: counts.EXECUTING || 0,
        queued: counts.QUEUED || 0,
        reservoir,
      },
      stats: limiterStats.get(provider) || null,
    });
  }

  return results;
}

/**
 * Reset a provider's limiter (useful for testing or recovery)
 */
export async function resetLimiter(providerName: string): Promise<void> {
  const key = providerName.toLowerCase();
  const limiter = limiters.get(key);

  if (limiter) {
    await limiter.stop({ dropWaitingJobs: true });
    limiters.delete(key);
    limiterStats.delete(key);
    console.log(`[LLMRateLimiter] Reset limiter for ${key}`);
  }
}

/**
 * Clear all waiting jobs for a provider (emergency recovery)
 */
export async function clearWaitingJobs(providerName: string): Promise<number> {
  const key = providerName.toLowerCase();
  const limiter = limiters.get(key);

  if (!limiter) {
    return 0;
  }

  const counts = await limiter.counts();
  const waiting = counts.QUEUED || 0;

  if (waiting > 0) {
    await limiter.stop({ dropWaitingJobs: true });
    // Recreate the limiter
    limiters.delete(key);
    getProviderLimiter(key);
    console.log(`[LLMRateLimiter] Cleared ${waiting} waiting jobs for ${key}`);
  }

  return waiting;
}

/**
 * Graceful shutdown of all limiters
 */
export async function shutdownAllLimiters(): Promise<void> {
  console.log('[LLMRateLimiter] Shutting down all limiters...');

  const shutdownPromises = [];
  for (const [provider, limiter] of Array.from(limiters.entries())) {
    console.log(`[LLMRateLimiter] Stopping ${provider}...`);
    shutdownPromises.push(
      limiter.stop({ dropWaitingJobs: false }).then(() => {
        console.log(`[LLMRateLimiter] ${provider} stopped`);
      })
    );
  }

  await Promise.all(shutdownPromises);
  limiters.clear();
  limiterStats.clear();
  console.log('[LLMRateLimiter] All limiters shut down');
}

// Handle process shutdown
process.on('SIGTERM', async () => {
  await shutdownAllLimiters();
});

process.on('SIGINT', async () => {
  await shutdownAllLimiters();
});
