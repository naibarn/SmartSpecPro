/**
 * Split Redis adapter for Cloud Run deployment.
 *
 * - Cache client: stateless ops -- rate limiting, locks, dedup, flags.
 *   Priority: REDIS_UPSTASH_URL → REDIS_CLOUD_URL → REDIS_URL
 *   Supports Upstash (serverless), Redis Cloud Essentials, or local Redis.
 *
 * - Realtime client (Memorystore): connection-oriented ops -- pub/sub, concurrency sets.
 *   Connected via REDIS_MEMORYSTORE_URL. Uses IORedis with persistent TCP.
 *
 * For local development, both clients fall back to REDIS_URL (single Redis instance).
 */

import Redis from "ioredis";
import type { RedisOptions } from "ioredis";

// ─── Lazy singletons ────────────────────────────────────────────────────────

let _cacheClient: Redis | null = null;
let _realtimeClient: Redis | null = null;

// ─── URL resolution ─────────────────────────────────────────────────────────

function resolveCacheUrl(): string {
  const url =
    process.env.REDIS_UPSTASH_URL || process.env.REDIS_CLOUD_URL || process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "Redis cache not configured. Set REDIS_UPSTASH_URL, REDIS_CLOUD_URL (production) or REDIS_URL (local dev).",
    );
  }
  return url;
}

function resolveRealtimeUrl(): string {
  const url =
    process.env.REDIS_MEMORYSTORE_URL || process.env.REDIS_URL;
  if (!url) {
    throw new Error(
      "Redis realtime not configured. Set REDIS_MEMORYSTORE_URL (production) or REDIS_URL (local dev).",
    );
  }
  return url;
}

// ─── Cache client (Upstash / Redis Cloud / local Redis) ──────────────────────

const CACHE_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
};

/**
 * Get the cache Redis client (Upstash/Redis Cloud in production, local Redis in dev).
 * Used for: rate limiting, locks, dedup keys, feature flags.
 */
export function getCacheClient(): Redis {
  if (!_cacheClient) {
    const url = resolveCacheUrl();
    _cacheClient = new Redis(url, CACHE_OPTIONS);
  }
  return _cacheClient;
}

// ─── Realtime client (Memorystore or local Redis) ───────────────────────────

const REALTIME_OPTIONS: RedisOptions = {
  maxRetriesPerRequest: null, // Required for Bottleneck/BullMQ compatibility
  enableReadyCheck: true,
  retryStrategy: (times) => {
    if (times > 5) return null;
    return Math.min(times * 200, 2000);
  },
  lazyConnect: true,
};

/**
 * Get the realtime Redis client (Memorystore in production, local Redis in dev).
 * Used for: pub/sub, concurrency sets, Bottleneck state.
 */
export function getRealtimeClient(): Redis {
  if (!_realtimeClient) {
    const url = resolveRealtimeUrl();
    _realtimeClient = new Redis(url, REALTIME_OPTIONS);
  }
  return _realtimeClient;
}

/**
 * Create a duplicate IORedis connection for subscriber use cases.
 * Each subscriber needs its own connection since SUBSCRIBE blocks.
 */
export function createRealtimeSubscriber(): Redis {
  const url = resolveRealtimeUrl();
  return new Redis(url, {
    ...REALTIME_OPTIONS,
    maxRetriesPerRequest: 3,
  });
}

// ─── Health checks ──────────────────────────────────────────────────────────

export async function isCacheHealthy(): Promise<boolean> {
  try {
    if (!_cacheClient) return false;
    const result = await _cacheClient.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

export async function isRealtimeHealthy(): Promise<boolean> {
  try {
    if (!_realtimeClient) return false;
    const result = await _realtimeClient.ping();
    return result === "PONG";
  } catch {
    return false;
  }
}

// ─── Graceful shutdown ──────────────────────────────────────────────────────

export async function closeAllRedis(): Promise<void> {
  const promises: Promise<string>[] = [];
  if (_cacheClient) {
    promises.push(_cacheClient.quit());
    _cacheClient = null;
  }
  if (_realtimeClient) {
    promises.push(_realtimeClient.quit());
    _realtimeClient = null;
  }
  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}
