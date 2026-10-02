import {
  acquireRateLimitSlot,
  consumeFixedWindow,
  consumeSlidingWindow,
  releaseRateLimitSlot,
} from "./postgresRateLimitStore";

const HOURLY_INTERACTIVE_LIMIT = 10;
const HOURLY_BATCH_LIMIT = 50;
const CONCURRENT_LIMIT = 3;
const CONCURRENT_TTL = 600;
const DAILY_BATCH_LIMIT = 100;

const activeSlotsByUser = new Map<number, string[]>();

function utcDayStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const midnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return Math.ceil((midnight.getTime() - now.getTime()) / 1000);
}

export async function checkHourlyRate(
  userId: number,
  mode: "interactive" | "batch",
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const limit = mode === "interactive" ? HOURLY_INTERACTIVE_LIMIT : HOURLY_BATCH_LIMIT;
  const result = await consumeSlidingWindow(`auto-draft-hourly-${mode}`, String(userId), limit, 3600);
  return { allowed: result.allowed, remaining: result.remaining, resetIn: result.retryAfterSeconds ?? 3600 };
}

export async function acquireConcurrentSlot(userId: number): Promise<{ allowed: boolean }> {
  const slotId = await acquireRateLimitSlot("auto-draft-concurrent", String(userId), CONCURRENT_LIMIT, CONCURRENT_TTL);
  if (!slotId) return { allowed: false };
  const slots = activeSlotsByUser.get(userId) ?? [];
  slots.push(slotId);
  activeSlotsByUser.set(userId, slots);
  return { allowed: true };
}

export async function releaseConcurrentSlot(userId: number): Promise<void> {
  const slots = activeSlotsByUser.get(userId);
  const slotId = slots?.pop();
  if (slots?.length === 0) activeSlotsByUser.delete(userId);
  if (slotId) await releaseRateLimitSlot(slotId);
}

export async function checkDailyBatchLimit(
  userId: number,
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const result = await consumeFixedWindow("auto-draft-daily-batch", String(userId), DAILY_BATCH_LIMIT, utcDayStart());
  return { allowed: result.allowed, used: result.used, limit: DAILY_BATCH_LIMIT };
}

export { secondsUntilUtcMidnight };
