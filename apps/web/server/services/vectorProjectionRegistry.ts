import { eq, and, inArray } from "drizzle-orm";
import {
  vectorIndexRecords,
  type InsertVectorIndexRecord,
} from "../../drizzle/schema";
import {
  deterministicVectorId,
  VECTORIZE_CHUNKING_VERSION,
  VECTORIZE_EMBEDDING_MODEL,
  VECTORIZE_EMBEDDING_VERSION,
  VECTORIZE_EMBEDDING_DIMENSIONS,
  VECTORIZE_METRIC,
  validateVectorizeProjectionContract,
  vectorizeNamespaceForTenant,
} from "./vectorizeContract";

export type VectorProjectionRegistryInput = {
  tenantId: string;
  userId?: number | null;
  workspaceId?: string | null;
  pluginId?: string | null;
  sourceFamily: string;
  sourceTable: string;
  sourceId: string;
  chunkId?: string | null;
  assetId?: string | null;
  vectorIndex: string;
  namespace?: string;
  sourceRevision: string;
  contentHash: string;
  inputHash?: string | null;
  sourceLocatorKind?: string | null;
  vectorId?: string;
  embeddingModel?: string;
  embeddingDimensions?: number;
  embeddingVersion?: string;
  metric?: string;
  chunkingVersion?: string;
  normalizationVersion?: string | null;
};

function requireHash(value: string, field: string): string {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`VECTORIZE_${field.toUpperCase()}_HASH_INVALID`);
  }
  return value.toLowerCase();
}

export function buildVectorProjectionRecord(
  input: VectorProjectionRegistryInput
): InsertVectorIndexRecord {
  const namespace =
    input.namespace ?? vectorizeNamespaceForTenant(input.tenantId);
  const embeddingModel = input.embeddingModel ?? VECTORIZE_EMBEDDING_MODEL;
  const embeddingDimensions =
    input.embeddingDimensions ?? VECTORIZE_EMBEDDING_DIMENSIONS;
  const embeddingVersion =
    input.embeddingVersion ?? VECTORIZE_EMBEDDING_VERSION;
  const metric = input.metric ?? VECTORIZE_METRIC;
  const chunkingVersion = input.chunkingVersion ?? VECTORIZE_CHUNKING_VERSION;

  validateVectorizeProjectionContract({
    tenantId: input.tenantId,
    namespace,
    embeddingModel,
    embeddingDimensions,
    metric,
    sourceFamily: input.sourceFamily,
    sourceId: input.sourceId,
  });

  const vectorId =
    input.vectorId ??
    deterministicVectorId({
      vectorIndex: input.vectorIndex,
      namespace,
      sourceFamily: input.sourceFamily,
      sourceId: input.sourceId,
      chunkOrSegmentId: input.chunkId,
      sourceRevision: input.sourceRevision,
      embeddingVersion,
    });

  return {
    tenantId: input.tenantId,
    userId: input.userId ?? null,
    workspaceId: input.workspaceId ?? null,
    pluginId: input.pluginId ?? null,
    sourceFamily: input.sourceFamily,
    sourceTable: input.sourceTable,
    sourceId: input.sourceId,
    chunkId: input.chunkId ?? null,
    assetId: input.assetId ?? null,
    vectorId,
    vectorIndex: input.vectorIndex,
    namespace,
    embeddingModel,
    embeddingDimensions,
    embeddingVersion,
    metric,
    chunkingVersion,
    normalizationVersion: input.normalizationVersion ?? null,
    contentHash: requireHash(input.contentHash, "content"),
    sourceRevision: input.sourceRevision,
    indexedAt: null,
    lastMutationId: null,
    inputHash: input.inputHash ? requireHash(input.inputHash, "input") : null,
    sourceLocatorKind: input.sourceLocatorKind ?? null,
    status: "queued",
    failureCode: null,
  };
}

export async function upsertVectorProjectionRecord(
  db: any,
  input: VectorProjectionRegistryInput
): Promise<InsertVectorIndexRecord> {
  const record = buildVectorProjectionRecord(input);
  await db
    .insert(vectorIndexRecords)
    .values(record)
    .onConflictDoUpdate({
      target: [vectorIndexRecords.vectorIndex, vectorIndexRecords.vectorId],
      set: {
        tenantId: record.tenantId,
        userId: record.userId,
        workspaceId: record.workspaceId,
        pluginId: record.pluginId,
        sourceFamily: record.sourceFamily,
        sourceTable: record.sourceTable,
        sourceId: record.sourceId,
        chunkId: record.chunkId,
        assetId: record.assetId,
        namespace: record.namespace,
        embeddingModel: record.embeddingModel,
        embeddingDimensions: record.embeddingDimensions,
        embeddingVersion: record.embeddingVersion,
        metric: record.metric,
        chunkingVersion: record.chunkingVersion,
        normalizationVersion: record.normalizationVersion,
        contentHash: record.contentHash,
        sourceRevision: record.sourceRevision,
        inputHash: record.inputHash,
        sourceLocatorKind: record.sourceLocatorKind,
        status: record.status,
        failureCode: null,
        indexedAt: null,
        lastMutationId: null,
        updatedAt: new Date(),
      },
    });
  return record;
}

export async function markVectorProjectionIndexed(
  db: any,
  params: { vectorIndex: string; vectorId: string; mutationId?: string | null }
): Promise<void> {
  await db
    .update(vectorIndexRecords)
    .set({
      status: "indexed",
      indexedAt: new Date(),
      lastMutationId: params.mutationId ?? null,
      failureCode: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vectorIndexRecords.vectorIndex, params.vectorIndex),
        eq(vectorIndexRecords.vectorId, params.vectorId)
      )
    );
}

export async function markVectorProjectionFailed(
  db: any,
  params: { vectorIndex: string; vectorIds: string[]; failureCode: string }
): Promise<void> {
  if (params.vectorIds.length === 0) return;
  await db
    .update(vectorIndexRecords)
    .set({
      status: "failed",
      failureCode: params.failureCode.slice(0, 96),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(vectorIndexRecords.vectorIndex, params.vectorIndex),
        inArray(vectorIndexRecords.vectorId, params.vectorIds)
      )
    );
}
