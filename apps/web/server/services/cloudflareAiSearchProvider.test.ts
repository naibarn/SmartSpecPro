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
const projectionItem = {
  namespace: "smartaihub-dev",
  instanceId: "tenant-pool-01-rag-v2",
  key: `rag/${"a".repeat(20)}/library_document/${"b".repeat(32)}/${"c".repeat(24)}/${"d".repeat(24)}/whole.md`,
  content: "canonical projection body",
  metadata: {
    acl_scope: "tenant_shared:1234567890abcdef",
    source_type: "library_document",
  },
};

function response(
  metadata = {
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
  it("uses the explicit route and applies opaque tenant-scoped ACL and source filters before retrieval", async () => {
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
    expect(body.ai_search_options.instance_ids).toEqual(["tenant-pool-01-rag-v2"]);
    expect(body.ai_search_options.retrieval).not.toHaveProperty("instance_ids");
    expect(body.ai_search_options.retrieval).toMatchObject({
      retrieval_type: "hybrid",
      max_num_results: 20,
      match_threshold: 0,
      keyword_match_mode: "or",
      filters: {
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

  it("rejects unshared tenant-scoped ACL and unexpected source-class results", async () => {
    for (const metadata of [
      {
        acl_scope: "tenant_shared:other-tenant-scope",
        source_type: "library",
      },
      {
        acl_scope: "user_private:other",
        source_type: "library",
      },
      {
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

  it("exposes explicit rerank/rewrite profiles and fuses bounded multi-query results", async () => {
    const fetchImpl = vi.fn(async () => response());
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });
    await provider.search({
      ...request,
      retrievalType: "vector",
      messages: [
        { role: "user", content: "original question" },
        { role: "assistant", content: "follow up context" },
        { role: "user", content: request.query },
      ],
      queryRewrite: true,
      reranking: true,
    });
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(firstBody.messages).toEqual([
      { role: "user", content: "original question" },
      { role: "assistant", content: "follow up context" },
      { role: "user", content: request.query },
    ]);
    expect(firstBody.query).toBeUndefined();
    expect(firstBody.ai_search_options).toMatchObject({
      query_rewrite: { enabled: true },
      reranking: { enabled: true },
      instance_ids: ["tenant-pool-01-rag-v2"],
      retrieval: { retrieval_type: "vector" },
    });

    const multiQuery = await provider.searchMany({
      ...request,
      messages: [
        { role: "user", content: "first question" },
        { role: "assistant", content: "first answer" },
        { role: "user", content: "variant one" },
      ],
      queryRewrite: true,
      queries: ["variant one", "variant two"],
    });
    expect(multiQuery).toHaveLength(1);
    expect(multiQuery[0].fusionScore).toBeCloseTo(1 / 61 + 1 / 61);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const lastBody = JSON.parse(String(fetchImpl.mock.calls[2][1]?.body));
    expect(lastBody.ai_search_options.retrieval.fusion_method).toBe("rrf");
    expect(lastBody.messages).toEqual([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "variant two" },
    ]);
    expect(lastBody.query).toBeUndefined();
    await expect(
      provider.searchMany({
        ...request,
        queries: Array.from({ length: 9 }, (_, index) => `variant-${index}`),
      })
    ).rejects.toThrow("AI_SEARCH_MULTI_QUERY_INVALID");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("fails closed when query rewrite lacks follow-up conversation messages", async () => {
    const fetchImpl = vi.fn(async () => response());
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });
    await expect(provider.search({ ...request, queryRewrite: true })).rejects.toThrow(
      "AI_SEARCH_QUERY_REWRITE_REQUIRES_FOLLOWUP_MESSAGES",
    );
    expect(fetchImpl).not.toHaveBeenCalled();
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

  it("uploads only bounded, provenance-bearing projection items to explicit instances", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: {
              id: "provider-item-1",
              key: projectionItem.key,
              status: "completed",
            },
          }),
          { status: 200 }
        )
    );
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });

    await expect(provider.upsertItem(projectionItem)).resolves.toEqual({
      id: "provider-item-1",
      key: projectionItem.key,
      status: "completed",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/instances/tenant-pool-01-rag-v2/items");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer private-token",
    });
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(JSON.parse(String(form.get("metadata")))).toMatchObject({
      acl_scope: "tenant_shared:1234567890abcdef",
      source_type: "library_document",
    });
    await expect(
      provider.upsertItem({
        ...projectionItem,
        content: "x".repeat(3_500_001),
      })
    ).rejects.toThrow("AI_SEARCH_PROJECTION_SPLIT_REQUIRED");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("accepts the five reserved metadata fields and rejects unsupported provenance fields", async () => {
    const fetchImpl = vi.fn();
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });

    fetchImpl.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          result: { id: "item-5-fields", key: projectionItem.key },
        }),
        { status: 200 }
      )
    );
    await expect(
      provider.upsertItem({
        ...projectionItem,
        metadata: {
          ...projectionItem.metadata,
          project_id: "project-a",
          status: "ready",
          language: "en",
        },
      })
    ).resolves.toMatchObject({ id: "item-5-fields" });
    await expect(
      provider.upsertItem({
        ...projectionItem,
        metadata: {
          ...projectionItem.metadata,
          source_revision: "revision-7",
        } as never,
      })
    ).rejects.toThrow("AI_SEARCH_PROJECTION_METADATA_INVALID");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("deletes only by explicit instance and opaque provider item identity", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            success: true,
            result: null,
          }),
          { status: 200 }
        )
    );
    const provider = new CloudflareAiSearchProvider({ ...config, fetchImpl });
    await expect(
      provider.deleteItem({
        namespace: "smartaihub-dev",
        instanceId: "tenant-pool-01-rag-v2",
        providerItemId: "provider-item-1",
      })
    ).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0][0]).toContain("/items/provider-item-1");
    await expect(
      provider.deleteItem({
        namespace: "smartaihub-dev",
        instanceId: "tenant-pool-01-rag-v2",
        providerItemId: "../other-tenant",
      })
    ).rejects.toThrow("AI_SEARCH_PROVIDER_ITEM_ID_INVALID");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
