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
  it("creates a private keyword-only trigram profile with the tenant filter fields", async () => {
    const fetchImpl = vi.fn(async () => response({ id: config.instanceId }));
    const client = new CloudflareAiSearchEvaluationClient({ ...config, fetchImpl });

    await client.createKeywordOnlyInstance();

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("/ai-search/namespaces/default/instances");
    expect(init?.method).toBe("POST");
    const body = JSON.parse(String(init?.body));
    expect(body.index_method).toEqual({ vector: false, keyword: true });
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
        tenant_id: "repo-development",
        acl_scope: "tenant_shared:spec229-repository",
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
    expect(JSON.parse(String(form.get("metadata"))).tenant_id).toBe("repo-development");
    expect(form.get("wait_for_completion")).toBe("true");
  });

  it("executes keyword-only search with fail-closed tenant and ACL filters", async () => {
    const fetchImpl = vi.fn(async () => response({
      chunks: [{
        id: "chunk-1",
        score: 0.91,
        text: "Repository result",
        item: {
          key: "spec229-eval-bcbf0c7d4e0bdac0-example.md",
          metadata: { tenant_id: "repo-development" },
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
        tenant_id: "repo-development",
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
      tenant_id: "repo-foreign-control",
      acl_scope: "tenant_shared:foreign-control",
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
        tenant_id: "repo-development",
        acl_scope: "tenant_shared:spec229-repository",
        source_id: "outside.md",
        source_revision: `sha256:${"c".repeat(64)}`,
        source_digest: "c".repeat(64),
      },
    })).rejects.toThrow(/disposable prefix/);
    await expect(client.uploadDocument({
      key: "spec229-eval-long-scope.md",
      content: "x",
      metadata: {
        tenant_id: "repo-development",
        acl_scope: "x".repeat(65),
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
