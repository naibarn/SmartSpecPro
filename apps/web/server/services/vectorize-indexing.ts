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
  generateImageDescriptionFromBuffer,
} from "./vectorize";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
} from "./vectorProvider";
import { toVectorizeSafeId } from "./vectorizeContract";

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
  [key: string]: string | number | boolean | undefined;
}

interface VectorEntry {
  id: string;
  values: number[];
  metadata: VectorMetadata;
}

export interface VectorizeMutationEvidence {
  mutationIds: string[];
  vectorCount: number;
}

/**
 * Index a text document by chunking, embedding, and upserting to the active vector provider.
 */
export async function indexDocument(params: {
  id: string;
  text: string;
  tenantId: string;
  title: string;
  type: string;
  sourceUrl: string;
}): Promise<VectorizeMutationEvidence> {
  const chunks = chunkDocument(params.text);
  const vectors: VectorEntry[] = [];
  const providerConfig = await getEffectiveVectorProviderConfig({ tenantId: params.tenantId });

  for (let i = 0; i < chunks.length; i++) {
    const embedding = await generateEmbedding(chunks[i]);
    vectors.push({
      id: toVectorizeSafeId(`${params.id}-chunk-${i}`),
      values: embedding,
      metadata: {
        tenantId: params.tenantId,
        type: params.type,
        sourceId: params.id,
        chunkIndex: i,
        createdAt: Date.now(),
        title: params.title,
        sourceUrl: params.sourceUrl,
      },
    });
  }

  // Batch upsert
  const mutationIds: string[] = [];
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const result = await dispatchVectorOperation({
      operation: "index",
      indexName: DOCS_INDEX,
      vectors: vectors.slice(i, i + BATCH_SIZE),
      providerConfig,
    });
    if ("mutationId" in result && result.mutationId) mutationIds.push(result.mutationId);
  }
  return { mutationIds, vectorCount: vectors.length };
}

/**
 * Index a gallery image by generating a description, embedding it, and upserting.
 */
export async function indexImage(params: {
  id: string;
  imageUrl: string;
  tenantId: string;
  filename: string;
  type?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}): Promise<VectorizeMutationEvidence> {
  const description = await generateImageDescription(params.imageUrl);
  return indexImageDescription({
    id: params.id,
    description,
    imageUrl: params.imageUrl,
    tenantId: params.tenantId,
    filename: params.filename,
    type: params.type,
    metadata: params.metadata,
  });
}

export async function indexImageBuffer(params: {
  id: string;
  imageBuffer: Buffer | Uint8Array;
  imageUrl: string;
  tenantId: string;
  filename: string;
  type?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}) {
  const description = await generateImageDescriptionFromBuffer(params.imageBuffer);
  return indexImageDescription({
    id: params.id,
    description,
    imageUrl: params.imageUrl,
    tenantId: params.tenantId,
    filename: params.filename,
    type: params.type,
    metadata: params.metadata,
  });
}

async function indexImageDescription(params: {
  id: string;
  description: string;
  imageUrl: string;
  tenantId: string;
  filename: string;
  type?: string;
  metadata?: Record<string, string | number | boolean | undefined>;
}) {
  const searchableText = [
    params.filename,
    params.description,
    params.metadata?.productName,
    params.metadata?.productDescription,
    params.metadata?.platform,
    params.metadata?.imageKind,
  ].filter(Boolean).join("\n");
  const embedding = await generateEmbedding(searchableText);
  const providerConfig = await getEffectiveVectorProviderConfig({ tenantId: params.tenantId });

  const result = await dispatchVectorOperation({
    operation: "index",
    indexName: IMAGES_INDEX,
    vectors: [
      {
        id: toVectorizeSafeId(params.id),
        values: embedding,
        metadata: {
          ...params.metadata,
          tenantId: params.tenantId,
          type: params.type ?? "image",
          sourceId: params.id,
          createdAt: Date.now(),
          title: params.filename,
          sourceUrl: params.imageUrl,
          description: params.description,
        },
      },
    ],
    providerConfig,
  });
  return {
    mutationIds: "mutationId" in result && result.mutationId ? [result.mutationId] : [],
    vectorCount: 1,
  };
}

/**
 * Remove a vector by ID from the specified index.
 */
export async function removeVector(indexName: string, id: string) {
  const providerConfig = await getEffectiveVectorProviderConfig();
  await dispatchVectorOperation({
    operation: "delete",
    indexName,
    ids: [toVectorizeSafeId(id)],
    providerConfig,
  });
}

/**
 * Remove all chunk vectors for a document from the docs index.
 * Documents are stored as {id}-chunk-0, {id}-chunk-1, etc.
 */
export async function removeDocument(id: string, maxChunks = 100) {
  const chunkIds = Array.from(
    { length: maxChunks },
    (_, i) => toVectorizeSafeId(`${id}-chunk-${i}`),
  );
  const providerConfig = await getEffectiveVectorProviderConfig();
  await dispatchVectorOperation({
    operation: "delete",
    indexName: DOCS_INDEX,
    ids: chunkIds,
    providerConfig,
  });
}
