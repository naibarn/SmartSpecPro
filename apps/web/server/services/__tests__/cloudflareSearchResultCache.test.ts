import { afterEach, describe, expect, it, vi } from "vitest";
import { createCloudflareSearchResultCacheStore } from "../cloudflareSearchResultCache";

afterEach(() => vi.unstubAllEnvs());

describe("Cloudflare Search Result Cache adapter", () => {
  it("does not call a backend while disabled", async () => {
    const fetcher = vi.fn();
    const store = createCloudflareSearchResultCacheStore(async () => "disabled", fetcher as any);
    expect(await store.get("search_cache:tenant:t1:" + "a".repeat(64))).toBeNull();
    await store.setex("search_cache:tenant:t1:" + "a".repeat(64), 900, "{}");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("sends only the scoped KV request and treats Worker errors as miss/no-op", async () => {
    vi.stubEnv("CLOUDFLARE_RUNTIME_URL", "https://worker.example");
    vi.stubEnv("CLOUDFLARE_SEARCH_CACHE_TOKEN", "test-secret");
    const hash = "b".repeat(64);
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer test-secret" });
      return new Response(JSON.stringify({ entry: { queryHash: hash } }), { status: 200 });
    });
    const store = createCloudflareSearchResultCacheStore(async () => "cloudflare_kv", fetcher as any);
    expect(JSON.parse((await store.get(`search_cache:user:7:${hash}`))!)).toEqual({ queryHash: hash });
    expect(fetcher).toHaveBeenCalledWith("https://worker.example/internal/cache/search", expect.objectContaining({ method: "POST" }));
    const putStore = createCloudflareSearchResultCacheStore(async () => "cloudflare_kv", fetcher as any);
    await putStore.setex(`search_cache:tenant:tenant:alpha:${hash}`, 900, JSON.stringify({ queryHash: hash }));
    const sent = JSON.parse(String((fetcher.mock.calls[1]?.[1] as RequestInit).body));
    expect(sent).toMatchObject({ scope: "tenant", id: Buffer.from("tenant:alpha").toString("base64url"), queryHash: hash, ttlSeconds: 900 });

    const failed = createCloudflareSearchResultCacheStore(async () => "cloudflare_kv", vi.fn().mockRejectedValue(new Error("offline")) as any);
    expect(await failed.get(`search_cache:user:7:${hash}`)).toBeNull();
    await expect(failed.setex(`search_cache:user:7:${hash}`, 3600, "{}" )).resolves.toBeUndefined();
  });
});
