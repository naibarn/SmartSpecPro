/**
 * Chat Memory Feature Flags
 *
 * Reads chat-memory rollout flags from system_settings with a small in-memory
 * cache so the memory pipeline can gate each step independently.
 */

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings } from "../../drizzle/schema";

export type ChatMemoryFlag =
  | "chat_archive_enabled"
  | "chat_fact_extraction_enabled"
  | "chat_chunk_index_enabled"
  | "chat_vector_memory_enabled"
  | "chat_smart_summarize_enabled";

export const CHAT_MEMORY_FLAG_DEFAULTS: Record<ChatMemoryFlag, boolean> = {
  chat_archive_enabled: true,
  chat_fact_extraction_enabled: false,
  chat_chunk_index_enabled: false,
  chat_vector_memory_enabled: false,
  chat_smart_summarize_enabled: false,
};

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: boolean; expiresAt: number }>();

const CHAT_MEMORY_FLAGS: ChatMemoryFlag[] = [
  "chat_archive_enabled",
  "chat_fact_extraction_enabled",
  "chat_chunk_index_enabled",
  "chat_vector_memory_enabled",
  "chat_smart_summarize_enabled",
];

function cacheKey(flag: ChatMemoryFlag, tenantId?: string): string {
  return `${tenantId ?? "global"}:${flag}`;
}

function parseBooleanSetting(value: string | null | undefined): boolean | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return null;
}

function readCached(flag: ChatMemoryFlag, tenantId?: string): boolean | null {
  const key = cacheKey(flag, tenantId);
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(flag: ChatMemoryFlag, tenantId: string | undefined, value: boolean): void {
  cache.set(cacheKey(flag, tenantId), {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function resolveFlagValue(
  rows: Array<{ key: string; value: string | null }>,
  flag: ChatMemoryFlag,
  tenantId?: string,
): boolean {
  const tenantKey = tenantId ? `tenant_${tenantId}_${flag}` : null;
  const tenantRow = tenantKey ? rows.find((row) => row.key === tenantKey) : undefined;
  const globalRow = rows.find((row) => row.key === flag);

  return (
    parseBooleanSetting(tenantRow?.value) ??
    parseBooleanSetting(globalRow?.value) ??
    CHAT_MEMORY_FLAG_DEFAULTS[flag]
  );
}

async function fetchFlagRows(tenantId?: string): Promise<Array<{ key: string; value: string | null }>> {
  const db = await getDb();
  if (!db) return [];

  const keys = tenantId
    ? CHAT_MEMORY_FLAGS.flatMap((flag) => [`tenant_${tenantId}_${flag}`, flag])
    : CHAT_MEMORY_FLAGS;

  return db
    .select({
      key: systemSettings.key,
      value: systemSettings.value,
    })
    .from(systemSettings)
    .where(and(eq(systemSettings.category, "feature_flags"), inArray(systemSettings.key, keys)));
}

export async function getChatMemoryFlag(
  flag: ChatMemoryFlag,
  tenantId?: string,
): Promise<boolean> {
  const cached = readCached(flag, tenantId);
  if (cached !== null) return cached;

  const db = await getDb();
  if (!db) {
    return CHAT_MEMORY_FLAG_DEFAULTS[flag];
  }

  const rows = await fetchFlagRows(tenantId);
  const value = resolveFlagValue(rows, flag, tenantId);
  writeCache(flag, tenantId, value);
  return value;
}

export async function getAllChatMemoryFlags(
  tenantId?: string,
): Promise<Record<ChatMemoryFlag, boolean>> {
  const result = { ...CHAT_MEMORY_FLAG_DEFAULTS };

  const db = await getDb();
  if (!db) {
    return result;
  }

  const rows = await fetchFlagRows(tenantId);
  for (const flag of CHAT_MEMORY_FLAGS) {
    const value = resolveFlagValue(rows, flag, tenantId);
    result[flag] = value;
    writeCache(flag, tenantId, value);
  }

  return result;
}

export function clearChatMemoryFlagCache(): void {
  cache.clear();
}
