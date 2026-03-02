/**
 * Redis-based semaphore for cross-process concurrency limiting.
 *
 * Used by: voice gateway (1/user), browser tool (1/user, 2/tenant),
 * cross-agency calls (2 concurrent), widget visitor caps.
 *
 * Pattern: atomic Lua INCR+EXPIRE, check against max, DECR on release.
 * TTL acts as safety net — if the process crashes without releasing,
 * the key expires and the slot becomes available.
 */

import type Redis from "ioredis";

export interface SemaphoreHandle {
  /** Release the acquired slot. Safe to call multiple times. */
  release(): Promise<void>;
}

/**
 * Lua script for atomic INCR + conditional EXPIRE.
 *
 * Atomically increments the counter and, on the very first increment,
 * sets the TTL in the same round-trip. This eliminates the window where
 * a process crash after INCR but before EXPIRE would leave a stuck key.
 *
 * Returns the new counter value after increment.
 */
const INCR_WITH_TTL_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return current
`;

/**
 * Lua script for atomic DECR-if-EXISTS.
 *
 * Prevents the TOCTOU race between EXISTS and DECR that would create a
 * key at value -1 if the TTL expires between the two round-trips.
 */
const DECR_IF_EXISTS_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('DECR', KEYS[1])
end
`;

/**
 * Try to acquire a semaphore slot.
 *
 * Uses an atomic Lua script (INCR + conditional EXPIRE) so the
 * crash-recovery TTL is always set on the first acquisition.
 * If INCR puts us over capacity, we DECR immediately and return null.
 *
 * @returns SemaphoreHandle if acquired, null if at capacity.
 */
export async function acquireSemaphore(
  redis: Redis,
  key: string,
  maxSlots: number,
  ttlSeconds: number,
): Promise<SemaphoreHandle | null> {
  // eval(script, numkeys, key, arg1)
  const current = (await (redis as Redis & {
    eval(...args: unknown[]): Promise<unknown>;
  }).eval(INCR_WITH_TTL_SCRIPT, 1, key, String(ttlSeconds))) as number;

  if (current > maxSlots) {
    await redis.decr(key);
    return null;
  }

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      // Atomic: only decrement if key still exists (prevents key at -1 on TTL expiry).
      // Single Lua round-trip eliminates the TOCTOU race between EXISTS and DECR.
      await (redis as Redis & { eval(...args: unknown[]): Promise<unknown> }).eval(
        DECR_IF_EXISTS_SCRIPT,
        1,
        key,
      );
    },
  };
}

/**
 * Check current semaphore count without acquiring a slot.
 */
export async function getSemaphoreCount(
  redis: Redis,
  key: string,
): Promise<number> {
  const value = await redis.get(key);
  if (!value) return 0;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? 0 : parsed;
}
