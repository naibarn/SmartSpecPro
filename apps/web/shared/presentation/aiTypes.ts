import { z } from "zod";

// ── Layout template IDs used by AI generation ──────────────
export const AI_LAYOUT_TEMPLATE_IDS = [
  "hero_center",
  "split_left_image",
  "split_right_image",
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
] as const;

// ── SlideStylePreset schemas ───────────────────────────────

export const SlideStylePresetHeaderSchema = z.object({
  enabled: z.boolean(),
  height: z.number().positive(),
  backgroundColor: z.string(),
  logoPosition: z.enum(["left", "center", "right"]).optional(),
  showDeckTitle: z.boolean().optional(),
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
  graphicCategory: z.enum(AI_SVG_CATEGORIES),
  imagePromptKeywords: z.string().min(1).max(500),
});

export type AIPresentationSlide = z.infer<typeof AIPresentationSlideSchema>;

export const AIPresentationSchema = z
  .array(AIPresentationSlideSchema)
  .min(1)
  .max(10);

// ── GenerateAIDraftInput schema (tRPC input) ───────────────

export const GenerateAIDraftInputSchema = z.object({
  deckId: z.number().int().positive(),
  expectedVersion: z.number().int().nonnegative(),
  prompt: z.string().min(3).max(1000),
  numSlides: z.number().int().min(1).max(10).default(5),
  language: z.enum(["auto", "en", "th"]).default("auto"),
  articleSkillId: z.string().min(1),
  imageSkillId: z.string().min(1).optional(),
  imageModel: z.string().min(1).optional(),
  stylePresetId: z.enum(AI_STYLE_PRESET_IDS).default("dark-professional"),
  footerCustomText: z.string().max(200).optional(),
});

export type GenerateAIDraftInput = z.infer<typeof GenerateAIDraftInputSchema>;

// ── GenerateAIDraftOutput schema ───────────────────────────

export const GenerateAIDraftOutputSchema = z.object({
  taskId: z.string().min(1),
});

export type GenerateAIDraftOutput = z.infer<typeof GenerateAIDraftOutputSchema>;

// ── AIDraftProgress schema (polling response) ──────────────

export const AIDraftProgressSchema = z.object({
  phase: z.number().int().min(0).max(6),
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
