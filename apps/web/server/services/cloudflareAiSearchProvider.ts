import { Buffer } from "node:buffer";

const API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_FILTER_STRING_BYTES = 64;
const MAX_CUSTOM_METADATA_FIELDS = 5;
const ALLOWED_CUSTOM_METADATA_FIELDS = new Set([
  "acl_scope",
  "source_type",
  "project_id",
  "status",
  "language",
]);

export type AiSearchRetrievalType = "keyword" | "vector" | "hybrid";

export interface CloudflareAiSearchProviderConfig {
  accountId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

export interface AiSearchProviderCandidate {
  chunkId: string;
  score: number;
  fusionScore?: number;
  text: string;
  key: string;
  instanceId?: string;
  metadata: Record<string, unknown>;
  timestamp?: number;
}

export interface AiSearchProviderRequest {
  namespace: string;
  instanceIds: string[];
  tenantId: string;
  authorizedAclScopes: string[];
  sourceClasses: string[];
  query: string;
  messages?: Array<{ role: string; content: string }>;
  retrievalType: AiSearchRetrievalType;
  maxResults: number;
  keywordMatchMode?: "and" | "or";
  fusionMethod?: "max" | "rrf";
  queryRewrite?: boolean;
  reranking?: boolean;
}

export interface AiSearchProjectionItemInput {
  namespace: string;
  instanceId: string;
  key: string;
  content: string;
  metadata: {
    acl_scope: string;
    source_type: string;
    project_id?: string;
    status?: string;
    language?: string;
  };
}

export interface AiSearchProjectionItemReceipt {
  id: string;
  key: string;
  status?: string;
}

type CloudflareEnvelope<T> = {
  success?: boolean;
  result?: T;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function assertFilterValue(field: string, value: string): void {
  if (
    !value.trim() ||
    Buffer.byteLength(value, "utf8") > MAX_FILTER_STRING_BYTES
  ) {
    throw new Error(`AI_SEARCH_FILTER_VALUE_INVALID:${field}`);
  }
}

function validateProjectionMetadata(
  metadata: AiSearchProjectionItemInput["metadata"]
): void {
  const entries = Object.entries(metadata);
  if (
    entries.length < 2 ||
    entries.length > MAX_CUSTOM_METADATA_FIELDS ||
    entries.some(
      ([key, value]) =>
        !ALLOWED_CUSTOM_METADATA_FIELDS.has(key) ||
        typeof value !== "string" ||
        !value.trim()
    )
  ) {
    throw new Error("AI_SEARCH_PROJECTION_METADATA_INVALID");
  }
  assertFilterValue("acl_scope", metadata.acl_scope);
  assertFilterValue("source_type", metadata.source_type);
  for (const field of ["project_id", "status", "language"] as const) {
    const value = metadata[field];
    if (value !== undefined) assertFilterValue(field, value);
  }
}

function validateRequest(input: AiSearchProviderRequest): void {
  if (
    !new Set(["smartaihub-dev", "smartaihub-staging", "smartaihub-prod"]).has(
      input.namespace
    )
  ) {
    throw new Error("AI_SEARCH_NAMESPACE_INVALID");
  }
  if (
    !Array.isArray(input.instanceIds) ||
    input.instanceIds.length < 1 ||
    input.instanceIds.length > 10 ||
    new Set(input.instanceIds).size !== input.instanceIds.length ||
    input.instanceIds.some(id => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))
  ) {
    throw new Error("AI_SEARCH_INSTANCE_ROUTE_INVALID");
  }
  assertFilterValue("tenant_id", input.tenantId);
  if (
    !Array.isArray(input.authorizedAclScopes) ||
    !input.authorizedAclScopes.length
  ) {
    throw new Error("AI_SEARCH_AUTHORIZED_ACL_SCOPES_REQUIRED");
  }
  for (const scope of input.authorizedAclScopes)
    assertFilterValue("acl_scope", scope);
  if (!Array.isArray(input.sourceClasses) || !input.sourceClasses.length) {
    throw new Error("AI_SEARCH_SOURCE_CLASSES_REQUIRED");
  }
  for (const sourceClass of input.sourceClasses)
    assertFilterValue("source_type", sourceClass);
  if (!input.query.trim() || input.query.length > 10_000) {
    throw new Error("AI_SEARCH_QUERY_INVALID");
  }
  if (input.messages !== undefined && (
    !Array.isArray(input.messages) ||
    input.messages.length < 1 ||
    input.messages.length > 20 ||
    input.messages.some(message =>
      !message ||
      !["user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      !message.content.trim() ||
      message.content.length > 10_000
    )
  )) {
    throw new Error("AI_SEARCH_MESSAGES_INVALID");
  }
  if (input.queryRewrite && (
    !input.messages ||
    input.messages.length < 2 ||
    input.messages.at(-1)?.role !== "user" ||
    input.messages.at(-1)?.content !== input.query
  )) {
    throw new Error("AI_SEARCH_QUERY_REWRITE_REQUIRES_FOLLOWUP_MESSAGES");
  }
  if (
    !Number.isInteger(input.maxResults) ||
    input.maxResults < 1 ||
    input.maxResults > 50
  ) {
    throw new Error("AI_SEARCH_MAX_RESULTS_INVALID");
  }
}

/**
 * Provider adapter only. Route selection remains owned by PostgreSQL and
 * canonical content/authorization hydration remains owned by RetrievalBroker.
 */
export class CloudflareAiSearchProvider {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly config: CloudflareAiSearchProviderConfig) {
    if (!/^[a-f0-9]{32}$/i.test(config.accountId)) {
      throw new Error("AI_SEARCH_ACCOUNT_ID_INVALID");
    }
    if (!config.apiToken.trim())
      throw new Error("AI_SEARCH_API_TOKEN_REQUIRED");
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async search(
    input: AiSearchProviderRequest
  ): Promise<AiSearchProviderCandidate[]> {
    validateRequest(input);
    const url =
      `${API_BASE}/accounts/${encodeURIComponent(this.config.accountId)}` +
      `/ai-search/namespaces/${encodeURIComponent(input.namespace)}/search`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ...(input.queryRewrite && input.messages
          ? { messages: input.messages }
          : { query: input.query }),
        ai_search_options: {
          cache: { enabled: false },
          query_rewrite: { enabled: input.queryRewrite ?? false },
          reranking: { enabled: input.reranking ?? false },
          retrieval: {
            instance_ids: input.instanceIds,
            retrieval_type: input.retrievalType,
            max_num_results: input.maxResults,
            match_threshold: 0,
            keyword_match_mode: input.keywordMatchMode ?? "or",
            ...(input.fusionMethod
              ? { fusion_method: input.fusionMethod }
              : {}),
            filters: {
              // Every authorized ACL scope is tenant-hashed, so this keeps
              // tenant isolation without consuming a sixth custom metadata field.
              acl_scope: { $in: input.authorizedAclScopes },
              source_type: { $in: input.sourceClasses },
            },
          },
        },
      }),
    });

    let envelope: CloudflareEnvelope<unknown>;
    try {
      envelope = (await response.json()) as CloudflareEnvelope<unknown>;
    } catch {
      throw new Error(`AI_SEARCH_PROVIDER_REQUEST_FAILED:${response.status}`);
    }
    if (
      !response.ok ||
      envelope.success === false ||
      !isRecord(envelope.result)
    ) {
      throw new Error(`AI_SEARCH_PROVIDER_REQUEST_FAILED:${response.status}`);
    }
    const chunks = envelope.result.chunks;
    if (!Array.isArray(chunks))
      throw new Error("AI_SEARCH_PROVIDER_RESPONSE_INVALID");

    return chunks.map((chunk): AiSearchProviderCandidate => {
      if (
        !isRecord(chunk) ||
        typeof chunk.id !== "string" ||
        typeof chunk.score !== "number" ||
        !Number.isFinite(chunk.score) ||
        typeof chunk.text !== "string" ||
        !isRecord(chunk.item) ||
        typeof chunk.item.key !== "string" ||
        !isRecord(chunk.item.metadata)
      ) {
        throw new Error("AI_SEARCH_PROVIDER_RESPONSE_INVALID");
      }
      const metadata = chunk.item.metadata;
      const instanceId = chunk.instance_id;
      const aclScope = metadata.acl_scope;
      const sourceClass = metadata.source_type;
      if (
        (typeof instanceId === "string" &&
          !input.instanceIds.includes(instanceId)) ||
        typeof aclScope !== "string" ||
        !input.authorizedAclScopes.includes(aclScope) ||
        typeof sourceClass !== "string" ||
        !input.sourceClasses.includes(sourceClass)
      ) {
        throw new Error("AI_SEARCH_PROVIDER_RESULT_SCOPE_MISMATCH");
      }
      return {
        chunkId: chunk.id,
        score: chunk.score,
        text: chunk.text,
        key: chunk.item.key,
        ...(typeof instanceId === "string" ? { instanceId } : {}),
        metadata,
        ...(typeof chunk.item.timestamp === "number"
          ? { timestamp: chunk.item.timestamp }
          : {}),
      };
    });
  }

  /**
   * Run already-planned query variants through the same tenant/ACL filters and
   * fuse by reciprocal rank. Query generation remains owned by the Broker.
   */
  async searchMany(
    input: Omit<AiSearchProviderRequest, "query"> & { queries: string[] }
  ): Promise<AiSearchProviderCandidate[]> {
    if (
      !Array.isArray(input.queries) ||
      input.queries.length < 1 ||
      input.queries.length > 8 ||
      input.queries.some(query => typeof query !== "string" || !query.trim())
    ) {
      throw new Error("AI_SEARCH_MULTI_QUERY_INVALID");
    }
    const fused = new Map<
      string,
      { candidate: AiSearchProviderCandidate; score: number }
    >();
    for (const query of [...new Set(input.queries)]) {
      const messages = input.messages && input.queryRewrite
        ? [...input.messages.slice(0, -1), { ...input.messages.at(-1)!, content: query }]
        : input.messages;
      const candidates = await this.search({
        ...input,
        query,
        messages,
        fusionMethod: "rrf",
      });
      candidates.forEach((candidate, index) => {
        const key = `${candidate.instanceId ?? ""}:${candidate.key}:${candidate.chunkId}`;
        const rankScore = 1 / (60 + index + 1);
        const existing = fused.get(key);
        fused.set(key, {
          candidate: existing?.candidate ?? candidate,
          score: (existing?.score ?? 0) + rankScore,
        });
      });
    }
    return [...fused.values()]
      .sort((left, right) => right.score - left.score)
      .slice(0, input.maxResults)
      .map(({ candidate, score }) => ({ ...candidate, fusionScore: score }));
  }

  async upsertItem(
    input: AiSearchProjectionItemInput
  ): Promise<AiSearchProjectionItemReceipt> {
    this.validateNamespaceAndInstance(input.namespace, input.instanceId);
    if (
      !input.key.startsWith("rag/") ||
      input.key.length > 256 ||
      input.key.includes("..") ||
      input.key.startsWith("/")
    ) {
      throw new Error("AI_SEARCH_PROJECTION_KEY_INVALID");
    }
    const contentBytes = Buffer.byteLength(input.content, "utf8");
    if (contentBytes < 1 || contentBytes > 3_500_000) {
      throw new Error(
        contentBytes > 3_500_000
          ? "AI_SEARCH_PROJECTION_SPLIT_REQUIRED"
          : "AI_SEARCH_PROJECTION_CONTENT_EMPTY"
      );
    }
    validateProjectionMetadata(input.metadata);

    const url =
      `${API_BASE}/accounts/${encodeURIComponent(this.config.accountId)}` +
      `/ai-search/namespaces/${encodeURIComponent(input.namespace)}` +
      `/instances/${encodeURIComponent(input.instanceId)}/items`;
    const form = new FormData();
    form.append(
      "file",
      new Blob([input.content], { type: "text/markdown; charset=utf-8" }),
      input.key
    );
    form.append("metadata", JSON.stringify(input.metadata));
    form.append("wait_for_completion", "true");
    const result = await this.readResult<unknown>(
      await this.fetchImpl(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
        body: form,
      })
    );
    if (
      !isRecord(result) ||
      typeof result.id !== "string" ||
      typeof result.key !== "string" ||
      result.key !== input.key
    ) {
      throw new Error("AI_SEARCH_PROVIDER_UPLOAD_RESPONSE_INVALID");
    }
    return {
      id: result.id,
      key: result.key,
      ...(typeof result.status === "string" ? { status: result.status } : {}),
    };
  }

  async deleteItem(input: {
    namespace: string;
    instanceId: string;
    providerItemId: string;
  }): Promise<void> {
    this.validateNamespaceAndInstance(input.namespace, input.instanceId);
    if (!input.providerItemId.trim() || input.providerItemId.includes("/")) {
      throw new Error("AI_SEARCH_PROVIDER_ITEM_ID_INVALID");
    }
    const url =
      `${API_BASE}/accounts/${encodeURIComponent(this.config.accountId)}` +
      `/ai-search/namespaces/${encodeURIComponent(input.namespace)}` +
      `/instances/${encodeURIComponent(input.instanceId)}/items/${encodeURIComponent(input.providerItemId)}`;
    await this.readResult(
      await this.fetchImpl(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${this.config.apiToken}` },
      })
    );
  }

  private validateNamespaceAndInstance(
    namespace: string,
    instanceId: string
  ): void {
    if (
      !new Set(["smartaihub-dev", "smartaihub-staging", "smartaihub-prod"]).has(
        namespace
      )
    ) {
      throw new Error("AI_SEARCH_NAMESPACE_INVALID");
    }
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(instanceId)) {
      throw new Error("AI_SEARCH_INSTANCE_ROUTE_INVALID");
    }
  }

  private async readResult<T>(response: Response): Promise<T> {
    let envelope: CloudflareEnvelope<T>;
    try {
      envelope = (await response.json()) as CloudflareEnvelope<T>;
    } catch {
      throw new Error(`AI_SEARCH_PROVIDER_REQUEST_FAILED:${response.status}`);
    }
    if (
      !response.ok ||
      envelope.success === false ||
      envelope.result === undefined
    ) {
      throw new Error(`AI_SEARCH_PROVIDER_REQUEST_FAILED:${response.status}`);
    }
    return envelope.result;
  }
}
