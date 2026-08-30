import { and, eq, ilike, inArray, or } from "drizzle-orm";

import { verticalDramaMediaAssets, verticalDramaMediaIndexRecords } from "../../drizzle/schema";
import { getDb } from "../db";
import { getMultimodalEmbeddingProvider } from "./multimodalEmbeddingProvider";
import { dispatchVectorOperation, getEffectiveVectorProviderConfig } from "./vectorProvider";

const MEDIA_VECTOR_INDEX = process.env.VECTORIZE_MEDIA_INDEX || process.env.VECTORIZE_DOCS_INDEX || "drama-media-index-prod";

export type VerticalDramaMediaEvidence = {
  mediaAssetId: string;
  score: number;
  sourceAssetId: string;
  artifactRevision: string;
  searchableText: string;
  tags: string[];
  sourceTimeRanges: Array<{ startMs: number; endMs: number | null; label: string }>;
  silenceSegments: Array<{ startMs: number; endMs: number | null }>;
  subjectLabels: string[];
  transform: Record<string, unknown> | null;
};

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function evidenceFromAsset(asset: typeof verticalDramaMediaAssets.$inferSelect, index: typeof verticalDramaMediaIndexRecords.$inferSelect | undefined, score: number): VerticalDramaMediaEvidence {
  const artifact = readRecord(asset.derivedArtifactJson);
  const intelligence = readRecord(artifact.intelligence);
  const scenes = Array.isArray(intelligence.scenes) ? intelligence.scenes : [];
  const silence = Array.isArray(intelligence.silenceSegments) ? intelligence.silenceSegments : [];
  return {
    mediaAssetId: asset.id,
    score,
    sourceAssetId: asset.sourceAssetId,
    artifactRevision: asset.sourceRevision,
    searchableText: index?.searchableText ?? "",
    tags: Array.isArray(index?.tagsJson) ? index.tagsJson.filter((value): value is string => typeof value === "string") : [],
    sourceTimeRanges: scenes.flatMap((value) => {
      const scene = readRecord(value);
      const startMs = Number(scene.startMs);
      if (!Number.isFinite(startMs) || startMs < 0) return [];
      const rawEnd = scene.endMs;
      return [{ startMs, endMs: rawEnd === null || rawEnd === undefined ? null : Number(rawEnd), label: typeof scene.label === "string" ? scene.label : "scene" }];
    }).slice(0, 256),
    silenceSegments: silence.flatMap((value) => {
      const segment = readRecord(value);
      const startMs = Number(segment.startMs);
      if (!Number.isFinite(startMs) || startMs < 0) return [];
      const rawEnd = segment.endMs;
      return [{ startMs, endMs: rawEnd === null || rawEnd === undefined ? null : Number(rawEnd) }];
    }).slice(0, 256),
    subjectLabels: Array.isArray(intelligence.subjects) ? intelligence.subjects.filter((value): value is string => typeof value === "string").slice(0, 32) : [],
    transform: intelligence.transform && typeof intelligence.transform === "object" ? intelligence.transform as Record<string, unknown> : null,
  };
}

/**
 * Series-scoped, grounded media retrieval for draft/B-roll planning. The
 * vector provider is preferred, but a bounded lexical fallback keeps the
 * feature useful while a tenant's vector index is catching up.
 */
export async function retrieveVerticalDramaMediaEvidence(input: { tenantId: string; seriesId: string; query: string; limit?: number }): Promise<VerticalDramaMediaEvidence[]> {
  const query = input.query.trim().slice(0, 2000);
  if (!query) return [];
  const seriesId = Number(input.seriesId);
  if (!Number.isSafeInteger(seriesId) || seriesId <= 0) return [];
  const db = getDb();
  const limit = Math.max(1, Math.min(input.limit ?? 8, 32));
  let ranked: Array<{ mediaAssetId: string; score: number }> = [];
  try {
    const provider = await getMultimodalEmbeddingProvider();
    const vector = await provider.embedText({ text: query });
    const result = await dispatchVectorOperation({
      operation: "search",
      indexName: MEDIA_VECTOR_INDEX,
      vector,
      topK: limit,
      filter: { tenantId: input.tenantId, seriesId, type: "vertical_drama_media" },
      providerConfig: await getEffectiveVectorProviderConfig({ tenantId: input.tenantId }),
    });
    ranked = (result as { matches: Array<{ score: number; metadata: Record<string, unknown> }> }).matches
      .map(match => ({ mediaAssetId: String(match.metadata.mediaAssetId ?? "").trim(), score: Number(match.score) || 0 }))
      .filter(item => item.mediaAssetId.length > 0 && item.mediaAssetId.length <= 160)
      .slice(0, limit);
  } catch {
    // The lexical fallback below is intentionally bounded and Series-scoped.
  }
  if (ranked.length === 0) {
    const terms = query.split(/\s+/).map(term => term.trim()).filter(term => term.length >= 2).slice(0, 8);
    const predicates = terms.map(term => ilike(verticalDramaMediaIndexRecords.searchableText, `%${term}%`));
    const rows = predicates.length > 0
      ? await db.select({ mediaAssetId: verticalDramaMediaIndexRecords.mediaAssetId }).from(verticalDramaMediaIndexRecords).where(and(eq(verticalDramaMediaIndexRecords.tenantId, input.tenantId), eq(verticalDramaMediaIndexRecords.seriesId, seriesId), or(...predicates))).limit(limit)
      : [];
    ranked = rows.map((row, index) => ({ mediaAssetId: row.mediaAssetId, score: Math.max(0.01, 1 - index / Math.max(1, limit)) }));
  }
  if (ranked.length === 0) return [];
  const assetIds = ranked.map(item => item.mediaAssetId);
  const [assets, indexes] = await Promise.all([
    db.select().from(verticalDramaMediaAssets).where(and(eq(verticalDramaMediaAssets.tenantId, input.tenantId), eq(verticalDramaMediaAssets.seriesId, seriesId), inArray(verticalDramaMediaAssets.id, assetIds), eq(verticalDramaMediaAssets.pipelineState, "published"))).limit(limit),
    db.select().from(verticalDramaMediaIndexRecords).where(and(eq(verticalDramaMediaIndexRecords.tenantId, input.tenantId), eq(verticalDramaMediaIndexRecords.seriesId, seriesId), inArray(verticalDramaMediaIndexRecords.mediaAssetId, assetIds))).limit(limit),
  ]);
  const indexByAsset = new Map(indexes.map(row => [row.mediaAssetId, row]));
  const assetById = new Map(assets.map(asset => [asset.id, asset]));
  return ranked.flatMap(item => {
    const asset = assetById.get(item.mediaAssetId);
    return asset ? [evidenceFromAsset(asset, indexByAsset.get(item.mediaAssetId), item.score)] : [];
  });
}

export function projectVerticalDramaMediaEvidence(value: VerticalDramaMediaEvidence): VerticalDramaMediaEvidence {
  return { ...value, sourceTimeRanges: value.sourceTimeRanges.slice(0, 256), silenceSegments: value.silenceSegments.slice(0, 256), tags: value.tags.slice(0, 64), subjectLabels: value.subjectLabels.slice(0, 32) };
}
