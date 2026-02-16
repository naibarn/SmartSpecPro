import type { PoolConfig } from "pg";

export type VectorProvider = "chromadb" | "pgvector" | "cloudflare_vectorize";
export type VectorOperation = "index" | "delete" | "search";
export type VectorErrorClassification = "transient" | "permanent";

export interface VectorMetadata {
  tenantId: string;
  type: string;
  createdAt: number;
  title: string;
  sourceUrl: string;
  description?: string;
}

export interface VectorEntry {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorSearchMatch {
  id: string;
  score: number;
  metadata: VectorMetadata;
}

export interface VectorProviderCapabilities {
  provider: VectorProvider;
  minTopK: number;
  maxTopK: number;
  supportsMetadataFilter: boolean;
  supportedDimensions: number[];
}

export interface VectorProviderConfig {
  provider?: string;
  currentReadProvider?: string;
  targetProvider?: string;
  mirrorWrites?: boolean;
  chromaPersistDir?: string;
  pgvectorHost?: string;
  pgvectorPort?: string;
  pgvectorDatabase?: string;
  pgvectorUser?: string;
  pgvectorPassword?: string;
  vectorizeAccountId?: string;
  vectorizeApiToken?: string;
}

export interface VectorProviderAdapter {
  capabilities: VectorProviderCapabilities;
  index(params: { indexName: string; vectors: VectorEntry[] }): Promise<{ count: number }>;
  delete(params: { indexName: string; ids: string[] }): Promise<{ count: number }>;
  search(params: {
    indexName: string;
    vector: number[];
    topK: number;
    filter?: Record<string, string | number | boolean>;
  }): Promise<{ matches: VectorSearchMatch[] }>;
}

export interface VectorProviderResolution {
  provider: VectorProvider;
  fallbackApplied: boolean;
}

const PROVIDER_CAPABILITIES: Record<VectorProvider, VectorProviderCapabilities> = {
  cloudflare_vectorize: {
    provider: "cloudflare_vectorize",
    minTopK: 1,
    maxTopK: 100,
    supportsMetadataFilter: true,
    supportedDimensions: [768],
  },
  pgvector: {
    provider: "pgvector",
    minTopK: 1,
    maxTopK: 1000,
    supportsMetadataFilter: true,
    supportedDimensions: [384, 768, 1024, 1536],
  },
  chromadb: {
    provider: "chromadb",
    minTopK: 1,
    maxTopK: 100,
    supportsMetadataFilter: true,
    supportedDimensions: [384, 768],
  },
};

const overrideAdapters: Partial<Record<VectorProvider, VectorProviderAdapter>> = {};

function isProvider(value: string | undefined | null): value is VectorProvider {
  return value === "cloudflare_vectorize" || value === "pgvector" || value === "chromadb";
}

function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("503") ||
    message.includes("429")
  );
}

export class VectorProviderError extends Error {
  readonly provider: VectorProvider;
  readonly classification: VectorErrorClassification;
  readonly code: string;

  constructor(params: {
    provider: VectorProvider;
    code: string;
    message: string;
    classification: VectorErrorClassification;
  }) {
    super(params.message);
    this.name = "VectorProviderError";
    this.provider = params.provider;
    this.code = params.code;
    this.classification = params.classification;
  }
}

function normalizeProviderError(provider: VectorProvider, code: string, error: unknown): VectorProviderError {
  if (error instanceof VectorProviderError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);
  return new VectorProviderError({
    provider,
    code,
    message,
    classification: isTransientError(error) ? "transient" : "permanent",
  });
}

function requireCloudflareConfig(config?: VectorProviderConfig): { accountId: string; apiToken: string } {
  const accountId = config?.vectorizeAccountId || process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken =
    config?.vectorizeApiToken || process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY;

  if (!accountId || !apiToken) {
    throw new VectorProviderError({
      provider: "cloudflare_vectorize",
      code: "missing_cloudflare_config",
      message: "Cloudflare Vectorize account or token is not configured",
      classification: "permanent",
    });
  }

  return { accountId, apiToken };
}

function createCloudflareVectorizeAdapter(config?: VectorProviderConfig): VectorProviderAdapter {
  return {
    capabilities: getProviderCapabilities("cloudflare_vectorize"),

    async index(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const ndjson = params.vectors.map((vector) => JSON.stringify(vector)).join("\n");
        const response = await fetch(`${baseUrl}/upsert`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/x-ndjson",
          },
          body: ndjson,
        });
        if (!response.ok) {
          throw new Error(`Vectorize upsert failed: ${response.status}`);
        }
        return { count: params.vectors.length };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "index_failed", error);
      }
    },

    async delete(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const response = await fetch(`${baseUrl}/delete-by-ids`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ ids: params.ids }),
        });
        if (!response.ok) {
          throw new Error(`Vectorize delete failed: ${response.status}`);
        }
        return { count: params.ids.length };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "delete_failed", error);
      }
    },

    async search(params) {
      const { accountId, apiToken } = requireCloudflareConfig(config);
      const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${params.indexName}`;
      try {
        const response = await fetch(`${baseUrl}/query`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            vector: params.vector,
            topK: params.topK,
            filter: params.filter,
            returnMetadata: true,
          }),
        });
        if (!response.ok) {
          throw new Error(`Vectorize query failed: ${response.status}`);
        }

        const data = (await response.json()) as {
          result?: {
            matches?: VectorSearchMatch[];
          };
        };

        return { matches: data.result?.matches || [] };
      } catch (error) {
        throw normalizeProviderError("cloudflare_vectorize", "search_failed", error);
      }
    },
  };
}

function getPgVectorPoolConfig(config?: VectorProviderConfig): PoolConfig {
  const host = config?.pgvectorHost;
  const database = config?.pgvectorDatabase;
  if (!host || !database) {
    throw new VectorProviderError({
      provider: "pgvector",
      code: "missing_pgvector_config",
      message: "pgvector host/database is not configured",
      classification: "permanent",
    });
  }

  return {
    host,
    port: Number(config?.pgvectorPort || "5432"),
    database,
    user: config?.pgvectorUser,
    password: config?.pgvectorPassword,
  };
}

function createPgVectorAdapter(config?: VectorProviderConfig): VectorProviderAdapter {
  const unsupported = async (code: string) => {
    try {
      // Validate config eagerly so callers get deterministic errors.
      getPgVectorPoolConfig(config);
      throw new Error("Node pgvector adapter requires dedicated SQL schema wiring");
    } catch (error) {
      throw normalizeProviderError("pgvector", code, error);
    }
  };

  return {
    capabilities: getProviderCapabilities("pgvector"),
    index: () => unsupported("index_not_supported"),
    delete: () => unsupported("delete_not_supported"),
    search: () => unsupported("search_not_supported"),
  };
}

function createChromaAdapter(): VectorProviderAdapter {
  const unsupported = async (code: string) => {
    throw new VectorProviderError({
      provider: "chromadb",
      code,
      message: "Node Chroma adapter is not configured in this runtime",
      classification: "permanent",
    });
  };

  return {
    capabilities: getProviderCapabilities("chromadb"),
    index: () => unsupported("index_not_supported"),
    delete: () => unsupported("delete_not_supported"),
    search: () => unsupported("search_not_supported"),
  };
}

function createDefaultAdapter(provider: VectorProvider, config?: VectorProviderConfig): VectorProviderAdapter {
  if (provider === "cloudflare_vectorize") {
    return createCloudflareVectorizeAdapter(config);
  }
  if (provider === "pgvector") {
    return createPgVectorAdapter(config);
  }
  return createChromaAdapter();
}

export function getProviderCapabilities(provider: VectorProvider): VectorProviderCapabilities {
  return PROVIDER_CAPABILITIES[provider];
}

export function resolveVectorProvider(
  operation: VectorOperation,
  config: VectorProviderConfig | undefined,
): VectorProviderResolution {
  const defaultProvider: VectorProvider = "cloudflare_vectorize";
  const configuredProvider = isProvider(config?.provider) ? config?.provider : undefined;
  const readProvider = isProvider(config?.currentReadProvider) ? config?.currentReadProvider : undefined;
  const writeProvider = isProvider(config?.targetProvider) ? config?.targetProvider : undefined;

  let provider: VectorProvider;
  if (operation === "search") {
    provider = readProvider || configuredProvider || defaultProvider;
  } else {
    provider = writeProvider || configuredProvider || defaultProvider;
  }

  const fallbackApplied =
    !configuredProvider && !readProvider && !writeProvider;

  return {
    provider,
    fallbackApplied,
  };
}

export function validateProviderCapabilityRequest(params: {
  capabilities: VectorProviderCapabilities;
  request: {
    topK?: number;
    dimension?: number;
    filter?: Record<string, string | number | boolean>;
  };
}): void {
  const { capabilities, request } = params;

  if (request.topK !== undefined) {
    if (request.topK < capabilities.minTopK || request.topK > capabilities.maxTopK) {
      throw new VectorProviderError({
        provider: capabilities.provider,
        code: "topk_out_of_range",
        message: `Requested topK ${request.topK} is outside supported range ${capabilities.minTopK}-${capabilities.maxTopK}`,
        classification: "permanent",
      });
    }
  }

  if (request.dimension !== undefined && !capabilities.supportedDimensions.includes(request.dimension)) {
    throw new VectorProviderError({
      provider: capabilities.provider,
      code: "unsupported_dimension",
      message: `Dimension ${request.dimension} is not supported by ${capabilities.provider}`,
      classification: "permanent",
    });
  }

  if (request.filter && Object.keys(request.filter).length > 0 && !capabilities.supportsMetadataFilter) {
    throw new VectorProviderError({
      provider: capabilities.provider,
      code: "metadata_filter_unsupported",
      message: `${capabilities.provider} does not support metadata filters`,
      classification: "permanent",
    });
  }
}

export function registerVectorProviderAdapter(provider: VectorProvider, adapter: VectorProviderAdapter): void {
  overrideAdapters[provider] = adapter;
}

export function resetVectorProviderAdapterRegistry(): void {
  delete overrideAdapters.chromadb;
  delete overrideAdapters.pgvector;
  delete overrideAdapters.cloudflare_vectorize;
}

function getAdapter(provider: VectorProvider, config?: VectorProviderConfig): VectorProviderAdapter {
  return overrideAdapters[provider] || createDefaultAdapter(provider, config);
}

export function createVectorProviderAdapter(
  provider: VectorProvider,
  config?: VectorProviderConfig,
): VectorProviderAdapter {
  return createDefaultAdapter(provider, config);
}

export async function dispatchVectorOperation(params:
  | {
      operation: "index";
      indexName: string;
      vectors: VectorEntry[];
      providerConfig?: VectorProviderConfig;
    }
  | {
      operation: "delete";
      indexName: string;
      ids: string[];
      providerConfig?: VectorProviderConfig;
    }
  | {
      operation: "search";
      indexName: string;
      vector: number[];
      topK: number;
      filter?: Record<string, string | number | boolean>;
      providerConfig?: VectorProviderConfig;
    },
): Promise<{ count: number } | { matches: VectorSearchMatch[] }> {
  const resolved = resolveVectorProvider(params.operation, params.providerConfig);
  const adapter = getAdapter(resolved.provider, params.providerConfig);

  if (params.operation === "index") {
    const dimension = params.vectors[0]?.values.length;
    validateProviderCapabilityRequest({
      capabilities: adapter.capabilities,
      request: { dimension },
    });
    return adapter.index({ indexName: params.indexName, vectors: params.vectors });
  }

  if (params.operation === "delete") {
    return adapter.delete({ indexName: params.indexName, ids: params.ids });
  }

  validateProviderCapabilityRequest({
    capabilities: adapter.capabilities,
    request: {
      topK: params.topK,
      dimension: params.vector.length,
      filter: params.filter,
    },
  });

  return adapter.search({
    indexName: params.indexName,
    vector: params.vector,
    topK: params.topK,
    filter: params.filter,
  });
}

export function getVectorProviderConfigFromEnv(): VectorProviderConfig {
  return {
    provider: process.env.VECTORDB_PROVIDER,
    currentReadProvider: process.env.VECTORDB_CURRENT_READ_PROVIDER,
    targetProvider: process.env.VECTORDB_TARGET_PROVIDER,
    mirrorWrites: ["1", "true", "yes", "on"].includes((process.env.VECTORDB_MIRROR_WRITES || "").toLowerCase()),
    chromaPersistDir: process.env.CHROMA_PERSIST_DIR,
    pgvectorHost: process.env.PGVECTOR_HOST,
    pgvectorPort: process.env.PGVECTOR_PORT,
    pgvectorDatabase: process.env.PGVECTOR_DATABASE,
    pgvectorUser: process.env.PGVECTOR_USER,
    pgvectorPassword: process.env.PGVECTOR_PASSWORD,
    vectorizeAccountId: process.env.CLOUDFLARE_ACCOUNT_ID,
    vectorizeApiToken: process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY,
  };
}
