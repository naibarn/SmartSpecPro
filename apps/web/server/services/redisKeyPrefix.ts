const REDIS_GLOB_CHARACTERS = /[*?\[\]\\]/;

/** Validate a configured Redis prefix before appending the SCAN MATCH wildcard. */
export function assertLiteralRedisPrefix(prefix: string, label = "Redis key prefix"): string {
  if (!prefix || REDIS_GLOB_CHARACTERS.test(prefix) || prefix.includes("\0")) {
    throw new Error(`${label} must be a non-empty literal prefix without Redis glob characters`);
  }
  return prefix;
}
