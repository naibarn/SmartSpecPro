/**
 * Redis Connection Service
 *
 * Provides a singleton Redis connection for:
 * - BullMQ queues
 * - Bottleneck rate limiters
 * - Distributed state management
 */

import Redis, { RedisOptions } from 'ioredis';

// Environment configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_MAX_RETRIES = parseInt(process.env.REDIS_MAX_RETRIES || '3');

// Connection state
let redisClient: Redis | null = null;
let isConnected = false;
let connectionError: Error | null = null;

/**
 * Redis connection options
 */
const connectionOptions: RedisOptions = {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: true,
  retryStrategy: (times: number) => {
    if (times > REDIS_MAX_RETRIES) {
      console.error('[Redis] Max retries exceeded, giving up');
      return null; // Stop retrying
    }
    const delay = Math.min(times * 200, 2000);
    console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
    return delay;
  },
  password: REDIS_PASSWORD,
};

/**
 * Get the Redis client instance
 * Creates a new connection if one doesn't exist
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    console.log('[Redis] Creating new connection to:', REDIS_URL.replace(/\/\/.*@/, '//<credentials>@'));

    redisClient = new Redis(REDIS_URL, connectionOptions);

    redisClient.on('connect', () => {
      console.log('[Redis] Connected successfully');
      isConnected = true;
      connectionError = null;
    });

    redisClient.on('ready', () => {
      console.log('[Redis] Ready to accept commands');
    });

    redisClient.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
      connectionError = err;
      isConnected = false;
    });

    redisClient.on('close', () => {
      console.log('[Redis] Connection closed');
      isConnected = false;
    });

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });
  }

  return redisClient;
}

/**
 * Create a duplicate Redis connection
 * Useful for BullMQ which needs separate connections for queue and worker
 */
export function createRedisConnection(): Redis {
  return new Redis(REDIS_URL, connectionOptions);
}

/**
 * Check if Redis is connected and healthy
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    return pong === 'PONG';
  } catch (error) {
    return false;
  }
}

/**
 * Get Redis connection status
 */
export function getRedisStatus(): {
  connected: boolean;
  error: string | null;
  url: string;
} {
  return {
    connected: isConnected,
    error: connectionError?.message || null,
    url: REDIS_URL.replace(/\/\/.*@/, '//<credentials>@'), // Hide credentials
  };
}

/**
 * Graceful shutdown
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    console.log('[Redis] Closing connection...');
    await redisClient.quit();
    redisClient = null;
    isConnected = false;
    console.log('[Redis] Connection closed');
  }
}

/**
 * Check if Redis is available (for fallback logic)
 * Returns false if Redis is not configured or not connected
 */
export function isRedisAvailable(): boolean {
  if (!process.env.REDIS_URL) {
    return false;
  }
  return isConnected;
}

// Handle process shutdown
process.on('SIGTERM', async () => {
  await closeRedis();
});

process.on('SIGINT', async () => {
  await closeRedis();
});
