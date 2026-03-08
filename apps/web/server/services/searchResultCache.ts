/**
 * Two-tier Redis-based cache for web search results from the Responses API.
 *
 * Tier 1: Tenant-shared cache (key includes tenantId + normalized query hash)
 * Tier 2: Per-user cache (key includes userId + query hash + optional context)
 *
 * Freshness detection bypasses cache when users need current data.
 */

import crypto from "crypto";
import type { Redis } from "ioredis";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const TENANT_CACHE_TTL_SECONDS = 15 * 60; // 15 minutes
export const USER_CACHE_TTL_SECONDS = 60 * 60; // 60 minutes
export const DEFAULT_MAX_SEARCH_CALLS_PER_REQUEST = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CachedSearchResult {
  snippets: Array<{ title: string; url: string; text: string }>;
  citations: Array<{ url: string; title?: string }>;
  retrievedAt: string; // ISO timestamp
  queryHash: string; // for debugging/audit
}

// ---------------------------------------------------------------------------
// Query Normalization
// ---------------------------------------------------------------------------

/**
 * Normalize a search query for cache key generation.
 * Steps: lowercase, strip extra whitespace, remove punctuation (preserving
 * Thai and other Unicode letters), sort words, then SHA-256 hash.
 */
export function normalizeSearchQuery(query: string): string {
  const normalized = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "") // Remove non-letter, non-digit, non-space (Unicode-aware)
    .replace(/\s+/g, " ") // Collapse whitespace
    .trim()
    .split(" ")
    .sort()
    .join(" ");

  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// ---------------------------------------------------------------------------
// Freshness Detection
// ---------------------------------------------------------------------------

const FRESHNESS_KEYWORDS = [
  // English
  "latest",
  "today",
  "current price",
  "now",
  "real-time",
  "realtime",
  "live",
  "up to date",
  "most recent",
  "breaking",
  // Thai
  "ล่าสุด",
  "วันนี้",
  "ราคาปัจจุบัน",
  "ตอนนี้",
  "ข่าวด่วน",
];

const FRESHNESS_REGEX = new RegExp(
  FRESHNESS_KEYWORDS.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"),
  "i",
);

/**
 * Check if a prompt requires fresh (non-cached) data.
 * Returns true if cache should be bypassed.
 */
export function requiresFreshData(prompt: string): boolean {
  return FRESHNESS_REGEX.test(prompt);
}

// ---------------------------------------------------------------------------
// SearchResultCache
// ---------------------------------------------------------------------------

export class SearchResultCache {
  constructor(private redis: Redis) {}

  /** Look up tenant-shared cache. Returns null on miss. */
  async getTenantCache(
    tenantId: number | string,
    query: string,
  ): Promise<CachedSearchResult | null> {
    const hash = normalizeSearchQuery(query);
    const key = `search_cache:tenant:${tenantId}:${hash}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedSearchResult;
    } catch {
      return null;
    }
  }

  /** Store result in tenant-shared cache. */
  async setTenantCache(
    tenantId: number | string,
    query: string,
    result: CachedSearchResult,
  ): Promise<void> {
    const hash = normalizeSearchQuery(query);
    const key = `search_cache:tenant:${tenantId}:${hash}`;
    await this.redis.setex(key, TENANT_CACHE_TTL_SECONDS, JSON.stringify(result));
  }

  /** Look up per-user cache. Returns null on miss. */
  async getUserCache(
    userId: number,
    query: string,
    context?: string,
  ): Promise<CachedSearchResult | null> {
    const queryWithContext = context ? `${query}|||${context}` : query;
    const hash = normalizeSearchQuery(queryWithContext);
    const key = `search_cache:user:${userId}:${hash}`;
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as CachedSearchResult;
    } catch {
      return null;
    }
  }

  /** Store result in per-user cache. */
  async setUserCache(
    userId: number,
    query: string,
    result: CachedSearchResult,
    context?: string,
  ): Promise<void> {
    const queryWithContext = context ? `${query}|||${context}` : query;
    const hash = normalizeSearchQuery(queryWithContext);
    const key = `search_cache:user:${userId}:${hash}`;
    await this.redis.setex(key, USER_CACHE_TTL_SECONDS, JSON.stringify(result));
  }

  /** Check both tiers: user cache first, then tenant cache. */
  async get(
    userId: number,
    tenantId: number | string,
    query: string,
    context?: string,
  ): Promise<CachedSearchResult | null> {
    // Tier 2: per-user (more specific)
    const userResult = await this.getUserCache(userId, query, context);
    if (userResult) return userResult;

    // Tier 1: tenant-shared
    return this.getTenantCache(tenantId, query);
  }
}

