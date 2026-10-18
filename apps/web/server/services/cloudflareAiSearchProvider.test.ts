import { describe, expect, it, vi } from "vitest";

import { CloudflareAiSearchProvider } from "./cloudflareAiSearchProvider";

const config = {
  accountId: "a".repeat(32),
  apiToken: "private-token",
};
const request = {
  namespace: "smartaihub-dev",
  instanceIds: ["tenant-pool-01-rag-v2"],
  tenantId: "tenant-a",
  authorizedAclScopes: ["tenant_shared:1234567890abcdef"],
  sourceClasses: ["library"],
  query: "approved query",
  retrievalType: "hybrid" as const,
  maxResults: 20,
};

function response(
  metadata = {
    tenant_id: "tenant-a",
    acl_scope: "tenant_shared:1234567890abcdef",
    source_type: "library",
  }
) {
  return new Response(
    JSON.stringify({
      success: true,
      result: {
        chunks: [
          {
            id: "chunk-a",
            score: 0.91,
            text: "provider candidate",
            instance_id: "tenant-pool-01-rag-v2",
            item: { key: "rag/tenant-a/library/item-a/r3/hash.md", metadata },
          },
        ],
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

describe("Cloudflare AI Search provider adapter", () => {
  it("uses the explicit route and applies tenant, ACL, and source filters before retrieval", async () => {
    const fetchImpl = vi.fn(async () => response());
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });

    const candidates = await provider.search(request);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      chunkId: "chunk-a",
      key: "rag/tenant-a/library/item-a/r3/hash.md",
      instanceId: "tenant-pool-01-rag-v2",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/namespaces/smartaihub-dev/search");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer private-token",
    });
    const body = JSON.parse(String(init?.body));
    expect(body.ai_search_options.retrieval).toMatchObject({
      instance_ids: ["tenant-pool-01-rag-v2"],
      retrieval_type: "hybrid",
      max_num_results: 20,
      match_threshold: 0,
      keyword_match_mode: "or",
      filters: {
        tenant_id: "tenant-a",
        acl_scope: { $in: ["tenant_shared:1234567890abcdef"] },
        source_type: { $in: ["library"] },
      },
    });
    expect(body.ai_search_options.cache.enabled).toBe(false);
    expect(body.ai_search_options.query_rewrite.enabled).toBe(false);
    expect(body.ai_search_options.reranking.enabled).toBe(false);
  });

  it("fails closed for missing scopes, oversized filter IDs and fanout beyond ten", async () => {
    const fetchImpl = vi.fn(async () => response());
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });
    await expect(
      provider.search({ ...request, authorizedAclScopes: [] })
    ).rejects.toThrow("AI_SEARCH_AUTHORIZED_ACL_SCOPES_REQUIRED");
    await expect(
      provider.search({
        ...request,
        authorizedAclScopes: ["x".repeat(65)],
      })
    ).rejects.toThrow("AI_SEARCH_FILTER_VALUE_INVALID:acl_scope");
    await expect(
      provider.search({
        ...request,
        instanceIds: Array.from({ length: 11 }, (_, index) => `route-${index}`),
      })
    ).rejects.toThrow("AI_SEARCH_INSTANCE_ROUTE_INVALID");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant, unshared ACL and unexpected source-class results", async () => {
    for (const metadata of [
      {
        tenant_id: "tenant-b",
        acl_scope: "tenant_shared:1234567890abcdef",
        source_type: "library",
      },
      {
        tenant_id: "tenant-a",
        acl_scope: "user_private:other",
        source_type: "library",
      },
      {
        tenant_id: "tenant-a",
        acl_scope: "tenant_shared:1234567890abcdef",
        source_type: "memory",
      },
    ]) {
      const provider = new CloudflareAiSearchProvider({
        ...config,
        fetchImpl: vi.fn(async () => response(metadata)),
      });
      await expect(provider.search(request)).rejects.toThrow(
        "AI_SEARCH_PROVIDER_RESULT_SCOPE_MISMATCH"
      );
    }
  });

  it("rejects candidate results outside the explicitly routed provider instances", async () => {
    const mismatched = response();
    const body = (await mismatched.json()) as {
      result: { chunks: Array<Record<string, unknown>> };
    };
    body.result.chunks[0].instance_id = "unrouted-instance";
    const provider = new CloudflareAiSearchProvider({
      ...config,
      fetchImpl: vi.fn(
        async () => new Response(JSON.stringify(body), { status: 200 })
      ),
    });
    await expect(provider.search(request)).rejects.toThrow(
      "AI_SEARCH_PROVIDER_RESULT_SCOPE_MISMATCH"
    );
  });

  it("does not echo provider bodies or secrets on errors", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: false,
            errors: [{ message: "private-token backend trace" }],
          }),
          { status: 403 }
        )
    );
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });
    await expect(provider.search(request)).rejects.toThrow(
      "AI_SEARCH_PROVIDER_REQUEST_FAILED:403"
    );
    await expect(provider.search(request)).rejects.not.toThrow("private-token");
  });
});
