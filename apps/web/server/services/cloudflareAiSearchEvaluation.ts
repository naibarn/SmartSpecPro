import { CloudflareAiSearchProvider, type AiSearchProviderCandidate } from "./cloudflareAiSearchProvider";
import { getAiSearchComparisonOptions, type AiSearchComparisonProfile } from "./retrievalComparisonProfiles";

/**
 * Narrow Cloudflare AI Search REST client for SPEC-229 disposable evaluation
 * runs. Production retrieval must continue to enter through RetrievalBroker.
 */

export interface CloudflareAiSearchEvaluationConfig {
  accountId: string;
  apiToken: string;
  namespace?: string;
  instanceId: string;
  fetchImpl?: typeof fetch;
}

export interface AiSearchEvaluationDocument {
  key: string;
  content: string;
  metadata: {
    acl_scope: string;
    source_type: "library";
    source_id: string;
    source_revision: string;
    source_digest: string;
  };
}

export interface AiSearchEvaluationChunk {
  id: string;
  score: number;
  text: string;
  item: {
    key: string;
    metadata?: Record<string, unknown>;
    timestamp?: number;
  };
}

export interface AiSearchEvaluationSearchResult {
  chunks: AiSearchEvaluationChunk[];
  queryKind?: string;
  searchQuery?: string;
  usage?: Record<string, unknown>;
}

export interface AiSearchEvaluationItemReceipt {
  id: string;
  key: string;
  chunksCount?: number;
  status?: "queued" | "running" | "completed" | "error" | "skipped" | "outdated";
  error?: string;
}

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
  errors?: Array<{ code?: number; message?: string }>;
};

const API_BASE = "https://api.cloudflare.com/client/v4";
const EVAL_INSTANCE_PATTERN = /^spec229-eval-[a-z0-9-]{1,48}$/;
const EVAL_TENANT = "repo-development";
const EVAL_ACL_SCOPE = "tenant_shared:spec229-repository";
const MAX_FILTER_VALUE_BYTES = 64;

function assertShortFilterValue(field: string, value: string): void {
  if (Buffer.byteLength(value, "utf8") > MAX_FILTER_VALUE_BYTES) {
    throw new Error(`AI Search evaluation ${field} exceeds 64 UTF-8 bytes`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export class CloudflareAiSearchEvaluationClient {
  private readonly fetchImpl: typeof fetch;
  private readonly namespace: string;
  private readonly basePath: string;

  constructor(private readonly config: CloudflareAiSearchEvaluationConfig) {
    if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
      throw new Error("Cloudflare AI Search evaluation account ID is invalid");
    }
    if (!config.apiToken.trim()) {
      throw new Error("Cloudflare AI Search evaluation API token is required");
    }
    if (!EVAL_INSTANCE_PATTERN.test(config.instanceId)) {
      throw new Error(
        "AI Search evaluation instance must use the spec229-eval-* prefix"
      );
    }
    this.namespace = config.namespace?.trim() || "default";
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(this.namespace)) {
      throw new Error("Cloudflare AI Search namespace is invalid");
    }
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.basePath =
      `${API_BASE}/accounts/${encodeURIComponent(config.accountId)}` +
      `/ai-search/namespaces/${encodeURIComponent(this.namespace)}` +
      `/instances/${encodeURIComponent(config.instanceId)}`;
  }

  /**
   * Create the comparison instance only after the caller has asserted the
   * disposable non-production run flag. The instance has no public endpoint.
   */
  async createKeywordOnlyInstance(): Promise<void> {
    return this.createComparisonInstance("ai_search_bm25");
  }

  async createComparisonInstance(profile: AiSearchComparisonProfile): Promise<void> {
    const options = getAiSearchComparisonOptions(profile);
    const vector = options.retrievalType !== "keyword";
    const keyword = options.retrievalType !== "vector";
    await this.request("POST", "/instances", {
      id: this.config.instanceId,
      cache: false,
      custom_metadata: [
        { field_name: "acl_scope", data_type: "text" },
        { field_name: "source_type", data_type: "text" },
        { field_name: "source_id", data_type: "text" },
        { field_name: "source_revision", data_type: "text" },
        { field_name: "source_digest", data_type: "text" },
      ],
      embedding_model: "@cf/baai/bge-m3",
      index_method: { vector, keyword },
      ...(options.fusionMethod
        ? { fusion_method: options.fusionMethod }
        : {}),
      indexing_options: { keyword_tokenizer: "trigram", use_ocr: false },
      retrieval_options: { keyword_match_mode: "or" },
      chunk_size: 384,
      chunk_overlap: 15,
      rewrite_query: options.queryRewrite,
      reranking: options.reranking,
      reranking_model: "@cf/baai/bge-reranker-base",
      max_num_results: 50,
      score_threshold: 0,
      public_endpoint_params: {
        enabled: false,
        search_endpoint: { disabled: true },
        chat_completions_endpoint: { disabled: true },
        mcp: { disabled: true },
      },
    });
  }

  async uploadDocument(document: AiSearchEvaluationDocument): Promise<AiSearchEvaluationItemReceipt> {
    this.validateDocument(document);
    const form = new FormData();
    form.append(
      "file",
      new Blob([document.content], { type: "text/markdown; charset=utf-8" }),
      document.key,
    );
    form.append("metadata", JSON.stringify(document.metadata));
    form.append("wait_for_completion", "true");
    const response = await this.request<{
      id?: string;
      key?: string;
      chunks_count?: number | null;
      status?: AiSearchEvaluationItemReceipt["status"];
      error?: string;
    }>("POST", "/items", form);
    if (
      !response.id ||
      typeof response.id !== "string" ||
      !response.key ||
      typeof response.key !== "string"
    ) {
      throw new Error("AI Search upload returned no item identity or key");
    }
    return {
      id: response.id,
      key: response.key,
      ...(typeof response.chunks_count === "number"
        ? { chunksCount: response.chunks_count }
        : {}),
      ...(response.status ? { status: response.status } : {}),
      ...(response.error ? { error: response.error } : {}),
    };
  }

  async getItem(itemId: string): Promise<AiSearchEvaluationItemReceipt> {
    if (!itemId || itemId.includes("/")) {
      throw new Error("AI Search evaluation item ID is invalid");
    }
    const response = await this.request<{
      id?: string;
      key?: string;
      status?: AiSearchEvaluationItemReceipt["status"];
      error?: string;
    }>("GET", `/items/${encodeURIComponent(itemId)}`);
    if (
      !response.id ||
      typeof response.id !== "string" ||
      !response.key ||
      typeof response.key !== "string"
    ) {
      throw new Error("AI Search item lookup returned no item identity");
    }
    return {
      id: response.id,
      key: response.key,
      ...(response.status ? { status: response.status } : {}),
      ...(response.error ? { error: response.error } : {}),
    };
  }

  async searchKeyword(
    query: string,
    maxResults = 50,
    scope: { tenantId: string; aclScope: string } = SPEC229_AI_SEARCH_EVALUATION_SCOPE,
  ): Promise<AiSearchEvaluationSearchResult> {
    if (!query.trim()) throw new Error("AI Search query must not be empty");
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 50) {
      throw new Error("AI Search max results must be between 1 and 50");
    }
    assertShortFilterValue("tenant_id", scope.tenantId);
    assertShortFilterValue("acl_scope", scope.aclScope);
    if (!scope.tenantId || !scope.aclScope) {
      throw new Error("AI Search evaluation security scope must be explicit");
    }
    const result = await this.request<unknown>("POST", "/search", {
      query,
      ai_search_options: {
        cache: { enabled: false },
        query_rewrite: { enabled: false },
        reranking: { enabled: false, match_threshold: 0 },
        retrieval: {
          filters: { acl_scope: scope.aclScope },
          keyword_match_mode: "or",
          match_threshold: 0,
          max_num_results: maxResults,
          retrieval_type: "keyword",
        },
      },
    });
    if (!isRecord(result) || !Array.isArray(result.chunks)) {
      throw new Error("AI Search returned an invalid search result envelope");
    }
    const chunks = result.chunks.map((value): AiSearchEvaluationChunk => {
      if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        typeof value.score !== "number" ||
        !Number.isFinite(value.score) ||
        typeof value.text !== "string" ||
        !isRecord(value.item) ||
        typeof value.item.key !== "string"
      ) {
        throw new Error("AI Search returned a malformed result chunk");
      }
      return {
        id: value.id,
        score: value.score,
        text: value.text,
        item: {
          key: value.item.key,
          ...(isRecord(value.item.metadata)
            ? { metadata: value.item.metadata }
            : {}),
          ...(typeof value.item.timestamp === "number"
            ? { timestamp: value.item.timestamp }
            : {}),
        },
      };
    });
    return {
      chunks,
      ...(typeof result.query_kind === "string"
        ? { queryKind: result.query_kind }
        : {}),
      ...(typeof result.search_query === "string"
        ? { searchQuery: result.search_query }
        : {}),
      ...(isRecord(result.usage) ? { usage: result.usage } : {}),
    };
  }

  async searchComparison(input: {
    query: string;
    profile: AiSearchComparisonProfile;
    maxResults?: number;
    scope?: { tenantId: string; aclScope: string };
    messages?: Array<{ role: "user" | "assistant"; content: string }>;
    multiQueryVariants?: string[];
  }): Promise<AiSearchEvaluationSearchResult> {
    const scope = input.scope ?? SPEC229_AI_SEARCH_EVALUATION_SCOPE;
    const options = getAiSearchComparisonOptions(input.profile);
    const provider = new CloudflareAiSearchProvider({
      accountId: this.config.accountId,
      apiToken: this.config.apiToken,
      fetchImpl: this.fetchImpl,
    });
    const providerInput = {
      namespace: this.namespace,
      instanceIds: [this.config.instanceId],
      tenantId: scope.tenantId,
      authorizedAclScopes: [scope.aclScope],
      sourceClasses: ["library"],
      query: input.query,
      retrievalType: options.retrievalType,
      maxResults: input.maxResults ?? 50,
      keywordMatchMode: "or" as const,
      ...(options.fusionMethod ? { fusionMethod: options.fusionMethod } : {}),
      queryRewrite: options.queryRewrite,
      reranking: options.reranking,
      ...(input.messages ? { messages: input.messages } : {}),
    };
    const candidates = options.multiQuery
      ? await provider.searchMany({
          ...providerInput,
          queries: [input.query, ...(input.multiQueryVariants ?? [])],
        })
      : await provider.search(providerInput);
    return { chunks: candidates.map(toEvaluationChunk) };
  }

  async deleteItem(itemId: string): Promise<void> {
    if (!itemId || itemId.includes("/")) {
      throw new Error("AI Search evaluation item ID is invalid");
    }
    await this.request("DELETE", `/items/${encodeURIComponent(itemId)}`);
  }

  async deleteInstance(): Promise<void> {
    await this.request("DELETE", "");
  }

  private validateDocument(document: AiSearchEvaluationDocument): void {
    if (
      !document.key.startsWith("spec229-eval-") ||
      document.key.length > 128 ||
      document.key.includes("..") ||
      document.key.startsWith("/")
    ) {
      throw new Error("AI Search evaluation key is outside the disposable prefix");
    }
    if (!document.content.trim()) {
      throw new Error("AI Search evaluation document is empty");
    }
    assertShortFilterValue("acl_scope", document.metadata.acl_scope);
    if (
      !document.metadata.acl_scope ||
      document.metadata.source_type !== "library" ||
      !/^[a-f0-9]{64}$/.test(document.metadata.source_digest) ||
      !document.metadata.source_revision.startsWith("sha256:")
    ) {
      throw new Error("AI Search evaluation document provenance is invalid");
    }
  }

  private async request<T = unknown>(
    method: string,
    suffix: string,
    body?: Record<string, unknown> | FormData,
  ): Promise<T> {
    const url = suffix === "/instances"
      ? `${API_BASE}/accounts/${encodeURIComponent(this.config.accountId)}` +
        `/ai-search/namespaces/${encodeURIComponent(this.namespace)}${suffix}`
      : `${this.basePath}${suffix}`;
    const formUpload = body instanceof FormData;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        ...(body && !formUpload ? { "Content-Type": "application/json" } : {}),
      },
      ...(body
        ? { body: formUpload ? body : JSON.stringify(body) }
        : {}),
    };
    const response = await this.fetchImpl(url, init);
    let envelope: CloudflareEnvelope<T>;
    try {
      envelope = (await response.json()) as CloudflareEnvelope<T>;
    } catch {
      throw new Error(`Cloudflare AI Search request failed (${response.status})`);
    }
    if (!response.ok || envelope.success === false || envelope.result === undefined) {
      throw new Error(`Cloudflare AI Search request failed (${response.status})`);
    }
    return envelope.result;
  }
}

function toEvaluationChunk(candidate: AiSearchProviderCandidate): AiSearchEvaluationChunk {
  return {
    id: candidate.chunkId,
    score: candidate.fusionScore ?? candidate.score,
    text: candidate.text,
    item: {
      key: candidate.key,
      metadata: candidate.metadata,
      ...(candidate.timestamp === undefined ? {} : { timestamp: candidate.timestamp }),
    },
  };
}

export const SPEC229_AI_SEARCH_EVALUATION_SCOPE = {
  tenantId: EVAL_TENANT,
  aclScope: EVAL_ACL_SCOPE,
} as const;
