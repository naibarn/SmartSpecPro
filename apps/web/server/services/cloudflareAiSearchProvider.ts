import { Buffer } from "node:buffer";

const API_BASE = "https://api.cloudflare.com/client/v4";
const MAX_FILTER_STRING_BYTES = 64;

export type AiSearchRetrievalType = "keyword" | "vector" | "hybrid";

export interface CloudflareAiSearchProviderConfig {
  accountId: string;
  apiToken: string;
  fetchImpl?: typeof fetch;
}

export interface AiSearchProviderCandidate {
  chunkId: string;
  score: number;
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
  retrievalType: AiSearchRetrievalType;
  maxResults: number;
  keywordMatchMode?: "and" | "or";
  fusionMethod?: "max" | "rrf";
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
        query: input.query,
        ai_search_options: {
          cache: { enabled: false },
          query_rewrite: { enabled: false },
          reranking: { enabled: false },
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
              tenant_id: input.tenantId,
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
      const tenantId = metadata.tenant_id;
      const aclScope = metadata.acl_scope;
      const sourceClass = metadata.source_type;
      if (
        tenantId !== input.tenantId ||
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
}
