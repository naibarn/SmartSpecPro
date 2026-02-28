/**
 * Feature flags for Cloud Tasks migration.
 *
 * Reads/writes flags via Redis with an env var fallback for reads.
 */

import { getRedisClient } from "./redis";

/**
 * Read a feature flag value.
 *
 * Checks Redis key `feature-flag:{flagName}` first.
 * Falls back to process.env[flagName] if Redis is unavailable.
 * Returns false by default.
 */
export async function getFeatureFlag(flagName: string): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const value = await redis.get(`feature-flag:${flagName}`);
    if (value !== null) {
      return value === "true";
    }
  } catch {
    // Redis unavailable, fall through to env var
  }

  // Fallback to environment variable
  const envValue = process.env[flagName];
  if (envValue) {
    return envValue === "true";
  }

  return false;
}

/**
 * Write a feature flag value to Redis.
 *
 * Sets Redis key `feature-flag:{flagName}` to "true" or "false".
 * Throws if Redis is unavailable (caller should handle).
 */
export async function setFeatureFlag(
  flagName: string,
  value: boolean,
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(`feature-flag:${flagName}`, value ? "true" : "false");
}

/**
 * Read a tenant-scoped feature flag value.
 *
 * Checks Redis key `feature-flag:{flagName}:{tenantId}` first.
 * Falls back to the global flag if no tenant-specific override exists.
 */
export async function getTenantFeatureFlag(
  flagName: string,
  tenantId: string,
): Promise<boolean> {
  try {
    const redis = getRedisClient();
    const value = await redis.get(`feature-flag:${flagName}:${tenantId}`);
    if (value !== null) {
      return value === "true";
    }
  } catch {
    // Redis unavailable, fall through to global flag
  }

  // Fall back to global flag
  return getFeatureFlag(flagName);
}

/**
 * Write a tenant-scoped feature flag value to Redis.
 *
 * Sets Redis key `feature-flag:{flagName}:{tenantId}` to "true" or "false".
 */
export async function setTenantFeatureFlag(
  flagName: string,
  tenantId: string,
  value: boolean,
): Promise<void> {
  const redis = getRedisClient();
  await redis.set(
    `feature-flag:${flagName}:${tenantId}`,
    value ? "true" : "false",
  );
}
