import { z } from "zod";

// ── Layout template IDs used by AI generation ──────────────
export const AI_LAYOUT_TEMPLATE_IDS = [
  "hero_center",
  "split_left_image",
  "split_right_image",
  "top_image_text_bottom",
  "bottom_image_text_top",
  "feature_boxes_right",
] as const;

// ── SVG graphic categories available in the catalog ────────
export const AI_SVG_CATEGORIES = [
  "Arrows",
  "Business",
  "Communication",
  "Technology",
  "Education",
  "Nature",
  "Health",
  "Shapes",
  "Media",
  "Navigation",
  "Finance",
] as const;

// ── Built-in style preset IDs ──────────────────────────────
export const AI_STYLE_PRESET_IDS = [
  "dark-professional",
  "light-minimalist",
  "corporate-blue",
  "nature-green",
  "warm-sunset",
  "editorial-clean",
  "midnight-luxe",
] as const;

export const AI_WATERMARK_FORMATS = [
  "png",
  "jpg",
] as const;

export const AI_GEOMETRIC_CROP_SHAPES = [
  "auto",
  "rect",
  "circle",
  "triangle",
] as const;

export const AI_GEOMETRIC_ACCENT_SHAPES = [
  "auto",
  "rect",
  "circle",
  "triangle",
] as const;

export const MAX_AI_DRAFT_SLIDES = 30;

const referenceImageUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), {
    message: "Reference URL must be a relative path or http(s) URL",
  });

const watermarkImageUrlSchema = referenceImageUrlSchema.refine(
  (value) => /\.(png|jpe?g)(?:[?#].*)?$/i.test(value),
  { message: "Watermark URL must be PNG or JPG" },
);

export const AIWatermarkSchema = z.object({
  sourceUrl: watermarkImageUrlSchema,
  format: z.enum(AI_WATERMARK_FORMATS),
  clarityPercent: z.number().int().min(5).max(100).multipleOf(5).default(20),
}).strict();

// ── SlideStylePreset schemas ───────────────────────────────

export const SlideStylePresetHeaderSchema = z.object({
  enabled: z.boolean(),
  height: z.number().positive(),
  backgroundColor: z.string(),
  logoPosition: z.enum(["left", "center", "right"]).optional(),
  showDeckTitle: z.boolean().optional(),
  customTitle: z.string().max(200).optional(),
  titleFontSize: z.number().optional(),
  titleColor: z.string().optional(),
  borderBottom: z.string().optional(),
});

export const SlideStylePresetFooterSchema = z.object({
  enabled: z.boolean(),
  height: z.number().positive(),
  backgroundColor: z.string(),
  showPageNumber: z.boolean().optional(),
  showCustomText: z.boolean().optional(),
  customText: z.string().optional(),
  fontSize: z.number().optional(),
  textColor: z.string().optional(),
  borderTop: z.string().optional(),
});

export const SlideStylePresetSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  nameLocalized: z
    .object({
      th: z.string().optional(),
      en: z.string().optional(),
    })
    .optional(),
  colors: z.object({
    background: z.string(),
    backgroundAlt: z.string(),
    primary: z.string(),
    secondary: z.string(),
    text: z.string(),
    textMuted: z.string(),
    cardBg: z.tuple([z.string(), z.string(), z.string()]),
    overlay: z.string(),
  }),
  typography: z.object({
    titleFontFamily: z.string(),
    bodyFontFamily: z.string(),
    titleFontWeight: z.number(),
    bodyFontWeight: z.number(),
  }),
  header: SlideStylePresetHeaderSchema.optional(),
  footer: SlideStylePresetFooterSchema.optional(),
});

export type SlideStylePreset = z.infer<typeof SlideStylePresetSchema>;
export type SlideStylePresetHeader = z.infer<
  typeof SlideStylePresetHeaderSchema
>;
export type SlideStylePresetFooter = z.infer<
  typeof SlideStylePresetFooterSchema
>;

// ── AIPresentationSlide schema ─────────────────────────────

export const AIPresentationSlideSchema = z.object({
  templateId: z.enum(AI_LAYOUT_TEMPLATE_IDS),
  title: z.string().min(1).max(200),
  body: z.array(z.string()).min(1).max(10),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).max(180),
        details: z.array(z.string().min(1).max(260)).min(1).max(4),
      }),
    )
    .min(1)
    .max(6)
    .optional(),
  graphicCategory: z.enum(AI_SVG_CATEGORIES),
  imagePromptKeywords: z.string().min(1).max(500),
});

export type AIPresentationSlide = z.infer<typeof AIPresentationSlideSchema>;

export const AIPresentationSchema = z
  .array(AIPresentationSlideSchema)
  .min(1)
  .max(MAX_AI_DRAFT_SLIDES);

// ── GenerateAIDraftInput schema (tRPC input) ───────────────

export const GenerateAIDraftInputSchema = z.object({
  deckId: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
  prompt: z.string().min(3).max(1000),
  numSlides: z.number().int().min(1).max(MAX_AI_DRAFT_SLIDES).default(5),
  language: z.enum(["auto", "en", "th"]).default("auto"),
  draftSkillId: z.string().min(1).optional(),
  articleSkillId: z.string().min(1).optional(),
  useCustomArticle: z.boolean().default(false),
  customArticleText: z.string().min(1).max(20_000).optional(),
  hideTextOnSlides: z.boolean().default(false),
  imageSkillId: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
  generateAudio: z.boolean().default(false),
  audioModel: z.string().min(1).optional(),
  canvasWidth: z.number().int().positive().max(10_000).optional(),
  canvasHeight: z.number().int().positive().max(10_000).optional(),
  imagePromptContext: z.string().max(1000).optional(),
  referenceImageUrls: z.array(referenceImageUrlSchema).max(5).optional(),
  mediaModelExtraParams: z.record(z.string(), z.any()).optional(),
  audioModelExtraParams: z.record(z.string(), z.any()).optional(),
  stylePresetId: z.enum(AI_STYLE_PRESET_IDS).default("dark-professional"),
  headerCustomText: z.string().max(200).optional(),
  footerCustomText: z.string().max(200).optional(),
  styleOverrides: z
    .object({
      headerEnabled: z.boolean().optional(),
      showDeckTitle: z.boolean().optional(),
      footerEnabled: z.boolean().optional(),
      showPageNumber: z.boolean().optional(),
    })
    .optional(),
  watermark: AIWatermarkSchema.optional(),
  draftSkillParams: z.record(z.string(), z.any()).optional(),
  articleSkillParams: z.record(z.string(), z.any()).optional(),
}).superRefine((value, ctx) => {
  if (value.useCustomArticle) {
    if (!value.customArticleText?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customArticleText"],
        message: "Custom article text is required when using your own article",
      });
    }
    return;
  }

  if (!value.draftSkillId?.trim() && !value.articleSkillId?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["draftSkillId"],
      message: "Draft skill is required when custom article mode is disabled",
    });
  }
});

export type GenerateAIDraftInput = z.infer<typeof GenerateAIDraftInputSchema>;
export type AIWatermark = z.infer<typeof AIWatermarkSchema>;

// ── GenerateAIDraftOutput schema ───────────────────────────

export const GenerateAIDraftOutputSchema = z.object({
  taskId: z.string().min(1),
  alreadyInProgress: z.boolean().optional(),
});

export type GenerateAIDraftOutput = z.infer<typeof GenerateAIDraftOutputSchema>;

// ── AIDraftProgress schema (polling response) ──────────────

export const AIDraftProgressSchema = z.object({
  phase: z.number().int().min(0).max(7),
  phaseLabel: z.string(),
  slidesCompleted: z.number().int().nonnegative(),
  totalSlides: z.number().int().nonnegative(),
  slidePreview: z.array(
    z.object({
      title: z.string(),
      imageStatus: z.enum(["pending", "generating", "done", "placeholder"]),
    }),
  ),
  completed: z.boolean(),
  cancelled: z.boolean().optional(),
  result: z
    .object({
      slidesAdded: z.number(),
      newDeckVersion: z.number(),
      articlePreview: z.string(),
      warnings: z.array(z.string()),
    })
    .optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .optional(),
});

export type AIDraftProgress = z.infer<typeof AIDraftProgressSchema>;
