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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.VECTORIZE_API_TOKEN || process.env.CLOUDFLARE_AI_API_KEY;

  if (!accountId || !apiToken) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID and VECTORIZE_API_TOKEN must be set");
  }

  const baseUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/vectorize/indexes/${indexName}`;

  return {
    async upsert(vectors: VectorEntry[]) {
      const ndjson = vectors
        .map((v) => JSON.stringify(v))
        .join("\n");
      const resp = await fetch(`${baseUrl}/upsert`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/x-ndjson",
        },
        body: ndjson,
      });
      if (!resp.ok) throw new Error(`Vectorize upsert failed: ${resp.status}`);
      return { count: vectors.length };
    },

    async delete(ids: string[]) {
      const resp = await fetch(`${baseUrl}/delete-by-ids`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ids }),
      });
      if (!resp.ok) throw new Error(`Vectorize delete failed: ${resp.status}`);
      return { count: ids.length };
    },

    async query(
      vector: number[],
      options: {
        topK: number;
        filter?: Record<string, string | number>;
      },
    ) {
      const resp = await fetch(`${baseUrl}/query`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          vector,
          topK: options.topK,
          filter: options.filter,
          returnMetadata: true,
        }),
      });
      if (!resp.ok) throw new Error(`Vectorize query failed: ${resp.status}`);
      const data = (await resp.json()) as {
        result: {
          matches: Array<{
            id: string;
            score: number;
            metadata: VectorMetadata;
          }>;
        };
      };
      return data.result;
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
  const client = getVectorizeClient(DOCS_INDEX);
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    await client.upsert(vectors.slice(i, i + BATCH_SIZE));
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

  const client = getVectorizeClient(IMAGES_INDEX);
  await client.upsert([
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
  ]);
}

/**
 * Remove a vector by ID from the specified index.
 */
export async function removeVector(indexName: string, id: string) {
  const client = getVectorizeClient(indexName);
  await client.delete([id]);
}

/**
 * Remove all chunk vectors for a document from the docs index.
 * Documents are stored as {id}-chunk-0, {id}-chunk-1, etc.
 */
export async function removeDocument(id: string, maxChunks = 100) {
  const client = getVectorizeClient(DOCS_INDEX);
  const chunkIds = Array.from({ length: maxChunks }, (_, i) => `${id}-chunk-${i}`);
  await client.delete(chunkIds);
}
