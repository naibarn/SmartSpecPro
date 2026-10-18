import { describe, expect, it, vi } from "vitest";
import { CloudflareAiSearchEvaluationClient } from "../cloudflareAiSearchEvaluation";

const config = {
  accountId: "a".repeat(32),
  apiToken: "not-a-real-token",
  instanceId: "spec229-eval-profile-c-test",
};

function response(result: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({ success: true, result }),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

describe("CloudflareAiSearchEvaluationClient", () => {
  it("creates a private keyword-only trigram profile with the canonical metadata fields", async () => {
    const fetchImpl = vi.fn(async () => response({ id: config.instanceId }));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });

    await client.createKeywordOnlyInstance();

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/ai-search/namespaces/default/instances");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.index_method).toEqual({ vector: false, keyword: true });
    expect(body.embedding_model).toBe("@cf/baai/bge-m3");
    expect(body).not.toHaveProperty("fusion_method");
    expect(body.indexing_options).toEqual({ keyword_tokenizer: "trigram", use_ocr: false });
    expect(body.retrieval_options).toEqual({ keyword_match_mode: "or" });
    expect(body.cache).toBe(false);
    expect(body.rewrite_query).toBe(false);
    expect(body.reranking).toBe(false);
    expect(body.public_endpoint_params).toMatchObject({ enabled: false });
    expect(body.custom_metadata).toHaveLength(5);
  });

  it("uploads only repository evaluation content and returns the created item identity", async () => {
    const fetchImpl = vi.fn(async () => response({
      id: "item-1",
      key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
      status: "completed",
    }));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });
    const receipt = await client.uploadDocument({
      key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
      content: "Authorized repository fixture content",
      metadata: {
        acl_scope: "tenant_shared:spec229-repository",
        source_type: "library",
        source_id: "specs/example.md",
        source_revision: `sha256:${"b".repeat(64)}`,
        source_digest: "b".repeat(64),
      },
    });

    expect(receipt).toEqual({
      id: "item-1",
      key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
      status: "completed",
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/instances/spec229-eval-profile-c-test/items");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer not-a-real-token",
    });
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    const file = form.get("file") as File;
    expect(file.name).toBe("spec229-eval-bcbf0c7d4e0bdac0-example.md");
    expect(await file.text()).toBe("Authorized repository fixture content");
    expect(JSON.parse(String(form.get("metadata"))).source_type).toBe("library");
    expect(form.get("wait_for_completion")).toBe("true");
  });

  it("executes keyword-only search with fail-closed ACL filters", async () => {
    const fetchImpl = vi.fn(async () => response({
      chunks: [{
        id: "chunk-1",
        score: 0.91,
        text: "Repository result",
        item: {
          key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
          metadata: {
            acl_scope: "tenant_shared:spec229-repository",
            source_type: "library",
          },
        },
      }],
      search_query: "source query",
    }));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });

    const result = await client.searchKeyword("source query");

    expect(result.chunks).toHaveLength(1);
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(String(init?.body));
    expect(body.query).toBe("source query");
    expect(body.ai_search_options.retrieval).toMatchObject({
      retrieval_type: "keyword",
      keyword_match_mode: "or",
      max_num_results: 50,
      match_threshold: 0,
      filters: {
        acl_scope: "tenant_shared:spec229-repository",
      },
    });
    expect(body.ai_search_options.reranking.enabled).toBe(false);
    expect(body.ai_search_options.query_rewrite.enabled).toBe(false);
    expect(body.ai_search_options.cache.enabled).toBe(false);

    await client.searchKeyword("canary", 50, {
      tenantId: "repo-foreign-control",
      aclScope: "tenant_shared:foreign-control",
    });
    const [, scopedInit] = fetchImpl.mock.calls[1];
    const scopedBody = JSON.parse(String(scopedInit?.body));
    expect(scopedBody.ai_search_options.retrieval.filters).toEqual({
      acl_scope: "tenant_shared:foreign-control",
    });
  });

  it("creates the SPEC hybrid reranker profile with both indexes and pinned models", async () => {
    const fetchImpl = vi.fn(async () => response({ id: config.instanceId }));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });

    await client.createComparisonInstance("hybrid_reranker");

    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(body.index_method).toEqual({ vector: true, keyword: true });
    expect(body.fusion_method).toBe("rrf");
    expect(body.reranking).toBe(true);
    expect(body.reranking_model).toBe("@cf/baai/bge-reranker-base");
    expect(body.rewrite_query).toBe(false);
  });

  it("runs Profile H through the existing provider with ACL filters, rewrite context, and reviewed variants", async () => {
    const fetchImpl = vi.fn(async () => response({ chunks: [{
      id: "chunk-1",
      score: 0.9,
      text: "Repository result",
      item: {
        key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
        metadata: {
          acl_scope: "tenant_shared:spec229-repository",
          source_type: "library",
        },
      },
    }] }));
    const client = new CloudflareAiSearchEvaluationClient({
      ...config,
      namespace: "smartaihub-dev",
      fetchImpl,
    });

    const result = await client.searchComparison({
      query: "follow-up query",
      profile: "multi_query",
      messages: [
        { role: "user", content: "previous question" },
        { role: "assistant", content: "prior context" },
        { role: "user", content: "follow-up query" },
      ],
      multiQueryVariants: ["reviewed alternate query"],
    });

    expect(result.chunks).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstBody = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body));
    expect(firstBody.messages.at(-1)).toEqual({ role: "user", content: "follow-up query" });
    expect(firstBody.ai_search_options).toMatchObject({
      query_rewrite: { enabled: true },
      reranking: { enabled: true },
      retrieval: {
        retrieval_type: "hybrid",
        fusion_method: "rrf",
        filters: {
          acl_scope: { $in: ["tenant_shared:spec229-repository"] },
          source_type: { $in: ["library"] },
        },
      },
    });
  });

  it("rejects app indexes, unsafe item paths, oversized filter values and malformed chunks", async () => {
    const fetchImpl = vi.fn(async () => response({ chunks: [{ malformed: true }] }));
    expect(() => new CloudflareAiSearchEvaluationClient({
      ...config,
      instanceId: "app-library-index",
      fetchImpl,
    })).toThrow(/spec229-eval/);
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });
    await expect(client.uploadDocument({
      key: "spec229-eval-../outside.md",
      content: "x",
      metadata: {
        acl_scope: "tenant_shared:spec229-repository",
        source_type: "library",
        source_id: "outside.md",
        source_revision: `sha256:${"c".repeat(64)}`,
        source_digest: "c".repeat(64),
      },
    })).rejects.toThrow(/disposable prefix/);
    await expect(client.uploadDocument({
      key: "spec229-eval-long-scope.md",
      content: "x",
      metadata: {
        acl_scope: "x".repeat(65),
        source_type: "library",
        source_id: "long-scope.md",
        source_revision: `sha256:${"c".repeat(64)}`,
        source_digest: "c".repeat(64),
      },
    })).rejects.toThrow(/64 UTF-8 bytes/);
    await expect(client.searchKeyword("query")).rejects.toThrow(/malformed result/);
  });

  it("deletes only its named disposable instance", async () => {
    const fetchImpl = vi.fn(async () => response(null));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });
    await client.deleteInstance();
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/instances/spec229-eval-profile-c-test");
    expect(init?.method).toBe("DELETE");
  });
});
