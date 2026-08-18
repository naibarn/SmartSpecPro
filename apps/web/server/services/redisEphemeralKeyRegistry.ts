import type Redis from "ioredis";
import { getCacheClient } from "./redisClients";

export class RedisEphemeralKeyRegistryError extends Error {
  readonly code = "redis_ephemeral_store_unavailable";
}

const MAX_KEY_BYTES = 512;
const MAX_VALUE_BYTES = 256 * 1024;

function assertBounds(key: string, ttlSeconds: number, value?: string): void {
  if (!key || Buffer.byteLength(key, "utf8") > MAX_KEY_BYTES || !Number.isInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > 30 * 24 * 60 * 60) {
    throw new RedisEphemeralKeyRegistryError("Redis ephemeral key or TTL is outside the policy bound");
  }
  if (value !== undefined && Buffer.byteLength(value, "utf8") > MAX_VALUE_BYTES) {
    throw new RedisEphemeralKeyRegistryError("Redis ephemeral value is outside the policy bound");
  }
}

function client(): Redis {
  // Ephemeral authorization state must never silently fall back to process
  // memory: a second web instance would otherwise observe a different login
  // or pairing state. Redis connection errors are deliberately propagated.
  return getCacheClient();
}

export async function setEphemeralJson<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== "string") throw new RedisEphemeralKeyRegistryError("Redis ephemeral value must be JSON serializable");
  assertBounds(key, ttlSeconds, serialized);
  try {
    await client().set(key, serialized, "EX", ttlSeconds);
  } catch (error) {
    throw new RedisEphemeralKeyRegistryError(error instanceof Error ? error.message : "Redis write failed");
  }
}

export async function getEphemeralJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await client().get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw new RedisEphemeralKeyRegistryError(error instanceof Error ? error.message : "Redis read failed");
  }
}

export async function setEphemeralText(key: string, value: string, ttlSeconds: number): Promise<void> {
  assertBounds(key, ttlSeconds, value);
  try {
    await client().set(key, value, "EX", ttlSeconds);
  } catch (error) {
    throw new RedisEphemeralKeyRegistryError(error instanceof Error ? error.message : "Redis write failed");
  }
}

export async function getEphemeralText(key: string): Promise<string | null> {
  try {
    return await client().get(key);
  } catch (error) {
    throw new RedisEphemeralKeyRegistryError(error instanceof Error ? error.message : "Redis read failed");
  }
}

export async function deleteEphemeralKeys(...keys: string[]): Promise<void> {
  if (!keys.length) return;
  try {
    await client().del(...keys);
  } catch (error) {
    throw new RedisEphemeralKeyRegistryError(error instanceof Error ? error.message : "Redis delete failed");
  }
}
