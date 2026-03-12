import { z } from "zod";

// Canvas preset dimensions — must match PRESENTATION_CANVAS_PRESETS in client/src/presentation-canvas/constants.ts
export const CANVAS_PRESET_MAP: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1280, height: 720 },
  "9:16": { width: 720, height: 1280 },
  "4:3": { width: 1024, height: 768 },
  "3:4": { width: 768, height: 1024 },
  "4:5": { width: 960, height: 1200 },
  "5:4": { width: 1250, height: 1000 },
  "1:1": { width: 1080, height: 1080 },
};

export function canvasPresetToSize(preset: string): { width: number; height: number } | null {
  return CANVAS_PRESET_MAP[preset] ?? null;
}

export const canvasPresetSchema = z.enum(["16:9", "9:16", "4:3", "3:4", "4:5", "5:4", "1:1"]);

export const InputItemSchema = z.object({
  topic: z.string().min(1).max(5000),
  custom_article_text: z.string().max(50000).optional(),
  params: z.record(z.unknown()).optional(),
  attachments: z.array(z.string().url()).max(10).optional(),
});

export type InputItem = z.infer<typeof InputItemSchema>;

export const AutoDraftRequestSchema = z.object({
  topic: z.string().min(3).max(1000),
  article_skill_slug: z.string().min(1).max(100).optional(),
  media_skill_slug: z.string().min(1).max(100).optional(),
  image_model_id: z.string().max(100).optional(),
  canvas_preset: canvasPresetSchema.optional().default("16:9"),
  num_slides: z.number().int().min(1).max(30).optional(),
  language: z.string().min(2).max(10).optional(),
  style_preset: z.string().max(100).optional(),
  reference_image_urls: z.array(z.string()).max(5).optional(),
  source: z.string().max(200).optional(),
  trace_id: z.string().max(100).optional(),
});

export type AutoDraftRequest = z.infer<typeof AutoDraftRequestSchema>;

export const AutoDraftResponseSchema = z.object({
  success: z.boolean(),
  deck_id: z.number().int().positive().optional(),
  slide_count: z.number().int().min(0).optional(),
  credits_used: z.number().min(0).optional(),
  warnings: z.array(z.string()).optional(),
  error: z.string().optional(),
});

export type AutoDraftResponse = z.infer<typeof AutoDraftResponseSchema>;

export const ModelSuggestRequestSchema = z.object({
  purpose: z.enum(["image", "video", "audio", "text"]),
  quality_preference: z.enum(["speed", "balanced", "quality"]).optional().default("balanced"),
});

export type ModelSuggestRequest = z.infer<typeof ModelSuggestRequestSchema>;

const modelEntrySchema = z.object({
  model_id: z.string(),
  name: z.string(),
  provider: z.string(),
  cost_tier: z.enum(["low", "medium", "high"]),
  description: z.string(),
});

export const ModelSuggestResponseSchema = z.object({
  success: z.boolean(),
  recommended: modelEntrySchema.nullable(),
  alternatives: z.array(modelEntrySchema).max(3),
  message: z.string().optional(),
});

export type ModelSuggestResponse = z.infer<typeof ModelSuggestResponseSchema>;

export const FileParseRequestSchema = z.object({
  file_url: z.string().url(),
  file_type: z.enum(["csv", "xlsx", "txt"]).optional(),
  topic_column: z.string().min(1).max(100).optional().default("topic"),
  params_columns: z.record(z.string()).optional(),
  parse_mode: z.enum(["per_line", "single"]).optional().default("per_line"),
  max_rows: z.number().int().min(1).max(100).optional().default(100),
});

export type FileParseRequest = z.infer<typeof FileParseRequestSchema>;

export const FileParseResponseSchema = z.object({
  items: z.array(InputItemSchema),
  total_rows: z.number().int(),
  parsed_rows: z.number().int(),
  warnings: z.array(z.string()).optional(),
});

export type FileParseResponse = z.infer<typeof FileParseResponseSchema>;

// Draft params without topic (topic comes from template in schedule context)
const DraftParamsSchema = AutoDraftRequestSchema.omit({ topic: true });

export const ScheduleDraftRequestSchema = z
  .object({
    topic_template: z.string().min(3).max(1000),
    schedule_type: z.enum(["one_time", "recurring"]),
    cron_expression: z.string().max(100).optional(),
    run_at: z.string().datetime().optional(),
    timezone: z.string().max(50).optional().default("UTC"),
    draft_params: DraftParamsSchema.optional(),
    notify_email: z.string().email().optional(),
    notify_webhook_url: z.string().url().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.schedule_type === "recurring" && !data.cron_expression) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "cron_expression is required for recurring schedules",
        path: ["cron_expression"],
      });
    }
    if (data.schedule_type === "one_time" && !data.run_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "run_at is required for one_time schedules",
        path: ["run_at"],
      });
    }
  });

export type ScheduleDraftRequest = z.infer<typeof ScheduleDraftRequestSchema>;

export const ScheduleDraftResponseSchema = z.object({
  schedule_id: z.number().int().positive(),
  next_run: z.string().datetime(),
  status: z.enum(["active", "paused", "completed"]),
});

export type ScheduleDraftResponse = z.infer<typeof ScheduleDraftResponseSchema>;
