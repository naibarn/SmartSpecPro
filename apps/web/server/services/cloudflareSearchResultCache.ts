import { eq, and } from "drizzle-orm";
import { systemSettings } from "../../drizzle/schema";
import { getDb } from "../db";
import type { SearchResultCacheStore } from "./searchResultCache";

let providerCache: { value: string; expiresAt: number } | null = null;
async function getProvider(): Promise<string> {
  if (providerCache && providerCache.expiresAt > Date.now()) return providerCache.value;
  try {
    const db = await getDb();
    if (!db) {
      providerCache = { value: "disabled", expiresAt: Date.now() + 5_000 };
      return "disabled";
    }
    const [row] = await db.select({ value: systemSettings.value }).from(systemSettings)
      .where(and(eq(systemSettings.category, "infrastructure"), eq(systemSettings.key, "search_result_cache_provider"))).limit(1);
    const value = row?.value === "cloudflare_kv" ? "cloudflare_kv" : "disabled";
    providerCache = { value, expiresAt: Date.now() + 5_000 };
    return value;
  } catch {
    providerCache = { value: "disabled", expiresAt: Date.now() + 5_000 };
    return "disabled";
  }
}

async function request(operation: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<any> {
  const baseUrl = process.env.CLOUDFLARE_RUNTIME_URL?.trim().replace(/\/$/, "");
  const token = process.env.CLOUDFLARE_SEARCH_CACHE_TOKEN?.trim();
  if (!baseUrl || !token) throw new Error("SEARCH_CACHE_NOT_CONFIGURED");
  const response = await fetcher(`${baseUrl}/internal/cache/search`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(operation),
    signal: AbortSignal.timeout(2_000),
  });
  if (!response.ok) throw new Error("SEARCH_CACHE_UNAVAILABLE");
  return response.json();
}

function encodeScopeId(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

/** Cache-only store: failures are misses/no-ops and never fall back to Redis. */
export function createCloudflareSearchResultCacheStore(
  provider: () => Promise<string>,
  fetcher: typeof fetch = fetch,
): SearchResultCacheStore {
  async function send(operation: Record<string, unknown>) {
    return request(operation, fetcher);
  }
  return {
  async get(key) {
    if (await provider() !== "cloudflare_kv") return null;
    const match = /^search_cache:(tenant|user):(.+):([a-f0-9]{64})$/.exec(key);
    if (!match) return null;
    try {
      const result = await send({ operation: "get", scope: match[1], id: encodeScopeId(match[2]), queryHash: match[3] });
      return result?.entry ? JSON.stringify(result.entry) : null;
    } catch { return null; }
  },
  async setex(key, ttlSeconds, value) {
    if (await provider() !== "cloudflare_kv") return;
    const match = /^search_cache:(tenant|user):(.+):([a-f0-9]{64})$/.exec(key);
    if (!match) return;
    try {
      await send({ operation: "put", scope: match[1], id: encodeScopeId(match[2]), queryHash: match[3], entry: JSON.parse(value), ttlSeconds });
    } catch { /* Disposable cache must never fail the model request. */ }
  },
  };
}

export const cloudflareSearchResultCacheStore = createCloudflareSearchResultCacheStore(getProvider);

export function refreshSearchResultCacheProvider(): void {
  providerCache = null;
}
