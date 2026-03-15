/**
 * Vision Memory Service (Section 09 + 10)
 *
 * Safety utilities for the multimodal memory pipeline:
 * - NSFW content blocking via safety label inspection
 * - OCR PII filtering before searchable text storage
 *
 * User controls (Section 10):
 * - deleteFromMemory: cascade-delete a memory item and remove from visual state
 * - pinToMemory: set salience to 1.0 to ensure persistent retrieval
 * - isImageDeletionCommand: detect deletion intent in user messages
 */

import { TRPCError } from "@trpc/server";
import { detectAndRedactPII } from "./piiFilter";

// ---------------------------------------------------------------------------
// NSFW Safety Blocking
// ---------------------------------------------------------------------------

export const NSFW_BLOCKED_CATEGORIES: ReadonlySet<string> = new Set([
  "sexually_explicit",
  "violence",
  "hate_speech",
  "dangerous",
]);

export const NSFW_SCORE_THRESHOLD = 0.5;

export interface SafetyLabel {
  category: string;
  score: number;
}

export interface SafetyCheckResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Inspect Gemini safety labels and determine whether the image should be
 * blocked from entering the multimodal memory pipeline.
 *
 * Returns blocked:true when any label's category is in the blocked set
 * AND its confidence score is >= NSFW_SCORE_THRESHOLD.
 */
export function checkSafety(safetyLabels: SafetyLabel[] | null | undefined): SafetyCheckResult {
  if (!safetyLabels || safetyLabels.length === 0) {
    return { blocked: false };
  }

  for (const label of safetyLabels) {
    if (NSFW_BLOCKED_CATEGORIES.has(label.category) && label.score >= NSFW_SCORE_THRESHOLD) {
      return {
        blocked: true,
        reason: `Blocked category "${label.category}" with score ${label.score.toFixed(2)}`,
      };
    }
  }

  return { blocked: false };
}

// ---------------------------------------------------------------------------
// Searchable Text Builder with OCR PII Filtering
// ---------------------------------------------------------------------------

export interface AnalysisInput {
  shortCaption: string | null;
  objects?: string[] | null;
  styles?: string[] | null;
  materials?: string[] | null;
  colors?: string[] | null;
  ocrText?: string | null;
}

/**
 * Build the searchable text string from vision analysis fields.
 *
 * Caption and tag fields pass through unchanged (LLM-generated, not user content).
 * Only `ocrText` (which may contain text photographed from the real world) is
 * passed through the PII filter before inclusion.
 */
export function buildSearchableText(analysis: AnalysisInput): string {
  const parts: string[] = [];

  if (analysis.shortCaption) {
    parts.push(analysis.shortCaption);
  }
  if (analysis.objects?.length) {
    parts.push(`objects: ${analysis.objects.join(", ")}`);
  }
  if (analysis.styles?.length) {
    parts.push(`style: ${analysis.styles.join(", ")}`);
  }
  if (analysis.materials?.length) {
    parts.push(`materials: ${analysis.materials.join(", ")}`);
  }
  if (analysis.colors?.length) {
    parts.push(`colors: ${analysis.colors.join(", ")}`);
  }

  // OCR text passes through PII filter — may contain real-world text with PII
  if (analysis.ocrText) {
    const { sanitizedText } = detectAndRedactPII(analysis.ocrText);
    parts.push(`ocr: ${sanitizedText}`);
  }

  return parts.join(" | ");
}

// ---------------------------------------------------------------------------
// Section 10: User Controls and Deletion
// ---------------------------------------------------------------------------

/**
 * Delete a multimodal memory item by assetId.
 *
 * Cascade cleanup via FK constraints removes:
 * - multimodal_memory_vectors (FK memoryItemId CASCADE)
 * - multimodal_memory_links (FK fromMemoryItemId / toMemoryItemId CASCADE)
 *
 * The media_assets row is preserved — the image remains as a chat attachment.
 * Only the memory indexing is removed.
 *
 * Idempotent: returns { success: true, deletedItemCount: 0 } if already deleted.
 */
export async function deleteFromMemory(
  assetId: number,
  userId: number,
  tenantId: string
): Promise<{ success: boolean; deletedItemCount: number }> {
  const { getDb } = await import("../db");
  const { mediaAssets, multimodalMemoryItems } = await import("../../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Step 1: Authorization — verify asset ownership
  const [asset] = await db
    .select({ id: mediaAssets.id, userId: mediaAssets.userId, tenantId: mediaAssets.tenantId, conversationId: mediaAssets.conversationId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!asset || asset.userId !== userId || asset.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to delete this asset" });
  }

  // Step 2: Delete memory items (cascade removes vectors + links)
  const deleted = await db
    .delete(multimodalMemoryItems)
    .where(eq(multimodalMemoryItems.mediaAssetId, assetId))
    .returning({ id: multimodalMemoryItems.id });

  // Step 3: Remove from visual state
  if (asset.conversationId) {
    const { removeAssetFromState } = await import("./visualStateService");
    await removeAssetFromState(asset.conversationId, assetId).catch(() => {
      // Non-fatal — visual state will self-correct on next load
    });
  }

  return { success: true, deletedItemCount: deleted.length };
}

/**
 * Pin an image to memory by setting salience to 1.0.
 *
 * Pinned images are always prioritized in retrieval ranking.
 * Also increments accessCount and updates lastAccessedAt.
 */
export async function pinToMemory(
  assetId: number,
  userId: number,
  tenantId: string
): Promise<{ success: boolean }> {
  const { getDb } = await import("../db");
  const { mediaAssets, multimodalMemoryItems } = await import("../../drizzle/schema");
  const { eq } = await import("drizzle-orm");
  const { sql } = await import("drizzle-orm");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Step 1: Authorization
  const [asset] = await db
    .select({ id: mediaAssets.id, userId: mediaAssets.userId, tenantId: mediaAssets.tenantId })
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!asset || asset.userId !== userId || asset.tenantId !== tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Not authorized to pin this asset" });
  }

  // Step 2: Set salience to 1.0, increment accessCount, update lastAccessedAt
  await db
    .update(multimodalMemoryItems)
    .set({
      salience: "1.0",
      accessCount: sql`COALESCE(${multimodalMemoryItems.accessCount}, 0) + 1`,
      lastAccessedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(multimodalMemoryItems.mediaAssetId, assetId))
    .returning({ id: multimodalMemoryItems.id });

  return { success: true };
}

// ---------------------------------------------------------------------------
// Chat Command Detection
// ---------------------------------------------------------------------------

const IMAGE_DELETION_PATTERNS = [
  /ลบ.*memory/i,
  /ลบรูป.*ออก/i,
  /ลืมรูป/i,
  /remove.*from\s+memory/i,
  /delete.*from\s+memory/i,
  /forget.*image/i,
  /forget.*photo/i,
];

/**
 * Detect whether a user message contains an image deletion intent.
 * Used in the chat pipeline to short-circuit and perform deletion
 * instead of invoking the LLM.
 */
export function isImageDeletionCommand(message: string): boolean {
  return IMAGE_DELETION_PATTERNS.some((pattern) => pattern.test(message));
}
