/**
 * Vectorize indexing operations — upsert, delete, and batch management.
 *
 * Uses Cloudflare Vectorize REST API for vector storage.
 * Two indexes: docs-index (text documents) and images-index (gallery images).
 */
import {
  generateEmbedding,
  chunkDocument,
  generateImageDescription,
} from "./vectorize";
import {
  dispatchVectorOperation,
  getVectorProviderConfigFromEnv,
} from "./vectorProvider";

const DOCS_INDEX =
  process.env.VECTORIZE_DOCS_INDEX || "docs-index-prod";
const IMAGES_INDEX =
  process.env.VECTORIZE_IMAGES_INDEX || "images-index-prod";
const BATCH_SIZE = 1000;

interface VectorMetadata {
  tenantId: string;
  type: string;
  createdAt: number;
  title: string;
  sourceUrl: string;
  description?: string;
}

interface VectorEntry {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

interface VectorizeClient {
  upsert(vectors: VectorEntry[]): Promise<{ count: number }>;
  delete(ids: string[]): Promise<{ count: number }>;
  query(
    vector: number[],
    options: {
      topK: number;
      filter?: Record<string, string | number>;
    },
  ): Promise<{
    matches: Array<{
      id: string;
      score: number;
      metadata: VectorMetadata;
    }>;
  }>;
}

/**
 * Get a Vectorize client for the given index.
 * Uses Cloudflare API REST endpoints.
 */
export function getVectorizeClient(indexName: string): VectorizeClient {
  const cloudflareOnlyConfig = {
    ...getVectorProviderConfigFromEnv(),
    provider: "cloudflare_vectorize",
    currentReadProvider: "cloudflare_vectorize",
    targetProvider: "cloudflare_vectorize",
  };

  return {
    async upsert(vectors: VectorEntry[]) {
      const result = await dispatchVectorOperation({
        operation: "index",
        indexName,
        vectors,
        providerConfig: cloudflareOnlyConfig,
      });
      return result as { count: number };
    },

    async delete(ids: string[]) {
      const result = await dispatchVectorOperation({
        operation: "delete",
        indexName,
        ids,
        providerConfig: cloudflareOnlyConfig,
      });
      return result as { count: number };
    },

    async query(
      vector: number[],
      options: {
        topK: number;
        filter?: Record<string, string | number>;
      },
    ) {
      const result = await dispatchVectorOperation({
        operation: "search",
        indexName,
        vector,
        topK: options.topK,
        filter: options.filter,
        providerConfig: cloudflareOnlyConfig,
      });
      return result as {
        matches: Array<{
          id: string;
          score: number;
          metadata: VectorMetadata;
        }>;
      };
    },
  };
}

/**
 * Index a text document by chunking, embedding, and upserting to Vectorize.
 */
export async function indexDocument(params: {
  id: string;
  text: string;
  tenantId: string;
  title: string;
  type: string;
  sourceUrl: string;
}) {
  const chunks = chunkDocument(params.text);
  const vectors: VectorEntry[] = [];
  const providerConfig = getVectorProviderConfigFromEnv();

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    vectors.push({
      id: `${params.id}-chunk-${i}`,
      values: embedding,
      metadata: {
        tenantId: params.tenantId,
        type: params.type,
        createdAt: Date.now(),
        title: params.title,
        sourceUrl: params.sourceUrl,
      },
    });
  }

  // Batch upsert
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await dispatchVectorOperation({
      operation: "index",
      indexName: DOCS_INDEX,
      vectors: vectors.slice(i, i + BATCH_SIZE),
      providerConfig,
    });
  }
}

/**
 * Index a gallery image by generating a description, embedding it, and upserting.
 */
export async function indexImage(params: {
  id: string;
  imageUrl: string;
  tenantId: string;
  filename: string;
}) {
  const description = await generateImageDescription(params.imageUrl);
  const embedding = await generateEmbedding(description);
  const providerConfig = getVectorProviderConfigFromEnv();

  await dispatchVectorOperation({
    operation: "index",
    indexName: IMAGES_INDEX,
    vectors: [
      {
        id: params.id,
        values: embedding,
        metadata: {
          tenantId: params.tenantId,
          type: "image",
          createdAt: Date.now(),
          title: params.filename,
          sourceUrl: params.imageUrl,
          description,
        },
      },
    ],
    providerConfig,
  });
}

/**
 * Remove a vector by ID from the specified index.
 */
export async function removeVector(indexName: string, id: string) {
  await dispatchVectorOperation({
    operation: "delete",
    indexName,
    ids: [id],
    providerConfig: getVectorProviderConfigFromEnv(),
  });
}

/**
 * Remove all chunk vectors for a document from the docs index.
 * Documents are stored as {id}-chunk-0, {id}-chunk-1, etc.
 */
export async function removeDocument(id: string, maxChunks = 100) {
  const chunkIds = Array.from({ length: maxChunks }, (_, i) => `${id}-chunk-${i}`);
  await dispatchVectorOperation({
    operation: "delete",
    indexName: DOCS_INDEX,
    ids: chunkIds,
    providerConfig: getVectorProviderConfigFromEnv(),
  });
}
