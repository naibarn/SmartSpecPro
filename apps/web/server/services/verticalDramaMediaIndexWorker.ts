import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { createHash } from "node:crypto";

import {
  verticalDramaMediaAssets,
  verticalDramaMediaIndexRecords,
} from "../../drizzle/schema";
import { getDb } from "../db";
import {
  CloudflareFallbackProvider,
  getMultimodalEmbeddingProvider,
} from "./multimodalEmbeddingProvider";
import {
  dispatchVectorOperation,
  getEffectiveVectorProviderConfig,
  resolveVectorProvider,
  type VectorEntry,
} from "./vectorProvider";
import {
  toVectorizeSafeId,
  vectorizeNamespaceForTenant,
} from "./vectorizeContract";
import {
  upsertVectorProjectionRecord,
  markVectorProjectionIndexed,
  markVectorProjectionFailed,
} from "./vectorProjectionRegistry";

const DEFAULT_MEDIA_VECTOR_INDEX = "smartaihub-media-v1";
const MAX_ATTEMPTS = 5;

function mediaVectorId(
  tenantId: string,
  seriesId: number,
  mediaAssetId: string,
  revision: string
): string {
  return toVectorizeSafeId(
    `vdrama:${tenantId}:${seriesId}:${mediaAssetId}:${revision}`
  );
}

export async function processVerticalDramaMediaIndexRecord(
  recordId: string
): Promise<{ status: "indexed" | "retry"; recordId: string }> {
  const db = getDb();
  const [claimed] = await db
    .update(verticalDramaMediaIndexRecords)
    .set({
      status: "processing",
      attemptCount: sql`${verticalDramaMediaIndexRecords.attemptCount} + 1`,
      updatedAt: new Date(),
      lastError: null,
    })
    .where(
      and(
        eq(verticalDramaMediaIndexRecords.id, recordId),
        inArray(verticalDramaMediaIndexRecords.status, ["queued", "failed"]),
        lt(verticalDramaMediaIndexRecords.attemptCount, MAX_ATTEMPTS)
      )
    )
    .returning({
      id: verticalDramaMediaIndexRecords.id,
      tenantId: verticalDramaMediaIndexRecords.tenantId,
      seriesId: verticalDramaMediaIndexRecords.seriesId,
      mediaAssetId: verticalDramaMediaIndexRecords.mediaAssetId,
      artifactRevision: verticalDramaMediaIndexRecords.artifactRevision,
      searchableText: verticalDramaMediaIndexRecords.searchableText,
      tagsJson: verticalDramaMediaIndexRecords.tagsJson,
      attemptCount: verticalDramaMediaIndexRecords.attemptCount,
    });
  if (!claimed) return { status: "indexed", recordId };

  let projectionIndexName = DEFAULT_MEDIA_VECTOR_INDEX;
  let projectionVectorId = "";
  try {
    const providerConfig = await getEffectiveVectorProviderConfig({
      tenantId: claimed.tenantId,
    });
    const resolvedProvider = resolveVectorProvider(
      "index",
      providerConfig
    ).provider;
    const usingVectorize = resolvedProvider === "cloudflare_vectorize";
    const provider = usingVectorize
      ? new CloudflareFallbackProvider()
      : await getMultimodalEmbeddingProvider();
    const values = await provider.embedText({ text: claimed.searchableText });
    const vectorId = mediaVectorId(
      claimed.tenantId,
      claimed.seriesId,
      claimed.mediaAssetId,
      claimed.artifactRevision
    );
    const namespace = vectorizeNamespaceForTenant(claimed.tenantId);
    const indexName =
      providerConfig.vectorizeMediaIndexName?.trim() ||
      process.env.VECTORIZE_MEDIA_INDEX?.trim() ||
      DEFAULT_MEDIA_VECTOR_INDEX;
    projectionIndexName = indexName;
    projectionVectorId = vectorId;
    const entry: VectorEntry = {
      id: vectorId,
      values,
      namespace,
      metadata: {
        tenantId: claimed.tenantId,
        type: "vertical_drama_media",
        createdAt: Date.now(),
        title: `Series ${claimed.seriesId} media ${claimed.mediaAssetId}`,
        sourceUrl: `media://series/${claimed.seriesId}/asset/${claimed.mediaAssetId}`,
        description: claimed.searchableText,
        seriesId: claimed.seriesId,
        mediaAssetId: claimed.mediaAssetId,
        artifactRevision: claimed.artifactRevision,
        tags: Array.isArray(claimed.tagsJson) ? claimed.tagsJson.join(",") : "",
      },
    };
    const contentHash = createHash("sha256")
      .update(claimed.searchableText, "utf8")
      .digest("hex");
    if (usingVectorize) {
      await upsertVectorProjectionRecord(db, {
        tenantId: claimed.tenantId,
        sourceFamily: "vertical_drama_media",
        sourceTable: "vertical_drama_media_assets",
        sourceId: claimed.mediaAssetId,
        assetId: claimed.mediaAssetId,
        chunkId: claimed.artifactRevision,
        vectorIndex: indexName,
        namespace,
        vectorId,
        sourceRevision: claimed.artifactRevision,
        contentHash,
        inputHash: contentHash,
        sourceLocatorKind: "sql_r2_derived",
      });
    }
    const mutationResult = await dispatchVectorOperation({
      operation: "index",
      indexName,
      vectors: [entry],
      providerConfig,
    });
    if (usingVectorize) {
      await markVectorProjectionIndexed(db, {
        vectorIndex: indexName,
        vectorId,
        mutationId:
          "mutationId" in mutationResult ? mutationResult.mutationId : null,
      });
    }
    await db
      .update(verticalDramaMediaIndexRecords)
      .set({
        status: "indexed",
        embeddingRef: `${provider.getProviderName()}:${provider.getModelName()}:${vectorId}`,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(verticalDramaMediaIndexRecords.id, claimed.id));
    await db
      .update(verticalDramaMediaAssets)
      .set({ vectorIndexStatus: "indexed", updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaMediaAssets.id, claimed.mediaAssetId),
          eq(verticalDramaMediaAssets.tenantId, claimed.tenantId),
          eq(verticalDramaMediaAssets.seriesId, claimed.seriesId)
        )
      );
    return { status: "indexed", recordId };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message.slice(0, 1000)
        : String(error).slice(0, 1000);
    try {
      if (projectionVectorId) {
        await markVectorProjectionFailed(db, {
          vectorIndex: projectionIndexName,
          vectorIds: [projectionVectorId],
          failureCode: "vertical_drama_media_index_failed",
        });
      }
    } catch {
      // Preserve the original job failure when registry reconciliation is unavailable.
    }
    await db
      .update(verticalDramaMediaIndexRecords)
      .set({ status: "failed", lastError: message, updatedAt: new Date() })
      .where(eq(verticalDramaMediaIndexRecords.id, claimed.id));
    await db
      .update(verticalDramaMediaAssets)
      .set({ vectorIndexStatus: "retry", updatedAt: new Date() })
      .where(
        and(
          eq(verticalDramaMediaAssets.id, claimed.mediaAssetId),
          eq(verticalDramaMediaAssets.tenantId, claimed.tenantId),
          eq(verticalDramaMediaAssets.seriesId, claimed.seriesId)
        )
      );
    return { status: "retry", recordId };
  }
}

export async function processVerticalDramaMediaIndexBatch(
  limit = 10
): Promise<number> {
  const db = getDb();
  const rows = await db
    .select({ id: verticalDramaMediaIndexRecords.id })
    .from(verticalDramaMediaIndexRecords)
    .where(inArray(verticalDramaMediaIndexRecords.status, ["queued", "failed"]))
    .limit(Math.max(1, Math.min(limit, 50)));
  let processed = 0;
  for (const row of rows) {
    await processVerticalDramaMediaIndexRecord(row.id);
    processed += 1;
  }
  return processed;
}
