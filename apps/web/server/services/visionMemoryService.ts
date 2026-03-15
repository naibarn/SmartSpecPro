/**
 * Vision Memory Service (Section 09)
 *
 * Safety utilities for the multimodal memory pipeline:
 * - NSFW content blocking via safety label inspection
 * - OCR PII filtering before searchable text storage
 */

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
