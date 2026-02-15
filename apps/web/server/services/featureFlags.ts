/**
 * Feature flag reader for Cloud Tasks migration.
 *
 * Reads flags from Redis with an env var fallback.
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
