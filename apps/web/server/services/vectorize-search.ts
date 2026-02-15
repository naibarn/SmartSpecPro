/**
 * Search functions for querying Vectorize indexes.
 *
 * Used by the search tRPC router to provide semantic search
 * over documents and images with tenant isolation.
 */
import { generateEmbedding } from "./vectorize";
import { getVectorizeClient } from "./vectorize-indexing";

const DOCS_INDEX =
  process.env.VECTORIZE_DOCS_INDEX || "docs-index-prod";
const IMAGES_INDEX =
  process.env.VECTORIZE_IMAGES_INDEX || "images-index-prod";
const MIN_RELEVANCE_SCORE = 0.5;

interface DocSearchResult {
  id: string;
  score: number;
  title: string;
  type: string;
  sourceUrl: string;
  createdAt: number;
}

interface ImageSearchResult {
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
    const client = getVectorizeClient(DOCS_INDEX);

    const filter: Record<string, string> = { tenantId: params.tenantId };
    if (params.type) filter.type = params.type;

    const results = await client.query(queryEmbedding, {
      topK: params.limit,
      filter,
    });

    return results.matches
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
}): Promise<ImageSearchResult[]> {
  if (!params.query) return [];

  try {
    const queryEmbedding = await generateEmbedding(params.query);
    const client = getVectorizeClient(IMAGES_INDEX);

    const results = await client.query(queryEmbedding, {
      topK: params.limit,
      filter: { tenantId: params.tenantId },
    });

    return results.matches
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
