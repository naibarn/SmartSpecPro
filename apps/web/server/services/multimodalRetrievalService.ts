/**
 * Multimodal Retrieval Service (Section 06)
 *
 * Resolves user references to images, performs hybrid retrieval across
 * multiple ranking signals, and packs image context for the LLM.
 */

import { z } from "zod";
import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "../db";
import { mediaAssets, mediaAssetAnalysis, multimodalMemoryItems, multimodalMemoryVectors } from "../../drizzle/schema";
import { callLLMStructured } from "./callLLMStructured";
import { getMultimodalEmbeddingProvider } from "./multimodalEmbeddingProvider";
import { getOrCreateState } from "./visualStateService";
import { generateSignedUrl } from "./mediaAssetService";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedReference {
  assetId: number;
  confidence: number;
  reason: string;
}

export interface RetrievalResult {
  assetId: number;
  score: number;
  source: string;
}

export interface ModelCapabilities {
  supportsVision: boolean;
  maxImageInputs?: number;
}

export interface ImageBudget {
  maxImages: number;
  maxTextTokens: number;
}

export interface ImageContext {
  imageAssets: Array<{
    assetId: number;
    fileUrl: string;
    caption?: string;
    role: "memory" | "current";
  }>;
  visualMemoryContext: string | null;
  memoryCards: Array<{
    assetId: number;
    label: string;
    summary: string;
    tags: string[];
    salientAttributes: Record<string, string>;
  }> | null;
}

interface RetrievalScope {
  userId: number;
  tenantId: string;
  conversationId: number;
  projectId?: string;
  explicitRefs?: Array<{ assetId: number; confidence: number }>;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIDENCE_THRESHOLD = 0.5;
const HIGH_CONFIDENCE_THRESHOLD = 0.8;
const DEFAULT_LIMIT = 8;
const MAX_IMAGES = 5;

const WEIGHTS = {
  explicit: 0.35,
  vector: 0.25,
  recency: 0.20,
  metadata: 0.10,
  projectScope: 0.05,
  salience: 0.05,
};

// ---------------------------------------------------------------------------
// 1. Keyword Pre-Filter
// ---------------------------------------------------------------------------

const IMAGE_KEYWORD_PATTERN = /รูป|ภาพ|โฟโต้|ก่อนหน้า|เปรียบเทียบ|image|photo|picture|pic|screenshot|compare/i;

export function hasImageReferenceKeywords(message: string): boolean {
  return IMAGE_KEYWORD_PATTERN.test(message);
}

// ---------------------------------------------------------------------------
// 2. LLM Reference Resolver
// ---------------------------------------------------------------------------

const ResolvedRefSchema = z.array(
  z.object({
    assetId: z.number(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
  })
);

export async function resolveVisualReferences(
  userMessage: string,
  conversationId: number,
  userId: number,
  tenantId: string,
  projectId?: string
): Promise<ResolvedReference[]> {
  // Gate 3 (section 09): honour multimodalMemory feature flag
  try {
    const { getTenantFeatureFlags } = await import("./tenantFeatureFlagService");
    const flags = await getTenantFeatureFlags(tenantId);
    if (!flags.multimodalMemory) return [];
  } catch {
    return [];
  }

  // Step 1: Fast keyword pre-filter
  if (!hasImageReferenceKeywords(userMessage)) return [];

  // Step 2: Get visual state
  const state = await getOrCreateState(conversationId);
  if (state.recentAssetIds.length === 0) return [];

  // Step 3: Fetch recent image metadata
  const db = await getDb();
  if (!db) return [];

  const recentIds = state.recentAssetIds.slice(0, 12);
  const analysisRows = await db
    .select({
      id: mediaAssets.id,
      shortCaption: mediaAssetAnalysis.shortCaption,
      architectureTags: mediaAssetAnalysis.architectureTags,
      styles: mediaAssetAnalysis.styles,
      createdAt: mediaAssets.createdAt,
    })
    .from(mediaAssets)
    .leftJoin(mediaAssetAnalysis, eq(mediaAssetAnalysis.mediaAssetId, mediaAssets.id))
    .where(
      and(
        inArray(mediaAssets.id, recentIds),
        eq(mediaAssets.tenantId, tenantId)
      )
    )
    .limit(12);

  if (analysisRows.length === 0) return [];

  // Build position map (most recent = position 1)
  const positionMap = new Map(recentIds.map((id, idx) => [id, idx + 1]));

  const imageList = analysisRows
    .map((row) => {
      const pos = positionMap.get(row.id) ?? 99;
      const tags = [
        ...((row.architectureTags as string[]) ?? []),
        ...((row.styles as string[]) ?? []),
      ].slice(0, 3);
      return `[position ${pos}] assetId=${row.id}: "${row.shortCaption ?? "image"}" tags: ${tags.join(", ")}`;
    })
    .join("\n");

  // Step 5: LLM call
  const systemPrompt = `You are a visual reference resolver for a Thai/English real estate platform.
Given a user message and a list of available images (with position and metadata),
determine which images the user is referring to. Support:
- Ordinal references: รูปแรก (first), รูปที่สอง (second), first, second
- Recency: ล่าสุด (latest), ก่อนหน้า (previous), latest, previous
- Semantic: บ้านสีขาว (white house), ห้องนอน modern
- Sets: 3 รูปล่าสุด (last 3 images)
Return ONLY a JSON array. If unsure, return [].`;

  const userPromptText = `User message: "${userMessage}"

Available images (most recent first):
${imageList}

Return JSON array of resolved references.`;

  try {
    const result = await callLLMStructured({
      systemPrompt,
      userMessage: userPromptText,
      zodSchema: ResolvedRefSchema,
      userId,
      tenantId,
      billingDescription: "vision_reference_resolution",
    });

    // Step 6: Filter by confidence
    return (result.data as ResolvedReference[]).filter(
      (ref) => ref.confidence >= CONFIDENCE_THRESHOLD
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// 3. Hybrid Retrieval
// ---------------------------------------------------------------------------

export async function retrieveRelevantAssets(
  query: string,
  scope: RetrievalScope
): Promise<RetrievalResult[]> {
  const { userId, tenantId, conversationId, projectId, explicitRefs, limit = DEFAULT_LIMIT } = scope;

  // Gate 3 (section 09): honour multimodalMemory feature flag
  try {
    const { getTenantFeatureFlags } = await import("./tenantFeatureFlagService");
    const flags = await getTenantFeatureFlags(tenantId);
    if (!flags.multimodalMemory) return [];
  } catch {
    return [];
  }

  // Fast path: high-confidence explicit references
  if (explicitRefs && explicitRefs.length > 0) {
    const hasHighConf = explicitRefs.some((r) => r.confidence >= HIGH_CONFIDENCE_THRESHOLD);
    if (hasHighConf) {
      const results: RetrievalResult[] = explicitRefs
        .map((ref) => ({
          assetId: ref.assetId,
          score: ref.confidence * WEIGHTS.explicit,
          source: "explicit",
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
      return results;
    }
  }

  // Full hybrid retrieval
  const db = await getDb();
  if (!db) return [];

  // Get visual state for recency scoring
  const state = await getOrCreateState(conversationId);
  const recentIds = state.recentAssetIds;

  // Vector search
  let vectorCandidates: Array<{ assetId: number; vectorScore: number }> = [];
  try {
    const provider = await getMultimodalEmbeddingProvider();
    const queryVector = await provider.embedText({ text: query });
    const providerName = provider.getProviderName();

    // Raw SQL for pgvector cosine similarity
    const vectorResult = await db.execute(sql`
      SELECT
        mi."mediaAssetId" AS "assetId",
        1 - (mv.embedding <=> ${JSON.stringify(queryVector)}::vector) AS "vectorScore"
      FROM multimodal_memory_vectors mv
      JOIN multimodal_memory_items mi ON mi.id = mv."memoryItemId"
      WHERE mv.provider = ${providerName}
        AND mi."tenantId" = ${tenantId}
        AND mi."userId" = ${userId}
      ORDER BY mv.embedding <=> ${JSON.stringify(queryVector)}::vector
      LIMIT 20
    `);

    vectorCandidates = (vectorResult.rows as any[]).map((row: any) => ({
      assetId: Number(row.assetId),
      vectorScore: Number(row.vectorScore) || 0,
    }));
  } catch {
    // Vector search failure is non-fatal
  }

  // Combine explicit refs with vector candidates
  const candidateIds = new Set([
    ...(explicitRefs ?? []).map((r) => r.assetId),
    ...vectorCandidates.map((c) => c.assetId),
  ]);

  if (candidateIds.size === 0) return [];

  // Build score map
  const vectorScoreMap = new Map(vectorCandidates.map((c) => [c.assetId, c.vectorScore]));
  const explicitScoreMap = new Map((explicitRefs ?? []).map((r) => [r.assetId, r.confidence]));
  const recencyMap = new Map(recentIds.map((id, idx) => [id, (recentIds.length - idx) / recentIds.length]));

  const results: RetrievalResult[] = Array.from(candidateIds).map((assetId) => {
    const explicitScore = explicitScoreMap.get(assetId) ?? 0;
    const vectorScore = vectorScoreMap.get(assetId) ?? 0;
    const recencyScore = recencyMap.get(assetId) ?? 0;

    const finalScore =
      explicitScore * WEIGHTS.explicit +
      vectorScore * WEIGHTS.vector +
      recencyScore * WEIGHTS.recency;

    const dominantSource =
      explicitScore > vectorScore && explicitScore > recencyScore
        ? "explicit"
        : vectorScore > recencyScore
          ? "vector"
          : "recency";

    return { assetId, score: finalScore, source: dominantSource };
  });

  return results.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------------------------------------------------------------------
// 4. Context Builder
// ---------------------------------------------------------------------------

export async function buildImageContext(
  resolvedAssets: RetrievalResult[],
  modelCapabilities: ModelCapabilities,
  budget: ImageBudget
): Promise<ImageContext> {
  if (resolvedAssets.length === 0) {
    return { imageAssets: [], visualMemoryContext: null, memoryCards: null };
  }

  const db = await getDb();
  const cappedAssets = resolvedAssets.slice(0, budget.maxImages);
  const assetIds = cappedAssets.map((a) => a.assetId);

  // Fetch analysis rows
  let analysisMap = new Map<
    number,
    {
      storageKey: string;
      shortCaption: string;
      detailedCaption: string;
      architectureTags: string[];
      styles: string[];
      colors: string[];
      materials: string[];
    }
  >();

  if (db && assetIds.length > 0) {
    try {
      const rows = await db
        .select({
          id: mediaAssets.id,
          storageKey: mediaAssets.storageKey,
          shortCaption: mediaAssetAnalysis.shortCaption,
          detailedCaption: mediaAssetAnalysis.detailedCaption,
          architectureTags: mediaAssetAnalysis.architectureTags,
          styles: mediaAssetAnalysis.styles,
          colors: mediaAssetAnalysis.colors,
          materials: mediaAssetAnalysis.materials,
        })
        .from(mediaAssets)
        .leftJoin(mediaAssetAnalysis, eq(mediaAssetAnalysis.mediaAssetId, mediaAssets.id))
        .where(inArray(mediaAssets.id, assetIds))
        .limit(assetIds.length);

      for (const row of rows) {
        analysisMap.set(row.id, {
          storageKey: row.storageKey ?? "",
          shortCaption: row.shortCaption ?? "",
          detailedCaption: row.detailedCaption ?? "",
          architectureTags: (row.architectureTags as string[]) ?? [],
          styles: (row.styles as string[]) ?? [],
          colors: (row.colors as string[]) ?? [],
          materials: (row.materials as string[]) ?? [],
        });
      }
    } catch {
      // best-effort
    }
  }

  if (modelCapabilities.supportsVision) {
    // Vision-capable path
    const imageAssets: ImageContext["imageAssets"] = [];
    const memoryCards: NonNullable<ImageContext["memoryCards"]> = [];

    for (const asset of cappedAssets) {
      const analysis = analysisMap.get(asset.assetId);
      if (!analysis) continue;

      const signedUrl = await generateSignedUrl(analysis.storageKey, 3600);
      if (!signedUrl) continue;

      if (imageAssets.length < budget.maxImages) {
        imageAssets.push({
          assetId: asset.assetId,
          fileUrl: signedUrl,
          caption: analysis.shortCaption || undefined,
          role: "current",
        });
      } else {
        // Overflow → memory card
        const tags = [...analysis.architectureTags, ...analysis.styles].slice(0, 5);
        memoryCards.push({
          assetId: asset.assetId,
          label: analysis.shortCaption,
          summary: analysis.detailedCaption.slice(0, 200),
          tags,
          salientAttributes: {
            colors: analysis.colors.join(", "),
            materials: analysis.materials.join(", "),
          },
        });
      }
    }

    return {
      imageAssets,
      visualMemoryContext: null,
      memoryCards: memoryCards.length > 0 ? memoryCards : null,
    };
  } else {
    // Text-only model path
    const maxChars = budget.maxTextTokens * 4;
    let textParts: string[] = [];
    let usedChars = 0;
    const memoryCards: NonNullable<ImageContext["memoryCards"]> = [];

    for (let i = 0; i < cappedAssets.length; i++) {
      const asset = cappedAssets[i];
      const analysis = analysisMap.get(asset.assetId);
      if (!analysis) continue;

      const tags = [...analysis.architectureTags, ...analysis.styles].slice(0, 5);
      const entry = `[Image ${i + 1}: "${analysis.shortCaption}"]\nDetails: ${analysis.detailedCaption}\nTags: ${tags.join(", ")}`;

      if (usedChars + entry.length <= maxChars) {
        textParts.push(entry);
        usedChars += entry.length;
      } else {
        memoryCards.push({
          assetId: asset.assetId,
          label: analysis.shortCaption,
          summary: analysis.detailedCaption.slice(0, 200),
          tags,
          salientAttributes: {
            colors: analysis.colors.join(", "),
            materials: analysis.materials.join(", "),
          },
        });
      }
    }

    return {
      imageAssets: [],
      visualMemoryContext: textParts.length > 0 ? textParts.join("\n\n") : null,
      memoryCards: memoryCards.length > 0 ? memoryCards : null,
    };
  }
}
