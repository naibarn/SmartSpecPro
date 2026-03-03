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
] as const;

export type PresentationExportWarningCode = typeof PRESENTATION_EXPORT_WARNING_CODE_VALUES[number];

export const presentationExportWarningCodeSchema = z.enum(PRESENTATION_EXPORT_WARNING_CODE_VALUES);

export const presentationExportWarningSchema = z.object({
  code: presentationExportWarningCodeSchema,
  slideId: z.number().int().positive(),
  detail: z.string().min(1).max(240).optional(),
});

export const presentationExportWarningsSchema = z.array(presentationExportWarningSchema).max(500);

export type PresentationExportWarning = z.infer<typeof presentationExportWarningSchema>;
