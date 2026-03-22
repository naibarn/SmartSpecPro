/**
 * Conversation Starter Cache
 *
 * Redis cache for agency conversation starter responses.
 * When cacheConversationStarters is enabled, first-turn LLM responses
 * matching a conversation starter are cached with 24h TTL.
 */

import { createHash } from "crypto";
import { getRedisClient } from "./redis";

/** Cache TTL in seconds (24 hours) */
const CACHE_TTL = 86400;

/** Redis key prefix for conversation starter caches */
const KEY_PREFIX = "agency:";
const KEY_INFIX = ":starter:";

/**
 * Generate a stable SHA-256 hash from prompt text for cache key.
 */
function promptHash(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex").slice(0, 16);
}

/**
 * Build the Redis key for a conversation starter cache entry.
 */
function cacheKey(agencyId: string, prompt: string): string {
  return `${KEY_PREFIX}${agencyId}${KEY_INFIX}${promptHash(prompt)}`;
}

/**
 * Retrieve a cached response for a conversation starter prompt.
 *
 * @returns The cached response string, or null on cache miss.
 */
export async function getCachedStarterResponse(
  agencyId: string,
  prompt: string,
): Promise<string | null> {
  try {
    const redis = getRedisClient();
    return await redis.get(cacheKey(agencyId, prompt));
  } catch {
    return null;
  }
}

/**
 * Cache a conversation starter response.
 *
 * @param agencyId - The agency ID
 * @param prompt - The conversation starter prompt text
 * @param response - The LLM response to cache
 */
export async function cacheStarterResponse(
  agencyId: string,
  prompt: string,
  response: string,
  cacheEnabled = true,
): Promise<void> {
  if (!cacheEnabled) return;
  try {
    const redis = getRedisClient();
    await redis.set(cacheKey(agencyId, prompt), response, "EX", CACHE_TTL);
  } catch {
    // Silently fail — caching is best-effort
  }
}

/**
 * Invalidate all conversation starter caches for an agency.
 * Uses SCAN + DEL to avoid blocking Redis with KEYS command.
 */
export async function invalidateStarterCache(agencyId: string): Promise<void> {
  try {
    const redis = getRedisClient();
    const pattern = `${KEY_PREFIX}${agencyId}${KEY_INFIX}*`;

    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    } while (cursor !== "0");
  } catch {
    // Silently fail — cache invalidation is best-effort
  }
}
