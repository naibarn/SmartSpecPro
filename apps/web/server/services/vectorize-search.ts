/**
 * Search functions for querying Vectorize indexes.
 *
 * Used by the search tRPC router to provide semantic search
 * over documents and images with tenant isolation.
 */
import {
  generateEmbedding,
  generateImageDescriptionFromBuffer,
} from "./vectorize";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
  type VectorSearchMatch,
  type VectorProviderConfig,
} from "./vectorProvider";
import { vectorizeNamespaceForTenant } from "./vectorizeContract";

const MIN_RELEVANCE_SCORE = 0.5;
const MAX_VECTORIZE_SEARCH_TOP_K = 50;

function resolveKnowledgeIndex(config: VectorProviderConfig): string {
  return (
    config.vectorizeKnowledgeIndexName?.trim() ||
    config.vectorizeIndexName?.trim() ||
    process.env.VECTORIZE_KNOWLEDGE_INDEX?.trim() ||
    process.env.VECTORIZE_LIBRARY_INDEX?.trim() ||
    "smartaihub-knowledge-v1"
  );
}

function resolveMediaIndex(config: VectorProviderConfig): string {
  return (
    config.vectorizeMediaIndexName?.trim() ||
    process.env.VECTORIZE_MEDIA_INDEX?.trim() ||
    "smartaihub-media-v1"
  );
}

function boundedTopK(limit: number): number {
  return Math.min(
    Math.max(Number.isFinite(limit) ? Math.floor(limit) : 1, 1),
    MAX_VECTORIZE_SEARCH_TOP_K
  );
}

export interface DocSearchResult {
  id: string;
  score: number;
  title: string;
  type: string;
  sourceUrl: string;
  createdAt: number;
}

export interface ImageSearchResult {
  id: string;
  score: number;
  imageUrl: string;
  filename: string;
  description: string;
  createdAt: number;
}

/**
 * Search documents by semantic similarity with tenant isolation.
 */
export async function searchDocs(params: {
  query: string;
  tenantId: string;
  type?: string;
  limit: number;
}): Promise<DocSearchResult[]> {
  if (!params.query) return [];

  try {
    const queryEmbedding = await generateEmbedding(params.query);

    const filter: Record<string, string> = { tenantId: params.tenantId };
    if (params.type) filter.type = params.type;
    const providerConfig = await getEffectiveVectorProviderConfig({
      tenantId: params.tenantId,
    });
    const indexName = resolveKnowledgeIndex(providerConfig);
    const namespace = vectorizeNamespaceForTenant(params.tenantId);

    const result = await dispatchVectorOperation({
      operation: "search",
      indexName,
      vector: queryEmbedding,
      topK: boundedTopK(params.limit),
      filter,
      namespace,
      providerConfig,
    });
    const matches = (result as { matches: VectorSearchMatch[] }).matches;

    return matches
      .filter(match => match.score >= MIN_RELEVANCE_SCORE)
      .map(match => ({
        id:
          typeof match.metadata.sourceId === "string" && match.metadata.sourceId
            ? match.metadata.sourceId
            : match.id,
        score: match.score,
        title: match.metadata.title,
        type: match.metadata.type,
        sourceUrl: match.metadata.sourceUrl,
        createdAt: match.metadata.createdAt,
      }));
  } catch {
    // Graceful degradation: return empty results if Vectorize is unavailable
    return [];
  }
}

/**
 * Search images by semantic similarity with tenant isolation.
 */
export async function searchImages(params: {
  query: string;
  tenantId: string;
  limit: number;
  scope?: "all" | "library" | "marketplace";
}): Promise<ImageSearchResult[]> {
  if (!params.query) return [];

  try {
    const queryEmbedding = await generateEmbedding(params.query);
    const providerConfig = await getEffectiveVectorProviderConfig({
      tenantId: params.tenantId,
    });
    const indexName = resolveMediaIndex(providerConfig);
    const namespace = vectorizeNamespaceForTenant(params.tenantId);

    const filter: Record<string, string> = { tenantId: params.tenantId };
    if (params.scope === "marketplace") filter.type = "marketplace_image";
    if (params.scope === "library") filter.type = "image";

    const result = await dispatchVectorOperation({
      operation: "search",
      indexName,
      vector: queryEmbedding,
      topK: boundedTopK(params.limit),
      filter,
      namespace,
      providerConfig,
    });
    const matches = (result as { matches: VectorSearchMatch[] }).matches;

    return matches
      .filter(match => match.score >= MIN_RELEVANCE_SCORE)
      .map(match => ({
        id:
          typeof match.metadata.sourceId === "string" && match.metadata.sourceId
            ? match.metadata.sourceId
            : match.id,
        score: match.score,
        imageUrl: match.metadata.sourceUrl,
        filename: match.metadata.title,
        description: match.metadata.description || "",
        createdAt: match.metadata.createdAt,
      }));
  } catch {
    // Graceful degradation: return empty results if Vectorize is unavailable
    return [];
  }
}

/**
 * Search images by uploading a query image. The query image is described by the
 * existing vision model, embedded as text, then matched against the image index.
 */
export async function searchImagesByBuffer(params: {
  imageBuffer: Buffer | Uint8Array;
  tenantId: string;
  limit: number;
  scope?: "all" | "library" | "marketplace";
}): Promise<ImageSearchResult[]> {
  if (!params.imageBuffer?.byteLength) return [];

  try {
    const description = await generateImageDescriptionFromBuffer(
      params.imageBuffer
    );
    const queryEmbedding = await generateEmbedding(description);
    const providerConfig = await getEffectiveVectorProviderConfig({
      tenantId: params.tenantId,
    });
    const indexName = resolveMediaIndex(providerConfig);
    const namespace = vectorizeNamespaceForTenant(params.tenantId);

    const filter: Record<string, string> = { tenantId: params.tenantId };
    if (params.scope === "marketplace") filter.type = "marketplace_image";
    if (params.scope === "library") filter.type = "image";

    const result = await dispatchVectorOperation({
      operation: "search",
      indexName,
      vector: queryEmbedding,
      topK: boundedTopK(params.limit),
      filter,
      namespace,
      providerConfig,
    });
    const matches = (result as { matches: VectorSearchMatch[] }).matches;

    return matches
      .filter(match => match.score >= MIN_RELEVANCE_SCORE)
      .map(match => ({
        id: match.id,
        score: match.score,
        imageUrl: match.metadata.sourceUrl,
        filename: match.metadata.title,
        description: match.metadata.description || "",
        createdAt: match.metadata.createdAt,
      }));
  } catch {
    return [];
  }
}
