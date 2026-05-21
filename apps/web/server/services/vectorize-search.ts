/**
 * Search functions for querying Vectorize indexes.
 *
 * Used by the search tRPC router to provide semantic search
 * over documents and images with tenant isolation.
 */
import { generateEmbedding } from "./vectorize";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
  type VectorSearchMatch,
} from "./vectorProvider";

const DOCS_INDEX =
  process.env.VECTORIZE_DOCS_INDEX || "docs-index-prod";
const IMAGES_INDEX =
  process.env.VECTORIZE_IMAGES_INDEX || "images-index-prod";
const MIN_RELEVANCE_SCORE = 0.5;

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
    const providerConfig = await getEffectiveVectorProviderConfig({ tenantId: params.tenantId });

    const result = await dispatchVectorOperation({
      operation: "search",
      indexName: DOCS_INDEX,
      vector: queryEmbedding,
      topK: params.limit,
      filter,
      providerConfig,
    });
    const matches = (result as { matches: VectorSearchMatch[] }).matches;

    return matches
      .filter((match) => match.score >= MIN_RELEVANCE_SCORE)
      .map((match) => ({
        id: match.id,
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
    const providerConfig = await getEffectiveVectorProviderConfig({ tenantId: params.tenantId });

    const filter: Record<string, string> = { tenantId: params.tenantId };
    if (params.scope === "marketplace") filter.type = "marketplace_image";
    if (params.scope === "library") filter.type = "image";

    const result = await dispatchVectorOperation({
      operation: "search",
      indexName: IMAGES_INDEX,
      vector: queryEmbedding,
      topK: params.limit,
      filter,
      providerConfig,
    });
    const matches = (result as { matches: VectorSearchMatch[] }).matches;

    return matches
      .filter((match) => match.score >= MIN_RELEVANCE_SCORE)
      .map((match) => ({
        id: match.id,
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
