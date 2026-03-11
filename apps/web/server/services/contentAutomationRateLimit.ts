import { getRedisClient } from "./redis";

const HOURLY_INTERACTIVE_LIMIT = 10;
const HOURLY_BATCH_LIMIT = 50;
const CONCURRENT_LIMIT = 3;
const CONCURRENT_TTL = 600; // 10 min safety net
const DAILY_BATCH_LIMIT = 100;

function nextMidnightUtcTimestamp(): number {
  const now = new Date();
  const midnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0),
  );
  return Math.floor(midnight.getTime() / 1000);
}

export async function checkHourlyRate(
  userId: number,
  mode: "interactive" | "batch",
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const redis = getRedisClient();
  const key = `rate:auto_draft:${userId}`;
  const limit = mode === "interactive" ? HOURLY_INTERACTIVE_LIMIT : HOURLY_BATCH_LIMIT;

  const count = await redis.incr(key);
  // Set TTL only on first increment
  if (count === 1) {
    await redis.expire(key, 3600);
  }

  if (count > limit) {
    return { allowed: false, remaining: 0, resetIn: 3600 };
  }

  return { allowed: true, remaining: limit - count, resetIn: 3600 };
}

// Lua script for atomic check-and-increment semaphore.
// Returns 1 if slot acquired, 0 if at limit.
// KEYS[1] = semaphore key, ARGV[1] = max concurrent, ARGV[2] = TTL seconds
const ACQUIRE_SLOT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local count = redis.call('INCR', key)
if count == 1 then
  redis.call('EXPIRE', key, ttl)
end
if count > limit then
  redis.call('DECR', key)
  return 0
end
return 1
`;

export async function acquireConcurrentSlot(
  userId: number,
): Promise<{ allowed: boolean }> {
  const redis = getRedisClient();
  const key = `rate:concurrent_draft:${userId}`;
  const result = await redis.eval(
    ACQUIRE_SLOT_LUA,
    1,
    key,
    String(CONCURRENT_LIMIT),
    String(CONCURRENT_TTL),
  );
  return { allowed: result === 1 };
}

export async function releaseConcurrentSlot(userId: number): Promise<void> {
  const redis = getRedisClient();
  const key = `rate:concurrent_draft:${userId}`;

  const current = await redis.get(key);
  if (current !== null && parseInt(current, 10) > 0) {
    await redis.decr(key);
  }
}

export async function checkDailyBatchLimit(
  userId: number,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const redis = getRedisClient();
  const key = `daily:batch:${userId}`;

  const count = await redis.incr(key);
  // Set expiry to next midnight UTC only on first increment to avoid mid-day resets
  if (count === 1) {
    await redis.expireat(key, nextMidnightUtcTimestamp());
  }

  if (count > DAILY_BATCH_LIMIT) {
    return { allowed: false, used: count, limit: DAILY_BATCH_LIMIT };
  }

  return { allowed: true, used: count, limit: DAILY_BATCH_LIMIT };
}
