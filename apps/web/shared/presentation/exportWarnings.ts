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
  "SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED",
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
  SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED: "fallback_degraded",
  SLIDE_TRANSITION_UNSUPPORTED: "validation",
  SLIDE_DURATION_INVALID: "validation",
  SLIDE_IMAGE_SOURCE_MISSING: "validation",
};

export function categorizePresentationExportWarningCode(code: string): PresentationExportWarningCategory {
  return WARNING_CODE_CATEGORY_MAP[code] ?? "unknown";
}

export function describePresentationExportWarning(
  warning: { code: string; slideId?: number | null },
): string {
  switch (warning.code) {
    case "SLIDE_MEDIA_MOTION_STATIC_EXPORT_OMITTED":
      return "Static exports flatten image and video motion into a still frame. Use MP4 to keep zoom and pan effects.";
    case "SLIDE_ELEMENT_UNSUPPORTED":
      return "Some slide elements are unsupported in the current export format and may be omitted.";
    case "W_SVG_PLACEHOLDER":
      return "Some SVG assets could not be rendered directly and were replaced with placeholders.";
    case "W_SVG_RASTERIZED":
      return "Some SVG assets were rasterized for compatibility during export.";
    case "W_SLIDE_READY_TIMEOUT":
      return "Some slides needed a fallback capture path because media did not finish loading in time.";
    case "SLIDE_TRANSITION_UNSUPPORTED":
      return "Some slide transitions are unsupported in the current export format and were simplified.";
    case "SLIDE_DURATION_INVALID":
      return "Some slide durations were invalid and were normalized during export.";
    case "SLIDE_IMAGE_SOURCE_MISSING":
      return "Some slides contain images without valid sources.";
    case "W_SVG_LOAD_FAILED":
    case "W_SVG_PARSE_FAILED":
      return "Some SVG assets could not be loaded cleanly during export.";
    default:
      return "Export completed with compatibility warnings.";
  }
}

export const presentationExportWarningSchema = z.object({
  code: presentationExportWarningCodeSchema,
  slideId: z.number().int().positive(),
  detail: z.string().min(1).max(240).optional(),
  category: presentationExportWarningCategorySchema.optional(),
});

export const presentationExportWarningsSchema = z.array(presentationExportWarningSchema).max(500);

export type PresentationExportWarning = z.infer<typeof presentationExportWarningSchema>;
