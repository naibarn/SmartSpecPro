import { z } from "zod";

export const PRESENTATION_EXPORT_WARNING_CODE_VALUES = [
  "SLIDE_TRANSITION_UNSUPPORTED",
  "SLIDE_DURATION_INVALID",
  "SLIDE_ELEMENT_UNSUPPORTED",
  "SLIDE_IMAGE_SOURCE_MISSING",
  "W_SVG_LOAD_FAILED",
  "W_SVG_PARSE_FAILED",
  "W_SVG_RASTERIZED",
  "W_SVG_PLACEHOLDER",
  "W_SLIDE_READY_TIMEOUT",
] as const;

export const PRESENTATION_EXPORT_WARNING_CATEGORY_VALUES = [
  "unsupported",
  "fallback_degraded",
  "timeout_deferred",
  "validation",
  "unknown",
] as const;

export type PresentationExportWarningCode = string;
export type PresentationExportWarningCategory = typeof PRESENTATION_EXPORT_WARNING_CATEGORY_VALUES[number];

export const presentationExportWarningCodeSchema = z.string().min(1).max(80);
export const presentationExportWarningCategorySchema = z.enum(PRESENTATION_EXPORT_WARNING_CATEGORY_VALUES);

const WARNING_CODE_CATEGORY_MAP: Record<string, PresentationExportWarningCategory> = {
  SLIDE_ELEMENT_UNSUPPORTED: "unsupported",
  W_SVG_LOAD_FAILED: "fallback_degraded",
  W_SVG_PARSE_FAILED: "fallback_degraded",
  W_SVG_RASTERIZED: "fallback_degraded",
  W_SVG_PLACEHOLDER: "fallback_degraded",
  W_SLIDE_READY_TIMEOUT: "timeout_deferred",
  SLIDE_TRANSITION_UNSUPPORTED: "validation",
  SLIDE_DURATION_INVALID: "validation",
  SLIDE_IMAGE_SOURCE_MISSING: "validation",
};

export function categorizePresentationExportWarningCode(code: string): PresentationExportWarningCategory {
  return WARNING_CODE_CATEGORY_MAP[code] ?? "unknown";
}

export const presentationExportWarningSchema = z.object({
  code: presentationExportWarningCodeSchema,
  slideId: z.number().int().positive(),
  detail: z.string().min(1).max(240).optional(),
  category: presentationExportWarningCategorySchema.optional(),
});

export const presentationExportWarningsSchema = z.array(presentationExportWarningSchema).max(500);

export type PresentationExportWarning = z.infer<typeof presentationExportWarningSchema>;
