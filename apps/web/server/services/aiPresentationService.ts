import type {
  AIPresentationComponentRecipeId,
  GenerateAIDraftInput,
  AIPresentationSlide,
  AIDraftProgress,
  AIWatermark,
  SlideStylePreset,
} from "@shared/presentation/aiTypes";
import {
  AI_COMPONENT_RECIPE_IDS,
  AI_GEOMETRIC_ACCENT_SHAPES,
  AIWatermarkSchema,
  AIPresentationSchema,
  AIPresentationSlideSchema,
  AI_GEOMETRIC_CROP_SHAPES,
  AI_LAYOUT_TEMPLATE_IDS,
  MAX_AI_DRAFT_SLIDES,
  AI_STYLE_PRESET_IDS,
  AI_SVG_CATEGORIES,
} from "@shared/presentation/aiTypes";
import { BUILT_IN_PRESETS, getBuiltInPreset } from "@shared/presentation/aiStylePresets";
import { pickRandomSvgFromCategory } from "@shared/presentation/svgGraphicsCatalog";
import { PRESENTATION_ERROR_CODE, PRESENTATION_LIMITS } from "@shared/presentation/constants";
import {
  classifyDraftSkillCapability,
  getDraftSkillMediaType,
  shouldUseDraftSkillForMedia,
} from "@shared/presentation/draftSkillCapabilities";
import {
  PRESENTATION_COMPONENT_AI_GUIDANCE,
  PRESENTATION_COMPONENT_LAYOUT_FAMILIES,
  PRESENTATION_COMPONENT_MEDIA_SLOTS,
  PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES,
  PRESENTATION_COMPONENT_SLOT_BUDGETS,
  presentationMediaSlotSupportsType,
} from "@shared/presentation/componentRecipes";
import { buildPresentationComponentRecipeSlotBindings } from "@shared/presentation/componentRecipeSlotBindings";
import {
  getPresentationSlideRenderableElements,
  presentationSlideAIDesignSchema,
  presentationRenderOrderIdForComponent,
  presentationSlideContentSchema,
  resolvePresentationSlideRenderOrder,
  type AudioTrackInput,
  type PresentationComponentInstance,
  type PresentationComponentSlotBinding,
  type PresentationAIDesignFallbackHistory,
  type PresentationAIDesignFitScore,
  type PresentationAIDesignMediaModeMetadata,
  type PresentationAIDesignSourceTrace,
  type PresentationSlideContent,
  type PresentationPendingMediaJob,
} from "@shared/presentation/contracts";
import {
  buildPresentationContentProfile,
  resolvePresentationLayoutMode,
  type PresentationAILayoutMode,
  type PresentationAILayoutModeCandidate,
} from "@shared/presentation/contentProfile";
import {
  PRESENTATION_RECIPE_COMPACTION_LEVELS,
  PRESENTATION_RECIPE_FIT_THRESHOLDS,
  buildDefaultRecipeSourceTrace,
  evaluatePresentationRecipeSlotFit,
  presentationRecipeCompactionResponseSchema,
  type PresentationRecipeCompactionLevel,
} from "@shared/presentation/recipeCompaction";
import {
  evaluateSlideQualityGate,
  evaluateSourceTraceOmission,
} from "@shared/presentation/qualityGate";
import {
  buildDeckConsistencyEvent,
  buildModeSelectedEvent,
  buildQualityGateEvent,
} from "@shared/presentation/layoutTelemetry";
import { evaluateDeckConsistency } from "@shared/presentation/deckConsistency";
import {
  PRESENTATION_LAYOUT_DSL_ALLOWED_PRIMITIVES,
  PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS,
  PRESENTATION_LAYOUT_DSL_MAX_GROUPS,
  normalizePresentationLayoutDslToSlideContent,
  presentationLayoutDslRequestSchema,
  presentationLayoutDslResponseSchema,
} from "@shared/presentation/layoutDsl";
import { randomBytes } from "node:crypto";
import { z } from "zod";

import { callLLMStructured } from "./callLLMStructured";
import { getSkillByIdAsync } from "./skillRegistry";
import { mediaGenerationService, type ImageModel, type MediaTask, type TaskStatus } from "./mediaGenerationService";
import { getModelsByTypeAsync, type ModelDefinition } from "./modelRegistry";
import {
  addSlideToDeck,
  getPresentationDeckDetail,
  updatePresentationDeckMetadata,
  updateSlideInDeck,
  type PresentationActor,
} from "./presentationService";
import { addMediaTaskToLibrary } from "./mediaLibraryService";
import { deductCredits, deductCreditsForModel, hasEnoughCredits } from "./creditService";
import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";
import { getDb, type DrizzleDB } from "../db";
import { generateSlide } from "./aiPresentationLayoutEngine";
import {
  applyAIRecipeMediaMetadata,
  applyResolvedMediaToAIRecipeSlideContent,
  findAIRecipePendingMediaTarget,
  findAIRecipePendingMediaTargets,
} from "./aiPresentationComponentRecipes";
import { resolveTtsTextFromSlideNote } from "./ttsText";
import { buildAlgorithmicSlideLayout } from "./aiPresentationAlgorithmicLayout";
import { executeWithFallback, resolveProviders } from "./llmRouter";
import { loadEnabledModelsWithPricing } from "./capabilityRegistry";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { selectBestLlmModel } from "./intelligentModelSelector";
import { llmProviders, modelProviderMap, presentationDecks } from "../../drizzle/schema";
import { and, asc, eq } from "drizzle-orm";
import {
  applyWatermarkToSlideContent,
  extractWatermarkFromSlideContent,
} from "./presentationWatermarkService";
import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
import { linkArtifactToTaskRun } from "./taskRunStore";

// ── Constants ──────────────────────────────────────────────

const IMAGE_POLL_INTERVAL_MS = 2000;
const IMAGE_POLL_BASE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 90000;
})();
const IMAGE_POLL_TIMEOUT_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 4000;
})();
const IMAGE_POLL_TIMEOUT_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_POLL_TIMEOUT_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 300000;
})();
const VIDEO_POLL_BASE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 480000;
})();
const VIDEO_POLL_TIMEOUT_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 90000;
})();
const VIDEO_POLL_TIMEOUT_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_POLL_TIMEOUT_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 3600000;
})();
const VIDEO_POLL_ACTIVE_GRACE_BASE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 600000;
})();
const VIDEO_POLL_ACTIVE_GRACE_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 120000;
})();
const VIDEO_POLL_ACTIVE_GRACE_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_VIDEO_ACTIVE_GRACE_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 1800000;
})();
const AUDIO_POLL_BASE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_AUDIO_POLL_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 180000;
})();
const AUDIO_POLL_TIMEOUT_PER_SLIDE_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_AUDIO_POLL_TIMEOUT_PER_SLIDE_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 0) {
    return raw;
  }
  return 15000;
})();
const AUDIO_POLL_TIMEOUT_MAX_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_AUDIO_POLL_TIMEOUT_MAX_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 10000) {
    return raw;
  }
  return 600000;
})();
const LOCK_TTL_SECONDS = 300;
const PROGRESS_TTL_SECONDS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_PROGRESS_TTL_SECONDS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 300) {
    return raw;
  }
  return 3600;
})();
const HEARTBEAT_INTERVAL_MS = 30000;
const SLIDE_SPLIT_MIN_WORDS = 2400;
const SLIDE_SPLIT_MAX_WORDS = 6000;
const ARTICLE_TARGET_WORDS_MIN = 320;
const ARTICLE_TARGET_WORDS_MAX = 3600;
const ARTICLE_WORDS_PER_SLIDE_EN = 108;
const ARTICLE_WORDS_PER_SLIDE_TH = 92;
const ARTICLE_WORD_PRESET_TARGETS: Record<string, number> = {
  short: 400,
  medium: 700,
  long: 1200,
};
const MAX_IMAGE_CONCURRENCY = 3;
const MEDIA_SUBMIT_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_MEDIA_SUBMIT_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 45000;
})();
const MEDIA_STATUS_FETCH_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_MEDIA_STATUS_FETCH_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 2000) {
    return raw;
  }
  return 15000;
})();
const IMAGE_PROMPT_ENHANCE_TIMEOUT_MS = (() => {
  const raw = Number.parseInt(process.env.AI_DRAFT_IMAGE_PROMPT_ENHANCE_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 5000) {
    return raw;
  }
  return 30000;
})();
const AI_DRAFT_CANCEL_POLL_INTERVAL_MS = 1000;
const AI_DRAFT_TEXT_TIMEOUT_DEFAULT_MS = 180000;
const AI_DRAFT_STRUCTURED_TIMEOUT_DEFAULT_MS = 120000;
const AI_DRAFT_RECIPE_COMPACTION_TIMEOUT_DEFAULT_MS = 90000;
const AI_DRAFT_RECIPE_COMPACTION_TOTAL_TIMEOUT_DEFAULT_MS = 120000;
const AI_DRAFT_LAYOUT_DSL_TIMEOUT_DEFAULT_MS = 90000;
const AI_DRAFT_LAYOUT_DSL_TOTAL_TIMEOUT_DEFAULT_MS = 120000;

const CREDIT_ARTICLE = 30;
const CREDIT_SPLIT = 10;
const CREDIT_IMAGE_SKILL = 75;
const CREDIT_IMAGE_GEN = 40;
const CREDIT_AUDIO_GEN = 40;
const CREDIT_BUFFER_MULTIPLIER = 1.2;
const PRESENTATION_LAYOUT_DSL_ENV_FLAG = "PRESENTATION_AI_LAYOUT_DSL_ENABLED";
const PRESENTATION_FULL_SLIDE_MEDIA_ENV_FLAG = "PRESENTATION_AI_FULL_SLIDE_MEDIA_ENABLED";
/**
 * Resolve the best available text model dynamically from the DB.
 * Prefers models with structured output support and large context,
 * sorted by provider priority. Falls back to a known model ID only
 * if the DB is unreachable.
 */
let _cachedDefaultTextModel: { modelId: string; ts: number } | null = null;
const DEFAULT_TEXT_MODEL_CACHE_TTL_MS = 60_000;
const LAST_RESORT_MODEL = "gpt-4o-mini"; // only used if DB query fails entirely

async function resolveDefaultTextModel(): Promise<string> {
  const now = Date.now();
  if (_cachedDefaultTextModel && now - _cachedDefaultTextModel.ts < DEFAULT_TEXT_MODEL_CACHE_TTL_MS) {
    return _cachedDefaultTextModel.modelId;
  }

  try {
    // Use shared intelligent selector (Feature 041) — sorted by priority ASC
    const rows = await loadEnabledLlmModelRows();
    if (rows.length === 0) {
      return LAST_RESORT_MODEL;
    }

    // Prefer models with structured outputs (most useful for presentation generation)
    const best = selectBestLlmModel(
      { supportsStructuredOutputs: true, supportsFunctionTools: true },
      rows,
    );

    // Fall back to highest-priority enabled model if requirements too strict
    const topModelId = best
      ?? rows.sort((a, b) => a.priority - b.priority)[0]?.modelId
      ?? LAST_RESORT_MODEL;

    _cachedDefaultTextModel = { modelId: topModelId, ts: now };
    return topModelId;
  } catch {
    return _cachedDefaultTextModel?.modelId ?? LAST_RESORT_MODEL;
  }
}

// Synchronous accessor for non-critical paths (uses cached value or last-resort)
function getDefaultTextModelSync(): string {
  return _cachedDefaultTextModel?.modelId ?? LAST_RESORT_MODEL;
}

const FALLBACK_IMAGE_MODEL: ImageModel = "flux-2.0";
const FALLBACK_VIDEO_MODEL: ImageModel = "veo-3-1";
const FALLBACK_AUDIO_MODEL = "elevenlabs-tts";
const DEFAULT_CANVAS_WIDTH = 1280;
const DEFAULT_CANVAS_HEIGHT = 720;
const MIN_CANVAS_DIMENSION = 64;
const MAX_CANVAS_DIMENSION = 10_000;

const CANVAS_PRESET_BY_RATIO: Record<string, "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1"> = {
  "16:9": "16:9",
  "9:16": "9:16",
  "4:3": "4:3",
  "3:4": "3:4",
  "4:5": "4:5",
  "5:4": "5:4",
  "1:1": "1:1",
};

type LayoutTemplateId = (typeof AI_LAYOUT_TEMPLATE_IDS)[number];
type GraphicCategoryId = (typeof AI_SVG_CATEGORIES)[number];
type StylePresetId = (typeof AI_STYLE_PRESET_IDS)[number];
type GeometricCropShapeId = (typeof AI_GEOMETRIC_CROP_SHAPES)[number];
type GeometricAccentShapeId = (typeof AI_GEOMETRIC_ACCENT_SHAPES)[number];
type SlideElement = PresentationSlideContent["elements"][number];
type SlideTextElement = Extract<SlideElement, { type: "text" }>;
type SlideImageElement = Extract<SlideElement, { type: "image" }>;
type SlideRectElement = Extract<SlideElement, { type: "rect" }>;
type SlideVideoElement = Extract<SlideElement, { type: "video" }>;
type SlidePendingMediaJob = PresentationPendingMediaJob;

const LenientAIPresentationSlideSchema = z.object({
  templateId: z.string().optional(),
  componentRecipeId: z.string().optional(),
  mediaPlan: z.array(z.object({
    slotId: z.string().optional(),
    prompt: z.string().optional(),
  }).passthrough()).max(8).optional(),
  title: z.string().optional(),
  body: z.array(z.unknown()).max(12).optional(),
  notes: z.string().optional(),
  markdownHierarchy: z
    .array(
      z.object({
        level: z.enum(["h2", "h3", "body"]).optional(),
        text: z.string().optional(),
      }).passthrough(),
    )
    .max(24)
    .optional(),
  sections: z
    .array(
      z.object({
        heading: z.string().optional(),
        details: z.array(z.unknown()).max(6).optional(),
      }).passthrough(),
    )
    .max(6)
    .optional(),
  graphicCategory: z.string().optional(),
  imagePromptKeywords: z.string().optional(),
}).passthrough();

const LenientAIPresentationSchema = z
  .array(LenientAIPresentationSlideSchema)
  .min(1)
  .max(MAX_AI_DRAFT_SLIDES);
type LenientAIPresentationSlide = z.infer<typeof LenientAIPresentationSlideSchema>;

interface DeferredMediaTaskInfo {
  mediaType: "image" | "video";
  mediaTaskId: string;
  providerTaskId?: string;
  modelId?: string;
  prompt?: string;
  slotId?: string;
  reason?: string;
}

interface MediaGenerationPlanEntry {
  prompt: string;
  slotId?: string;
}

interface DraftAwaitConfig {
  cancelLabel: string;
  timeoutLabel: string;
  timeoutMs: number;
}

type DraftAwaitStep = <T>(
  promise: Promise<T>,
  config: DraftAwaitConfig,
) => Promise<T>;

interface SkillLLMBillingContext {
  description: string;
  taskId: string;
  deckId: number;
  phase: number;
  stage: string;
  slideIndex?: number;
  promptPreview?: string;
}

interface MediaBillingContext {
  userId: number;
  tenantId?: string;
  deckId: number;
  aiDraftTaskId?: string;
  slideIndex: number;
  totalSlides: number;
  mediaType: "image" | "video" | "audio";
  modelId: string;
  provider?: string;
  promptPreview?: string;
  task: MediaTask;
  fallbackCredits?: number;
  stage: string;
}

class BillingChargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingChargeError";
  }
}

class AIDraftCancelledError extends Error {
  constructor(message = "ai_draft_cancelled") {
    super(message);
    this.name = "AIDraftCancelledError";
  }
}

interface RelayoutSlideInput {
  slideTitle: string;
  slideContent: PresentationSlideContent;
  slideNotes?: string | null;
  userToken?: string;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  stylePresetId?: StylePresetId;
  templateId?: LayoutTemplateId;
  preferredComponentRecipeId?: AIPresentationComponentRecipeId;
  includeSvg?: boolean;
  includeGeometricCrop?: boolean;
  geometricCropShape?: GeometricCropShapeId;
  includeGeometricAccents?: boolean;
  geometricAccentShape?: GeometricAccentShapeId;
  layoutSeed?: number;
  watermark?: AIWatermark;
  supplementalMediaClarityPercent?: number;
}

interface RelayoutSlideOutput {
  slideContent: PresentationSlideContent;
  warnings: string[];
  applied: {
    templateId: LayoutTemplateId;
    stylePresetId: StylePresetId;
    graphicCategory: GraphicCategoryId;
    reusedImage: boolean;
  };
}

interface RepairSlideFromSavedNoteInput {
  deckId: number;
  slideTitle: string;
  slideContent: PresentationSlideContent;
  slideNotes: string;
  deckTitle?: string;
  slideIndex: number;
  totalSlides: number;
  stylePresetId?: StylePresetId;
}

interface RepairSlideFromSavedNoteOutput {
  title: string;
  slideContent: PresentationSlideContent;
  warnings: string[];
  applied: {
    templateId: LayoutTemplateId;
    stylePresetId: StylePresetId;
    graphicCategory: GraphicCategoryId;
    regeneratedImage: boolean;
  };
}

export function finalizeSlideContentAfterRepair(
  slideContent: PresentationSlideContent,
  warnings: string[],
): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.safeParse(slideContent);
  if (parsed.success) {
    return parsed.data;
  }

  const aiDesignParsed = presentationSlideAIDesignSchema.safeParse(slideContent.aiDesign);
  if (!aiDesignParsed.success) {
    const withoutAIDesign = { ...slideContent };
    delete (withoutAIDesign as Partial<PresentationSlideContent>).aiDesign;
    const withoutAIDesignParsed = presentationSlideContentSchema.safeParse(withoutAIDesign);
    if (withoutAIDesignParsed.success) {
      warnings.push("Regenerated slide content omitted incompatible AI metadata to satisfy schema validation.");
      return withoutAIDesignParsed.data;
    }
  }

  const baseFallback: PresentationSlideContent = {
    elements: slideContent.elements,
    ...(slideContent.components?.length ? { components: slideContent.components } : {}),
    ...(slideContent.renderOrder?.length ? { renderOrder: slideContent.renderOrder } : {}),
    ...(slideContent.canvas ? { canvas: slideContent.canvas } : {}),
    ...(slideContent.transition ? { transition: slideContent.transition } : {}),
    ...(slideContent.durationMs ? { durationMs: slideContent.durationMs } : {}),
    ...(slideContent.background ? { background: slideContent.background } : {}),
    ...(slideContent.visualOnly ? { visualOnly: slideContent.visualOnly } : {}),
  };
  const fallbackParsed = presentationSlideContentSchema.safeParse(baseFallback);
  if (fallbackParsed.success) {
    warnings.push("Regenerated slide content dropped incompatible optional metadata to satisfy schema validation.");
    return fallbackParsed.data;
  }

  warnings.push("Regenerated slide content used a minimal schema-safe fallback payload.");
  return presentationSlideContentSchema.parse({
    elements: slideContent.elements.filter((element) => element.type === "text" || element.type === "image" || element.type === "video"),
    ...(slideContent.canvas ? { canvas: slideContent.canvas } : {}),
    ...(slideContent.transition ? { transition: slideContent.transition } : {}),
    ...(slideContent.durationMs ? { durationMs: slideContent.durationMs } : {}),
  });
}

export function finalizeSlideContentAfterRelayout(
  slideContent: PresentationSlideContent,
  warnings: string[],
): PresentationSlideContent {
  const parsed = presentationSlideContentSchema.safeParse(slideContent);
  if (parsed.success) {
    return parsed.data;
  }

  const aiDesignParsed = presentationSlideAIDesignSchema.safeParse(slideContent.aiDesign);
  if (!aiDesignParsed.success) {
    const withoutAIDesign = { ...slideContent };
    delete (withoutAIDesign as Partial<PresentationSlideContent>).aiDesign;
    const withoutAIDesignParsed = presentationSlideContentSchema.safeParse(withoutAIDesign);
    if (withoutAIDesignParsed.success) {
      warnings.push("Auto layout omitted incompatible AI metadata to satisfy schema validation.");
      return withoutAIDesignParsed.data;
    }
  }

  const baseFallback: PresentationSlideContent = {
    elements: slideContent.elements,
    ...(slideContent.components?.length ? { components: slideContent.components } : {}),
    ...(slideContent.renderOrder?.length ? { renderOrder: slideContent.renderOrder } : {}),
    ...(slideContent.canvas ? { canvas: slideContent.canvas } : {}),
    ...(slideContent.transition ? { transition: slideContent.transition } : {}),
    ...(slideContent.durationMs ? { durationMs: slideContent.durationMs } : {}),
    ...(slideContent.background ? { background: slideContent.background } : {}),
    ...(slideContent.visualOnly ? { visualOnly: slideContent.visualOnly } : {}),
  };
  const fallbackParsed = presentationSlideContentSchema.safeParse(baseFallback);
  if (fallbackParsed.success) {
    warnings.push("Auto layout dropped incompatible optional metadata to satisfy schema validation.");
    return fallbackParsed.data;
  }

  warnings.push("Auto layout used a minimal schema-safe fallback payload.");
  return presentationSlideContentSchema.parse({
    elements: slideContent.elements.filter((element) => element.type === "text" || element.type === "image" || element.type === "video"),
    ...(slideContent.canvas ? { canvas: slideContent.canvas } : {}),
    ...(slideContent.transition ? { transition: slideContent.transition } : {}),
    ...(slideContent.durationMs ? { durationMs: slideContent.durationMs } : {}),
  });
}

interface RGBColor {
  r: number;
  g: number;
  b: number;
}

interface RelayoutMediaSources {
  imageUrls: string[];
  videoUrls: string[];
}

interface RelayoutNarrative {
  title: string;
  body: string[];
  sections: Array<{ heading: string; details: string[] }>;
  notes?: string;
  source: "aiDesign" | "slideNotes" | "rendered";
  templateId: LayoutTemplateId;
}

function parseCssColorToRgb(value: string | undefined | null): RGBColor | null {
  if (!value) {
    return null;
  }
  const color = value.trim().toLowerCase();
  if (color.length === 0) {
    return null;
  }
  const hex3 = color.match(/^#([0-9a-f]{3})$/i);
  if (hex3) {
    const [, digits] = hex3;
    return {
      r: Number.parseInt(digits[0] + digits[0], 16),
      g: Number.parseInt(digits[1] + digits[1], 16),
      b: Number.parseInt(digits[2] + digits[2], 16),
    };
  }
  const hex6 = color.match(/^#([0-9a-f]{6})$/i);
  if (hex6) {
    const [, digits] = hex6;
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }
  const rgb = color.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const parts = rgb[1].split(",").map((part) => Number.parseFloat(part.trim()));
    if (parts.length >= 3 && parts.slice(0, 3).every((num) => Number.isFinite(num))) {
      return {
        r: Math.max(0, Math.min(255, Math.round(parts[0]))),
        g: Math.max(0, Math.min(255, Math.round(parts[1]))),
        b: Math.max(0, Math.min(255, Math.round(parts[2]))),
      };
    }
  }
  return null;
}

function colorDistance(a: RGBColor, b: RGBColor): number {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt((dr * dr) + (dg * dg) + (db * db));
}

function resolveSlideCanvasDimensions(slideContent: PresentationSlideContent): {
  width: number;
  height: number;
  preset?: "16:9" | "9:16" | "4:3" | "3:4" | "4:5" | "5:4" | "1:1";
} {
  const canvasWidth = sanitizeCanvasDimension(slideContent.canvas?.width);
  const canvasHeight = sanitizeCanvasDimension(slideContent.canvas?.height);
  if (canvasWidth && canvasHeight) {
    return {
      width: canvasWidth,
      height: canvasHeight,
      preset: slideContent.canvas?.preset,
    };
  }

  let inferredWidth = 0;
  let inferredHeight = 0;
  for (const element of slideContent.elements) {
    inferredWidth = Math.max(inferredWidth, element.x + element.width);
    inferredHeight = Math.max(inferredHeight, element.y + element.height);
  }
  const width = sanitizeCanvasDimension(inferredWidth) ?? DEFAULT_CANVAS_WIDTH;
  const height = sanitizeCanvasDimension(inferredHeight) ?? DEFAULT_CANVAS_HEIGHT;
  return { width, height };
}

function normalizeTextLines(raw: string): string[] {
  return raw
    .replace(/[•▪◦·]/g, "\n")
    .split(/\r?\n+/)
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);
}

function normalizeThaiNumberSpacing(value: string): string {
  return value
    .replace(/([0-9])([\u0e00-\u0e7f])/g, "$1 $2")
    .replace(/([\u0e00-\u0e7f])([0-9])/g, "$1 $2");
}

/** Strip all markdown formatting from text for display on slides. */
function stripMarkdownFormatting(value: string): string {
  return value
    .replace(/^#{1,6}\s+/gm, "")                    // # headings
    .replace(/\*{2,3}([^*]+)\*{2,3}/g, "$1")        // **bold** / ***bold italic***
    .replace(/\*([^*]+)\*/g, "$1")                   // *italic*
    .replace(/_([^_]+)_/g, "$1")                     // _italic_
    .replace(/~~([^~]+)~~/g, "$1")                   // ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1")                     // `code`
    .replace(/^\s*>\s?/gm, "")                       // > blockquote
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")         // [link](url)
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");       // ![alt](img)
}

function splitInlineStructuredListSegments(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const markerPattern = /(^|\s)((?:\d+|[A-Za-z])\s*[\).:])\s+/g;
  const markerStarts: number[] = [];
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(normalized)) !== null) {
    const prefixLength = match[1]?.length ?? 0;
    markerStarts.push(match.index + prefixLength);
    if (markerPattern.lastIndex === match.index) {
      markerPattern.lastIndex += 1;
    }
  }

  if (markerStarts.length === 0) {
    return [normalized];
  }

  const firstMarkerStart = markerStarts[0]!;
  if (firstMarkerStart > 0) {
    const prefix = normalized.slice(0, firstMarkerStart).trim();
    if (prefix.length < 6) {
      return [normalized];
    }

    const segments = [prefix];
    for (let index = 0; index < markerStarts.length; index += 1) {
      const start = markerStarts[index]!;
      const end = markerStarts[index + 1] ?? normalized.length;
      const segment = normalized.slice(start, end).trim();
      if (segment.length > 0) {
        segments.push(segment);
      }
    }
    return segments;
  }

  return markerStarts.map((start, index) => {
    const end = markerStarts[index + 1] ?? normalized.length;
    return normalized.slice(start, end).trim();
  }).filter((segment) => segment.length > 0);
}

function splitInlineBulletSegments(value: string): string[] {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\s+(?=[•▪◦·-]\s+)/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function canonicalizeSlideNotesForNarrative(note: string): string {
  return note
    .replace(/\r/g, "\n")
    .split("\n")
    .flatMap((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return [""];
      }
      return splitInlineStructuredListSegments(line)
        .flatMap((segment) => splitInlineBulletSegments(segment));
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Parse markdown-structured note into title, section headings, and body lines.
 * Uses # for slide title, ## for section headings.
 * Returns structured data with markdown stripped from all text.
 */
function parseMarkdownNoteStructure(note: string): {
  title: string | null;
  sections: Array<{ heading: string; bodyLines: string[] }>;
  plainLines: string[];
  hierarchy: Array<{ level: "h2" | "h3" | "body"; text: string }>;
} {
  const lines = note.replace(/\r/g, "\n").split(/\n/);
  let title: string | null = null;
  const sections: Array<{ heading: string; bodyLines: string[] }> = [];
  const plainLines: string[] = [];
  const hierarchy: Array<{ level: "h2" | "h3" | "body"; text: string }> = [];
  let currentSection: { heading: string; bodyLines: string[] } | null = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      continue;
    }

    // # Main title (level 1)
    const h1Match = trimmed.match(/^#\s+(.+)/);
    if (h1Match && !title) {
      title = stripMarkdownFormatting(h1Match[1]).trim();
      continue;
    }

    // ## Section heading (level 2-3)
    const h2Match = trimmed.match(/^#{2,3}\s+(.+)/);
    if (h2Match && !trimmed.startsWith("###")) {
      if (currentSection) {
        sections.push(currentSection);
      }
      const heading = stripMarkdownFormatting(h2Match[1]).trim();
      currentSection = {
        heading,
        bodyLines: [],
      };
      if (heading) {
        hierarchy.push({ level: "h2", text: heading });
      }
      continue;
    }

    const h3Match = trimmed.match(/^#{3}\s+(.+)/);
    if (h3Match) {
      const heading = stripMarkdownFormatting(h3Match[1]).trim();
      if (!heading) {
        continue;
      }
      hierarchy.push({ level: "h3", text: heading });
      if (currentSection) {
        currentSection.bodyLines.push(heading);
      } else {
        plainLines.push(heading);
      }
      continue;
    }

    // Regular line — strip markdown and add to current section or plainLines
    const cleanLine = stripMarkdownFormatting(trimmed).trim();
    if (!cleanLine) {
      continue;
    }
    if (currentSection) {
      currentSection.bodyLines.push(cleanLine);
    } else {
      plainLines.push(cleanLine);
    }
    hierarchy.push({ level: "body", text: cleanLine });
  }
  if (currentSection) {
    sections.push(currentSection);
  }

  return { title, sections, plainLines, hierarchy };
}

function normalizeSlideText(value: string): string {
  const collapsed = stripMarkdownFormatting(value)
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!collapsed) {
    return "";
  }
  return normalizeThaiNumberSpacing(collapsed);
}

const AI_NARRATIVE_MAX_BODY_LINES = 10;
const AI_NARRATIVE_MAX_BODY_CHARS = 260;
const AI_NARRATIVE_MAX_SECTION_HEADING_CHARS = 180;
const AI_NARRATIVE_MAX_SECTION_DETAILS = 4;
const AI_NARRATIVE_MAX_SECTION_DETAIL_CHARS = 260;

function normalizeNarrativeBodyLine(value: string): string {
  return normalizeSlideText(value).slice(0, AI_NARRATIVE_MAX_BODY_CHARS);
}

function normalizeNarrativeSection(
  section: { heading: string; details: string[] },
): { heading: string; details: string[] } | null {
  const heading = normalizeSlideText(section.heading).slice(0, AI_NARRATIVE_MAX_SECTION_HEADING_CHARS);
  if (!heading) {
    return null;
  }
  const details = section.details
    .map((detail) => normalizeSlideText(detail).slice(0, AI_NARRATIVE_MAX_SECTION_DETAIL_CHARS))
    .filter((detail) => detail.length > 0 && detail.toLowerCase() !== heading.toLowerCase())
    .slice(0, AI_NARRATIVE_MAX_SECTION_DETAILS);
  if (details.length === 0) {
    return null;
  }
  return { heading, details };
}

function resolveTextWeightScore(weight?: "normal" | "500" | "600" | "700"): number {
  switch (weight) {
    case "700":
      return 700;
    case "600":
      return 600;
    case "500":
      return 500;
    default:
      return 400;
  }
}

interface NarrativeTextElement extends SlideTextElement {
  rawText: string;
  normalizedText: string;
  normalizedLines: string[];
  score: number;
  fontSizeValue: number;
  fontWeightValue: number;
}

function computeHorizontalOverlapRatio(
  first: Pick<SlideTextElement, "x" | "width">,
  second: Pick<SlideTextElement, "x" | "width">,
): number {
  const left = Math.max(first.x, second.x);
  const right = Math.min(first.x + first.width, second.x + second.width);
  const overlap = Math.max(0, right - left);
  const minWidth = Math.max(1, Math.min(first.width, second.width));
  return overlap / minWidth;
}

function shouldPairAsSectionDetail(
  headingElement: NarrativeTextElement,
  detailElement: NarrativeTextElement,
  canvas: { width: number; height: number },
): boolean {
  const fontHierarchy = headingElement.fontSizeValue >= (detailElement.fontSizeValue * 1.08)
    || (headingElement.fontWeightValue - detailElement.fontWeightValue) >= 100;
  if (!fontHierarchy) {
    return false;
  }
  const verticalGap = detailElement.y - (headingElement.y + headingElement.height);
  const minVerticalGap = -Math.max(12, headingElement.height * 0.28);
  const maxVerticalGap = Math.max(canvas.height * 0.09, headingElement.height * 1.25);
  if (verticalGap < minVerticalGap || verticalGap > maxVerticalGap) {
    return false;
  }
  const overlapRatio = computeHorizontalOverlapRatio(headingElement, detailElement);
  const xAligned = Math.abs(headingElement.x - detailElement.x) <= Math.max(24, canvas.width * 0.04);
  return overlapRatio >= 0.46 || xAligned;
}

function inferNarrativeSections(
  bodyCandidates: NarrativeTextElement[],
  titleKey: string,
  canvas: { width: number; height: number },
): Array<{ heading: string; details: string[] }> {
  const sections: Array<{ heading: string; details: string[] }> = [];
  let sectionsWithDetails = 0;
  let index = 0;

  while (index < bodyCandidates.length) {
    const current = bodyCandidates[index];
    const lines = current.normalizedLines.filter((line) => line.toLowerCase() !== titleKey);
    if (lines.length === 0) {
      index += 1;
      continue;
    }

    if (lines.length >= 2) {
      const heading = lines[0].slice(0, 180);
      const details = lines.slice(1, 5).map((line) => line.slice(0, 260));
      const averageDetailLength = details.length > 0
        ? details.reduce((sum, line) => sum + line.length, 0) / details.length
        : 0;
      const multilineHierarchyLikely = details.length > 0
        && heading.length <= 160
        && (lines.length === 2 || averageDetailLength >= Math.round(heading.length * 0.85));
      if (multilineHierarchyLikely) {
        sections.push({ heading, details });
        sectionsWithDetails += 1;
      } else {
        sections.push({ heading, details: [] });
      }
      index += 1;
      continue;
    }

    const headingText = lines[0].slice(0, 180);
    let details: string[] = [];
    const next = bodyCandidates[index + 1];
    if (next) {
      const nextLines = next.normalizedLines.filter((line) => line.toLowerCase() !== titleKey);
      const nextPrimaryLine = nextLines[0];
      if (
        nextPrimaryLine
        && shouldPairAsSectionDetail(current, next, canvas)
        && nextPrimaryLine.length > 0
      ) {
        details = [nextPrimaryLine.slice(0, 260)];
        index += 1;
      }
    }
    sections.push({ heading: headingText, details });
    if (details.length > 0) {
      sectionsWithDetails += 1;
    }
    index += 1;
  }

  if (sectionsWithDetails < 2) {
    return [];
  }

  const deduped: Array<{ heading: string; details: string[] }> = [];
  const seen = new Set<string>();
  for (const section of sections) {
    const normalizedHeading = normalizeSlideText(section.heading);
    const normalizedDetails = section.details
      .map((detail) => normalizeSlideText(detail))
      .filter((detail) => detail.length > 0 && detail.toLowerCase() !== normalizedHeading.toLowerCase())
      .slice(0, 4);
    if (!normalizedHeading) {
      continue;
    }
    const key = `${normalizedHeading.toLowerCase()}||${normalizedDetails.join("||").toLowerCase()}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push({
      heading: normalizedHeading.slice(0, 180),
      details: normalizedDetails.map((detail) => detail.slice(0, 260)),
    });
    if (deduped.length >= 6) {
      break;
    }
  }
  return deduped;
}

function extractSlideNarrative(slideTitle: string, slideContent: PresentationSlideContent): {
  title: string;
  body: string[];
  sections: Array<{ heading: string; details: string[] }>;
} {
  const canvas = resolveSlideCanvasDimensions(slideContent);
  const textElements = slideContent.elements
    .filter((element): element is SlideTextElement => element.type === "text")
    .map((element) => ({
      ...element,
      rawText: String(element.text ?? ""),
      normalizedText: normalizeSlideText(String(element.text ?? "")),
      normalizedLines: normalizeTextLines(String(element.text ?? "")),
      fontSizeValue: Number.isFinite(element.fontSize) ? Number(element.fontSize) : 28,
      fontWeightValue: resolveTextWeightScore(element.fontWeight),
      score:
        ((Number.isFinite(element.fontSize) ? Number(element.fontSize) : 28) * 2.4)
        + (resolveTextWeightScore(element.fontWeight) * 0.03)
        + (Math.max(0, element.width) * 0.02)
        - (Math.max(0, element.y) * 0.015),
    }) satisfies NarrativeTextElement)
    .filter((element) => element.normalizedText.length > 0)
    .sort((a, b) => b.score - a.score);

  const titleCandidate = textElements[0]?.normalizedText
    || normalizeSlideText(slideTitle)
    || "Key message";

  const body: string[] = [];
  const seen = new Set<string>();
  const titleKey = titleCandidate.toLowerCase();
  const sortedBodyCandidates = textElements
    .slice(1)
    .sort((a, b) => (a.y - b.y) || (a.x - b.x));
  for (const element of sortedBodyCandidates) {
    for (const line of normalizeTextLines(element.rawText)) {
      const key = line.toLowerCase();
      if (seen.has(key) || key === titleKey) {
        continue;
      }
      seen.add(key);
      body.push(line);
      if (body.length >= 15) {
        return {
          title: titleCandidate,
          body,
          sections: inferNarrativeSections(sortedBodyCandidates, titleKey, canvas),
        };
      }
    }
  }

  if (body.length === 0) {
    body.push(titleCandidate);
  }
  return {
    title: titleCandidate,
    body,
    sections: inferNarrativeSections(sortedBodyCandidates, titleKey, canvas),
  };
}

function extractDraftNarrativeFromAIDesign(
  slideContent: PresentationSlideContent,
): RelayoutNarrative | null {
  const narrative = slideContent.aiDesign?.narrative;
  if (!narrative) {
    return null;
  }

  const title = normalizeSlideText(narrative.title);
  const body = (narrative.body ?? [])
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line, index, arr) => line.length > 0 && arr.indexOf(line) === index)
    .slice(0, AI_NARRATIVE_MAX_BODY_LINES);
  const sections = (narrative.sections ?? [])
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section))
    .slice(0, 6);

  if (!title || body.length === 0) {
    return null;
  }

  return {
    title,
    body,
    sections,
    ...(normalizeSlideText(narrative.notes ?? "") ? { notes: normalizeSlideText(narrative.notes ?? "").slice(0, 5_000) } : {}),
    source: "aiDesign",
    templateId: isSupportedLayoutTemplateId(narrative.templateId)
      ? narrative.templateId
      : "split_right_image",
  };
}

function isSupportedLayoutTemplateId(value: string | undefined): value is LayoutTemplateId {
  return typeof value === "string"
    && (AI_LAYOUT_TEMPLATE_IDS as readonly string[]).includes(value);
}

function isSupportedGraphicCategoryId(value: string | undefined): value is GraphicCategoryId {
  return typeof value === "string"
    && (AI_SVG_CATEGORIES as readonly string[]).includes(value);
}

function extractNarrativeFromSlideNotes(
  slideTitle: string,
  slideNotes: string | null | undefined,
  fallbackTemplateId: LayoutTemplateId,
  slideIndex: number,
): RelayoutNarrative | null {
  const rawNotes = String(slideNotes ?? "").trim();
  if (!rawNotes) {
    return null;
  }

  const canonicalNotes = canonicalizeSlideNotesForNarrative(rawNotes);
  const mdStructure = parseMarkdownNoteStructure(canonicalNotes);
  const normalizedNotes = normalizeSlideText(canonicalNotes).slice(0, 5_000);
  let title = deriveTitleFromCanonicalNote(canonicalNotes, slideTitle, slideIndex);
  let body: string[] = [];
  let sections: Array<{ heading: string; details: string[] }> = [];

  if (mdStructure.sections.length > 0 || mdStructure.title) {
    title = mdStructure.title || title;
    const allBodyLines = [
      ...mdStructure.plainLines,
      ...mdStructure.sections.flatMap((section) => section.bodyLines),
    ];
    body = allBodyLines.length > 0
      ? allBodyLines
      : deriveBodyFromCanonicalNote(canonicalNotes, fallbackTemplateId);
    sections = mdStructure.sections
      .filter((section) => section.heading.length > 0)
      .map((section) => normalizeNarrativeSection({
        heading: section.heading,
        details: section.bodyLines.slice(0, AI_NARRATIVE_MAX_SECTION_DETAILS),
      }))
      .filter((section): section is { heading: string; details: string[] } => Boolean(section));
  } else {
    body = deriveBodyFromCanonicalNote(canonicalNotes, fallbackTemplateId);
    sections = buildSlideSectionsFromBody(body, fallbackTemplateId)
      .map((section) => normalizeNarrativeSection(section))
      .filter((section): section is { heading: string; details: string[] } => Boolean(section));
  }

  const normalizedBody = body
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line, index, arr) => line.length > 0 && arr.indexOf(line) === index)
    .slice(0, AI_NARRATIVE_MAX_BODY_LINES);
  const normalizedSections = sections
    .slice(0, 6)
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));

  if (!title || normalizedBody.length === 0) {
    return null;
  }

  return {
    title,
    body: normalizedBody,
    sections: normalizedSections,
    ...(normalizedNotes ? { notes: normalizedNotes } : {}),
    source: "slideNotes",
    templateId: fallbackTemplateId,
  };
}

function computeRelayoutNarrativeRichness(narrative: Pick<RelayoutNarrative, "body" | "sections" | "notes">): number {
  const bodyChars = narrative.body.reduce((sum, line) => sum + line.length, 0);
  const detailChars = narrative.sections.reduce(
    (sum, section) => sum + section.heading.length + section.details.reduce((detailSum, detail) => detailSum + detail.length, 0),
    0,
  );
  return bodyChars + detailChars + Math.round((narrative.notes?.length ?? 0) * 0.35);
}

function extractRelayoutNarrative(
  slideTitle: string,
  sourceSlideContent: PresentationSlideContent,
  renderableSlideContent: PresentationSlideContent,
  slideNotes?: string | null,
): RelayoutNarrative {
  const aiNarrative = extractDraftNarrativeFromAIDesign(sourceSlideContent);
  const notesNarrative = extractNarrativeFromSlideNotes(
    slideTitle,
    slideNotes,
    aiNarrative?.templateId ?? "split_right_image",
    0,
  );
  if (
    notesNarrative
    && (
      !aiNarrative
      || computeRelayoutNarrativeRichness(notesNarrative) > Math.round(computeRelayoutNarrativeRichness(aiNarrative) * 1.12)
      || aiNarrative.body.length < notesNarrative.body.length
    )
  ) {
    return notesNarrative;
  }
  if (aiNarrative) {
    return aiNarrative;
  }
  const renderedNarrative = extractSlideNarrative(slideTitle, renderableSlideContent);
  return {
    ...renderedNarrative,
    source: "rendered",
    templateId: "split_right_image",
  };
}

function isVisualOnlySlideContent(slideContent: PresentationSlideContent): boolean {
  return slideContent.visualOnly === true;
}

const WATERMARK_ID_PREFIX = "watermark__";
const WATERMARK_ALT_PREFIX = "watermark:";

function isWatermarkElement(element: SlideElement): boolean {
  if (element.type !== "image") {
    return false;
  }
  const alt = String(element.alt || "").trim().toLowerCase();
  return element.id.startsWith(WATERMARK_ID_PREFIX) || alt.startsWith(WATERMARK_ALT_PREFIX);
}

function isInlineSvgGraphicElement(element: SlideElement): element is SlideImageElement {
  return element.type === "image"
    && (!element.src || !String(element.src).trim())
    && typeof element.svgContent === "string"
    && element.svgContent.trim().length > 0;
}

function isCanvasBackgroundRect(
  element: SlideElement,
  canvas: { width: number; height: number },
): boolean {
  if (element.type !== "rect") {
    return false;
  }
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  return (
    Math.abs((Number(element.x) || 0)) <= 1
    && Math.abs((Number(element.y) || 0)) <= 1
    && width >= (canvas.width - 2)
    && height >= (canvas.height - 2)
  );
}

function getElementAreaRatio(
  element: SlideElement,
  canvas: { width: number; height: number },
): number {
  const canvasArea = Math.max(1, canvas.width * canvas.height);
  const area = Math.max(0, Number(element.width) || 0) * Math.max(0, Number(element.height) || 0);
  return area / canvasArea;
}

function isNearFullCanvasElement(
  element: SlideElement,
  canvas: { width: number; height: number },
): boolean {
  const width = Math.max(0, Number(element.width) || 0);
  const height = Math.max(0, Number(element.height) || 0);
  const x = Number(element.x) || 0;
  const y = Number(element.y) || 0;
  const maxOffsetX = canvas.width * 0.08;
  const maxOffsetY = canvas.height * 0.08;
  return (
    width >= (canvas.width * 0.88)
    && height >= (canvas.height * 0.88)
    && x <= maxOffsetX
    && y <= maxOffsetY
  );
}

function buildRelayoutPreservedElements(
  sourceContent: PresentationSlideContent,
  canvas: { width: number; height: number },
  excludedMediaSourceUrls?: Iterable<string>,
  excludedElementIds?: Iterable<string>,
): SlideElement[] {
  const MAX_PRESERVED_MEDIA = Math.max(24, Math.min(PRESENTATION_LIMITS.maxElementsPerSlide, 220));
  const MAX_PRESERVED_GRAPHICS = 3;
  const MAX_RECT_AREA_RATIO = 0.08;
  const excludedMediaSourceCounts = new Map<string, number>();
  for (const value of Array.from(excludedMediaSourceUrls ?? [])) {
    const normalized = String(value || "").trim();
    if (!normalized) {
      continue;
    }
    excludedMediaSourceCounts.set(
      normalized,
      (excludedMediaSourceCounts.get(normalized) ?? 0) + 1,
    );
  }
  const consumeExcludedMediaSource = (value: string): boolean => {
    const normalized = String(value || "").trim();
    if (!normalized) {
      return false;
    }
    const remaining = excludedMediaSourceCounts.get(normalized) ?? 0;
    if (remaining <= 0) {
      return false;
    }
    if (remaining === 1) {
      excludedMediaSourceCounts.delete(normalized);
    } else {
      excludedMediaSourceCounts.set(normalized, remaining - 1);
    }
    return true;
  };
  const excludedIds = new Set(
    Array.from(excludedElementIds ?? [])
      .map((value) => String(value || "").trim())
      .filter((value) => value.length > 0),
  );
  const preserved: SlideElement[] = [];
  let preservedMediaCount = 0;
  let preservedGraphicsCount = 0;
  for (const element of sourceContent.elements) {
    if (excludedIds.has(element.id)) {
      continue;
    }
    if (isWatermarkElement(element) || element.type === "text") {
      continue;
    }
    if (isInlineSvgGraphicElement(element)) {
      if (getElementAreaRatio(element, canvas) > 0.02) {
        continue;
      }
      if (preservedGraphicsCount >= MAX_PRESERVED_GRAPHICS) {
        continue;
      }
      preserved.push(element);
      preservedGraphicsCount += 1;
      continue;
    }
    if (element.type === "image") {
      const src = String(element.src || "").trim();
      if (src && consumeExcludedMediaSource(src)) {
        continue;
      }
      if (!src && !element.svgContent) {
        continue;
      }
      if (preservedMediaCount >= MAX_PRESERVED_MEDIA) {
        continue;
      }
      preserved.push(element);
      preservedMediaCount += 1;
      continue;
    }
    if (element.type === "video") {
      const src = String((element as any).src || "").trim();
      if (!src) {
        continue;
      }
      if (consumeExcludedMediaSource(src)) {
        continue;
      }
      if (preservedMediaCount >= MAX_PRESERVED_MEDIA) {
        continue;
      }
      preserved.push(element);
      preservedMediaCount += 1;
      continue;
    }
    if (element.type === "rect") {
      if (isCanvasBackgroundRect(element, canvas)) {
        continue;
      }
      if (isNearFullCanvasElement(element, canvas)) {
        continue;
      }
      if (getElementAreaRatio(element, canvas) > MAX_RECT_AREA_RATIO) {
        continue;
      }
      if (preservedGraphicsCount >= MAX_PRESERVED_GRAPHICS) {
        continue;
      }
      preserved.push(element);
      preservedGraphicsCount += 1;
      continue;
    }
    if (element.type === "line") {
      continue;
    }
  }
  return preserved;
}

function collectComponentFallbackExcludedElementIds(
  slideContent: PresentationSlideContent,
): Set<string> {
  const excludedIds = new Set<string>();
  for (const component of slideContent.components ?? []) {
    for (const element of component.fallbackElements) {
      if (element.type === "image" || element.type === "video") {
        continue;
      }
      excludedIds.add(element.id);
    }
  }
  return excludedIds;
}

function clampElementToCanvas(
  element: SlideElement,
  canvas: { width: number; height: number },
): SlideElement {
  const width = clampInteger(Math.max(0, element.width), 0, canvas.width);
  const minHeight = element.type === "line" ? 0 : 1;
  const height = clampInteger(Math.max(minHeight, element.height), minHeight, canvas.height);
  const maxX = Math.max(0, canvas.width - width);
  const maxY = Math.max(0, canvas.height - height);
  const x = clampInteger(element.x, 0, maxX);
  const y = clampInteger(element.y, 0, maxY);
  return {
    ...element,
    width,
    height,
    x,
    y,
  } as SlideElement;
}

function computeRectIntersectionArea(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);
  return width * height;
}

function collectDecorativeAvoidZones(
  elements: SlideElement[],
): Array<{ x: number; y: number; width: number; height: number }> {
  return elements
    .filter((element) => element.type === "text")
    .map((element) => ({
      x: element.x,
      y: element.y,
      width: Math.max(1, element.width),
      height: Math.max(1, element.height),
    }))
    .filter((zone) => zone.width > 0 && zone.height > 0);
}

function filterDecorativeGraphicElements(
  decorativeElements: SlideElement[],
  generatedElements: SlideElement[],
  canvas: { width: number; height: number },
): SlideElement[] {
  if (decorativeElements.length === 0) {
    return [];
  }
  const avoidZones = collectDecorativeAvoidZones(generatedElements);
  const accepted: SlideElement[] = [];
  for (const element of decorativeElements) {
    const normalized = clampElementToCanvas(element, canvas);
    const area = Math.max(1, normalized.width * Math.max(1, normalized.height));
    const canvasArea = Math.max(1, canvas.width * canvas.height);
    const areaRatio = area / canvasArea;
    if (areaRatio > 0.045) {
      continue;
    }
    const overlapRatio = avoidZones.reduce((maxRatio, zone) => {
      const overlap = computeRectIntersectionArea(normalized, zone);
      return Math.max(maxRatio, overlap / area);
    }, 0);
    const acceptedOverlap = accepted.reduce((maxRatio, placed) => {
      const overlap = computeRectIntersectionArea(normalized, placed);
      return Math.max(maxRatio, overlap / area);
    }, 0);
    if (overlapRatio > 0.12 || acceptedOverlap > 0.2) {
      continue;
    }
    accepted.push(normalized);
  }
  return accepted;
}

function findGeneratedMediaDropZones(
  generatedElements: SlideElement[],
  canvas: { width: number; height: number },
): Array<{ x: number; y: number; width: number; height: number }> {
  const textBounds = generatedElements
    .filter((element): element is SlideTextElement => element.type === "text")
    .map((element) => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }));
  const canvasArea = Math.max(1, canvas.width * canvas.height);
  const zones = generatedElements
    .filter((element): element is SlideRectElement => element.type === "rect")
    .filter((element) => !isCanvasBackgroundRect(element, canvas))
    .map((element) => clampElementToCanvas(element, canvas))
    .map((element) => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
    }))
    .filter((zone) => {
      const area = Math.max(1, zone.width * zone.height);
      const areaRatio = area / canvasArea;
      if (areaRatio < 0.025 || areaRatio > 0.42) {
        return false;
      }
      const textOverlapArea = textBounds.reduce((sum, textBox) => (
        sum + computeRectIntersectionArea(zone, textBox)
      ), 0);
      return textOverlapArea <= (area * 0.2);
    })
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return zones;
}

function fitMediaElementIntoZone(
  element: SlideElement,
  zone: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
): SlideElement {
  const padding = Math.max(6, Math.round(Math.min(zone.width, zone.height) * 0.06));
  const availableWidth = Math.max(24, zone.width - (padding * 2));
  const availableHeight = Math.max(24, zone.height - (padding * 2));
  const sourceWidth = Math.max(1, Number(element.width) || availableWidth);
  const sourceHeight = Math.max(1, Number(element.height) || availableHeight);
  const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight);
  const width = clampInteger(Math.round(sourceWidth * scale), 24, availableWidth);
  const height = clampInteger(Math.round(sourceHeight * scale), 24, availableHeight);
  const x = clampInteger(Math.round(zone.x + ((zone.width - width) / 2)), 0, Math.max(0, canvas.width - width));
  const y = clampInteger(Math.round(zone.y + ((zone.height - height) / 2)), 0, Math.max(0, canvas.height - height));
  if (element.type === "image") {
    return {
      ...element,
      x,
      y,
      width,
      height,
      imageFit: element.imageFit ?? "cover",
    } as SlideElement;
  }
  return {
    ...element,
    x,
    y,
    width,
    height,
  } as SlideElement;
}

function buildFallbackMediaGridZones(
  count: number,
  generatedElements: SlideElement[],
  canvas: { width: number; height: number },
  options?: {
    allowOverlayOnMedia?: boolean;
    preferMediaOverlay?: boolean;
  },
): Array<{ x: number; y: number; width: number; height: number }> {
  if (count <= 0) {
    return [];
  }

  const gap = Math.max(10, Math.round(Math.min(canvas.width, canvas.height) * 0.018));
  const zoneAspectRatio = count <= 1 ? 1.08 : (count === 2 ? 0.86 : 0.68);
  const targetWidth = clampInteger(
    Math.round(
      canvas.width * (
        count <= 1
          ? 0.32
          : count === 2
            ? 0.24
            : 0.17
      ),
    ),
    count <= 1 ? 180 : 110,
    count <= 1 ? 420 : 320,
  );
  const maxColumnsByWidth = Math.max(1, Math.floor((canvas.width - gap) / (targetWidth + gap)));
  let columns = Math.max(1, Math.min(maxColumnsByWidth, Math.ceil(Math.sqrt(count))));
  let rows = Math.max(1, Math.ceil(count / columns));
  let width = clampInteger(
    Math.floor((canvas.width - ((columns + 1) * gap)) / columns),
    96,
    280,
  );
  let height = clampInteger(Math.round(width * zoneAspectRatio), 72, count <= 1 ? 360 : 240);

  while (
    columns < maxColumnsByWidth
    && (((rows * height) + (Math.max(0, rows - 1) * gap)) > (canvas.height - (gap * 2)))
  ) {
    columns += 1;
    rows = Math.max(1, Math.ceil(count / columns));
    width = clampInteger(
      Math.floor((canvas.width - ((columns + 1) * gap)) / columns),
      84,
      280,
    );
    height = clampInteger(Math.round(width * zoneAspectRatio), 64, count <= 1 ? 360 : 240);
  }

  const totalWidth = (columns * width) + ((columns - 1) * gap);
  const totalHeight = (rows * height) + ((rows - 1) * gap);

  const minX = gap;
  const minY = gap;
  const maxX = Math.max(gap, canvas.width - totalWidth - gap);
  const maxY = Math.max(gap, canvas.height - totalHeight - gap);
  const midX = clampInteger(Math.round((canvas.width - totalWidth) / 2), minX, maxX);
  const midY = clampInteger(Math.round((canvas.height - totalHeight) / 2), minY, maxY);

  const textElements = generatedElements.filter((element): element is SlideTextElement => element.type === "text");
  const avgTextX = textElements.length > 0
    ? textElements.reduce((sum, element) => sum + (element.x + (element.width / 2)), 0) / textElements.length
    : canvas.width * 0.5;
  const avgTextY = textElements.length > 0
    ? textElements.reduce((sum, element) => sum + (element.y + (element.height / 2)), 0) / textElements.length
    : canvas.height * 0.5;
  const preferredCorner = {
    x: avgTextX >= (canvas.width * 0.5) ? minX : maxX,
    y: avgTextY >= (canvas.height * 0.5) ? minY : maxY,
  };

  const mediaZones = generatedElements
    .filter((element) => (
      (element.type === "image" && !isInlineSvgGraphicElement(element))
      || element.type === "video"
    ))
    .map((element) => clampElementToCanvas(element, canvas))
    .map((element) => ({
      x: element.x,
      y: element.y,
      width: element.width,
      height: Math.max(1, element.height),
    }))
    .filter((zone) => zone.width > 0 && zone.height > 0)
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  const avoidZones = generatedElements
    .filter((element) => (
      element.type === "text"
      || (!options?.allowOverlayOnMedia && (
        (element.type === "image" && !isInlineSvgGraphicElement(element))
        || element.type === "video"
      ))
    ))
    .map((element) => clampElementToCanvas(element, canvas))
    .map((element) => ({
      x: element.type === "text" ? element.x - Math.round(gap * 1.4) : element.x - Math.round(gap * 0.5),
      y: element.type === "text" ? element.y - Math.round(gap * 1.2) : element.y - Math.round(gap * 0.5),
      width: element.width + (element.type === "text" ? Math.round(gap * 2.8) : gap),
      height: Math.max(1, element.height) + (element.type === "text" ? Math.round(gap * 2.4) : gap),
    }))
    .filter((zone) => zone.width > 0 && zone.height > 0);

  const primaryMediaZone = options?.preferMediaOverlay ? mediaZones[0] : null;
  const overlayCandidateStarts = primaryMediaZone
    ? [
        {
          x: clampInteger(primaryMediaZone.x + gap, minX, maxX),
          y: clampInteger(primaryMediaZone.y + gap, minY, maxY),
        },
        {
          x: clampInteger(primaryMediaZone.x + primaryMediaZone.width - totalWidth - gap, minX, maxX),
          y: clampInteger(primaryMediaZone.y + gap, minY, maxY),
        },
        {
          x: clampInteger(primaryMediaZone.x + gap, minX, maxX),
          y: clampInteger(primaryMediaZone.y + primaryMediaZone.height - totalHeight - gap, minY, maxY),
        },
        {
          x: clampInteger(primaryMediaZone.x + primaryMediaZone.width - totalWidth - gap, minX, maxX),
          y: clampInteger(primaryMediaZone.y + primaryMediaZone.height - totalHeight - gap, minY, maxY),
        },
      ]
    : [];

  const candidateStarts = [
    ...overlayCandidateStarts,
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: minX, y: maxY },
    { x: maxX, y: maxY },
    { x: midX, y: minY },
    { x: midX, y: maxY },
    { x: minX, y: midY },
    { x: maxX, y: midY },
    { x: midX, y: midY },
  ];
  const dedupedStarts = Array.from(
    new Map(candidateStarts.map((candidate) => [`${candidate.x}:${candidate.y}`, candidate])).values(),
  );

  const buildZonesForStart = (start: { x: number; y: number }) => {
    const zones: Array<{ x: number; y: number; width: number; height: number }> = [];
    for (let index = 0; index < count; index += 1) {
      const row = Math.floor(index / columns);
      const column = index % columns;
      zones.push({
        x: start.x + (column * (width + gap)),
        y: start.y + (row * (height + gap)),
        width,
        height,
      });
    }
    return zones;
  };

  const scoreZones = (zones: Array<{ x: number; y: number; width: number; height: number }>): number => {
    let overlapScore = 0;
    for (const zone of zones) {
      const zoneArea = Math.max(1, zone.width * zone.height);
      for (const avoid of avoidZones) {
        const overlap = computeRectIntersectionArea(zone, avoid);
        if (overlap <= 0) {
          continue;
        }
        overlapScore += overlap / zoneArea;
      }
    }
    return overlapScore;
  };

  let bestZones: Array<{ x: number; y: number; width: number; height: number }> = [];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const start of dedupedStarts) {
    const zones = buildZonesForStart(start);
    const overlapPenalty = scoreZones(zones);
    const anchorDistance = Math.hypot(start.x - preferredCorner.x, start.y - preferredCorner.y)
      / Math.max(1, Math.hypot(canvas.width, canvas.height));
    const score = overlapPenalty + (anchorDistance * 0.1);
    if (score < bestScore) {
      bestScore = score;
      bestZones = zones;
    }
    if (overlapPenalty <= 0.001) {
      break;
    }
  }

  if (bestZones.length > 0) {
    return bestZones;
  }

  const fallback: Array<{ x: number; y: number; width: number; height: number }> = [];
  for (let index = 0; index < count; index += 1) {
    const row = Math.floor(index / columns);
    const column = index % columns;
    fallback.push({
      x: minX + (column * (width + gap)),
      y: minY + (row * (height + gap)),
      width,
      height,
    });
  }
  return fallback;
}

function layoutPreservedMediaElements(
  mediaElements: SlideElement[],
  generatedElements: SlideElement[],
  canvas: { width: number; height: number },
): SlideElement[] {
  if (mediaElements.length === 0) {
    return [];
  }

  const dropZones = findGeneratedMediaDropZones(generatedElements, canvas);
  const generatedHasRenderableMedia = generatedElements.some((element) => (
    (element.type === "image" && !isInlineSvgGraphicElement(element))
    || element.type === "video"
  ));
  const arranged: SlideElement[] = [];
  let nextMediaIndex = 0;
  for (const zone of (generatedHasRenderableMedia ? [] : dropZones)) {
    const media = mediaElements[nextMediaIndex];
    if (!media) {
      break;
    }
    arranged.push(fitMediaElementIntoZone(media, zone, canvas));
    nextMediaIndex += 1;
  }

  const remaining = mediaElements.slice(nextMediaIndex);
  if (remaining.length > 0) {
    const fallbackZones = buildFallbackMediaGridZones(
      remaining.length,
      [...generatedElements, ...arranged],
      canvas,
      {
        allowOverlayOnMedia: generatedHasRenderableMedia,
        preferMediaOverlay: generatedHasRenderableMedia,
      },
    );
    for (let i = 0; i < remaining.length; i += 1) {
      const media = remaining[i]!;
      const zone = fallbackZones[i];
      if (!zone) {
        arranged.push(media);
        continue;
      }
      arranged.push(fitMediaElementIntoZone(media, zone, canvas));
    }
  }

  return arranged;
}

function mergeRelayoutElementsWithPreserved(
  generatedElements: SlideElement[],
  preservedElements: SlideElement[],
  canvas: { width: number; height: number },
): SlideElement[] {
  if (preservedElements.length === 0) {
    return generatedElements;
  }
  const next = [...generatedElements];
  const insertAt = next.findIndex((element) => element.type === "text");
  const normalizedPreserved: SlideElement[] = [];
  const usedIds = new Set(next.map((element) => element.id));
  for (const preserved of preservedElements) {
    const normalized = clampElementToCanvas(preserved, canvas);
    let nextId = normalized.id;
    if (usedIds.has(nextId)) {
      nextId = `${normalized.type}_${randomBytes(4).toString("hex")}`;
    }
    usedIds.add(nextId);
    normalizedPreserved.push({
      ...normalized,
      id: nextId,
    } as SlideElement);
  }
  if (normalizedPreserved.length === 0) {
    return next;
  }
  const mediaPreserved = normalizedPreserved.filter((element) => (
    (element.type === "image" && !isInlineSvgGraphicElement(element)) || element.type === "video"
  ));
  const graphicPreserved = normalizedPreserved.filter((element) => (
    !mediaPreserved.some((mediaElement) => mediaElement.id === element.id)
  ));
  const arrangedPreserved = [
    ...layoutPreservedMediaElements(mediaPreserved, next, canvas),
    ...filterDecorativeGraphicElements(graphicPreserved, next, canvas),
  ];
  const availableSlots = Math.max(0, PRESENTATION_LIMITS.maxElementsPerSlide - next.length);
  const clippedPreserved = arrangedPreserved.slice(0, availableSlots);
  if (clippedPreserved.length === 0) {
    return next;
  }
  if (insertAt < 0) {
    next.push(...clippedPreserved);
    return next;
  }
  next.splice(insertAt, 0, ...clippedPreserved);
  return next;
}

function mergeRelayoutRenderOrder(
  generatedContent: PresentationSlideContent,
  mergedElements: SlideElement[],
  mergedComponents: PresentationComponentInstance[] | undefined,
): string[] | undefined {
  if (!generatedContent.renderOrder && !(mergedComponents && mergedComponents.length > 0)) {
    return undefined;
  }

  const preservedComponentEntries = (mergedComponents ?? [])
    .filter((component) => !(generatedContent.components ?? []).some((existing) => existing.id === component.id))
    .map((component) => presentationRenderOrderIdForComponent(component.id));
  const baseOrder = generatedContent.renderOrder ? [...generatedContent.renderOrder] : [];
  const generatedComponentIndexes = [...baseOrder]
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.startsWith("component:"))
    .map(({ index }) => index);
  const lastGeneratedComponentIndex = generatedComponentIndexes.length > 0
    ? generatedComponentIndexes[generatedComponentIndexes.length - 1]
    : undefined;
  const insertAt = lastGeneratedComponentIndex !== undefined
    ? lastGeneratedComponentIndex + 1
    : Math.min(1, baseOrder.length);
  const seededOrder = preservedComponentEntries.length > 0
    ? [
        ...baseOrder.slice(0, insertAt),
        ...preservedComponentEntries,
        ...baseOrder.slice(insertAt),
      ]
    : baseOrder;

  const resolved = resolvePresentationSlideRenderOrder({
    ...generatedContent,
    elements: mergedElements,
    ...(mergedComponents?.length ? { components: mergedComponents } : {}),
    ...(seededOrder.length > 0 ? { renderOrder: seededOrder } : {}),
  });

  return resolved.order.length > 0 ? resolved.order : undefined;
}

function pickLargestImageElement(slideContent: PresentationSlideContent): SlideImageElement | null {
  const candidates = slideContent.elements
    .filter((element): element is SlideImageElement => element.type === "image")
    .filter((element) => Boolean(element.src && element.src.trim().length > 0))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return candidates[0] ?? null;
}

function pickLargestVideoElement(slideContent: PresentationSlideContent): SlideVideoElement | null {
  const candidates = slideContent.elements
    .filter((element): element is SlideVideoElement => element.type === "video")
    .filter((element) => Boolean((element as any).src && String((element as any).src).trim().length > 0))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));
  return candidates[0] ?? null;
}

function getRelayoutRenderableSourceContent(
  slideContent: PresentationSlideContent,
): { slideContent: PresentationSlideContent; warnings: string[] } {
  const renderable = getPresentationSlideRenderableElements(slideContent);
  if (renderable.elements.length === 0) {
    return { slideContent, warnings: renderable.warnings };
  }
  return {
    slideContent: {
      ...slideContent,
      elements: renderable.elements,
    },
    warnings: renderable.warnings,
  };
}

function collectRelayoutMediaSources(
  slideContent: PresentationSlideContent,
): RelayoutMediaSources {
  const ordered = slideContent.elements
    .filter((element): element is SlideImageElement | SlideVideoElement => (
      (element.type === "image" || element.type === "video")
      && typeof (element as any).src === "string"
      && String((element as any).src).trim().length > 0
    ))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const seenImageUrls = new Set<string>();
  const seenVideoUrls = new Set<string>();
  const imageUrls: string[] = [];
  const videoUrls: string[] = [];

  for (const element of ordered) {
    const src = String((element as any).src || "").trim();
    if (!src) {
      continue;
    }
    if (element.type === "image") {
      if (seenImageUrls.has(src)) {
        continue;
      }
      seenImageUrls.add(src);
      imageUrls.push(src);
      continue;
    }
    if (seenVideoUrls.has(src)) {
      continue;
    }
    seenVideoUrls.add(src);
    videoUrls.push(src);
  }

  return {
    imageUrls: imageUrls.slice(0, 8),
    videoUrls: videoUrls.slice(0, 8),
  };
}

function collectRenderedMediaSourceUrls(elements: SlideElement[]): string[] {
  const urls: string[] = [];
  for (const element of elements) {
    if (
      !(
        (element.type === "image" && !isInlineSvgGraphicElement(element))
        || element.type === "video"
      )
    ) {
      continue;
    }
    const src = String((element as any).src || "").trim();
    if (!src) {
      continue;
    }
    urls.push(src);
  }
  return urls;
}

function getRelayoutPreferredMediaTypes(
  componentRecipeId: AIPresentationComponentRecipeId | undefined,
): Set<"image" | "video"> {
  if (!componentRecipeId) {
    return new Set();
  }
  const slotTypes = PRESENTATION_COMPONENT_MEDIA_SLOT_TYPES[componentRecipeId];
  if (!slotTypes) {
    return new Set();
  }
  const mediaTypes = new Set<"image" | "video">();
  for (const slotType of Object.values(slotTypes)) {
    if (presentationMediaSlotSupportsType(slotType, "image")) {
      mediaTypes.add("image");
    }
    if (presentationMediaSlotSupportsType(slotType, "video")) {
      mediaTypes.add("video");
    }
  }
  return mediaTypes;
}

function resolveRelayoutComponentRecipeId(
  slideContent: PresentationSlideContent,
): AIPresentationComponentRecipeId | undefined {
  const aiDesignRecipeId = slideContent.aiDesign?.componentRecipeId;
  if (isSupportedAIComponentRecipeId(aiDesignRecipeId)) {
    return aiDesignRecipeId;
  }

  for (const component of slideContent.components ?? []) {
    if (isSupportedAIComponentRecipeId(component.componentId)) {
      return component.componentId;
    }
  }

  return undefined;
}

function buildRelayoutRecipeSelectionSlide(options: {
  narrative: RelayoutNarrative;
  templateId: LayoutTemplateId;
  graphicCategory: GraphicCategoryId;
  hasImage: boolean;
  hasVideo: boolean;
}): AIPresentationSlide {
  return {
    templateId: options.templateId,
    title: options.narrative.title,
    body: options.narrative.body,
    ...(options.narrative.notes ? { notes: options.narrative.notes } : {}),
    ...(options.narrative.sections.length > 0 ? { sections: options.narrative.sections } : {}),
    graphicCategory: options.graphicCategory,
    imagePromptKeywords: options.narrative.title.slice(0, 500),
    ...(options.hasVideo && !options.hasImage ? { componentRecipeId: "video-spotlight" } : {}),
  };
}

function summarizeRelayoutRecipeText(value: string, maxChars: number): string {
  const normalized = normalizeSlideText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.length <= maxChars) {
    return normalized;
  }
  const chunks = splitLongTextAtSpaces(normalized, maxChars, Math.max(18, Math.floor(maxChars * 0.45)));
  const first = chunks[0] ?? normalized.slice(0, maxChars);
  return normalizeSlideText(first).slice(0, maxChars);
}

function adaptRelayoutSlideForRecipe(
  recipeId: AIPresentationComponentRecipeId,
  slide: AIPresentationSlide,
): { slide: AIPresentationSlide; adapted: boolean; warning?: string } {
  const sourceSections = (slide.sections ?? [])
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));
  const sourceBody = slide.body
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0);

  let maxSections = 0;
  let headingChars = 0;
  let detailChars = 0;
  let maxDetails = 0;
  let maxBodyLines = 0;
  let adaptationLabel = "";

  switch (recipeId) {
    case "process-steps":
      maxSections = 3;
      headingChars = 56;
      detailChars = 96;
      maxDetails = 3;
      maxBodyLines = 2;
      adaptationLabel = "process steps";
      break;
    case "timeline-flow":
      maxSections = 3;
      headingChars = 56;
      detailChars = 104;
      maxDetails = 3;
      maxBodyLines = 2;
      adaptationLabel = "timeline flow";
      break;
    case "timeline-report":
      maxSections = 3;
      headingChars = 72;
      detailChars = 180;
      maxDetails = 2;
      maxBodyLines = 3;
      adaptationLabel = "timeline report";
      break;
    case "feature-highlights":
      maxSections = 3;
      headingChars = 52;
      detailChars = 88;
      maxDetails = 2;
      maxBodyLines = 2;
      adaptationLabel = "feature highlights";
      break;
    case "infographic-grid":
      maxSections = 4;
      headingChars = 52;
      detailChars = 90;
      maxDetails = 2;
      maxBodyLines = 2;
      adaptationLabel = "infographic grid";
      break;
    case "sectioned-explainer":
      maxSections = 3;
      headingChars = 96;
      detailChars = 220;
      maxDetails = 2;
      maxBodyLines = 4;
      adaptationLabel = "sectioned explainer";
      break;
    case "a4-photo-grid":
      maxSections = 2;
      headingChars = 72;
      detailChars = 120;
      maxDetails = 2;
      maxBodyLines = 3;
      adaptationLabel = "multi-photo board";
      break;
    case "landscape-photo-story":
      maxSections = 3;
      headingChars = 64;
      detailChars = 96;
      maxDetails = 2;
      maxBodyLines = 3;
      adaptationLabel = "landscape showcase";
      break;
    default:
      return { slide, adapted: false };
  }

  if (recipeId === "feature-highlights" && sourceSections.length > maxSections) {
    return { slide, adapted: false };
  }

  const condensedSections = sourceSections
    .slice(0, maxSections)
    .map((section) => ({
      heading: summarizeRelayoutRecipeText(section.heading, headingChars),
      details: section.details
        .map((detail) => summarizeRelayoutRecipeText(detail, detailChars))
        .filter((detail) => detail.length > 0)
        .slice(0, maxDetails),
    }))
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));

  const overflowSections = sourceSections.slice(maxSections);
  if (overflowSections.length > 0 && condensedSections.length > 0) {
    const lastSection = condensedSections[condensedSections.length - 1]!;
    const mergedDetails = [...lastSection.details];
    for (const section of overflowSections) {
      if (mergedDetails.length >= maxDetails) {
        break;
      }
      const mergedLine = summarizeRelayoutRecipeText(
        `${section.heading}: ${section.details[0] ?? ""}`.trim(),
        detailChars,
      );
      if (mergedLine && !mergedDetails.includes(mergedLine)) {
        mergedDetails.push(mergedLine);
      }
    }
    lastSection.details = mergedDetails.slice(0, maxDetails);
  }

  const condensedBody = sourceBody
    .map((line) => summarizeRelayoutRecipeText(line, 96))
    .filter((line) => line.length > 0)
    .slice(0, maxBodyLines);

  const adaptedSlide = normalizeSlideHierarchyCore({
    ...slide,
    body: condensedBody,
    ...(condensedSections.length > 0 ? { sections: condensedSections } : {}),
  });
  const adapted = (
    condensedSections.length !== sourceSections.length
    || condensedBody.length !== sourceBody.length
    || condensedSections.some((section, index) => {
      const source = sourceSections[index];
      return !source
        || section.heading !== source.heading
        || section.details.join("||") !== source.details.slice(0, maxDetails).join("||");
    })
    || condensedBody.some((line, index) => line !== sourceBody[index])
  );

  return {
    slide: adaptedSlide,
    adapted,
    ...(adapted
      ? {
        warning: `Condensed the visible copy to fit the "${adaptationLabel}" block while keeping the full slide note intact.`,
      }
      : {}),
  };
}

function getRelayoutRecipeSuitability(
  recipeId: AIPresentationComponentRecipeId,
  slide: AIPresentationSlide,
  media: { hasImage: boolean; hasVideo: boolean },
): { suitable: boolean; reason?: string } {
  const allLines = [
    slide.title,
    ...slide.body,
    slide.notes ?? "",
    ...(slide.sections ?? []).flatMap((section) => [section.heading, ...section.details]),
  ]
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);
  const sectionCount = slide.sections?.length ?? 0;
  const bodyCount = slide.body.length;
  const noteChars = normalizeSlideText(slide.notes ?? "").length;
  const bodyCharTotal = slide.body.reduce((sum, line) => sum + line.length, 0);
  const detailLines = (slide.sections ?? []).flatMap((section) => section.details);
  const detailCharTotal = detailLines.reduce((sum, line) => sum + line.length, 0);
  const maxDetailChars = detailLines.reduce((max, line) => Math.max(max, line.length), 0);
  const longTextLines = [
    ...slide.body.filter((line) => line.length >= 90),
    ...detailLines.filter((line) => line.length >= 120),
  ].length;
  const metricSignals = detectMetricSignals(allLines);
  const contactSignals = detectContactSignals(allLines);

  const reject = (reason: string) => ({ suitable: false, reason });

  switch (recipeId) {
    case "process-steps":
      if (sectionCount > 3) return reject("Process steps cannot faithfully fit more than three structured steps.");
      if ((bodyCharTotal + detailCharTotal) > 280 || noteChars > 320 || maxDetailChars > 140 || longTextLines >= 2) {
        return reject("Process steps cards are too dense for the available copy.");
      }
      return { suitable: true };
    case "timeline-flow":
      if (sectionCount > 3) return reject("Timeline flow supports up to three milestones.");
      if ((bodyCharTotal + detailCharTotal) > 320 || noteChars > 360 || maxDetailChars > 150 || longTextLines >= 2) {
        return reject("Timeline flow cards are too dense for the available copy.");
      }
      return { suitable: true };
    case "timeline-report":
      if (sectionCount > 4) return reject("Timeline report still needs a bounded roadmap with up to four phases.");
      if ((bodyCharTotal + detailCharTotal) > 1_100 || noteChars > 900 || maxDetailChars > 280 || longTextLines >= 4) {
        return reject("Timeline report is still too dense and should be split instead of squeezed into one slide.");
      }
      return { suitable: true };
    case "feature-highlights":
      if (sectionCount > 3) return reject("Feature highlights supports up to three cards.");
      if ((bodyCharTotal + detailCharTotal) > 260 || noteChars > 300 || maxDetailChars > 120 || longTextLines >= 2) {
        return reject("Feature highlight cards are too dense for the available copy.");
      }
      return { suitable: true };
    case "infographic-grid":
      if (sectionCount > 4) return reject("Infographic grid supports up to four balanced items.");
      if ((bodyCharTotal + detailCharTotal) > 420 || noteChars > 520 || maxDetailChars > 150 || longTextLines >= 3) {
        return reject("Infographic grid would overcrowd the available copy.");
      }
      return { suitable: true };
    case "stat-cards":
      if (metricSignals < 2) return reject("Stat cards need multiple metric signals.");
      if (bodyCount > 4 || maxDetailChars > 80 || noteChars > 220) {
        return reject("Stat cards work best with short metric labels only.");
      }
      return { suitable: true };
    case "sectioned-explainer":
      if (!media.hasImage && !media.hasVideo) return reject("Sectioned explainer needs reusable image or video for the hero slot.");
      if ((bodyCharTotal + detailCharTotal) > 1_200 || noteChars > 900 || sectionCount > 4) {
        return reject("Sectioned explainer still needs a bounded long-form narrative.");
      }
      return { suitable: true };
    case "two-column-article":
      if (sectionCount < 2 || sectionCount > 3) return reject("Two-column article needs two or three strong sections.");
      if ((bodyCharTotal + detailCharTotal) > 1_100 || noteChars > 780 || maxDetailChars > 260 || longTextLines >= 4) {
        return reject("Two-column article is too dense and should split into multiple slides.");
      }
      return { suitable: true };
    case "quote-callout":
      if (bodyCount > 3 || noteChars > 260 || longTextLines >= 2) {
        return reject("Quote callout only fits a short quote and attribution.");
      }
      return { suitable: true };
    case "profile-summary":
      if (!media.hasImage) return reject("Profile summary needs an image slot.");
      if (contactSignals < 1 && sectionCount < 2) return reject("Profile summary needs bio/contact structure.");
      if (noteChars > 900) return reject("Profile summary is too dense for the compact bio layout.");
      return { suitable: true };
    case "video-spotlight":
      if (!media.hasVideo) return reject("Video spotlight needs reusable video.");
      if (bodyCount > 5 || noteChars > 340 || longTextLines >= 2) {
        return reject("Video spotlight only fits a short lead and benefit list.");
      }
      return { suitable: true };
    case "poster-spotlight":
      if (!media.hasImage && !media.hasVideo) return reject("Poster spotlight needs reusable image or video.");
      if (bodyCount > 5 || sectionCount > 2 || noteChars > 320 || longTextLines >= 2) {
        return reject("Poster spotlight only fits concise campaign copy.");
      }
      return { suitable: true };
    case "framed-image-story":
      if (!media.hasImage && !media.hasVideo) return reject("Framed image story needs reusable image or video.");
      if (sectionCount > 2 || bodyCount > 4 || noteChars > 380 || maxDetailChars > 130 || longTextLines >= 2) {
        return reject("Framed image story needs a shorter editorial narrative.");
      }
      return { suitable: true };
    case "photo-collage":
      if (!media.hasImage && !media.hasVideo) return reject("Photo collage needs reusable media.");
      if (bodyCount > 4 || sectionCount > 2 || noteChars > 240 || longTextLines >= 2) {
        return reject("Photo collage only fits a short caption-driven story.");
      }
      return { suitable: true };
    case "a4-photo-grid":
      if (!media.hasImage && !media.hasVideo) return reject("multi-photo board needs reusable media.");
      if (sectionCount > 2 || bodyCount > 5 || noteChars > 420 || longTextLines >= 3) {
        return reject("multi-photo board only fits a bounded editorial story.");
      }
      return { suitable: true };
    case "landscape-photo-story":
      if (!media.hasImage && !media.hasVideo) return reject("landscape showcase needs reusable media.");
      if (sectionCount > 3 || bodyCount > 5 || noteChars > 420 || longTextLines >= 3) {
        return reject("landscape showcase only fits a concise visual narrative.");
      }
      return { suitable: true };
    default:
      return { suitable: true };
  }
}

function resolveLegacyRelayoutBlockFallbackCandidates(options: {
  templateId: LayoutTemplateId;
  canvasWidth?: number;
  canvasHeight?: number;
}): AIPresentationComponentRecipeId[] {
  const portraitCanvas = isPortraitCanvasForRecipeSelection(options);
  switch (options.templateId) {
    case "hero_center":
      return ["poster-spotlight", "framed-image-story"];
    case "split_left_image":
    case "split_right_image":
      return portraitCanvas
        ? ["sectioned-explainer", "framed-image-story", "two-column-article"]
        : ["framed-image-story", "poster-spotlight", "two-column-article"];
    case "top_image_text_bottom":
    case "bottom_image_text_top":
      return portraitCanvas
        ? ["sectioned-explainer", "article-focus", "poster-spotlight"]
        : ["poster-spotlight", "framed-image-story", "sectioned-explainer"];
    case "feature_boxes_right":
      return ["feature-highlights", "infographic-grid", "sectioned-explainer"];
    default:
      return [];
  }
}

function resolveRelayoutComponentRecipeSelection(options: {
  preferredComponentRecipeId: AIPresentationComponentRecipeId | undefined;
  slide: AIPresentationSlide;
  templateId: LayoutTemplateId;
  hasImage: boolean;
  hasVideo: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  availableImageCount?: number;
  availableVideoCount?: number;
}): { componentRecipeId?: AIPresentationComponentRecipeId; warnings: string[]; slide: AIPresentationSlide } {
  const genericLongFormFallbackRecipes = new Set<AIPresentationComponentRecipeId>([
    "sectioned-explainer",
    "article-focus",
    "two-column-article",
  ]);
  const warnings: string[] = [];
  const media = { hasImage: options.hasImage, hasVideo: options.hasVideo };
  const preserveVisibleMedia = Boolean(options.preferredComponentRecipeId) && (options.hasImage || options.hasVideo);
  const recipeSupportsVisibleMedia = (recipeId: AIPresentationComponentRecipeId): boolean => {
    if (!preserveVisibleMedia) {
      return true;
    }
    const candidateMediaTypes = getRelayoutPreferredMediaTypes(recipeId);
    return (
      (media.hasImage && candidateMediaTypes.has("image"))
      || (media.hasVideo && candidateMediaTypes.has("video"))
    );
  };
  const resolveCandidate = (
    recipeId: AIPresentationComponentRecipeId,
    candidateWarnings: string[] = [],
    allowAdapted = Boolean(options.preferredComponentRecipeId),
  ): { componentRecipeId?: AIPresentationComponentRecipeId; warnings: string[]; slide: AIPresentationSlide } | null => {
    if (recipeId === options.preferredComponentRecipeId) {
      return null;
    }
    if (!recipeSupportsVisibleMedia(recipeId)) {
      return null;
    }
    const adaptedCandidate = adaptRelayoutSlideForRecipe(recipeId, options.slide);
    if (adaptedCandidate.adapted && !allowAdapted) {
      return null;
    }
    const suitability = getRelayoutRecipeSuitability(recipeId, adaptedCandidate.slide, media);
    if (!suitability.suitable) {
      return null;
    }
    return {
      componentRecipeId: recipeId,
      warnings: [...candidateWarnings, ...(adaptedCandidate.warning ? [adaptedCandidate.warning] : [])],
      slide: adaptedCandidate.slide,
    };
  };
  if (options.preferredComponentRecipeId) {
    const adaptedPreferred = adaptRelayoutSlideForRecipe(
      options.preferredComponentRecipeId,
      options.slide,
    );
    const preferredSuitability = getRelayoutRecipeSuitability(
      options.preferredComponentRecipeId,
      adaptedPreferred.slide,
      media,
    );
    if (preferredSuitability.suitable) {
      if (adaptedPreferred.warning) {
        warnings.push(adaptedPreferred.warning);
      }
      return {
        componentRecipeId: options.preferredComponentRecipeId,
        warnings,
        slide: adaptedPreferred.slide,
      };
    }
    warnings.push(
      `Skipped component recipe "${options.preferredComponentRecipeId}" because ${preferredSuitability.reason ?? "it does not fit the current copy."}`,
    );
  }

  for (const fallbackRecipeId of resolveLegacyRelayoutBlockFallbackCandidates({
    templateId: options.templateId,
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
  })) {
    const resolved = resolveCandidate(fallbackRecipeId, [
      `Mapped legacy layout "${options.templateId}" to built-in block "${describeAIComponentRecipe(fallbackRecipeId)}" for block-first Auto Layout.`,
    ]);
    if (resolved) {
      warnings.push(...resolved.warnings);
      return {
        componentRecipeId: resolved.componentRecipeId,
        warnings,
        slide: resolved.slide,
      };
    }
  }

  const candidates = scoreAIComponentRecipes({
    slide: options.slide,
    preferVideoRecipes: options.hasVideo && !options.hasImage,
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    availableImageCount: options.availableImageCount ?? (options.hasImage ? 1 : 0),
    availableVideoCount: options.availableVideoCount ?? (options.hasVideo ? 1 : 0),
    ignoreLegacyTemplateHints: true,
  });
  for (const candidate of candidates) {
    if (candidate.score < getAIComponentRecipeActivationThreshold(candidate.recipeId)) {
      continue;
    }
    if (candidate.recipeId === options.preferredComponentRecipeId) {
      continue;
    }
    if (
      options.preferredComponentRecipeId
      && genericLongFormFallbackRecipes.has(candidate.recipeId)
    ) {
      continue;
    }
    const resolved = resolveCandidate(
      candidate.recipeId,
      options.preferredComponentRecipeId
        ? [`Switched component recipe to "${candidate.recipeId}" during auto layout because it better fits the available copy.`]
        : [],
    );
    if (resolved) {
      warnings.push(...resolved.warnings);
      return {
        componentRecipeId: resolved.componentRecipeId,
        warnings,
        slide: resolved.slide,
      };
    }
  }

  for (const candidate of candidates) {
    if (candidate.recipeId === options.preferredComponentRecipeId || candidate.score < 0) {
      continue;
    }
    const resolved = resolveCandidate(candidate.recipeId, [
      `Preferred built-in block "${describeAIComponentRecipe(candidate.recipeId)}" as the closest Auto Layout match after scoring reusable block options.`,
    ]);
    if (resolved) {
      warnings.push(...resolved.warnings);
      return {
        componentRecipeId: resolved.componentRecipeId,
        warnings,
        slide: resolved.slide,
      };
    }
  }

  if (preserveVisibleMedia) {
    for (const fallbackRecipeId of genericLongFormFallbackRecipes) {
      const resolved = resolveCandidate(fallbackRecipeId, [
        `Recovered to long-form block "${describeAIComponentRecipe(fallbackRecipeId)}" to preserve reusable media during Auto Layout.`,
      ]);
      if (resolved) {
        warnings.push(...resolved.warnings);
        return {
          componentRecipeId: resolved.componentRecipeId,
          warnings,
          slide: resolved.slide,
        };
      }
    }
  }
  warnings.push("Auto Layout used the internal fallback layout because no built-in block fit the current copy cleanly.");
  return { warnings, slide: options.slide };
}

function deriveElementBounds(elements: SlideElement[]): { x: number; y: number; width: number; height: number } | null {
  if (elements.length === 0) {
    return null;
  }
  const minX = Math.min(...elements.map((element) => element.x));
  const minY = Math.min(...elements.map((element) => element.y));
  const maxX = Math.max(...elements.map((element) => element.x + element.width));
  const maxY = Math.max(...elements.map((element) => element.y + Math.max(1, element.height)));
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { x: minX, y: minY, width, height };
}

function fitComponentElementsIntoZone(
  elements: SlideElement[],
  zone: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
): SlideElement[] {
  const bounds = deriveElementBounds(elements);
  if (!bounds) {
    return [];
  }

  const padding = Math.max(8, Math.round(Math.min(zone.width, zone.height) * 0.06));
  const availableWidth = Math.max(32, zone.width - (padding * 2));
  const availableHeight = Math.max(32, zone.height - (padding * 2));
  const scale = Math.min(
    1,
    availableWidth / Math.max(1, bounds.width),
    availableHeight / Math.max(1, bounds.height),
  );
  const scaledWidth = Math.max(24, Math.round(bounds.width * scale));
  const scaledHeight = Math.max(24, Math.round(bounds.height * scale));
  const offsetX = clampInteger(
    Math.round(zone.x + ((zone.width - scaledWidth) / 2)),
    0,
    Math.max(0, canvas.width - scaledWidth),
  );
  const offsetY = clampInteger(
    Math.round(zone.y + ((zone.height - scaledHeight) / 2)),
    0,
    Math.max(0, canvas.height - scaledHeight),
  );

  return elements.map((element) => {
    const nextElement = {
      ...element,
      x: clampInteger(offsetX + Math.round((element.x - bounds.x) * scale), 0, canvas.width),
      y: clampInteger(offsetY + Math.round((element.y - bounds.y) * scale), 0, canvas.height),
      width: Math.max(
        element.type === "line" ? 0 : 1,
        Math.round(element.width * scale),
      ),
      height: Math.max(
        element.type === "line" ? 0 : 1,
        Math.round(element.height * scale),
      ),
    } as SlideElement;

    if (nextElement.type === "text") {
      return clampElementToCanvas({
        ...nextElement,
        fontSize: Math.max(12, Math.round((nextElement.fontSize ?? 24) * scale)),
      } as SlideElement, canvas);
    }

    return clampElementToCanvas(nextElement, canvas);
  });
}

function buildRelayoutPreservedComponents(
  slideContent: PresentationSlideContent,
  generatedElements: SlideElement[],
  canvas: { width: number; height: number },
  preferredComponentRecipeId: AIPresentationComponentRecipeId | undefined,
): PresentationComponentInstance[] {
  const preservableComponents = (slideContent.components ?? []).filter((component) => (
    component.fallbackElements.length > 0
  ));
  if (preservableComponents.length === 0) {
    return [];
  }

  let skippedPreferredRecipe = false;
  const candidates = preservableComponents.filter((component) => {
    if (!preferredComponentRecipeId || component.componentId !== preferredComponentRecipeId || skippedPreferredRecipe) {
      return true;
    }
    skippedPreferredRecipe = true;
    return false;
  });
  if (candidates.length === 0) {
    return [];
  }

  const zones = buildFallbackMediaGridZones(candidates.length, generatedElements, canvas);
  const preserved: PresentationComponentInstance[] = [];
  for (let index = 0; index < candidates.length; index += 1) {
    const component = candidates[index]!;
    const zone = zones[index];
    const fallbackElements = zone
      ? fitComponentElementsIntoZone(component.fallbackElements, zone, canvas)
      : component.fallbackElements.map((element) => clampElementToCanvas(element, canvas));
    if (fallbackElements.length === 0) {
      continue;
    }
    preserved.push({
      ...component,
      id: `${component.id}__relayout`,
      fallbackElements,
    });
  }

  return preserved.slice(0, Math.max(0, 4));
}

function inferGraphicCategoryFromText(text: string): GraphicCategoryId {
  const normalized = text.toLowerCase();
  const categoryPatterns: Array<{ category: GraphicCategoryId; pattern: RegExp }> = [
    { category: "Health", pattern: /(health|medical|doctor|patient|hospital|wellness|vaccine|โรค|สุขภาพ|แพทย์|คนไข้|ยา|ทารก|เด็ก)/i },
    { category: "Education", pattern: /(education|school|learn|teaching|course|training|knowledge|การศึกษา|เรียน|โรงเรียน|ครู|ความรู้)/i },
    { category: "Finance", pattern: /(finance|money|investment|bank|budget|revenue|cost|ตลาด|การเงิน|ลงทุน|งบประมาณ|รายได้|กำไร)/i },
    { category: "Technology", pattern: /(technology|digital|software|ai|automation|data|cloud|tech|เทคโนโลยี|ดิจิทัล|ซอฟต์แวร์|ปัญญาประดิษฐ์|ข้อมูล)/i },
    { category: "Nature", pattern: /(nature|eco|environment|green|organic|sustain|ธรรมชาติ|สิ่งแวดล้อม|สีเขียว|ยั่งยืน)/i },
    { category: "Communication", pattern: /(communication|message|team|collaboration|social|community|สื่อสาร|ทีม|ชุมชน|เครือข่าย)/i },
    { category: "Media", pattern: /(media|video|audio|music|photo|content|สื่อ|วิดีโอ|เสียง|เพลง|ภาพ)/i },
    { category: "Navigation", pattern: /(route|direction|map|path|step|navigate|เส้นทาง|ขั้นตอน|ทิศทาง|นำทาง)/i },
    { category: "Arrows", pattern: /(growth|increase|decrease|upward|trend|ลูกศร|เติบโต|แนวโน้ม|เพิ่มขึ้น|ลดลง)/i },
    { category: "Shapes", pattern: /(design|visual|layout|shape|pattern|ดีไซน์|รูปทรง|แพทเทิร์น)/i },
  ];
  for (const entry of categoryPatterns) {
    if (entry.pattern.test(normalized)) {
      return entry.category;
    }
  }
  return "Business";
}

function inferStylePresetIdFromSlide(slideContent: PresentationSlideContent): StylePresetId {
  const largestRect = slideContent.elements
    .filter((element): element is SlideRectElement => element.type === "rect")
    .sort((a, b) => (b.width * b.height) - (a.width * a.height))[0];
  const rectColor = parseCssColorToRgb(largestRect?.fill);
  if (!rectColor) {
    return "dark-professional";
  }

  let bestPreset: StylePresetId = "dark-professional";
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const preset of BUILT_IN_PRESETS) {
    const bg = parseCssColorToRgb(preset.colors.background);
    const bgAlt = parseCssColorToRgb(preset.colors.backgroundAlt);
    if (!bg || !bgAlt) {
      continue;
    }
    const distance = Math.min(colorDistance(rectColor, bg), colorDistance(rectColor, bgAlt));
    if (distance < bestDistance) {
      bestDistance = distance;
      bestPreset = preset.id as StylePresetId;
    }
  }
  return bestPreset;
}

function applyRelayoutChromePolicy(preset: SlideStylePreset): SlideStylePreset {
  const nextPreset: SlideStylePreset = {
    ...preset,
    ...(preset.header ? { header: { ...preset.header } } : {}),
    ...(preset.footer ? { footer: { ...preset.footer } } : {}),
  };

  if (nextPreset.header) {
    nextPreset.header.enabled = false;
  }
  if (nextPreset.footer) {
    nextPreset.footer.enabled = false;
  }

  return nextPreset;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;");
}

function resolveGeometricCropShape(shape: GeometricCropShapeId | undefined, seed: number): Exclude<GeometricCropShapeId, "auto"> {
  if (shape && shape !== "auto") {
    return shape;
  }
  const variants: Array<Exclude<GeometricCropShapeId, "auto">> = ["rect", "circle", "triangle"];
  const index = Math.abs(Math.round(seed)) % variants.length;
  return variants[index];
}

function resolveGeometricAccentShape(shape: GeometricAccentShapeId | undefined, seed: number): Exclude<GeometricAccentShapeId, "auto"> {
  if (shape && shape !== "auto") {
    return shape;
  }
  const variants: Array<Exclude<GeometricAccentShapeId, "auto">> = ["rect", "circle", "triangle"];
  const index = Math.abs(Math.round(seed)) % variants.length;
  return variants[index];
}

function withAlpha(color: string, alpha: number): string {
  const rgb = parseCssColorToRgb(color);
  if (!rgb) {
    return color;
  }
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function buildGeometricCropSvg(options: {
  src: string;
  width: number;
  height: number;
  shape: Exclude<GeometricCropShapeId, "auto">;
}): string {
  const width = Math.max(8, Math.round(options.width));
  const height = Math.max(8, Math.round(options.height));
  const escapedSrc = escapeXmlAttribute(options.src);
  const shapeMarkup = (() => {
    if (options.shape === "circle") {
      const radius = Math.round(Math.min(width, height) * 0.5);
      return `<circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" r="${radius}" />`;
    }
    if (options.shape === "triangle") {
      return `<polygon points="${Math.round(width / 2)},0 ${width},${height} 0,${height}" />`;
    }
    const radius = Math.max(8, Math.round(Math.min(width, height) * 0.08));
    return `<rect x="0" y="0" width="${width}" height="${height}" rx="${radius}" ry="${radius}" />`;
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"><defs><clipPath id="shapeCrop">${shapeMarkup}</clipPath></defs><image href="${escapedSrc}" width="${width}" height="${height}" preserveAspectRatio="xMidYMid slice" clip-path="url(#shapeCrop)" /></svg>`;
}

function buildGeometricShapeSvg(options: {
  width: number;
  height: number;
  shape: Exclude<GeometricAccentShapeId, "auto">;
  fill: string;
  stroke: string;
  strokeWidth: number;
}): string {
  const width = Math.max(8, Math.round(options.width));
  const height = Math.max(8, Math.round(options.height));
  const fill = options.fill || "#ffffff";
  const stroke = options.stroke || "transparent";
  const strokeWidth = Math.max(0, options.strokeWidth || 0);
  const shapeMarkup = (() => {
    if (options.shape === "circle") {
      const radius = Math.round(Math.min(width, height) * 0.5);
      const safeRadius = Math.max(1, radius - Math.round(strokeWidth / 2));
      return `<circle cx="${Math.round(width / 2)}" cy="${Math.round(height / 2)}" r="${safeRadius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    if (options.shape === "triangle") {
      const inset = Math.round(strokeWidth);
      const topX = Math.round(width / 2);
      return `<polygon points="${topX},${inset} ${Math.max(0, width - inset)},${Math.max(inset + 1, height - inset)} ${inset},${Math.max(inset + 1, height - inset)}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
    }
    const radius = Math.max(8, Math.round(Math.min(width, height) * 0.12));
    return `<rect x="${Math.round(strokeWidth / 2)}" y="${Math.round(strokeWidth / 2)}" width="${Math.max(1, width - strokeWidth)}" height="${Math.max(1, height - strokeWidth)}" rx="${radius}" ry="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" />`;
  })();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">${shapeMarkup}</svg>`;
}

function applyGeometricImageCrop(
  elements: PresentationSlideContent["elements"],
  options: { requestedShape?: GeometricCropShapeId; seed: number },
): {
  elements: PresentationSlideContent["elements"];
  appliedShape: Exclude<GeometricCropShapeId, "auto"> | null;
} {
  const candidates = elements
    .filter((element): element is SlideImageElement => (
      element.type === "image"
      && typeof element.src === "string"
      && element.src.trim().length > 0
      && !(typeof element.svgContent === "string" && element.svgContent.trim().length > 0)
    ))
    .sort((a, b) => (b.width * b.height) - (a.width * a.height));

  const target = candidates[0];
  if (!target) {
    return { elements, appliedShape: null };
  }

  const shape = resolveGeometricCropShape(options.requestedShape, options.seed);
  const nextElements = elements.map((element) => {
    if (element.type !== "image" || element.id !== target.id) {
      return element;
    }
    return {
      ...element,
      imageFit: "cover" as const,
      svgContent: buildGeometricCropSvg({
        src: target.src,
        width: target.width,
        height: target.height,
        shape,
      }),
    };
  });
  return { elements: nextElements, appliedShape: shape };
}

function buildGeometricAccentElements(options: {
  canvasWidth: number;
  canvasHeight: number;
  seed: number;
  requestedShape?: GeometricAccentShapeId;
  stylePreset: SlideStylePreset;
}): {
  elements: SlideImageElement[];
  appliedShape: Exclude<GeometricAccentShapeId, "auto">;
} {
  const shortEdge = Math.max(120, Math.min(options.canvasWidth, options.canvasHeight));
  const largeSize = Math.round(shortEdge * 0.24);
  const smallSize = Math.round(shortEdge * 0.15);
  const margin = Math.round(shortEdge * 0.03);
  const shape = resolveGeometricAccentShape(options.requestedShape, options.seed);

  const positionSets = [
    {
      primary: { x: margin, y: margin, width: largeSize, height: largeSize },
      secondary: {
        x: options.canvasWidth - smallSize - margin,
        y: options.canvasHeight - smallSize - margin,
        width: smallSize,
        height: smallSize,
      },
    },
    {
      primary: { x: options.canvasWidth - largeSize - margin, y: margin, width: largeSize, height: largeSize },
      secondary: { x: margin, y: options.canvasHeight - smallSize - margin, width: smallSize, height: smallSize },
    },
    {
      primary: { x: margin, y: options.canvasHeight - largeSize - margin, width: largeSize, height: largeSize },
      secondary: { x: options.canvasWidth - smallSize - margin, y: margin, width: smallSize, height: smallSize },
    },
  ] as const;
  const positionSet = positionSets[Math.abs(Math.round(options.seed)) % positionSets.length];
  const secondaryShape = resolveGeometricAccentShape("auto", options.seed + 17);

  const primaryBaseColor = options.stylePreset.colors.secondary
    || options.stylePreset.colors.primary
    || "#0f3460";
  const secondaryBaseColor = options.stylePreset.colors.primary
    || options.stylePreset.colors.text
    || "#e94560";
  const primarySvg = buildGeometricShapeSvg({
    width: positionSet.primary.width,
    height: positionSet.primary.height,
    shape,
    fill: withAlpha(primaryBaseColor, 0.3),
    stroke: withAlpha(primaryBaseColor, 0.62),
    strokeWidth: Math.max(2, Math.round(shortEdge * 0.01)),
  });
  const secondarySvg = buildGeometricShapeSvg({
    width: positionSet.secondary.width,
    height: positionSet.secondary.height,
    shape: secondaryShape,
    fill: withAlpha(secondaryBaseColor, 0.22),
    stroke: withAlpha(secondaryBaseColor, 0.5),
    strokeWidth: Math.max(2, Math.round(shortEdge * 0.008)),
  });

  return {
    appliedShape: shape,
    elements: [
      {
        id: `accent-primary-${Math.abs(Math.round(options.seed))}-${options.canvasWidth}-${options.canvasHeight}`,
        type: "image",
        x: positionSet.primary.x,
        y: positionSet.primary.y,
        width: positionSet.primary.width,
        height: positionSet.primary.height,
        src: "",
        alt: "Geometric accent",
        svgContent: primarySvg,
        opacity: 1,
      },
      {
        id: `accent-secondary-${Math.abs(Math.round(options.seed + 1))}-${options.canvasWidth}-${options.canvasHeight}`,
        type: "image",
        x: positionSet.secondary.x,
        y: positionSet.secondary.y,
        width: positionSet.secondary.width,
        height: positionSet.secondary.height,
        src: "",
        alt: "Geometric accent",
        svgContent: secondarySvg,
        opacity: 1,
      },
    ],
  };
}

function resolveRelayoutTemplateId(options: {
  requestedTemplateId?: LayoutTemplateId;
  bodyCount: number;
  hasImage: boolean;
  canvasWidth: number;
  canvasHeight: number;
  seed: number;
}): LayoutTemplateId {
  if (options.requestedTemplateId) {
    return options.requestedTemplateId;
  }
  if (!options.hasImage) {
    return options.bodyCount >= 4 ? "feature_boxes_right" : "hero_center";
  }

  const portrait = options.canvasHeight > options.canvasWidth;
  if (options.bodyCount <= 2) {
    return portrait ? "split_right_image" : "hero_center";
  }

  const splitTemplates: LayoutTemplateId[] = [
    "split_right_image",
    "split_left_image",
    "top_image_text_bottom",
    "bottom_image_text_top",
  ];
  const index = Math.abs(Math.round(options.seed)) % splitTemplates.length;
  return splitTemplates[index];
}

const PROFILE_RECIPE_KEYWORDS = [
  "about me",
  "about us",
  "about",
  "profile",
  "speaker",
  "resume",
  "biography",
  "bio",
  "team",
  "founder",
  "contact",
  "portfolio",
  "ประวัติ",
  "เกี่ยวกับ",
  "แนะนำตัว",
  "ผู้บรรยาย",
  "วิทยากร",
  "ข้อมูลส่วนตัว",
] as const;

const PROCESS_RECIPE_KEYWORDS = [
  "step",
  "steps",
  "process",
  "workflow",
  "roadmap",
  "checklist",
  "how to",
  "guide",
  "ขั้นตอน",
  "วิธี",
  "ลำดับ",
  "กระบวนการ",
] as const;

const TIMELINE_RECIPE_KEYWORDS = [
  "timeline",
  "roadmap",
  "milestone",
  "journey",
  "history",
  "phase",
  "phases",
  "quarter",
  "launch plan",
  "ไทม์ไลน์",
  "เหตุการณ์",
  "ช่วงเวลา",
  "ลำดับเวลา",
  "โรดแมป",
  "แผนงาน",
] as const;

const STAT_CARD_RECIPE_KEYWORDS = [
  "kpi",
  "kpis",
  "metric",
  "metrics",
  "stat",
  "stats",
  "growth",
  "lift",
  "conversion",
  "roi",
  "revenue",
  "performance",
  "snapshot",
  "ตัวเลข",
  "สถิติ",
  "อัตรา",
  "ยอดขาย",
  "ผลลัพธ์",
] as const;

const INFOGRAPHIC_GRID_RECIPE_KEYWORDS = [
  "framework",
  "grid",
  "matrix",
  "pillars",
  "quadrant",
  "categories",
  "dimensions",
  "overview",
  "องค์ประกอบ",
  "หมวดหมู่",
  "เสาหลัก",
  "กรอบแนวคิด",
  "ภาพรวม",
  "ตาราง",
] as const;

const QUOTE_RECIPE_KEYWORDS = [
  "quote",
  "quoted",
  "testimonial",
  "opinion",
  "เสียงจากลูกค้า",
  "คำพูด",
  "คำคม",
] as const;

const POSTER_RECIPE_KEYWORDS = [
  "launch",
  "promo",
  "promotion",
  "campaign",
  "offer",
  "package",
  "benefit",
  "announcement",
  "membership",
  "สมัคร",
  "เปิดตัว",
  "โปรโมชัน",
  "โปรโมชั่น",
  "แพ็กเกจ",
  "คุ้มครอง",
  "สิทธิพิเศษ",
  "ข้อเสนอ",
  "โปรแกรม",
] as const;

const FRAMED_STORY_RECIPE_KEYWORDS = [
  "story",
  "case study",
  "spotlight",
  "behind the scenes",
  "journey",
  "editorial",
  "concept",
  "เรื่องราว",
  "กรณีศึกษา",
  "เบื้องหลัง",
  "บทเรียน",
  "แนวคิด",
] as const;

const PHOTO_COLLAGE_RECIPE_KEYWORDS = [
  "collage",
  "lookbook",
  "gallery",
  "moodboard",
  "recap",
  "album",
  "photo story",
  "คอลลาจ",
  "แกลเลอรี",
  "ภาพรวมภาพถ่าย",
  "สรุปภาพ",
  "อัลบั้ม",
] as const;

const FAQ_RECIPE_KEYWORDS = [
  "faq",
  "frequently asked questions",
  "questions",
  "question",
  "answers",
  "myth",
  "myths",
  "objection",
  "objections",
  "คำถาม",
  "ถามบ่อย",
  "ข้อสงสัย",
  "ข้อกังวล",
  "ความเชื่อผิด",
] as const;

const AUTO_MEDIA_RECIPE_THRESHOLD = 4;
const AUTO_TEXT_RECIPE_THRESHOLD = 9;

const CONTACT_SIGNAL_REGEXES = [
  /@[a-z0-9.-]+\.[a-z]{2,}/i,
  /\+?\d[\d\s\-()]{6,}\d/,
  /\b(?:www\.|https?:\/\/)/i,
] as const;

function textIncludesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectContactSignals(lines: string[]): number {
  return lines.reduce((count, line) => {
    const hasSignal = CONTACT_SIGNAL_REGEXES.some((pattern) => pattern.test(line));
    return count + (hasSignal ? 1 : 0);
  }, 0);
}

function detectMetricSignals(lines: string[]): number {
  const metricLineRegexes = [
    /\b\d[\d.,]*\s?(?:%|x|k|m|ล้าน|พัน)\b/i,
    /^\s*[\d.,%+xX/]+\s+.+$/,
    /^.+:\s*[\d.,%+xX/].+$/,
    /^.+\s+[—-]\s+[\d.,%+xX/].+$/,
  ] as const;
  return lines.reduce((count, line) => (
    count + (metricLineRegexes.some((pattern) => pattern.test(line)) ? 1 : 0)
  ), 0);
}

function detectQuestionSignals(lines: string[]): number {
  return lines.reduce((count, line) => {
    const normalized = normalizeSlideText(line).toLowerCase();
    const isQuestion = normalized.endsWith("?")
      || normalized.includes("คำถาม")
      || normalized.includes("ถาม")
      || normalized.startsWith("how ")
      || normalized.startsWith("what ")
      || normalized.startsWith("why ")
      || normalized.startsWith("when ")
      || normalized.startsWith("who ")
      || normalized.startsWith("where ")
      || normalized.startsWith("can ")
      || normalized.startsWith("should ");
    return count + (isQuestion ? 1 : 0);
  }, 0);
}

const COMPONENT_RECIPE_PROMPT_GUIDE = AI_COMPONENT_RECIPE_IDS
  .map((recipeId) => {
    const guidance = PRESENTATION_COMPONENT_AI_GUIDANCE[recipeId];
    return `- ${recipeId}: ${guidance.label}. ${guidance.useWhen}`;
  })
  .join("\n");

const COMPONENT_RECIPE_MEDIA_PLAN_GUIDE = AI_COMPONENT_RECIPE_IDS
  .map((recipeId) => {
    const mediaSlots = PRESENTATION_COMPONENT_MEDIA_SLOTS[recipeId];
    if (!mediaSlots?.length) {
      return null;
    }
    return `- ${recipeId}: valid mediaPlan slotId values are ${mediaSlots.join(", ")}`;
  })
  .filter((line): line is string => Boolean(line))
  .join("\n");

function scoreAIComponentRecipes(options: {
  slide: AIPresentationSlide;
  preferVideoRecipes: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  availableImageCount?: number;
  availableVideoCount?: number;
  ignoreLegacyTemplateHints?: boolean;
}): Array<{ recipeId: AIPresentationComponentRecipeId; score: number }> {
  const allLines = [
    options.slide.title,
    ...options.slide.body,
    options.slide.notes ?? "",
    ...(options.slide.sections ?? []).flatMap((section) => [
      section.heading,
      ...section.details,
    ]),
    ...(options.slide.markdownHierarchy ?? []).map((entry) => entry.text),
  ]
    .map((line) => line.trim())
    .filter(Boolean);
  const haystack = allLines.join(" ").toLowerCase();
  const numberedBodyLines = options.slide.body.filter((line) => /^\s*(\d+[).\-]|step\s+\d+)/i.test(line)).length;
  const sectionCount = options.slide.sections?.length ?? 0;
  const bodyCount = options.slide.body.filter((line) => line.trim().length > 0).length;
  const portraitCanvas = Boolean(options.canvasWidth && options.canvasHeight && options.canvasHeight > options.canvasWidth);
  const landscapeCanvas = Boolean(options.canvasWidth && options.canvasHeight && options.canvasWidth >= options.canvasHeight);
  const h2Count = options.slide.markdownHierarchy?.filter((entry) => entry.level === "h2").length ?? 0;
  const h3Count = options.slide.markdownHierarchy?.filter((entry) => entry.level === "h3").length ?? 0;
  const contactSignals = detectContactSignals(allLines);
  const metricSignals = detectMetricSignals(allLines);
  const questionSignals = detectQuestionSignals(allLines);
  const timelineMarkerCount = Array.from(
    haystack.matchAll(/\b(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi),
  ).length;
  const quoteLikeTitle = /["“”']/.test(options.slide.title);
  const quoteLikeBody = options.slide.body.some((line) => /["“”']/.test(line));
  const noteChars = normalizeSlideText(options.slide.notes ?? "").length;
  const bodyCharTotal = options.slide.body.reduce((sum, line) => sum + normalizeSlideText(line).length, 0);
  const maxBodyChars = options.slide.body.reduce((max, line) => Math.max(max, normalizeSlideText(line).length), 0);
  const detailCharTotal = (options.slide.sections ?? [])
    .flatMap((section) => section.details)
    .reduce((sum, detail) => sum + normalizeSlideText(detail).length, 0);
  const maxDetailChars = (options.slide.sections ?? [])
    .flatMap((section) => section.details)
    .reduce((max, detail) => Math.max(max, normalizeSlideText(detail).length), 0);
  const narrativeChars = bodyCharTotal + detailCharTotal;
  const longTextLines = [
    ...options.slide.body.filter((line) => normalizeSlideText(line).length >= 70),
    ...(options.slide.sections ?? []).flatMap((section) => section.details)
      .filter((line) => normalizeSlideText(line).length >= 100),
  ].length;
  const gallerySignal = textIncludesAnyKeyword(haystack, ["gallery", "lookbook", "collage", "moodboard", "recap", "album", "แกลเลอรี", "คอลลาจ", "อัลบั้ม"]);
  const showcaseSignal = textIncludesAnyKeyword(haystack, ["showcase", "interior", "property", "listing", "portfolio", "travel", "destination", "สินทรัพย์", "บ้าน", "คอนโด", "อสังหา", "รีวิวสถานที่"]);
  const availableVisualCount = (options.availableImageCount ?? 0) + (options.availableVideoCount ?? 0);
  const preferredVisualSlotCount = availableVisualCount >= 4
    ? 5
    : availableVisualCount >= 3
      ? 4
      : gallerySignal
        ? 5
        : showcaseSignal && landscapeCanvas
          ? 4
          : showcaseSignal && portraitCanvas
            ? 5
            : availableVisualCount > 0 && sectionCount <= 2 && bodyCount <= 3
              ? 2
              : 1;

  const scores: Record<AIPresentationComponentRecipeId, number> = {
    "process-steps": 0,
    "timeline-flow": 0,
    "timeline-report": 0,
    "feature-highlights": 0,
    "infographic-grid": 0,
    "stat-cards": 0,
    "sectioned-explainer": 0,
    "article-focus": 0,
    "two-column-article": 0,
    "faq-stack": 0,
    "profile-board": 0,
    "profile-summary": 0,
    "quote-callout": 0,
    "video-spotlight": 0,
    "poster-spotlight": 0,
    "framed-image-story": 0,
    "photo-collage": 0,
    "a4-photo-grid": 0,
    "landscape-photo-story": 0,
    "image-top-article": 0,
    "image-bottom-article": 0,
    "image-left-article": 0,
    "image-right-article": 0,
    "wide-hero-article": 0,
    "split-image-article": 0,
    "centered-hero-article": 0,
    "compact-article": 0,
    "fullpage-image": 0,
    "fullpage-image-landscape": 0,
    "fullpage-video": 0,
    "fullpage-video-landscape": 0,
  };

  if (options.preferVideoRecipes && (options.ignoreLegacyTemplateHints || options.slide.templateId !== "feature_boxes_right")) {
    if (bodyCount <= 4) scores["video-spotlight"] += 5;
    if (sectionCount <= 3) scores["video-spotlight"] += 2;
  }

  if (textIncludesAnyKeyword(haystack, PROFILE_RECIPE_KEYWORDS)) {
    scores["profile-summary"] += 6;
  }
  if (contactSignals >= 2) {
    scores["profile-summary"] += 5;
  }
  if (sectionCount >= 2 && textIncludesAnyKeyword(haystack, ["contact", "about", "ประวัติ", "เกี่ยวกับ"])) {
    scores["profile-summary"] += 3;
  }

  if (textIncludesAnyKeyword(haystack, STAT_CARD_RECIPE_KEYWORDS)) {
    scores["stat-cards"] += 6;
  }
  if (metricSignals >= 2) {
    scores["stat-cards"] += 6;
  }
  if (bodyCount >= 2 && bodyCount <= 4 && metricSignals >= 1) {
    scores["stat-cards"] += 2;
  }

  const longFormStructureSignal = sectionCount >= 2 || bodyCount >= 5;
  const longFormDensitySignal = (bodyCharTotal + detailCharTotal) >= 260
    || longTextLines >= 2
    || (longFormStructureSignal && noteChars >= 140);
  if (longFormDensitySignal && longFormStructureSignal) {
    if (sectionCount >= 2) {
      scores["sectioned-explainer"] += 6;
    }
    if (sectionCount >= 2 && bodyCount >= 3 && (bodyCharTotal + detailCharTotal) >= 220) {
      scores["sectioned-explainer"] += 4;
    }
    if ((bodyCharTotal + detailCharTotal) >= 360 || noteChars >= 180) {
      scores["sectioned-explainer"] += 3;
    }
    if (longTextLines >= 2) {
      scores["sectioned-explainer"] += 3;
    }
    if (h2Count >= 2 || h3Count >= 2) {
      scores["sectioned-explainer"] += 2;
    }
    if (sectionCount >= 3) {
      scores["sectioned-explainer"] += 2;
    }
  } else if (sectionCount >= 2 && maxBodyChars < 60 && maxDetailChars < 90 && noteChars < 140) {
    scores["sectioned-explainer"] -= 6;
  } else if (sectionCount >= 2) {
    scores["sectioned-explainer"] -= 3;
  }
  if (sectionCount >= 4 && maxDetailChars < 100 && noteChars < 200) {
    scores["sectioned-explainer"] -= 10;
  }
  if (metricSignals >= 2 && bodyCount <= 4 && noteChars < 180 && longTextLines === 0) {
    scores["sectioned-explainer"] -= 12;
  }
  if (
    (textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS) || /\b(?:q[1-4]|20\d{2})\b/i.test(haystack))
    && sectionCount >= 2
    && sectionCount <= 4
    && noteChars < 220
    && maxDetailChars <= 96
    && longTextLines === 0
  ) {
    scores["sectioned-explainer"] -= 10;
  }
  if (
    sectionCount === 2
    && narrativeChars >= 240
    && metricSignals < 2
    && questionSignals < 2
    && timelineMarkerCount < 2
    && contactSignals < 2
  ) {
    scores["two-column-article"] += 4;
    scores["sectioned-explainer"] -= 6;
  }
  if (
    sectionCount === 3
    && bodyCount <= 3
    && maxDetailChars <= 120
    && noteChars < 220
    && longTextLines <= 1
  ) {
    scores["feature-highlights"] += 6;
    scores["infographic-grid"] += 3;
    scores["sectioned-explainer"] -= 10;
  }

  if (textIncludesAnyKeyword(haystack, QUOTE_RECIPE_KEYWORDS)) {
    scores["quote-callout"] += 5;
  }
  if (quoteLikeTitle) {
    scores["quote-callout"] += 4;
  }
  if (quoteLikeBody && bodyCount <= 2) {
    scores["quote-callout"] += 2;
  }
  if (bodyCount <= 2 && sectionCount <= 1) {
    scores["quote-callout"] += 1;
  }

  if (textIncludesAnyKeyword(haystack, POSTER_RECIPE_KEYWORDS)) {
    scores["poster-spotlight"] += 6;
  }
  if (!options.preferVideoRecipes && bodyCount >= 2 && bodyCount <= 5 && sectionCount <= 2) {
    scores["poster-spotlight"] += 2;
  }
  if (textIncludesAnyKeyword(haystack, ["cta", "apply", "join", "buy", "register", "contact us", "learn more", "สมัคร", "ลงทะเบียน", "ติดต่อ"])) {
    scores["poster-spotlight"] += 3;
  }

  if (textIncludesAnyKeyword(haystack, FRAMED_STORY_RECIPE_KEYWORDS)) {
    scores["framed-image-story"] += 6;
  }
  if (bodyCount >= 2 && bodyCount <= 4 && sectionCount <= 2) {
    scores["framed-image-story"] += 2;
  }
  if ((options.slide.notes?.trim().length ?? 0) >= 140) {
    scores["framed-image-story"] += 2;
  }
  if (textIncludesAnyKeyword(haystack, PHOTO_COLLAGE_RECIPE_KEYWORDS)) {
    scores["photo-collage"] += 6;
    scores["a4-photo-grid"] += 7;
  }
  if (sectionCount <= 2 && gallerySignal) {
    scores["photo-collage"] += 3;
    scores["a4-photo-grid"] += 5;
    scores["landscape-photo-story"] += 4;
  }
  if (showcaseSignal) {
    scores["a4-photo-grid"] += 3;
  }
  if (preferredVisualSlotCount >= 5) {
    scores["a4-photo-grid"] += 8;
    scores["photo-collage"] -= 1;
  } else if (preferredVisualSlotCount >= 4) {
    scores["landscape-photo-story"] += 7;
    scores["a4-photo-grid"] += 4;
  } else if (preferredVisualSlotCount >= 2) {
    scores["photo-collage"] += 5;
    scores["framed-image-story"] += 2;
  }
  if (textIncludesAnyKeyword(haystack, FAQ_RECIPE_KEYWORDS)) {
    scores["faq-stack"] += 6;
  }
  if (questionSignals >= 2) {
    scores["faq-stack"] += 6;
  }
  if (sectionCount >= 2 && sectionCount <= 4 && questionSignals >= 2) {
    scores["faq-stack"] += 3;
  }
  if (metricSignals >= 2 || textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS) || numberedBodyLines >= 2) {
    scores["faq-stack"] -= 6;
  }

  if (numberedBodyLines >= 2) {
    scores["process-steps"] += 6;
    scores["framed-image-story"] -= 6;
    scores["poster-spotlight"] -= 4;
    scores["photo-collage"] -= 4;
    scores["a4-photo-grid"] -= 4;
    scores["landscape-photo-story"] -= 5;
  }
  if (textIncludesAnyKeyword(haystack, PROCESS_RECIPE_KEYWORDS)) {
    scores["process-steps"] += 4;
  }
  if (h2Count >= 2 || h3Count >= 3) {
    scores["process-steps"] += 2;
  }
  if (h2Count >= 3) {
    scores["process-steps"] += 4;
  }
  if (textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS)) {
    scores["timeline-flow"] += 6;
  }
  if (textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS) && sectionCount >= 3) {
    scores["timeline-flow"] += 2;
  }
  if (sectionCount >= 3 && h2Count >= 2) {
    scores["timeline-flow"] += 3;
  }
  if (/\b(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/i.test(haystack)) {
    scores["timeline-flow"] += 4;
  }
  if (textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS)) {
    scores["timeline-report"] += 5;
  }
  if (timelineMarkerCount >= 2) {
    scores["timeline-report"] += 4;
  }
  if (sectionCount >= 2 && sectionCount <= 4) {
    scores["timeline-report"] += 2;
  }
  if (narrativeChars >= 360 || noteChars >= 180 || maxDetailChars > 96 || longTextLines >= 2) {
    scores["timeline-report"] += 5;
  }
  if (metricSignals >= 2 || questionSignals >= 2) {
    scores["timeline-report"] -= 6;
  }
  if (
    sectionCount === 2
    && metricSignals < 2
    && questionSignals < 2
    && contactSignals < 2
    && timelineMarkerCount < 2
    && !textIncludesAnyKeyword(haystack, FRAMED_STORY_RECIPE_KEYWORDS)
    && !textIncludesAnyKeyword(haystack, POSTER_RECIPE_KEYWORDS)
  ) {
    scores["two-column-article"] += 5;
  }
  if (
    sectionCount === 2
    && (narrativeChars >= 320 || noteChars >= 180 || maxDetailChars > 110 || longTextLines >= 2)
  ) {
    scores["two-column-article"] += 5;
  }
  if (sectionCount === 2 && h2Count >= 1) {
    scores["two-column-article"] += 3;
  }
  if (timelineMarkerCount >= 2 || metricSignals >= 2 || questionSignals >= 2 || contactSignals >= 2) {
    scores["two-column-article"] -= 6;
  }

  if (!options.ignoreLegacyTemplateHints && options.slide.templateId === "feature_boxes_right") {
    scores["feature-highlights"] += 5;
  }
  if (sectionCount >= 3) {
    scores["feature-highlights"] += 4;
  }
  if (bodyCount >= 4) {
    scores["feature-highlights"] += 2;
  }
  if (textIncludesAnyKeyword(haystack, INFOGRAPHIC_GRID_RECIPE_KEYWORDS)) {
    scores["infographic-grid"] += 5;
  }
  if (sectionCount >= 4) {
    scores["infographic-grid"] += 5;
  }
  if (h2Count >= 3 && bodyCount >= 3) {
    scores["infographic-grid"] += 2;
  }
  if (!options.ignoreLegacyTemplateHints && options.slide.templateId === "feature_boxes_right" && sectionCount >= 4 && bodyCount <= 2 && noteChars < 140) {
    scores["infographic-grid"] += 4;
    scores["sectioned-explainer"] -= 20;
  }

  return (Object.entries(scores) as Array<[AIPresentationComponentRecipeId, number]>)
    .map(([recipeId, score]) => ({ recipeId, score }))
    .sort((a, b) => b.score - a.score);
}

function isSupportedAIComponentRecipeId(value: string | undefined): value is AIPresentationComponentRecipeId {
  return typeof value === "string"
    && (AI_COMPONENT_RECIPE_IDS as readonly string[]).includes(value);
}

interface ResolvedAIComponentRecipeSelection {
  mode: PresentationAILayoutMode;
  recommendedMode: PresentationAILayoutMode;
  componentRecipeId?: AIPresentationComponentRecipeId;
  selectionMode: "llm" | "heuristic" | "none";
  selectionReason?: string;
  candidateRecipes: Array<{ recipeId: AIPresentationComponentRecipeId; score: number }>;
  candidateModes: PresentationAILayoutModeCandidate[];
}

interface RecipeCompactionOutcome {
  slide: AIPresentationSlide;
  fitScore?: PresentationAIDesignFitScore;
  compactionLevel?: PresentationRecipeCompactionLevel;
  sourceTrace?: PresentationAIDesignSourceTrace[];
  fallbackHistory?: PresentationAIDesignFallbackHistory[];
}

interface SlideOverflowFallbackMetadata {
  sourceTrace?: PresentationAIDesignSourceTrace[];
  fallbackHistory?: PresentationAIDesignFallbackHistory[];
}

interface SlideAdvancedModeMetadata {
  mode?: PresentationAILayoutMode;
  slideContentOverride?: PresentationSlideContent;
  fallbackHistory?: PresentationAIDesignFallbackHistory[];
  mediaModeMetadata?: PresentationAIDesignMediaModeMetadata;
}

interface OverflowFallbackResolution {
  slides: AIPresentationSlide[];
  selections: ResolvedAIComponentRecipeSelection[];
  compactionResults: RecipeCompactionOutcome[];
  fallbackMetadata: SlideOverflowFallbackMetadata[];
}

function describeAIComponentRecipe(recipeId: AIPresentationComponentRecipeId): string {
  return PRESENTATION_COMPONENT_AI_GUIDANCE[recipeId]?.label ?? recipeId;
}

function aiComponentRecipeHasMediaSlot(recipeId: AIPresentationComponentRecipeId): boolean {
  return (PRESENTATION_COMPONENT_MEDIA_SLOTS[recipeId]?.length ?? 0) > 0;
}

function getAIComponentRecipeActivationThreshold(recipeId: AIPresentationComponentRecipeId): number {
  if (recipeId === "sectioned-explainer") {
    return 6;
  }
  if (aiComponentRecipeHasMediaSlot(recipeId)) {
    return AUTO_MEDIA_RECIPE_THRESHOLD;
  }
  if (recipeId === "feature-highlights") {
    return 7;
  }
  return AUTO_TEXT_RECIPE_THRESHOLD;
}

function resolveLayoutModeForRecipe(
  recipeId: AIPresentationComponentRecipeId,
): PresentationAILayoutMode {
  return PRESENTATION_COMPONENT_LAYOUT_FAMILIES[recipeId] === "long_form"
    ? "long_form_block"
    : "structured_block";
}

function isPortraitCanvasForRecipeSelection(options: {
  canvasWidth?: number;
  canvasHeight?: number;
}): boolean {
  const width = sanitizeCanvasDimension(options.canvasWidth);
  const height = sanitizeCanvasDimension(options.canvasHeight);
  return Boolean(width && height && height > width);
}

function isNarrowPortraitCanvasForRecipeSelection(options: {
  canvasWidth?: number;
  canvasHeight?: number;
}): boolean {
  const width = sanitizeCanvasDimension(options.canvasWidth);
  const height = sanitizeCanvasDimension(options.canvasHeight);
  if (!width || !height || height <= width) {
    return false;
  }
  return (height / width) >= 1.5;
}

const STRONG_PROFILE_BOARD_KEYWORDS = [
  "experience",
  "skills",
  "contact",
  "portfolio",
  "resume",
  "biography",
  "speaker",
  "founder",
  "ประวัติการทำงาน",
  "ข้อมูลส่วนตัว",
  "แนะนำตัว",
  "ผู้บรรยาย",
  "วิทยากร",
  "ทักษะ",
  "ติดต่อ",
] as const;

function resolveAIComponentRecipeForSlide(options: {
  slide: AIPresentationSlide;
  slideIndex: number;
  preferVideoRecipes: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
  availableImageCount?: number;
  availableVideoCount?: number;
}): ResolvedAIComponentRecipeSelection {
  const layoutModeSelection = resolvePresentationLayoutMode({
    slide: options.slide,
    slideIndex: options.slideIndex,
    enabledModes: {
      structured_block: true,
      long_form_block: true,
      llm_layout_dsl: isPresentationLayoutDslEnabled(),
      full_slide_media: isPresentationFullSlideMediaEnabled(),
    },
  });
  const candidates = scoreAIComponentRecipes({
    slide: options.slide,
    preferVideoRecipes: options.preferVideoRecipes,
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    availableImageCount: options.availableImageCount,
    availableVideoCount: options.availableVideoCount,
  }).slice(0, 5);
  const structuredModeCandidate = layoutModeSelection.candidateModes.find(
    (candidate) => candidate.mode === "structured_block",
  );
  const sectionCount = options.slide.sections?.length ?? 0;
  const bodyCount = options.slide.body.filter((line) => line.trim().length > 0).length;
  const detailLines = (options.slide.sections ?? [])
    .flatMap((section) => section.details)
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);
  const maxDetailChars = detailLines.reduce((max, line) => Math.max(max, line.length), 0);
  const allLines = [
    options.slide.title,
    ...options.slide.body,
    options.slide.notes ?? "",
    ...(options.slide.sections ?? []).flatMap((section) => [section.heading, ...section.details]),
    ...(options.slide.markdownHierarchy ?? []).map((entry) => entry.text),
  ]
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);
  const haystack = allLines.join(" ").toLowerCase();
  const numberedBodyLines = options.slide.body.filter((line) => /^\s*(\d+[).\-]|step\s+\d+)/i.test(line)).length;
  const metricSignals = detectMetricSignals(allLines);
  const questionSignals = detectQuestionSignals(allLines);
  const timelineKeywordSignal = Number(textIncludesAnyKeyword(haystack, TIMELINE_RECIPE_KEYWORDS));
  const timelineMarkerCount = Array.from(
    haystack.matchAll(/\b(?:q[1-4]|20\d{2}|jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\b/gi),
  ).length;
  const timelineSignals = timelineKeywordSignal + Math.min(4, timelineMarkerCount);
  const processSignals = numberedBodyLines + Number(textIncludesAnyKeyword(haystack, PROCESS_RECIPE_KEYWORDS));
  const visualShowcaseSignal = textIncludesAnyKeyword(
    haystack,
    [
      ...PHOTO_COLLAGE_RECIPE_KEYWORDS,
      "showcase",
      "interior",
      "property",
      "listing",
      "portfolio",
      "travel",
      "destination",
      "สินทรัพย์",
      "บ้าน",
      "คอนโด",
      "อสังหา",
      "รีวิวสถานที่",
    ],
  );
  const narrativeChars = options.slide.body.reduce((sum, line) => sum + normalizeSlideText(line).length, 0)
    + detailLines.reduce((sum, line) => sum + line.length, 0);
  const noteChars = normalizeSlideText(options.slide.notes ?? "").length;
  const quoteLikeTitle = /["“”']/.test(options.slide.title);
  const quoteLikeBody = options.slide.body.some((line) => /["“”']/.test(line));
  const portraitCanvas = isPortraitCanvasForRecipeSelection(options);
  const narrowPortraitCanvas = isNarrowPortraitCanvasForRecipeSelection(options);
  const landscapeCanvas = Boolean(!portraitCanvas && options.canvasWidth && options.canvasHeight);
  const hasLongFormTextPressure = layoutModeSelection.profile.longParagraphCount >= 2
    || layoutModeSelection.profile.maxParagraphChars >= 140
    || layoutModeSelection.profile.avgParagraphChars >= 95;
  const portraitA4Pressure = portraitCanvas && (
    sectionCount >= 2
    || narrativeChars >= 220
    || noteChars >= 140
    || hasLongFormTextPressure
  );
  const suppressCompactRecipeSelection = (
    layoutModeSelection.recommendedMode === "long_form_block"
    || layoutModeSelection.recommendedMode === "llm_layout_dsl"
  ) && structuredModeCandidate?.fitStatus === "unsafe"
    && hasLongFormTextPressure;
  const heuristicCandidates = suppressCompactRecipeSelection
    ? candidates.filter((candidate) => PRESENTATION_COMPONENT_LAYOUT_FAMILIES[candidate.recipeId] === "long_form")
    : candidates;
  if (options.slideIndex === 0) {
    return {
      mode: layoutModeSelection.mode,
      recommendedMode: layoutModeSelection.recommendedMode,
      selectionMode: "none",
      selectionReason: "Slide 1 stays on the hero intro layout for consistency.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (isSupportedAIComponentRecipeId(options.slide.componentRecipeId)) {
    return {
      mode: resolveLayoutModeForRecipe(options.slide.componentRecipeId),
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: options.slide.componentRecipeId,
      selectionMode: "llm",
      selectionReason: `LLM selected ${describeAIComponentRecipe(options.slide.componentRecipeId)} explicitly.`,
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    sectionCount >= 4
    && bodyCount <= 2
    && maxDetailChars <= 96
    && narrativeChars <= 260
    && metricSignals < 2
    && questionSignals < 2
    && layoutModeSelection.recommendedMode !== "llm_layout_dsl"
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "infographic-grid",
      selectionMode: "heuristic",
      selectionReason: "Balanced four-section framework matched the infographic-grid block.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    numberedBodyLines >= 2
    && questionSignals < 2
    && timelineSignals < 2
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "process-steps",
      selectionMode: "heuristic",
      selectionReason: "Numbered workflow copy matched the process-steps block.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    quoteLikeTitle
    && sectionCount <= 1
    && bodyCount <= 2
    && metricSignals < 2
    && timelineSignals < 2
    && processSignals === 0
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "quote-callout",
      selectionMode: "heuristic",
      selectionReason: quoteLikeBody
        ? "Quote-like title/body matched the quote-callout block."
        : "Quoted title matched the quote-callout block.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    portraitA4Pressure
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && processSignals === 0
    && sectionCount <= 2
    && narrativeChars <= 620
    && visualShowcaseSignal
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "a4-photo-grid",
      selectionMode: "heuristic",
      selectionReason: "Portrait 9:16 canvas and photo-led narrative were routed into the multi-photo board.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    landscapeCanvas
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && processSignals === 0
    && sectionCount <= 3
    && bodyCount <= 4
    && (
      visualShowcaseSignal
    )
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "landscape-photo-story",
      selectionMode: "heuristic",
      selectionReason: "Landscape 16:9 canvas and visual storytelling signals matched the landscape showcase layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    metricSignals >= 2
    && bodyCount >= 2
    && bodyCount <= 4
    && noteChars < 240
    && processSignals === 0
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "stat-cards",
      selectionMode: "heuristic",
      selectionReason: "Compact metric-heavy copy matched the stat-cards block.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    sectionCount === 3
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && processSignals === 0
    && maxDetailChars <= 120
    && noteChars < 220
    && narrativeChars <= 420
    && !portraitA4Pressure
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "feature-highlights",
      selectionMode: "heuristic",
      selectionReason: "Balanced three-part narrative copy matched the feature-highlights block more cleanly than a long-form overlay layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    (timelineKeywordSignal >= 1 || timelineMarkerCount >= 2)
    && metricSignals < 2
    && questionSignals < 2
    && sectionCount >= 2
    && sectionCount <= 4
    && (!portraitA4Pressure || timelineMarkerCount >= 2)
    && (narrativeChars >= 360 || noteChars >= 180 || maxDetailChars > 96 || hasLongFormTextPressure)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "timeline-report",
      selectionMode: "heuristic",
      selectionReason: "Roadmap copy needed longer milestone explanations and was routed into the timeline-report long-form layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    (timelineKeywordSignal >= 1 || timelineMarkerCount >= 2)
    && metricSignals < 2
    && sectionCount >= 2
    && sectionCount <= 6
    && (!portraitA4Pressure || timelineMarkerCount >= 2)
    && noteChars < 220
    && maxDetailChars <= 96
    && narrativeChars <= 420
  ) {
    return {
      mode: "structured_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "timeline-flow",
      selectionMode: "heuristic",
      selectionReason: "Roadmap and milestone signals matched the timeline-flow block.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    questionSignals >= 2
    && sectionCount >= 2
    && sectionCount <= 4
    && metricSignals < 2
    && timelineSignals < 2
    && processSignals === 0
    && (narrativeChars >= 220 || noteChars >= 140)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "faq-stack",
      selectionMode: "heuristic",
      selectionReason: "Question-heavy long-form copy matched the faq-stack layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    textIncludesAnyKeyword(haystack, STRONG_PROFILE_BOARD_KEYWORDS)
    && (
      layoutModeSelection.profile.signals.contact >= 2
      || layoutModeSelection.profile.signals.profile >= 4
    )
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && processSignals === 0
    && (narrativeChars >= 240 || noteChars >= 180 || sectionCount >= 2)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "profile-board",
      selectionMode: "heuristic",
      selectionReason: "Profile/contact-heavy long-form copy matched the profile-board layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    sectionCount <= 1
    && bodyCount >= 2
    && metricSignals < 2
    && layoutModeSelection.profile.signals.profile < 4
    && (narrativeChars >= 260 || noteChars >= 220 || layoutModeSelection.profile.maxParagraphChars >= 120)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "article-focus",
      selectionMode: "heuristic",
      selectionReason: "Single-thread narrative density matched the article-focus long-form layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    sectionCount === 2
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && layoutModeSelection.profile.signals.profile < 4
    && !textIncludesAnyKeyword(haystack, FRAMED_STORY_RECIPE_KEYWORDS)
    && !textIncludesAnyKeyword(haystack, POSTER_RECIPE_KEYWORDS)
    && (narrativeChars >= 320 || noteChars >= 180 || maxDetailChars > 110 || hasLongFormTextPressure)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "two-column-article",
      selectionMode: "heuristic",
      selectionReason: "Dense two-section narrative copy matched the two-column-article long-form layout.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  const dslCandidate = layoutModeSelection.candidateModes.find((candidate) => candidate.mode === "llm_layout_dsl");
  if (
    layoutModeSelection.recommendedMode === "llm_layout_dsl"
    && dslCandidate?.fitStatus === "fits"
    && sectionCount >= 4
    && metricSignals < 2
    && timelineSignals < 2
    && processSignals === 0
  ) {
    return {
      mode: "llm_layout_dsl",
      recommendedMode: layoutModeSelection.recommendedMode,
      selectionMode: "none",
      selectionReason: "Balanced multi-section content was routed to the bounded layout DSL because existing recipes would over-constrain the board.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    sectionCount >= 3
    && bodyCount >= 4
    && metricSignals < 2
    && timelineSignals < 2
    && (narrativeChars >= 300 || noteChars >= 180)
  ) {
    return {
      mode: "long_form_block",
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: "sectioned-explainer",
      selectionMode: "heuristic",
      selectionReason: "Dense multi-section copy crossed the long-form boundary and was routed into sectioned-explainer.",
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }
  if (
    portraitA4Pressure
    && metricSignals < 2
    && questionSignals < 2
    && timelineSignals < 2
    && processSignals === 0
  ) {
    if (sectionCount === 2) {
      return {
        mode: "long_form_block",
        recommendedMode: layoutModeSelection.recommendedMode,
        componentRecipeId: "two-column-article",
        selectionMode: "heuristic",
        selectionReason: "Portrait 9:16 canvas biased dense two-section copy toward the more editorial two-column-article layout.",
        candidateRecipes: candidates,
        candidateModes: layoutModeSelection.candidateModes,
      };
    }
    if (sectionCount >= 3) {
      return {
        mode: "long_form_block",
        recommendedMode: layoutModeSelection.recommendedMode,
        componentRecipeId: "sectioned-explainer",
        selectionMode: "heuristic",
        selectionReason: "Portrait 9:16 canvas biased multi-section copy toward the more A4-like sectioned-explainer layout.",
        candidateRecipes: candidates,
        candidateModes: layoutModeSelection.candidateModes,
      };
    }
    if (bodyCount >= 2 || narrativeChars >= 220 || noteChars >= 140) {
      return {
        mode: "long_form_block",
        recommendedMode: layoutModeSelection.recommendedMode,
        componentRecipeId: "article-focus",
        selectionMode: "heuristic",
        selectionReason: "Portrait 9:16 canvas biased dense single-thread copy toward the more editorial article-focus layout.",
        candidateRecipes: candidates,
        candidateModes: layoutModeSelection.candidateModes,
      };
    }
  }
  if (suppressCompactRecipeSelection && heuristicCandidates.length === 0) {
    return {
      mode: layoutModeSelection.mode,
      recommendedMode: layoutModeSelection.recommendedMode,
      selectionMode: "none",
      selectionReason: `Routed toward ${layoutModeSelection.recommendedMode} because the slide copy is too dense for compact component recipes.`,
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }

  const portraitAwareCandidates = portraitA4Pressure
    ? heuristicCandidates
      .map((candidate) => {
        let score = candidate.score;
        if (candidate.recipeId === "article-focus") score += 8;
        if (candidate.recipeId === "two-column-article") score += 9;
        if (candidate.recipeId === "sectioned-explainer") score += 7;
        if (candidate.recipeId === "timeline-report") score += 7;
        if (candidate.recipeId === "profile-board") score += 8;
        if (candidate.recipeId === "a4-photo-grid") score += visualShowcaseSignal ? 10 : -6;
        if (candidate.recipeId === "framed-image-story") score += 3;
        if (candidate.recipeId === "photo-collage") score += 3;
        if (candidate.recipeId === "poster-spotlight") score += 2;
        if (candidate.recipeId === "landscape-photo-story") score -= 6;
        if (candidate.recipeId === "feature-highlights") score -= narrowPortraitCanvas ? 6 : 4;
        if (candidate.recipeId === "infographic-grid") score -= narrowPortraitCanvas ? 6 : 4;
        if (candidate.recipeId === "stat-cards") score -= 3;
        if (candidate.recipeId === "process-steps") score -= 4;
        if (candidate.recipeId === "timeline-flow") score -= 4;
        if (candidate.recipeId === "profile-summary") score -= 3;
        return { ...candidate, score };
      })
      .sort((a, b) => b.score - a.score)
    : landscapeCanvas
    ? heuristicCandidates
      .map((candidate) => {
        let score = candidate.score;
        if (candidate.recipeId === "landscape-photo-story") score += visualShowcaseSignal ? 10 : -6;
        if (candidate.recipeId === "framed-image-story") score += 4;
        if (candidate.recipeId === "poster-spotlight") score += 3;
        if (candidate.recipeId === "a4-photo-grid") score -= 4;
        if (candidate.recipeId === "timeline-report") score -= 4;
        if (candidate.recipeId === "sectioned-explainer") score -= 4;
        return { ...candidate, score };
      })
      .sort((a, b) => b.score - a.score)
    : heuristicCandidates;

  const topCandidate = portraitAwareCandidates[0] ?? candidates[0];
  if (topCandidate && topCandidate.score >= getAIComponentRecipeActivationThreshold(topCandidate.recipeId)) {
    return {
      mode: resolveLayoutModeForRecipe(topCandidate.recipeId),
      recommendedMode: layoutModeSelection.recommendedMode,
      componentRecipeId: topCandidate.recipeId,
      selectionMode: "heuristic",
      selectionReason: `Heuristic match favored ${describeAIComponentRecipe(topCandidate.recipeId)} with score ${topCandidate.score}.`,
      candidateRecipes: candidates,
      candidateModes: layoutModeSelection.candidateModes,
    };
  }

  return {
    mode: layoutModeSelection.mode,
    recommendedMode: layoutModeSelection.recommendedMode,
    selectionMode: "none",
    selectionReason: topCandidate && !aiComponentRecipeHasMediaSlot(topCandidate.recipeId)
      ? `Ignored text-only heuristic "${describeAIComponentRecipe(topCandidate.recipeId)}" because Draft with AI still needs an image/video region.`
      : topCandidate
      ? `No component recipe cleared the activation threshold; top heuristic was ${describeAIComponentRecipe(topCandidate.recipeId)} (${topCandidate.score}).`
      : "No component recipe matched this slide strongly enough.",
    candidateRecipes: candidates,
    candidateModes: layoutModeSelection.candidateModes,
  };
}

function estimateDesiredVisualCountForSlide(
  slide: AIPresentationSlide,
  options: { preferVideoRecipes: boolean },
): { desiredImageCount: number; desiredVideoCount: number } {
  const explicitCount = Array.isArray(slide.mediaPlan) ? slide.mediaPlan.length : 0;
  const recipeSlotCount = slide.componentRecipeId
    ? PRESENTATION_COMPONENT_MEDIA_SLOTS[slide.componentRecipeId]?.length ?? 0
    : 0;
  const desiredVisualCount = Math.max(explicitCount, recipeSlotCount);
  if (desiredVisualCount <= 0) {
    return { desiredImageCount: 0, desiredVideoCount: 0 };
  }
  if (options.preferVideoRecipes) {
    return { desiredImageCount: 0, desiredVideoCount: desiredVisualCount };
  }
  return { desiredImageCount: desiredVisualCount, desiredVideoCount: 0 };
}

function applyAIRecipeSelectionDiversity(options: {
  selection: ResolvedAIComponentRecipeSelection;
  priorSelections: ResolvedAIComponentRecipeSelection[];
  slideIndex: number;
  allowMediaRecipeSwitch: boolean;
}): ResolvedAIComponentRecipeSelection {
  const selectedRecipeId = options.selection.componentRecipeId;
  const isLlmSelection = options.selection.selectionMode === "llm";
  if (!selectedRecipeId || (options.selection.selectionMode !== "heuristic" && !isLlmSelection) || options.slideIndex <= 0) {
    return options.selection;
  }
  // LLM selections require at least 2 consecutive repeats before diversity override,
  // versus 1 for heuristic — we respect the LLM's intent more strongly.
  const minConsecutiveRunForDiversity = isLlmSelection ? 2 : 1;

  const previousRecipeId = options.priorSelections[options.priorSelections.length - 1]?.componentRecipeId;
  const recipeUsage = new Map<AIPresentationComponentRecipeId, number>();
  let consecutiveRecipeRun = 0;

  for (const selection of options.priorSelections) {
    if (!selection.componentRecipeId) {
      continue;
    }
    recipeUsage.set(selection.componentRecipeId, (recipeUsage.get(selection.componentRecipeId) ?? 0) + 1);
  }

  for (let index = options.priorSelections.length - 1; index >= 0; index -= 1) {
    const recipeId = options.priorSelections[index]?.componentRecipeId;
    if (recipeId !== selectedRecipeId) {
      break;
    }
    consecutiveRecipeRun += 1;
  }

  if (consecutiveRecipeRun < minConsecutiveRunForDiversity) {
    return options.selection;
  }

  const rescoredCandidates = options.selection.candidateRecipes
    .map((candidate) => {
      let score = candidate.score;
      const usageCount = recipeUsage.get(candidate.recipeId) ?? 0;
      const candidateHasMedia = aiComponentRecipeHasMediaSlot(candidate.recipeId);
      const selectedHasMedia = aiComponentRecipeHasMediaSlot(selectedRecipeId);

      if (candidate.recipeId === selectedRecipeId) {
        score -= 4 + (consecutiveRecipeRun * 5);
      } else if (candidate.recipeId !== previousRecipeId) {
        score += 2;
      }

      if (usageCount > 0) {
        score -= usageCount * 2;
      }
      if (previousRecipeId && candidate.recipeId !== previousRecipeId) {
        score += 1;
      }
      if (!options.allowMediaRecipeSwitch && candidateHasMedia && !selectedHasMedia) {
        score -= 100;
      }

      return { ...candidate, score: Math.max(0, Math.min(1000, score)) };
    })
    .sort((left, right) => right.score - left.score);

  // Relax activation threshold for alternatives based on consecutive run length:
  // LLM selections use a stricter threshold (multiplier capped at 0.85) so we only
  // override when a clearly distinct layout is available.
  // Heuristic: after 2 consecutive → 65%; after 3+ → 50%
  // LLM: after 2 consecutive → 75%; after 3+ → 60%
  const diversityThresholdMultiplier = isLlmSelection
    ? (consecutiveRecipeRun >= 3 ? 0.6 : 0.75)
    : (consecutiveRecipeRun >= 3 ? 0.5 : consecutiveRecipeRun >= 2 ? 0.65 : 0.85);

  const currentCandidate = rescoredCandidates.find((candidate) => candidate.recipeId === selectedRecipeId);
  const alternativeCandidate = rescoredCandidates.find((candidate) => (
    candidate.recipeId !== selectedRecipeId
    && candidate.score >= Math.ceil(
      getAIComponentRecipeActivationThreshold(candidate.recipeId) * diversityThresholdMultiplier,
    )
  ));

  if (!alternativeCandidate || !currentCandidate) {
    return {
      ...options.selection,
      candidateRecipes: rescoredCandidates,
    };
  }

  // Allow wider score gap for longer consecutive runs so diversity is actually enforced.
  // LLM selections allow a narrower gap because the LLM intentionally chose this recipe —
  // we only override when the alternative is competitive.
  const switchGapAllowance = isLlmSelection
    ? (consecutiveRecipeRun >= 3 ? 12 : 4)
    : (consecutiveRecipeRun >= 3 ? 100 : consecutiveRecipeRun >= 2 ? 8 : 4);
  const shouldSwitch = alternativeCandidate.score >= currentCandidate.score - switchGapAllowance;

  if (!shouldSwitch) {
    return {
      ...options.selection,
      candidateRecipes: rescoredCandidates,
    };
  }

  return {
    ...options.selection,
    mode: resolveLayoutModeForRecipe(alternativeCandidate.recipeId),
    componentRecipeId: alternativeCandidate.recipeId,
    selectionMode: "heuristic",
    selectionReason: `${options.selection.selectionReason ?? "Heuristic selection."} Diversity pass switched slide ${options.slideIndex + 1} to ${describeAIComponentRecipe(alternativeCandidate.recipeId)} to avoid repeating ${describeAIComponentRecipe(selectedRecipeId)} across consecutive slides.`,
    candidateRecipes: rescoredCandidates,
  };
}

const PRESENTATION_RECIPE_COMPACTION_RECIPE_IDS = new Set<AIPresentationComponentRecipeId>([
  "sectioned-explainer",
  "article-focus",
  "two-column-article",
  "faq-stack",
  "timeline-report",
  "profile-board",
  "profile-summary",
  "poster-spotlight",
  "framed-image-story",
  "feature-highlights",
  "infographic-grid",
  "stat-cards",
  "timeline-flow",
  "process-steps",
  "a4-photo-grid",
  "landscape-photo-story",
]);

function buildRecipeNarrativeInputFromSlide(
  slide: AIPresentationSlide,
): Parameters<typeof buildPresentationComponentRecipeSlotBindings>[1] {
  return {
    title: slide.title,
    body: slide.body
      .map((line) => normalizeNarrativeBodyLine(line))
      .filter((line) => line.length > 0),
    ...(slide.notes ? { notes: slide.notes } : {}),
    ...(slide.sections?.length
      ? {
        sections: slide.sections.map((section) => ({
          heading: normalizeSlideText(section.heading),
          details: section.details
            .map((detail) => normalizeSlideText(detail))
            .filter((detail) => detail.length > 0),
        })),
      }
      : {}),
    ...(slide.graphicCategory ? { graphicCategory: slide.graphicCategory } : {}),
  };
}

export function evaluateDraftSlideRouting(options: {
  slide: AIPresentationSlide;
  slideIndex: number;
  preferVideoRecipes?: boolean;
  canvasWidth?: number;
  canvasHeight?: number;
}): {
  selection: {
    mode: PresentationAILayoutMode;
    recommendedMode: PresentationAILayoutMode;
    componentRecipeId?: AIPresentationComponentRecipeId;
    selectionMode: "llm" | "heuristic" | "manual-override" | "none";
    selectionReason: string;
    candidateModes: PresentationAILayoutModeCandidate[];
    candidateRecipes: ResolvedAIComponentRecipeSelection["candidateRecipes"];
  };
  profile: ReturnType<typeof buildPresentationContentProfile>;
} {
  const desiredVisualCounts = estimateDesiredVisualCountForSlide(options.slide, {
    preferVideoRecipes: Boolean(options.preferVideoRecipes),
  });
  const selection = resolveAIComponentRecipeForSlide({
    slide: options.slide,
    slideIndex: options.slideIndex,
    preferVideoRecipes: Boolean(options.preferVideoRecipes),
    canvasWidth: options.canvasWidth,
    canvasHeight: options.canvasHeight,
    availableImageCount: desiredVisualCounts.desiredImageCount,
    availableVideoCount: desiredVisualCounts.desiredVideoCount,
  });
  return {
    selection,
    profile: buildPresentationContentProfile(options.slide),
  };
}

function buildRawRecipeSlotBindings(
  slide: AIPresentationSlide,
  recipeId: AIPresentationComponentRecipeId,
): PresentationComponentSlotBinding[] {
  return buildPresentationComponentRecipeSlotBindings(
    recipeId,
    buildRecipeNarrativeInputFromSlide(slide),
  );
}

function buildRecipeSourceTraceForSlide(
  slide: AIPresentationSlide,
): PresentationAIDesignSourceTrace[] {
  const profile = buildPresentationContentProfile(slide);
  const entries: Array<{
    sourceId: string;
    sourceType: PresentationAIDesignSourceTrace["sourceType"];
    sourceExcerpt?: string;
  }> = [];

  for (const paragraph of profile.paragraphs) {
    entries.push({
      sourceId: paragraph.id,
      sourceType: paragraph.isBullet ? "bullet" : "paragraph",
      sourceExcerpt: paragraph.text.slice(0, 512),
    });
  }
  for (const section of profile.sections) {
    entries.push({
      sourceId: section.id,
      sourceType: "section",
      sourceExcerpt: section.heading.slice(0, 512),
    });
  }
  return buildDefaultRecipeSourceTrace(entries);
}

function normalizeRecipeCompactionLevel(
  value: string | undefined,
): PresentationRecipeCompactionLevel | undefined {
  if (
    value
    && (PRESENTATION_RECIPE_COMPACTION_LEVELS as readonly string[]).includes(value)
  ) {
    return value as PresentationRecipeCompactionLevel;
  }
  return undefined;
}

function buildCompactionPromptRequest(
  slide: AIPresentationSlide,
  recipeId: AIPresentationComponentRecipeId,
  compactionLevel: Exclude<PresentationRecipeCompactionLevel, "none">,
): string {
  const profile = buildPresentationContentProfile(slide);
  const slotBudgets = Object.entries(PRESENTATION_COMPONENT_SLOT_BUDGETS[recipeId] ?? {}).map(([slotId, budget]) => ({
    slotId,
    role: slotId,
    ...(budget.maxChars ? { maxChars: budget.maxChars } : {}),
    ...(budget.maxItems ? { maxItems: budget.maxItems } : {}),
    ...(budget.preferredLines ? { targetLines: budget.preferredLines } : {}),
  }));
  return JSON.stringify({
    mode: PRESENTATION_COMPONENT_LAYOUT_FAMILIES[recipeId] === "long_form"
      ? "long_form_block"
      : "structured_block",
    recipeId,
    language: "th",
    compactionLevel,
    contentProfile: {
      headingCount: profile.headingCount,
      paragraphCount: profile.paragraphCount,
      bulletCount: profile.bulletCount,
      avgParagraphChars: profile.avgParagraphChars,
      maxParagraphChars: profile.maxParagraphChars,
    },
    slotBudgets,
    qualityThresholds: {
      minFitScore: PRESENTATION_RECIPE_FIT_THRESHOLDS.accept,
      warnOverflowRisk: PRESENTATION_RECIPE_FIT_THRESHOLDS.warnOverflowRisk,
      unsafeOverflowRisk: PRESENTATION_RECIPE_FIT_THRESHOLDS.unsafeOverflowRisk,
    },
    textPolicy: {
      language: "th",
      preserveFacts: true,
      avoidInventingNewClaims: true,
      allowAggressiveRewrite: compactionLevel === "aggressive",
    },
    sourceNarrative: {
      title: slide.title,
      body: slide.body,
      ...(slide.sections?.length
        ? {
          sections: slide.sections.map((section, index) => ({
            id: `section-${index + 1}`,
            heading: section.heading,
            details: section.details,
          })),
        }
        : {}),
    },
  }, null, 2);
}

function buildValidatedRecipeBindings(
  rawBindings: PresentationComponentSlotBinding[],
  compacted: z.infer<typeof presentationRecipeCompactionResponseSchema>["slotContent"],
): PresentationComponentSlotBinding[] {
  const rawBySlotId = new Map(rawBindings.map((binding) => [binding.slotId, binding]));
  const nextBindings: PresentationComponentSlotBinding[] = [];

  for (const binding of compacted) {
    const rawBinding = rawBySlotId.get(binding.slotId);
    if (!rawBinding) {
      continue;
    }
    if (binding.type === "text" && rawBinding.type === "text") {
      nextBindings.push({
        slotId: binding.slotId,
        type: "text",
        text: normalizeSlideText(binding.text).slice(0, 2_000),
      });
      continue;
    }
    if (binding.type === "list" && rawBinding.type === "list") {
      nextBindings.push({
        slotId: binding.slotId,
        type: "list",
        items: binding.items
          .map((item) => normalizeSlideText(item))
          .filter((item) => item.length > 0)
          .slice(0, 12),
      });
      continue;
    }
    nextBindings.push({ ...rawBinding });
  }

  for (const rawBinding of rawBindings) {
    if (nextBindings.some((binding) => binding.slotId === rawBinding.slotId)) {
      continue;
    }
    nextBindings.push({ ...rawBinding });
  }

  return nextBindings;
}

async function compactSlideForRecipe(options: {
  slide: AIPresentationSlide;
  selection: ResolvedAIComponentRecipeSelection | undefined;
  actor: PresentationActor;
  taskId: string;
  deckId: number;
  model: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  awaitStep?: DraftAwaitStep;
  onAttempt?: (context: {
    recipeId: AIPresentationComponentRecipeId;
    compactionLevel: "balanced" | "compact" | "aggressive";
    attempt: number;
    maxAttempts: number;
    deadlineAt: string;
  }) => Promise<void>;
}): Promise<RecipeCompactionOutcome> {
  const recipeId = options.selection?.componentRecipeId;
  if (!recipeId || !PRESENTATION_RECIPE_COMPACTION_RECIPE_IDS.has(recipeId)) {
    return { slide: options.slide };
  }

  const rawBindings = buildRawRecipeSlotBindings(options.slide, recipeId);
  const rawFit = evaluatePresentationRecipeSlotFit(recipeId, rawBindings);
  const defaultTrace = buildRecipeSourceTraceForSlide(options.slide);
  const profile = buildPresentationContentProfile(options.slide);
  const noteChars = normalizeSlideText(options.slide.notes ?? "").length;
  const shouldForceCompaction = PRESENTATION_COMPONENT_LAYOUT_FAMILIES[recipeId] === "long_form"
    ? (
      profile.totalChars >= 220
      || noteChars >= 140
      || profile.sectionCount >= 2
      || profile.longParagraphCount >= 1
    )
    : (
      profile.totalChars >= 120
      || noteChars >= 60
      || profile.longParagraphCount >= 1
      || profile.sectionCount >= 1
    );
  if (
    !shouldForceCompaction
    && (
    rawFit.fitScore.overall >= PRESENTATION_RECIPE_FIT_THRESHOLDS.accept
    && rawFit.fitScore.status === "fits"
    )
  ) {
    return {
      slide: {
        ...options.slide,
        componentSlotBindings: rawBindings,
      },
      fitScore: rawFit.fitScore,
      compactionLevel: "none",
      sourceTrace: defaultTrace,
    };
  }

  const fallbackHistory: PresentationAIDesignFallbackHistory[] = [];
  const compactionDeadline = Date.now() + resolveAIDraftRecipeCompactionTotalTimeoutMs();
  const compactionLevels = ["balanced", "compact", "aggressive"] as const;
  for (const [attemptIndex, level] of compactionLevels.entries()) {
    const remainingBudgetMs = compactionDeadline - Date.now();
    if (remainingBudgetMs <= 0) {
      fallbackHistory.push(makeFallbackHistoryEntry({
        step: "retry_compaction",
        from: level,
        reason: "Recipe compaction exceeded the per-slide time budget; keeping the latest safe slide content.",
      }));
      break;
    }
    try {
      await options.onAttempt?.({
        recipeId,
        compactionLevel: level,
        attempt: attemptIndex + 1,
        maxAttempts: compactionLevels.length,
        deadlineAt: new Date(compactionDeadline).toISOString(),
      });
      const compactionPromise = callLLMStructured({
        systemPrompt: [
          "You compact slide copy into validated slot-shaped JSON for presentation layouts.",
          "Return JSON only.",
          "Preserve facts, dates, metrics, and named entities.",
          "Do not invent new claims.",
          "If content still cannot fit, return status=needs_fallback and explain why in fallbackSuggestion.",
        ].join("\n"),
        userMessage: buildCompactionPromptRequest(options.slide, recipeId, level),
        model: options.model,
        preferredProviderId: options.preferredProviderId,
        strictProviderPin: options.strictProviderPin,
        zodSchema: presentationRecipeCompactionResponseSchema,
        userId: options.actor.userId,
        tenantId: options.actor.tenantId,
        billingDescription: `AI Draft recipe compaction (${recipeId}) (Deck #${options.deckId})`,
        billingMetadata: {
          operation: "ai_draft_recipe_compaction",
          taskId: options.taskId,
          deckId: options.deckId,
          stage: "recipe_compaction",
          recipeId,
          compactionLevel: level,
          promptPreview: options.slide.title.slice(0, 200),
        },
      });
      const compaction = options.awaitStep
        ? await options.awaitStep(compactionPromise, {
          cancelLabel: "recipe_compaction_cancelled",
          timeoutLabel: "recipe_compaction_timeout",
          timeoutMs: Math.min(resolveAIDraftRecipeCompactionTimeoutMs(), remainingBudgetMs),
        })
        : await compactionPromise;
      if (compaction.data.status !== "ok") {
        fallbackHistory.push({
          step: "retry_compaction",
          from: level,
          to: compaction.data.fallbackSuggestion?.action,
          reason: compaction.data.fallbackSuggestion?.reason ?? "Compaction requested a fallback.",
          timestamp: new Date().toISOString(),
        });
        continue;
      }

      const compactedBindings = buildValidatedRecipeBindings(rawBindings, compaction.data.slotContent);
      const fit = evaluatePresentationRecipeSlotFit(recipeId, compactedBindings);
      if (
        fit.fitScore.overall >= PRESENTATION_RECIPE_FIT_THRESHOLDS.accept
        && fit.fitScore.status !== "unsafe"
      ) {
        return {
          slide: {
            ...options.slide,
            componentSlotBindings: compactedBindings,
          },
          fitScore: fit.fitScore,
          compactionLevel: level,
          sourceTrace: compaction.data.sourceTrace.map((entry) => ({
            sourceId: entry.sourceId,
            sourceType: defaultTrace.find((candidate) => candidate.sourceId === entry.sourceId)?.sourceType ?? "paragraph",
            ...(defaultTrace.find((candidate) => candidate.sourceId === entry.sourceId)?.sourceExcerpt
              ? { sourceExcerpt: defaultTrace.find((candidate) => candidate.sourceId === entry.sourceId)?.sourceExcerpt }
              : {}),
            disposition: entry.disposition,
            ...(entry.targetSlotId ? { targetSlotId: entry.targetSlotId } : {}),
            ...(entry.targetSlideId ? { targetSlideId: entry.targetSlideId } : {}),
            ...(entry.notes ? { notes: entry.notes } : {}),
          })),
          fallbackHistory,
        };
      }

      fallbackHistory.push({
        step: "retry_compaction",
        from: level,
        reason: `Compaction output remained ${fit.fitScore.status} with overall fit ${fit.fitScore.overall.toFixed(2)}.`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error instanceof AIDraftCancelledError) {
        throw error;
      }
      fallbackHistory.push({
        step: "retry_compaction",
        from: level,
        reason: `Compaction attempt failed: ${sanitizeErrorMessage(error)}`,
        timestamp: new Date().toISOString(),
      });
      if (Date.now() >= compactionDeadline) {
        fallbackHistory.push(makeFallbackHistoryEntry({
          step: "retry_compaction",
          from: level,
          reason: "Recipe compaction exhausted the per-slide retry budget; falling back to the current slide structure.",
        }));
        break;
      }
    }
  }

  return {
    slide: options.slide,
    fitScore: shouldForceCompaction && fallbackHistory.length > 0
      ? {
        ...rawFit.fitScore,
        overall: Math.min(rawFit.fitScore.overall, 0.4),
        overflowRisk: Math.max(rawFit.fitScore.overflowRisk, 0.82),
        status: "unsafe",
      }
      : rawFit.fitScore,
    compactionLevel: "none",
    sourceTrace: defaultTrace,
    fallbackHistory,
  };
}

function makeFallbackHistoryEntry(entry: Omit<PresentationAIDesignFallbackHistory, "timestamp">): PresentationAIDesignFallbackHistory {
  return {
    ...entry,
    timestamp: new Date().toISOString(),
  };
}

function dedupeSourceTrace(
  entries: PresentationAIDesignSourceTrace[] | undefined,
): PresentationAIDesignSourceTrace[] | undefined {
  if (!entries?.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const result: PresentationAIDesignSourceTrace[] = [];
  for (const entry of entries) {
    const key = [
      entry.sourceId,
      entry.disposition,
      entry.targetSlotId ?? "",
      entry.targetSlideId ?? "",
      entry.notes ?? "",
    ].join("::");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function dedupeFallbackHistory(
  entries: PresentationAIDesignFallbackHistory[] | undefined,
): PresentationAIDesignFallbackHistory[] | undefined {
  if (!entries?.length) {
    return undefined;
  }
  const seen = new Set<string>();
  const result: PresentationAIDesignFallbackHistory[] = [];
  for (const entry of entries) {
    const key = [entry.step, entry.from ?? "", entry.to ?? "", entry.reason].join("::");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(entry);
  }
  return result;
}

function mergeSourceTraceEntries(
  ...groups: Array<PresentationAIDesignSourceTrace[] | undefined>
): PresentationAIDesignSourceTrace[] | undefined {
  return dedupeSourceTrace(groups.flatMap((entries) => entries ?? []));
}

function mergeFallbackHistoryEntries(
  ...groups: Array<PresentationAIDesignFallbackHistory[] | undefined>
): PresentationAIDesignFallbackHistory[] | undefined {
  return dedupeFallbackHistory(groups.flatMap((entries) => entries ?? []));
}

function buildSlideQualityGateMetadata(options: {
  recipeId: AIPresentationComponentRecipeId | undefined;
  slotBindings: PresentationComponentSlotBinding[] | undefined;
  fitScore: PresentationAIDesignFitScore | undefined;
  sourceTrace: PresentationAIDesignSourceTrace[] | undefined;
}): {
  warnings: string[];
  verdict?: ReturnType<typeof evaluateSlideQualityGate>["verdict"];
  issues: ReturnType<typeof evaluateSlideQualityGate>["issues"];
} {
  if (!options.recipeId) {
    return { warnings: [], issues: [] };
  }
  const slotFit = options.slotBindings?.length
    ? evaluatePresentationRecipeSlotFit(options.recipeId, options.slotBindings)
    : undefined;
  const qualityGate = evaluateSlideQualityGate(
    options.fitScore,
    slotFit?.slotDetails,
    PRESENTATION_COMPONENT_SLOT_BUDGETS[options.recipeId],
  );
  const omissionIssue = evaluateSourceTraceOmission(options.sourceTrace);
  const issues = omissionIssue
    ? [...qualityGate.issues, omissionIssue]
    : qualityGate.issues;
  return {
    warnings: issues.map((issue) => issue.message),
    verdict: qualityGate.verdict,
    issues,
  };
}

function logLayoutTelemetryEvent(
  actor: PresentationActor,
  taskId: string,
  event: ReturnType<typeof buildModeSelectedEvent> | ReturnType<typeof buildQualityGateEvent> | ReturnType<typeof buildDeckConsistencyEvent>,
): void {
  auditLogger.log({
    traceId: taskId,
    timestamp: new Date().toISOString(),
    eventType: "rollout_gate",
    userId: actor.userId,
    responsePayload: event,
  });
}

function shouldEscalateStructuredSlideToLongForm(
  slide: AIPresentationSlide,
  selection: ResolvedAIComponentRecipeSelection | undefined,
): boolean {
  if (!selection || selection.componentRecipeId === "sectioned-explainer") {
    return false;
  }
  if (selection.recommendedMode !== "long_form_block") {
    return false;
  }
  const profile = buildPresentationContentProfile(slide);
  if (
    selection.componentRecipeId === "stat-cards"
    || selection.componentRecipeId === "feature-highlights"
    || selection.componentRecipeId === "timeline-flow"
    || selection.componentRecipeId === "timeline-report"
    || selection.componentRecipeId === "infographic-grid"
    || selection.componentRecipeId === "process-steps"
    || selection.componentRecipeId === "article-focus"
    || selection.componentRecipeId === "two-column-article"
    || selection.componentRecipeId === "faq-stack"
    || selection.componentRecipeId === "profile-board"
  ) {
    return false;
  }
  return (
    profile.totalChars >= 320
    || profile.sectionCount >= 3
    || profile.longParagraphCount >= 2
  );
}

function shouldSplitLongFormSlide(
  slide: AIPresentationSlide,
  selection: ResolvedAIComponentRecipeSelection | undefined,
  compaction: RecipeCompactionOutcome | undefined,
): boolean {
  if (selection?.componentRecipeId !== "sectioned-explainer") {
    return false;
  }
  const fitScore = compaction?.fitScore;
  if (!fitScore || (fitScore.status !== "unsafe" && fitScore.overall >= PRESENTATION_RECIPE_FIT_THRESHOLDS.warn)) {
    return false;
  }
  const profile = buildPresentationContentProfile(slide);
  return (
    profile.sectionCount >= 3
    || profile.paragraphCount >= 6
    || profile.totalChars >= 780
  );
}

function shouldFallbackUnsafeRecipeToSectionedExplainer(
  slide: AIPresentationSlide,
  selection: ResolvedAIComponentRecipeSelection | undefined,
  compaction: RecipeCompactionOutcome | undefined,
): boolean {
  const recipeId = selection?.componentRecipeId;
  if (
    !recipeId
    || recipeId === "sectioned-explainer"
    || (recipeId !== "profile-board" && recipeId !== "timeline-report")
  ) {
    return false;
  }
  const fitScore = compaction?.fitScore;
  if (!fitScore || fitScore.status !== "unsafe") {
    return false;
  }
  const profile = buildPresentationContentProfile(slide);
  return (
    profile.totalChars >= 180
    || profile.sectionCount >= 2
    || profile.longParagraphCount >= 1
  );
}

function buildOverflowSummaryForSlide(
  slide: AIPresentationSlide,
  sections: Array<{ heading: string; details: string[] }>,
  body: string[],
): string | undefined {
  const candidates = [
    ...sections.flatMap((section) => [section.heading, ...section.details]),
    ...body,
  ]
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0);
  const summary = candidates.slice(0, 3).join(" ");
  return summary ? summary.slice(0, 1_200) : normalizeSlideText(slide.notes ?? "").slice(0, 1_200) || undefined;
}

function splitDenseSlideForOverflow(options: {
  slide: AIPresentationSlide;
  slideIndex: number;
  selection: ResolvedAIComponentRecipeSelection | undefined;
}): {
  slides: AIPresentationSlide[];
  fallbackMetadata: SlideOverflowFallbackMetadata[];
} {
  const originalSlide = normalizeSlideHierarchy(options.slide);
  const sections = (originalSlide.sections ?? [])
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));
  const body = originalSlide.body
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0);
  const midpoint = Math.max(1, Math.ceil((sections.length || body.length) / 2));
  const firstSections = sections.length > 0 ? sections.slice(0, midpoint) : [];
  const secondSections = sections.length > 0 ? sections.slice(midpoint) : [];
  const firstBody = body.length > 0 ? body.slice(0, Math.max(1, Math.ceil(body.length / 2))) : [];
  const secondBody = body.length > 0 ? body.slice(Math.max(1, Math.ceil(body.length / 2))) : [];

  const partA = normalizeSlideHierarchy({
    ...originalSlide,
    componentRecipeId: "sectioned-explainer",
    title: originalSlide.title,
    body: (firstBody.length > 0 ? firstBody : body).slice(0, AI_NARRATIVE_MAX_BODY_LINES),
    ...(firstSections.length > 0 ? { sections: firstSections } : {}),
    ...(buildOverflowSummaryForSlide(originalSlide, firstSections, firstBody)
      ? { notes: buildOverflowSummaryForSlide(originalSlide, firstSections, firstBody) }
      : {}),
  });
  const secondTitleSeed = secondSections[0]?.heading
    ? `${originalSlide.title} / ${secondSections[0].heading}`
    : `${originalSlide.title} (ต่อ)`;
  const partB = normalizeSlideHierarchy({
    ...originalSlide,
    componentRecipeId: "sectioned-explainer",
    title: secondTitleSeed.slice(0, 200),
    body: (secondBody.length > 0 ? secondBody : body.slice(Math.max(1, Math.ceil(body.length / 2)))).slice(0, AI_NARRATIVE_MAX_BODY_LINES),
    ...(secondSections.length > 0 ? { sections: secondSections } : {}),
    ...(buildOverflowSummaryForSlide(originalSlide, secondSections, secondBody)
      ? { notes: buildOverflowSummaryForSlide(originalSlide, secondSections, secondBody) }
      : {}),
  });
  const splitSlides = secondSections.length > 0 || secondBody.length > 0
    ? [partA, partB]
    : [partA];
  const sourceProfile = buildPresentationContentProfile(originalSlide);
  const targetIds = splitSlides.map((_, partIndex) => `draft-slide-${options.slideIndex + 1}-part-${partIndex + 1}`);
  const traceByPart = splitSlides.map<PresentationAIDesignSourceTrace[]>(() => []);

  for (const paragraph of sourceProfile.paragraphs) {
    const targetIndex = splitSlides.findIndex((candidate) => (
      candidate.body.some((line) => normalizeNarrativeBodyLine(line) === paragraph.text)
      || (candidate.sections ?? []).some((section) => section.details.some((detail) => normalizeNarrativeBodyLine(detail) === paragraph.text))
      || normalizeSlideText(candidate.notes ?? "").includes(paragraph.text.slice(0, Math.min(24, paragraph.text.length)))
    ));
    if (targetIndex >= 0) {
      traceByPart[targetIndex]!.push({
        sourceId: paragraph.id,
        sourceType: paragraph.isBullet ? "bullet" : "paragraph",
        sourceExcerpt: paragraph.text.slice(0, 512),
        disposition: "split",
        targetSlideId: targetIds[targetIndex],
      });
    }
  }
  for (const section of sourceProfile.sections) {
    const targetIndex = splitSlides.findIndex((candidate) => (
      candidate.sections ?? []
    ).some((candidateSection) => candidateSection.heading === section.heading));
    if (targetIndex >= 0) {
      traceByPart[targetIndex]!.push({
        sourceId: section.id,
        sourceType: "section",
        sourceExcerpt: section.heading.slice(0, 512),
        disposition: "split",
        targetSlideId: targetIds[targetIndex],
      });
    }
  }

  return {
    slides: splitSlides,
    fallbackMetadata: splitSlides.map((slide, partIndex) => ({
      sourceTrace: traceByPart[partIndex],
      fallbackHistory: [
        makeFallbackHistoryEntry({
          step: "split_slide",
          from: options.selection?.componentRecipeId ?? options.selection?.mode ?? "structured_block",
          to: targetIds[partIndex],
          reason: `Overflow fallback split "${originalSlide.title}" into ${splitSlides.length} editable slides for long-form readability.`,
        }),
      ],
    })),
  };
}

async function applyOverflowFallbacks(options: {
  slides: AIPresentationSlide[];
  selections: ResolvedAIComponentRecipeSelection[];
  compactionResults: RecipeCompactionOutcome[];
  actor: PresentationActor;
  taskId: string;
  deckId: number;
  model: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  awaitStep?: DraftAwaitStep;
  onCompactionAttempt?: (context: {
    slideIndex: number;
    slideTitle: string;
    recipeId: AIPresentationComponentRecipeId;
    compactionLevel: "balanced" | "compact" | "aggressive";
    attempt: number;
    maxAttempts: number;
    deadlineAt: string;
  }) => Promise<void>;
}): Promise<OverflowFallbackResolution> {
  const resolvedSlides: AIPresentationSlide[] = [];
  const resolvedSelections: ResolvedAIComponentRecipeSelection[] = [];
  const resolvedCompactions: RecipeCompactionOutcome[] = [];
  const fallbackMetadata: SlideOverflowFallbackMetadata[] = [];

  for (let slideIndex = 0; slideIndex < options.slides.length; slideIndex += 1) {
    let slide = options.slides[slideIndex]!;
    let selection = options.selections[slideIndex];
    let compaction = options.compactionResults[slideIndex] ?? { slide };
    const slideFallbackHistory: PresentationAIDesignFallbackHistory[] = [];

    if (shouldEscalateStructuredSlideToLongForm(slide, selection)) {
      const previousRecipe = selection?.componentRecipeId;
      slide = normalizeSlideHierarchy({
        ...slide,
        componentRecipeId: "sectioned-explainer",
      });
      selection = {
        mode: "long_form_block",
        recommendedMode: "long_form_block",
        componentRecipeId: "sectioned-explainer",
        selectionMode: "heuristic",
        selectionReason: "Overflow fallback escalated dense structured copy into sectioned-explainer.",
        candidateRecipes: selection?.candidateRecipes ?? [],
        candidateModes: selection?.candidateModes ?? [],
      };
      slideFallbackHistory.push(makeFallbackHistoryEntry({
        step: "switch_recipe",
        from: previousRecipe ?? "structured_block",
        to: "sectioned-explainer",
        reason: "Dense text exceeded structured block limits, so the slide was escalated into the long-form explainer recipe.",
      }));
      compaction = await compactSlideForRecipe({
        slide,
        selection,
        actor: options.actor,
        taskId: options.taskId,
        deckId: options.deckId,
        model: options.model,
        preferredProviderId: options.preferredProviderId,
        strictProviderPin: options.strictProviderPin,
        awaitStep: options.awaitStep,
        onAttempt: async ({ recipeId, compactionLevel, attempt, maxAttempts, deadlineAt }) => {
          await options.onCompactionAttempt?.({
            slideIndex,
            slideTitle: slide.title,
            recipeId,
            compactionLevel,
            attempt,
            maxAttempts,
            deadlineAt,
          });
        },
      });
      slide = compaction.slide;
    }

    if (shouldSplitLongFormSlide(slide, selection, compaction)) {
      const split = splitDenseSlideForOverflow({
        slide,
        slideIndex,
        selection,
      });
      for (let partIndex = 0; partIndex < split.slides.length; partIndex += 1) {
        const splitSlide = split.slides[partIndex]!;
        const splitSelection: ResolvedAIComponentRecipeSelection = {
          mode: "long_form_block",
          recommendedMode: "long_form_block",
          componentRecipeId: "sectioned-explainer",
          selectionMode: "heuristic",
          selectionReason: `Overflow fallback split a dense long-form slide into part ${partIndex + 1}.`,
          candidateRecipes: selection?.candidateRecipes ?? [],
          candidateModes: selection?.candidateModes ?? [],
        };
        const splitCompaction = await compactSlideForRecipe({
          slide: splitSlide,
          selection: splitSelection,
          actor: options.actor,
          taskId: options.taskId,
          deckId: options.deckId,
          model: options.model,
          preferredProviderId: options.preferredProviderId,
          strictProviderPin: options.strictProviderPin,
          awaitStep: options.awaitStep,
          onAttempt: async ({ recipeId, compactionLevel, attempt, maxAttempts, deadlineAt }) => {
            await options.onCompactionAttempt?.({
              slideIndex,
              slideTitle: splitSlide.title,
              recipeId,
              compactionLevel,
              attempt,
              maxAttempts,
              deadlineAt,
            });
          },
        });
        resolvedSlides.push(splitCompaction.slide);
        resolvedSelections.push(splitSelection);
        resolvedCompactions.push(splitCompaction);
        fallbackMetadata.push({
          sourceTrace: split.fallbackMetadata[partIndex]?.sourceTrace,
          fallbackHistory: mergeFallbackHistoryEntries(
            slideFallbackHistory,
            compaction.fallbackHistory,
            split.fallbackMetadata[partIndex]?.fallbackHistory,
          ),
        });
      }
      continue;
    }

    if (shouldFallbackUnsafeRecipeToSectionedExplainer(slide, selection, compaction)) {
      const previousRecipe = selection?.componentRecipeId;
      slide = normalizeSlideHierarchy({
        ...slide,
        componentRecipeId: "sectioned-explainer",
      });
      selection = {
        mode: "long_form_block",
        recommendedMode: "long_form_block",
        componentRecipeId: "sectioned-explainer",
        selectionMode: "heuristic",
        selectionReason: `Unsafe ${previousRecipe ?? "component"} output was rerouted into sectioned-explainer for a safer editable long-form layout.`,
        candidateRecipes: selection?.candidateRecipes ?? [],
        candidateModes: selection?.candidateModes ?? [],
      };
      slideFallbackHistory.push(makeFallbackHistoryEntry({
        step: "switch_recipe",
        from: previousRecipe ?? "structured_block",
        to: "sectioned-explainer",
        reason: `The "${previousRecipe ?? "component"}" layout remained unsafe after compaction, so the slide was rerouted into sectioned-explainer.`,
      }));
      compaction = await compactSlideForRecipe({
        slide,
        selection,
        actor: options.actor,
        taskId: options.taskId,
        deckId: options.deckId,
        model: options.model,
        preferredProviderId: options.preferredProviderId,
        strictProviderPin: options.strictProviderPin,
        awaitStep: options.awaitStep,
        onAttempt: async ({ recipeId, compactionLevel, attempt, maxAttempts, deadlineAt }) => {
          await options.onCompactionAttempt?.({
            slideIndex,
            slideTitle: slide.title,
            recipeId,
            compactionLevel,
            attempt,
            maxAttempts,
            deadlineAt,
          });
        },
      });
      slide = compaction.slide;
    }

    resolvedSlides.push(slide);
    resolvedSelections.push(selection);
    resolvedCompactions.push(compaction);
    fallbackMetadata.push({
      fallbackHistory: mergeFallbackHistoryEntries(slideFallbackHistory),
    });
  }

  return {
    slides: resolvedSlides,
    selections: resolvedSelections,
    compactionResults: resolvedCompactions,
    fallbackMetadata,
  };
}

function isPresentationLayoutDslEnabled(): boolean {
  return String(process.env[PRESENTATION_LAYOUT_DSL_ENV_FLAG] ?? "").toLowerCase() === "true";
}

function isPresentationFullSlideMediaEnabled(): boolean {
  return String(process.env[PRESENTATION_FULL_SLIDE_MEDIA_ENV_FLAG] ?? "").toLowerCase() === "true";
}

function estimateThaiTextRisk(slide: AIPresentationSlide): "low" | "medium" | "high" {
  const text = [
    slide.title,
    ...slide.body,
    slide.notes ?? "",
    ...(slide.sections ?? []).flatMap((section) => [section.heading, ...section.details]),
  ]
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0)
    .join(" ");
  const thaiChars = (text.match(/[\u0E00-\u0E7F]/g) ?? []).length;
  if (thaiChars === 0) {
    return "low";
  }
  if (text.length >= 200 || (slide.sections?.length ?? 0) >= 2 || slide.body.length >= 4) {
    return "high";
  }
  if (text.length >= 80) {
    return "medium";
  }
  return "low";
}

function detectFullSlideVisualIntent(
  slide: AIPresentationSlide,
  slideIndex: number,
): NonNullable<PresentationAIDesignMediaModeMetadata["visualIntent"]> {
  const haystack = [
    slide.title,
    ...slide.body,
    slide.notes ?? "",
    slide.graphicCategory ?? "",
  ].join(" ").toLowerCase();
  if (slideIndex === 0) {
    return "cover";
  }
  if (haystack.includes("infographic") || haystack.includes("อินโฟกราฟิก")) {
    return "infographic";
  }
  if (haystack.includes("summary") || haystack.includes("สรุป")) {
    return "summary_visual";
  }
  return "poster";
}

function buildLayoutDslPromptRequest(options: {
  slide: AIPresentationSlide;
  canvasWidth: number;
  canvasHeight: number;
}): string {
  const profile = buildPresentationContentProfile(options.slide);
  return JSON.stringify(presentationLayoutDslRequestSchema.parse({
    mode: "llm_layout_dsl",
    language: "th",
    contentProfile: {
      sectionCount: profile.sectionCount,
      paragraphCount: profile.paragraphCount,
      visualFirstCandidate: profile.visualFirstCandidate,
    },
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
    },
    allowedPrimitives: PRESENTATION_LAYOUT_DSL_ALLOWED_PRIMITIVES,
    styleTokens: {
      themeId: "presentation-ai-default",
      typographyPack: "presentation-ai-default",
    },
    hardLimits: {
      maxElements: PRESENTATION_LAYOUT_DSL_MAX_ELEMENTS,
      maxGroups: PRESENTATION_LAYOUT_DSL_MAX_GROUPS,
      disallowArbitraryHtml: true,
    },
    sourceNarrative: {
      title: options.slide.title,
      body: options.slide.body,
      ...(options.slide.notes ? { notes: options.slide.notes } : {}),
    },
  }), null, 2);
}

function buildFullSlideMediaPrompt(slide: AIPresentationSlide, slideIndex: number): string {
  const intent = detectFullSlideVisualIntent(slide, slideIndex);
  const supportingLines = [
    ...slide.body,
    ...(slide.sections ?? []).flatMap((section) => [section.heading, ...section.details]),
  ]
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0)
    .slice(0, 6)
    .join(". ");
  const promptParts = [
    `Create a polished ${intent.replace(/_/g, " ")} slide visual for a vertical presentation.`,
    `Primary title: ${slide.title}`,
    supportingLines ? `Supporting content: ${supportingLines}` : "",
    "Prefer clean editorial composition, clear focal hierarchy, and presentation-grade spacing.",
    "Avoid embedding long paragraphs as text inside the image.",
  ].filter(Boolean);
  return promptParts.join("\n");
}

function buildFullSlideMediaContent(options: {
  slide: AIPresentationSlide;
  mediaUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  isVideo: boolean;
}): PresentationSlideContent {
  return {
    elements: [
      options.isVideo
        ? {
          id: `full-slide-media-${randomBytes(6).toString("hex")}`,
          type: "video" as const,
          x: 0,
          y: 0,
          width: options.canvasWidth,
          height: options.canvasHeight,
          src: options.mediaUrl,
          title: options.slide.title,
          muted: true,
          loop: true,
          videoFit: "cover" as const,
          videoPositionX: 50,
          videoPositionY: 50,
          videoZoom: 1,
        }
        : {
          id: `full-slide-media-${randomBytes(6).toString("hex")}`,
          type: "image" as const,
          x: 0,
          y: 0,
          width: options.canvasWidth,
          height: options.canvasHeight,
          src: options.mediaUrl,
          alt: options.slide.title,
          mediaShape: "rect" as const,
        },
    ],
    canvas: {
      width: options.canvasWidth,
      height: options.canvasHeight,
    },
    visualOnly: true,
  };
}

async function generateFullSlideMediaAssetForRelayout(options: {
  slide: AIPresentationSlide;
  slideIndex: number;
  actor: PresentationActor;
  userToken: string;
  preferredMediaType?: "image" | "video";
}): Promise<{
  mediaUrl: string;
  modelId?: string;
  prompt: string;
  extraParams?: Record<string, unknown>;
  isVideo: boolean;
} | null> {
  const prompt = buildFullSlideMediaPrompt(options.slide, Math.max(0, options.slideIndex - 1));
  if (options.preferredMediaType === "video") {
    const availableVideoModels = await getModelsByTypeAsync("video").catch(() => []);
    const selectedVideoModel = availableVideoModels[0];
    if (selectedVideoModel) {
      const aspectRatio = selectAspectRatioForModel("16:9", selectedVideoModel.aspectRatios);
      const apiConfig = buildImageApiConfig(selectedVideoModel);
      const extraParams = applyFieldSyncTargets(
        buildImageExtraParams(selectedVideoModel),
        selectedVideoModel,
        { aspectRatio, prompt },
      );
      const duration = selectVideoDuration(selectedVideoModel, extraParams);
      try {
        const mediaTask = await withTimeout(
          mediaGenerationService.generateVideoAsync(
            {
              prompt,
              model: selectedVideoModel.id,
              aspectRatio,
              ...(duration ? { duration } : {}),
              ...(Object.keys(apiConfig ?? {}).length > 0 ? { apiConfig } : {}),
              ...(extraParams ? { extraParams } : {}),
              auditContext: {
                userId: options.actor.userId,
                traceId: `relayout-full-slide:${options.slideIndex}:${randomBytes(6).toString("hex")}`,
                source: "ai_draft.relayoutExistingSlideAsync.full_slide_media",
              },
            },
            options.userToken,
          ),
          MEDIA_SUBMIT_TIMEOUT_MS,
          "full_slide_media_submit_timeout",
        );
        const pollResult = await pollMediaTask(
          mediaTask.id,
          options.userToken,
          computeVideoPollTimeoutMs(1),
          {
            auditContext: {
              userId: options.actor.userId,
              traceId: `relayout-full-slide:${options.slideIndex}:${mediaTask.id}`,
              source: "ai_draft.relayoutExistingSlideAsync.full_slide_media",
            },
          },
        );
        if (pollResult.url) {
          return {
            mediaUrl: pollResult.url,
            modelId: selectedVideoModel.id,
            prompt,
            ...(extraParams ? { extraParams } : {}),
            isVideo: true,
          };
        }
      } catch {
        // Fall through to image generation if video generation is unavailable.
      }
    }
  }

  const availableImageModels = await getModelsByTypeAsync("image").catch(() => []);
  if (availableImageModels.length === 0) {
    return null;
  }
  const textToImageModels = availableImageModels.filter(isTextToImageModel);
  const selectedImageModel = textToImageModels[0] ?? availableImageModels[0];
  const modelId = (selectedImageModel?.id || FALLBACK_IMAGE_MODEL) as ImageModel;
  const aspectRatio = selectAspectRatioForModel("16:9", selectedImageModel?.aspectRatios);
  const apiConfig = buildImageApiConfig(selectedImageModel);
  const extraParams = applyFieldSyncTargets(
    buildImageExtraParams(selectedImageModel),
    selectedImageModel,
    { aspectRatio, prompt },
  );

  const mediaTask = await withTimeout(
    mediaGenerationService.generateImageAsync(
      {
        prompt,
        model: modelId,
        aspectRatio,
        ...(Object.keys(apiConfig ?? {}).length > 0 ? { apiConfig } : {}),
        ...(extraParams ? { extraParams } : {}),
        auditContext: {
          userId: options.actor.userId,
          traceId: `relayout-full-slide:${options.slideIndex}:${randomBytes(6).toString("hex")}`,
          source: "ai_draft.relayoutExistingSlideAsync.full_slide_media",
        },
      },
      options.userToken,
    ),
    MEDIA_SUBMIT_TIMEOUT_MS,
    "full_slide_media_submit_timeout",
  );
  const pollResult = await pollMediaTask(
    mediaTask.id,
    options.userToken,
    computeImagePollTimeoutMs(1),
    {
      auditContext: {
        userId: options.actor.userId,
        traceId: `relayout-full-slide:${options.slideIndex}:${mediaTask.id}`,
        source: "ai_draft.relayoutExistingSlideAsync.full_slide_media",
      },
    },
  );
  if (!pollResult.url) {
    return null;
  }
  return {
    mediaUrl: pollResult.url,
    modelId: selectedImageModel?.id,
    prompt,
    ...(extraParams ? { extraParams } : {}),
    isVideo: false,
  };
}

async function resolveAdvancedLayoutModes(options: {
  slides: AIPresentationSlide[];
  selections: ResolvedAIComponentRecipeSelection[];
  actor: PresentationActor;
  taskId: string;
  deckId: number;
  model: string;
  canvasWidth: number;
  canvasHeight: number;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  awaitStep?: DraftAwaitStep;
  onLayoutDslAttempt?: (context: {
    slideIndex: number;
    slideTitle: string;
    attempt: number;
    maxAttempts: number;
    deadlineAt: string;
  }) => Promise<void>;
}): Promise<{
  slides: AIPresentationSlide[];
  metadata: SlideAdvancedModeMetadata[];
}> {
  const resolvedSlides = [...options.slides];
  const metadata: SlideAdvancedModeMetadata[] = [];

  for (let index = 0; index < options.slides.length; index += 1) {
    const slide = resolvedSlides[index]!;
    const selection = options.selections[index];
    const mode = selection?.recommendedMode ?? selection?.mode;
    const dslCandidate = selection?.candidateModes.find((candidate) => candidate.mode === "llm_layout_dsl");
    const structuredCandidate = selection?.candidateModes.find((candidate) => candidate.mode === "structured_block");
    const fallbackHistory: PresentationAIDesignFallbackHistory[] = [];
    let modeMetadata: SlideAdvancedModeMetadata = {};

    if (
      isPresentationLayoutDslEnabled()
      && !(
        selection?.componentRecipeId === "stat-cards"
        || selection?.componentRecipeId === "timeline-flow"
        || selection?.componentRecipeId === "process-steps"
        || selection?.componentRecipeId === "sectioned-explainer"
      )
      && (
        mode === "llm_layout_dsl"
        || (
          dslCandidate?.fitStatus === "fits"
          && structuredCandidate
          && dslCandidate.score >= (structuredCandidate.score - 1)
        )
      )
    ) {
      let repaired = false;
      let lastReason = "Layout DSL returned no usable slide content.";
      const layoutDslDeadline = Date.now() + resolveAIDraftLayoutDslTotalTimeoutMs();
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const remainingBudgetMs = layoutDslDeadline - Date.now();
        if (remainingBudgetMs <= 0) {
          lastReason = "Layout DSL exceeded the per-slide time budget and fell back to the structured layout.";
          break;
        }
        try {
          await options.onLayoutDslAttempt?.({
            slideIndex: index,
            slideTitle: slide.title,
            attempt: attempt + 1,
            maxAttempts: 2,
            deadlineAt: new Date(layoutDslDeadline).toISOString(),
          });
          const dslPromise = callLLMStructured({
            systemPrompt: [
              "Design a bounded presentation slide as JSON only.",
              "Use only the allowed primitives.",
              "Keep within the provided element budgets.",
              "Do not emit HTML, markdown, or unsupported properties.",
            ].join("\n"),
            userMessage: buildLayoutDslPromptRequest({
              slide,
              canvasWidth: options.canvasWidth,
              canvasHeight: options.canvasHeight,
            }),
            model: options.model,
            preferredProviderId: options.preferredProviderId,
            strictProviderPin: options.strictProviderPin,
            zodSchema: presentationLayoutDslResponseSchema,
            userId: options.actor.userId,
            tenantId: options.actor.tenantId,
            billingDescription: `AI Draft layout DSL (${slide.title.slice(0, 80)}) (Deck #${options.deckId})`,
            billingMetadata: {
              operation: "ai_draft_layout_dsl",
              taskId: options.taskId,
              deckId: options.deckId,
              phase: 2,
              stage: repaired ? "layout_dsl_repair" : "layout_dsl",
              slideIndex: index,
            },
          });
          const dsl = options.awaitStep
            ? await options.awaitStep(dslPromise, {
              cancelLabel: "layout_dsl_cancelled",
              timeoutLabel: "layout_dsl_timeout",
              timeoutMs: Math.min(resolveAIDraftLayoutDslTimeoutMs(), remainingBudgetMs),
            })
            : await dslPromise;
        const normalized = normalizePresentationLayoutDslToSlideContent({
          draft: dsl.data,
          canvasWidth: options.canvasWidth,
          canvasHeight: options.canvasHeight,
        });
        if (dsl.data.status === "ok" && normalized) {
          modeMetadata = {
            mode: "llm_layout_dsl",
            slideContentOverride: normalized,
          };
          break;
        }
        repaired = true;
        lastReason = dsl.data.fallbackSuggestion?.reason ?? lastReason;
        } catch (error) {
          if (error instanceof AIDraftCancelledError) {
            throw error;
          }
          lastReason = `Layout DSL attempt failed: ${sanitizeErrorMessage(error)}`;
          repaired = true;
          if (Date.now() >= layoutDslDeadline) {
            lastReason = "Layout DSL exhausted the per-slide retry budget and fell back to the structured layout.";
            break;
          }
        }
      }
      if (!modeMetadata.slideContentOverride) {
        modeMetadata = {
          ...modeMetadata,
          mode: "structured_block",
        };
        fallbackHistory.push(makeFallbackHistoryEntry({
          step: "switch_mode",
          from: "llm_layout_dsl",
          to: "structured_block",
          reason: lastReason,
        }));
      }
    }

    if (
      !modeMetadata.slideContentOverride
      && isPresentationFullSlideMediaEnabled()
      && mode === "full_slide_media"
    ) {
      const thaiTextRisk = estimateThaiTextRisk(slide);
      if (thaiTextRisk === "high") {
        fallbackHistory.push(makeFallbackHistoryEntry({
          step: "blocked_safety_policy",
          from: "full_slide_media",
          to: "structured_block",
          reason: "Thai text density is too high for automatic text-in-image generation.",
        }));
      } else {
        if (selection?.componentRecipeId) {
          fallbackHistory.push(makeFallbackHistoryEntry({
            step: "switch_mode",
            from: selection.componentRecipeId,
            to: "full_slide_media",
            reason: "Visual-first slide quality is higher as a full-slide generated asset than as a compact component recipe.",
          }));
        }
        resolvedSlides[index] = {
          ...slide,
          imagePromptKeywords: buildFullSlideMediaPrompt(slide, index),
          mediaPlan: [
            {
              slotId: "full-slide-media",
              prompt: buildFullSlideMediaPrompt(slide, index),
            },
          ],
        };
        modeMetadata = {
          mode: "full_slide_media",
          mediaModeMetadata: {
            editableSourceRetained: true,
            thaiTextRisk,
            visualIntent: detectFullSlideVisualIntent(slide, index),
          },
        };
      }
    }

    metadata.push({
      ...modeMetadata,
      ...(fallbackHistory.length > 0 ? { fallbackHistory } : {}),
    });
  }

  return {
    slides: resolvedSlides,
    metadata,
  };
}

export function assignAIComponentRecipes(
  slides: AIPresentationSlide[],
  options: { preferVideoRecipes: boolean; canvasWidth?: number; canvasHeight?: number },
): {
  slides: AIPresentationSlide[];
  selections: ResolvedAIComponentRecipeSelection[];
} {
  const selections: ResolvedAIComponentRecipeSelection[] = [];

  for (const [slideIndex, slide] of slides.entries()) {
    const desiredVisualCounts = estimateDesiredVisualCountForSlide(slide, {
      preferVideoRecipes: options.preferVideoRecipes,
    });
    const baseSelection = resolveAIComponentRecipeForSlide({
      slide,
      slideIndex,
      preferVideoRecipes: options.preferVideoRecipes,
      canvasWidth: options.canvasWidth,
      canvasHeight: options.canvasHeight,
      availableImageCount: desiredVisualCounts.desiredImageCount,
      availableVideoCount: desiredVisualCounts.desiredVideoCount,
    });
    selections.push(applyAIRecipeSelectionDiversity({
      selection: baseSelection,
      priorSelections: selections,
      slideIndex,
      allowMediaRecipeSwitch: (desiredVisualCounts.desiredImageCount + desiredVisualCounts.desiredVideoCount) > 0,
    }));
  }

  return {
    selections,
    slides: slides.map((slide, slideIndex) => {
      const selection = selections[slideIndex];
      if (!selection?.componentRecipeId) {
        const { componentRecipeId: _ignored, ...rest } = slide;
        return rest;
      }
      return {
        ...slide,
        componentRecipeId: selection.componentRecipeId,
      };
    }),
  };
}

function clampBodyLinesForTemplate(body: string[], templateId: LayoutTemplateId): string[] {
  const limits: Record<LayoutTemplateId, { min: number; max: number }> = {
    hero_center: { min: 2, max: 12 },
    split_left_image: { min: 3, max: 12 },
    split_right_image: { min: 3, max: 12 },
    top_image_text_bottom: { min: 3, max: 12 },
    bottom_image_text_top: { min: 3, max: 12 },
    feature_boxes_right: { min: 3, max: 8 },
  };
  const { min, max } = limits[templateId];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const line of body) {
    const normalized = line.trim();
    const key = normalized.toLowerCase();
    if (normalized.length === 0 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= max) {
      break;
    }
  }
  // Do NOT pad with duplicate lines — fewer unique lines is better than repeated text
  if (unique.length === 0) {
    unique.push("Key point");
  }
  return unique;
}

function sanitizeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg
    .replace(/https?:\/\/[^\s]+/g, "[redacted-url]")
    .replace(/\/[\w/.-]+\.(ts|js|json)/g, "[redacted-path]")
    .slice(0, 200);
}

function extractStructuredOutputZodError(err: unknown): z.ZodError | null {
  if (!err || typeof err !== "object" || !("zodErrors" in err)) {
    return null;
  }
  const candidate = (err as { zodErrors?: unknown }).zodErrors;
  return candidate instanceof z.ZodError ? candidate : null;
}

function formatSlidePlanningError(phaseLabel: "Topic planning" | "Article split", err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "topic_to_slide_plan_timeout" || msg === "article_split_timeout") {
    return `${phaseLabel} timed out while waiting for structured slide output. Please retry.`;
  }
  const zodError = extractStructuredOutputZodError(err);
  if (!zodError) {
    return `${phaseLabel} failed: ${sanitizeErrorMessage(err)}`;
  }

  const hasEmptyArrayViolation = zodError.issues.some((issue) => (
    issue.code === "too_small"
    && "type" in issue
    && issue.type === "array"
  ));
  if (hasEmptyArrayViolation) {
    return `${phaseLabel} returned incomplete slide data. Please retry.`;
  }

  return `${phaseLabel} returned an invalid structured response. Please retry.`;
}

function formatArticleGenerationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (msg === "article_generation_timeout") {
    return "Article generation timed out while waiting for the model. Please retry.";
  }
  return `Article generation failed: ${sanitizeErrorMessage(err)}`;
}

export function computeImagePollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = IMAGE_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * IMAGE_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(IMAGE_POLL_TIMEOUT_MAX_MS, scaledTimeout);
}

export function computeVideoPollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = VIDEO_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * VIDEO_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(VIDEO_POLL_TIMEOUT_MAX_MS, scaledTimeout);
}

export function computeAudioPollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = AUDIO_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * AUDIO_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(AUDIO_POLL_TIMEOUT_MAX_MS, scaledTimeout);
}

function buildSlideNarrationText(
  slide: AIPresentationSlide,
  index: number,
  totalSlides: number,
): string {
  const segments = collectVisibleSlideTextSegments(slide);
  const narration = segments
    .map((segment) => finalizeNarrationSegment(segment))
    .filter((segment) => segment.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = `Slide ${index + 1} of ${totalSlides}.`;
  return (narration || fallback).slice(0, 4000);
}

function collectVisibleSlideTextSegments(slide: AIPresentationSlide): string[] {
  const segments: string[] = [];
  const seenSegments = new Set<string>();
  const appendSegment = (value: string) => {
    const normalized = normalizeSlideText(value || "");
    if (!normalized) {
      return;
    }
    const key = normalized.toLocaleLowerCase();
    if (seenSegments.has(key)) {
      return;
    }
    seenSegments.add(key);
    segments.push(normalized);
  };

  appendSegment(slide.title || "");
  for (const line of slide.body ?? []) {
    appendSegment(line || "");
  }
  if (Array.isArray(slide.sections)) {
    for (const section of slide.sections) {
      appendSegment(section?.heading || "");
      for (const detail of section?.details ?? []) {
        appendSegment(detail || "");
      }
    }
  }

  return segments;
}

function finalizeNarrationSegment(segment: string): string {
  const normalized = normalizeSlideText(segment);
  if (!normalized) {
    return "";
  }

  if (/[.!?…:;。！？]$/.test(normalized)) {
    return normalized;
  }

  // Thai narration sounds unnatural when we inject English-style periods
  // between each text fragment. Keep Thai segments spaced without extra punctuation.
  if (/[\u0e00-\u0e7f]/i.test(normalized)) {
    return normalized;
  }

  return `${normalized}.`;
}

function buildSlideNarrationTextFromSlideContent(
  slideContent: PresentationSlideContent,
  index: number,
  totalSlides: number,
): string {
  const renderable = getPresentationSlideRenderableElements(slideContent);
  const seenSegments = new Set<string>();
  const segments: string[] = [];
  const appendSegment = (value: string) => {
    const normalized = normalizeSlideText(value || "");
    if (!normalized || /^\d+\s*\/\s*\d+$/.test(normalized)) {
      return;
    }
    const key = normalized.toLocaleLowerCase();
    if (seenSegments.has(key)) {
      return;
    }
    seenSegments.add(key);
    segments.push(finalizeNarrationSegment(normalized));
  };

  const renderableText = renderable.elements
    .filter((element): element is Extract<PresentationSlideElement, { type: "text" }> => element.type === "text")
    .sort((left, right) => (left.y - right.y) || (left.x - right.x));

  for (const element of renderableText) {
    for (const chunk of String(element.text ?? "").split(/\n+/)) {
      appendSegment(chunk);
    }
  }

  const narration = segments
    .filter((segment) => segment.length > 0)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const fallback = `Slide ${index + 1} of ${totalSlides}.`;
  return (narration || fallback).slice(0, 5_000);
}

type SlideNoteSyncMode = "append_missing" | "visible_only";

function synchronizeSlideNoteWithVisibleContent(
  slide: AIPresentationSlide,
  index: number,
  totalSlides: number,
  mode: SlideNoteSyncMode = "append_missing",
): AIPresentationSlide {
  const existingNote = normalizeSlideText(slide.notes ?? "").slice(0, 5_000);
  const visibleSegments = collectVisibleSlideTextSegments(slide)
    .map((segment) => finalizeNarrationSegment(segment))
    .filter((segment) => segment.length > 0);
  const visibleNarration = buildSlideNarrationText(slide, index, totalSlides).slice(0, 5_000);

  if (visibleSegments.length === 0) {
    return existingNote ? { ...slide, notes: existingNote } : slide;
  }

  if (mode === "visible_only") {
    return {
      ...slide,
      notes: visibleNarration,
    };
  }

  if (!existingNote) {
    return {
      ...slide,
      notes: visibleNarration,
    };
  }

  const noteLower = existingNote.toLocaleLowerCase();
  const missingSegments = visibleSegments.filter((segment) => !noteLower.includes(segment.toLocaleLowerCase()));
  if (missingSegments.length === 0) {
    return {
      ...slide,
      notes: existingNote,
    };
  }

  return {
    ...slide,
    notes: `${existingNote} ${missingSegments.join(" ")}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5_000),
  };
}

function synchronizeSlideNotesWithVisibleContent(
  slides: AIPresentationSlide[],
  mode: SlideNoteSyncMode = "append_missing",
): AIPresentationSlide[] {
  return slides.map((slide, index) => synchronizeSlideNoteWithVisibleContent(slide, index, slides.length, mode));
}

interface SlideNoteCoverageStats {
  score: number;
  coveredPoints: number;
  totalPoints: number;
  missingPoints: string[];
}

function assessSingleSlideNoteCoverage(
  note: string,
  slide: Pick<AIPresentationSlide, "title" | "body" | "sections">,
): SlideNoteCoverageStats {
  const normalizedNote = normalizeSlideText(note);
  const coveragePoints = extractCoveragePointsFromArticle(
    normalizedNote,
    Math.max((slide.body?.length ?? 0) + 4, 8),
  );
  if (coveragePoints.length === 0) {
    return { score: 1, coveredPoints: 0, totalPoints: 0, missingPoints: [] };
  }

  const visibleText = [
    normalizeSlideText(slide.title),
    ...(slide.body ?? []).map((line) => normalizeSlideText(line)),
    ...((slide.sections ?? []).flatMap((section) => [
      normalizeSlideText(section.heading),
      ...section.details.map((detail) => normalizeSlideText(detail)),
    ])),
  ]
    .filter((value) => value.length > 0)
    .join(" ");
  const visibleTokens = new Set(tokenizeCoverage(visibleText));
  const missingPoints: string[] = [];
  let coveredPoints = 0;

  for (const point of coveragePoints) {
    const uniquePointTokens = Array.from(new Set(tokenizeCoverage(point)));
    if (uniquePointTokens.length === 0) {
      continue;
    }
    let overlap = 0;
    for (const token of uniquePointTokens) {
      if (visibleTokens.has(token)) {
        overlap += 1;
      }
    }
    const overlapRatio = overlap / uniquePointTokens.length;
    if (overlap >= 2 || overlapRatio >= 0.34) {
      coveredPoints += 1;
      continue;
    }
    missingPoints.push(point);
  }

  return {
    score: coveragePoints.length > 0 ? coveredPoints / coveragePoints.length : 1,
    coveredPoints,
    totalPoints: coveragePoints.length,
    missingPoints,
  };
}

function mergeUniqueNarrativeLines(
  existing: string[],
  candidates: string[],
  maxLines: number,
): string[] {
  const merged: string[] = [];
  const seen = new Set<string>();
  const tryAppend = (value: string) => {
    const normalized = normalizeNarrativeBodyLine(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      return;
    }
    const overlaps = merged.some((line) => isSubstringOverlap(line, normalized));
    if (overlaps) {
      return;
    }
    seen.add(key);
    merged.push(normalized);
  };

  for (const line of existing) {
    tryAppend(line);
    if (merged.length >= maxLines) {
      return merged.slice(0, maxLines);
    }
  }
  for (const line of candidates) {
    tryAppend(line);
    if (merged.length >= maxLines) {
      break;
    }
  }
  return merged.slice(0, maxLines);
}

function mergeUniqueNarrativeSections(
  existing: Array<{ heading: string; details: string[] }>,
  candidates: Array<{ heading: string; details: string[] }>,
  maxSections: number,
): Array<{ heading: string; details: string[] }> {
  const merged: Array<{ heading: string; details: string[] }> = [];
  const seen = new Set<string>();
  for (const section of [...existing, ...candidates]) {
    const normalized = normalizeNarrativeSection(section);
    if (!normalized) {
      continue;
    }
    const key = `${normalized.heading}||${normalized.details.join("||")}`.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(normalized);
    if (merged.length >= maxSections) {
      break;
    }
  }
  return merged;
}

function reconcileSlideVisibleContentWithNotes(slide: AIPresentationSlide): AIPresentationSlide {
  const note = normalizeSlideText(slide.notes ?? "").slice(0, 5_000);
  if (!note) {
    return slide;
  }

  const visibleText = [
    slide.title,
    ...slide.body,
    ...(slide.sections ?? []).flatMap((section) => [section.heading, ...section.details]),
  ]
    .map((value) => normalizeSlideText(value))
    .filter((value) => value.length > 0)
    .join(" ");

  const coverage = assessSingleSlideNoteCoverage(note, slide);
  if (coverage.totalPoints === 0 || (coverage.score >= 0.62 && coverage.missingPoints.length <= 1)) {
    return slide;
  }

  const noteNarrative = extractNarrativeFromSlideNotes(slide.title, note, slide.templateId, 0);
  if (!noteNarrative) {
    return slide;
  }
  const noteIsSubstantiallyRicher = note.length >= (visibleText.length + 80)
    || coverage.missingPoints.length >= 2
    || noteNarrative.body.length >= (slide.body.length + 2)
    || noteNarrative.sections.length > (slide.sections?.length ?? 0);
  if (!noteIsSubstantiallyRicher) {
    return slide;
  }

  const { min, max } = getTemplateBodyLimits(slide.templateId);
  const preferredBodySeed = coverage.score < 0.45
    ? noteNarrative.body
    : slide.body;
  const fallbackBodySeed = coverage.score < 0.45
    ? slide.body
    : noteNarrative.body;
  const nextBody = mergeUniqueNarrativeLines(
    preferredBodySeed,
    [...fallbackBodySeed, ...coverage.missingPoints],
    max,
  );
  const ensuredBody = nextBody.length >= min
    ? nextBody
    : mergeUniqueNarrativeLines(noteNarrative.body, coverage.missingPoints, max);
  const maxSections = slide.templateId === "hero_center" ? 2 : 6;
  const preferredSections = coverage.score < 0.45
    ? noteNarrative.sections
    : (slide.sections ?? []);
  const fallbackSections = coverage.score < 0.45
    ? (slide.sections ?? [])
    : noteNarrative.sections;
  const nextSections = mergeUniqueNarrativeSections(preferredSections, fallbackSections, maxSections);

  const bodyChanged = JSON.stringify(ensuredBody) !== JSON.stringify(slide.body);
  const sectionsChanged = JSON.stringify(nextSections) !== JSON.stringify(slide.sections ?? []);
  if (!bodyChanged && !sectionsChanged) {
    return slide;
  }

  return {
    ...slide,
    body: ensuredBody.length > 0 ? ensuredBody : slide.body,
    ...(nextSections.length > 0 ? { sections: nextSections } : {}),
    notes: note,
  };
}

function parsePositiveNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim();
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
      return null;
    }
    const parsed = Number.parseFloat(normalized);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseDurationStringToSeconds(value: string): number | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const unitMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*(ms|msec|msecs|milliseconds?|s|sec|secs|seconds?|m|min|mins|minutes?|h|hr|hrs|hours?)$/i);
  if (unitMatch) {
    const amount = Number.parseFloat(unitMatch[1] ?? "");
    if (!Number.isFinite(amount) || amount <= 0) {
      return null;
    }
    const unit = unitMatch[2]?.toLowerCase() ?? "";
    if (unit.startsWith("ms")) {
      return amount / 1000;
    }
    if (unit.startsWith("s")) {
      return amount;
    }
    if (unit.startsWith("m")) {
      return amount * 60;
    }
    if (unit.startsWith("h")) {
      return amount * 3600;
    }
  }

  if (!normalized.includes(":")) {
    return null;
  }

  const parts = normalized.split(":").map((part) => part.trim());
  if (parts.length < 2 || parts.length > 3) {
    return null;
  }

  const parsed = parts.map((part) => Number.parseFloat(part));
  if (parsed.some((part) => !Number.isFinite(part) || part < 0)) {
    return null;
  }

  const [first, second, third] = parsed;
  if (parts.length === 2) {
    return (first! * 60) + second!;
  }

  return (first! * 3600) + (second! * 60) + third!;
}

const MIN_GENERATED_SLIDE_DURATION_MS = 250;
const MAX_GENERATED_SLIDE_DURATION_MS = 120_000;

// Thai ~5 chars/sec, English ~13 chars/sec at normal TTS speed.
// Use a blended conservative rate so the slide is long enough for the audio.
const TTS_CHARS_PER_SECOND = 6;
const TTS_MIN_DURATION_MS = 2000;
const TTS_OVERHEAD_MS = 500; // TTS intro/outro silence

function estimateAudioDurationMs(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const estimatedMs = Math.round((trimmed.length / TTS_CHARS_PER_SECOND) * 1000) + TTS_OVERHEAD_MS;
  return Math.max(TTS_MIN_DURATION_MS, estimatedMs);
}

function clampGeneratedSlideDurationMs(durationMs: number): number | null {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return null;
  }
  return Math.max(
    MIN_GENERATED_SLIDE_DURATION_MS,
    Math.min(MAX_GENERATED_SLIDE_DURATION_MS, Math.round(durationMs)),
  );
}

function extractMediaDurationSeconds(metadata: unknown): number | null {
  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const seen = new Set<unknown>();
  const durationMsKeys = [
    "durationMs",
    "duration_ms",
    "audioDurationMs",
    "audio_duration_ms",
    "videoDurationMs",
    "video_duration_ms",
  ];
  const durationSecondsKeys = [
    "durationSeconds",
    "duration_seconds",
    "durationSec",
    "duration_sec",
    "duration",
    "audioDuration",
    "audio_duration",
    "videoDuration",
    "video_duration",
  ];
  const nestedKeys = [
    "data",
    "response",
    "result",
    "output",
    "submission",
    "metadata",
    "meta",
    "media",
    "assets",
    "files",
    "items",
    "kie_ai_response",
    "raw_response",
  ];

  let bestSeconds: number | null = null;

  const recordSeconds = (value: unknown, divisor = 1) => {
    const parsed = parsePositiveNumber(value);
    const seconds = parsed != null
      ? parsed / divisor
      : (typeof value === "string" ? parseDurationStringToSeconds(value) : null);
    if (seconds == null) {
      return;
    }
    if (!Number.isFinite(seconds) || seconds <= 0) {
      return;
    }
    bestSeconds = bestSeconds == null ? seconds : Math.max(bestSeconds, seconds);
  };

  const walk = (value: unknown, depth: number) => {
    if (depth > 6 || value == null || typeof value !== "object") {
      return;
    }
    if (seen.has(value)) {
      return;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }

    const source = value as Record<string, unknown>;
    for (const key of durationMsKeys) {
      if (key in source) {
        recordSeconds(source[key], 1000);
      }
    }
    for (const key of durationSecondsKeys) {
      if (key in source) {
        recordSeconds(source[key], 1);
      }
    }
    for (const [key, nestedValue] of Object.entries(source)) {
      const normalizedKey = key.trim();
      if (!normalizedKey || /^duration(ms)?$/i.test(normalizedKey)) {
        continue;
      }
      if (/duration/i.test(normalizedKey)) {
        const useMilliseconds = /(^|[_-])ms$/i.test(normalizedKey) || /durationms$/i.test(normalizedKey);
        recordSeconds(nestedValue, useMilliseconds ? 1000 : 1);
      }
    }
    for (const key of nestedKeys) {
      if (key in source) {
        walk(source[key], depth + 1);
      }
    }
  };

  walk(metadata, 0);
  return bestSeconds;
}

function resolveGeneratedMediaDurationMs(
  task: MediaTask | undefined,
  fallbackSeconds?: number,
): number | null {
  const secondsFromResult = extractMediaDurationSeconds(task?.resultData);
  if (secondsFromResult != null) {
    return clampGeneratedSlideDurationMs(secondsFromResult * 1000);
  }
  const secondsFromParameters = extractMediaDurationSeconds(task?.parameters);
  if (secondsFromParameters != null) {
    return clampGeneratedSlideDurationMs(secondsFromParameters * 1000);
  }
  if (fallbackSeconds != null && Number.isFinite(fallbackSeconds) && fallbackSeconds > 0) {
    return clampGeneratedSlideDurationMs(fallbackSeconds * 1000);
  }
  return null;
}

function resolveGeneratedSlideDurationMs(input: {
  audioDurationMs?: number | null;
  videoDurationMs?: number | null;
}): number | null {
  const candidates = [input.audioDurationMs, input.videoDurationMs]
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
  if (!candidates.length) {
    return null;
  }
  return clampGeneratedSlideDurationMs(Math.max(...candidates));
}

function resolveStoredSlideDurationMs(content: PresentationSlideContent): number | null {
  return clampGeneratedSlideDurationMs(Number(content.durationMs));
}

function selectVideoDuration(
  model: ModelDefinition | undefined,
  extraParams: Record<string, unknown> | undefined,
): number | undefined {
  const fromDurationField = parsePositiveNumber(extraParams?.duration);
  if (fromDurationField) {
    return Math.round(fromDurationField);
  }

  const fromFramesField = parsePositiveNumber(extraParams?.n_frames);
  if (fromFramesField) {
    return Math.round(fromFramesField);
  }

  const supported = Array.isArray(model?.durations)
    ? model.durations.filter((value) => Number.isFinite(value) && value > 0)
    : [];
  if (supported.length > 0) {
    return Math.min(...supported);
  }

  return undefined;
}

function toIsoNow(): string {
  return new Date().toISOString();
}

function createPendingMediaJobId(): string {
  return `pmj_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

function findLargestRectElement(elements: SlideElement[]): SlideRectElement | null {
  let best: SlideRectElement | null = null;
  let bestArea = -1;
  for (const element of elements) {
    if (element.type !== "rect") {
      continue;
    }
    const area = Math.max(0, element.width) * Math.max(0, element.height);
    if (area > bestArea) {
      best = element as SlideRectElement;
      bestArea = area;
    }
  }
  return best;
}

function buildPendingMediaJob(
  task: DeferredMediaTaskInfo,
  target: {
    elementId?: string;
    slotId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
): SlidePendingMediaJob {
  return {
    id: createPendingMediaJobId(),
    mediaType: task.mediaType,
    mediaTaskId: task.mediaTaskId,
    ...(task.providerTaskId ? { providerTaskId: task.providerTaskId } : {}),
    ...(target.elementId ? { targetElementId: target.elementId } : {}),
    ...(target.slotId ? { targetSlotId: target.slotId } : {}),
    targetX: target.x,
    targetY: target.y,
    targetWidth: target.width,
    targetHeight: target.height,
    ...(task.modelId ? { modelId: task.modelId } : {}),
    ...(task.prompt ? { prompt: task.prompt.slice(0, 4000) } : {}),
    status: "pending",
    ...(task.reason ? { reason: task.reason.slice(0, 256) } : {}),
    createdAt: toIsoNow(),
    lastCheckedAt: toIsoNow(),
  };
}

function findPendingMediaTarget(
  elements: SlideElement[],
  templateId: LayoutTemplateId | undefined,
  canvasWidth: number,
  canvasHeight: number,
): {
  elementId?: string;
  x: number;
  y: number;
  width: number;
  height: number;
} | null {
  const rects = elements.filter((element): element is SlideRectElement => element.type === "rect");
  if (rects.length === 0) {
    return null;
  }

  const canvasArea = Math.max(1, canvasWidth * canvasHeight);
  const majorAreaThreshold = canvasArea * 0.18;
  const majorRects = rects.filter((rect) => (rect.width * rect.height) >= majorAreaThreshold);
  const searchPool = majorRects.length > 0 ? majorRects : rects;

  const pick = (predicate: (rect: SlideRectElement) => boolean): SlideRectElement | null => {
    for (const rect of searchPool) {
      if (predicate(rect)) {
        return rect;
      }
    }
    return null;
  };

  let target: SlideRectElement | null = null;
  switch (templateId) {
    case "split_right_image":
      target = pick((rect) => (rect.x + (rect.width * 0.5)) >= (canvasWidth * 0.52));
      break;
    case "split_left_image":
    case "feature_boxes_right":
      target = pick((rect) => (rect.x + (rect.width * 0.5)) <= (canvasWidth * 0.48));
      break;
    case "top_image_text_bottom":
      target = pick((rect) => (rect.y + (rect.height * 0.5)) <= (canvasHeight * 0.48));
      break;
    case "bottom_image_text_top":
      target = pick((rect) => (rect.y + (rect.height * 0.5)) >= (canvasHeight * 0.52));
      break;
    case "hero_center":
      target = pick((rect) => (rect.width * rect.height) >= (canvasArea * 0.55));
      break;
    default:
      target = null;
      break;
  }

  if (!target) {
    target = findLargestRectElement(searchPool);
  }
  if (!target) {
    return null;
  }
  return {
    elementId: target.id,
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
  };
}

function buildResolvedMediaElement(
  mediaType: "image" | "video",
  sourceUrl: string,
  target: {
    elementId?: string;
    x: number;
    y: number;
    width: number;
    height: number;
  },
  title?: string,
  metadata?: {
    prompt?: string;
    modelId?: string;
  },
): SlideImageElement | SlideVideoElement {
  const elementId = target.elementId || createPendingMediaJobId();
  if (mediaType === "video") {
    const videoPrompt = metadata?.prompt?.trim();
    const videoModelId = metadata?.modelId?.trim();
    return {
      id: elementId,
      type: "video",
      x: target.x,
      y: target.y,
      width: target.width,
      height: target.height,
      src: sourceUrl,
      poster: "",
      title: title || "Video",
      muted: true,
      loop: true,
      videoFit: "cover",
      videoPositionX: 50,
      videoPositionY: 50,
      videoZoom: 1,
      ...(videoPrompt ? { videoPrompt: videoPrompt.slice(0, 4000) } : {}),
      ...(videoModelId ? { videoModelId: videoModelId.slice(0, 256) } : {}),
    } satisfies SlideVideoElement;
  }

  return {
    id: elementId,
    type: "image",
    x: target.x,
    y: target.y,
    width: target.width,
    height: target.height,
    src: sourceUrl,
    alt: title || "Image",
    imageFit: "cover",
    imagePositionX: 50,
    imagePositionY: 50,
    imageZoom: 1,
  } satisfies SlideImageElement;
}

function applyResolvedMediaToElements(
  elements: SlideElement[],
  job: SlidePendingMediaJob,
  sourceUrl: string,
  slideTitle: string,
): SlideElement[] {
  const target = {
    elementId: job.targetElementId,
    x: job.targetX,
    y: job.targetY,
    width: job.targetWidth,
    height: job.targetHeight,
  };
  const replacement = buildResolvedMediaElement(
    job.mediaType,
    sourceUrl,
    target,
    slideTitle,
    {
      prompt: job.prompt,
      modelId: job.modelId,
    },
  );
  const targetIndex = job.targetElementId
    ? elements.findIndex((element) => element.id === job.targetElementId)
    : -1;
  if (targetIndex >= 0) {
    const next = [...elements];
    next[targetIndex] = replacement as SlideElement;
    return next;
  }
  return [...elements, replacement as SlideElement];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutLabel: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(timeoutLabel));
    }, timeoutMs);

    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}

function resolveAIDraftStepTimeoutMs(
  envKey: string,
  fallbackMs: number,
): number {
  const raw = Number.parseInt(process.env[envKey] ?? process.env.AI_DRAFT_LLM_TIMEOUT_MS ?? "", 10);
  if (Number.isFinite(raw) && raw >= 1000) {
    return raw;
  }
  return fallbackMs;
}

function resolveAIDraftTextTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_TEXT_TIMEOUT_MS",
    AI_DRAFT_TEXT_TIMEOUT_DEFAULT_MS,
  );
}

function resolveAIDraftProgressHeartbeatIntervalMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_PROGRESS_HEARTBEAT_INTERVAL_MS",
    15000,
  );
}

function resolveAIDraftStructuredTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_STRUCTURED_TIMEOUT_MS",
    AI_DRAFT_STRUCTURED_TIMEOUT_DEFAULT_MS,
  );
}

function resolveAIDraftRecipeCompactionTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_RECIPE_COMPACTION_TIMEOUT_MS",
    AI_DRAFT_RECIPE_COMPACTION_TIMEOUT_DEFAULT_MS,
  );
}

function resolveAIDraftRecipeCompactionTotalTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_RECIPE_COMPACTION_TOTAL_TIMEOUT_MS",
    AI_DRAFT_RECIPE_COMPACTION_TOTAL_TIMEOUT_DEFAULT_MS,
  );
}

function resolveAIDraftLayoutDslTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_LAYOUT_DSL_TIMEOUT_MS",
    AI_DRAFT_LAYOUT_DSL_TIMEOUT_DEFAULT_MS,
  );
}

function resolveAIDraftLayoutDslTotalTimeoutMs(): number {
  return resolveAIDraftStepTimeoutMs(
    "AI_DRAFT_LAYOUT_DSL_TOTAL_TIMEOUT_MS",
    AI_DRAFT_LAYOUT_DSL_TOTAL_TIMEOUT_DEFAULT_MS,
  );
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

function resolveSkillModel(skill?: { llmModelId?: string; defaultModel?: string; models?: string[] }): string {
  if (skill?.llmModelId && skill.llmModelId.trim().length > 0) {
    return skill.llmModelId.trim();
  }
  if (skill?.defaultModel && skill.defaultModel.trim().length > 0) {
    return skill.defaultModel.trim();
  }
  const firstModel = skill?.models?.find((m) => typeof m === "string" && m.trim().length > 0);
  if (firstModel) {
    return firstModel.trim();
  }
  return getDefaultTextModelSync();
}

function normalizeGenerateType(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function isTextToImageModel(model: ModelDefinition): boolean {
  const generateType = normalizeGenerateType(model.configJson?.generateType);
  if (!generateType) {
    return true; // treat unknown as compatible for backward compatibility
  }
  return [
    "text-to-image",
    "text2image",
    "txt2img",
    "t2i",
  ].includes(generateType);
}

function buildImageApiConfig(model?: ModelDefinition): Record<string, string> | undefined {
  if (!model) {
    return undefined;
  }

  const apiConfig: Record<string, string> = {};
  const configJson = model.configJson as Record<string, unknown> | undefined;

  if (typeof model.provider === "string" && model.provider.trim().length > 0) {
    apiConfig.provider = model.provider.trim();
  }
  if (configJson) {
    if (typeof configJson.apiEndpoint === "string") {
      apiConfig.endpoint = configJson.apiEndpoint;
    }
    if (typeof configJson.apiQueryEndpoint === "string") {
      apiConfig.query_endpoint = configJson.apiQueryEndpoint;
    }
    if (typeof configJson.apiPayloadFormat === "string") {
      apiConfig.payload_format = configJson.apiPayloadFormat;
    }
    if (typeof configJson.kieModelId === "string") {
      apiConfig.kie_model_id = configJson.kieModelId;
    }
    if (typeof configJson.provider === "string") {
      apiConfig.provider = configJson.provider;
    }
    const customApiConfig = configJson.apiConfig;
    if (customApiConfig && typeof customApiConfig === "object" && !Array.isArray(customApiConfig)) {
      for (const [key, value] of Object.entries(customApiConfig as Record<string, unknown>)) {
        if (typeof value === "string") {
          const normalized = value.trim();
          if (normalized.length > 0) {
            apiConfig[key] = normalized;
          }
        } else if (typeof value === "number" || typeof value === "boolean") {
          apiConfig[key] = String(value);
        }
      }
    }
  }

  return Object.keys(apiConfig).length > 0 ? apiConfig : undefined;
}

type ModelInputSyncTarget = "none" | "reference_images" | "prompt" | "aspect_ratio";
type ModelInputFieldType =
  | "select"
  | "text"
  | "number"
  | "boolean"
  | "image_urls"
  | "video_urls"
  | "audio_urls"
  | "library_file";

interface ParsedModelInputField {
  key: string;
  type: ModelInputFieldType;
  syncWith: ModelInputSyncTarget;
  default?: unknown;
  required?: boolean;
  options?: Array<{ value: unknown; label?: string }>;
}

function normalizeModelInputFieldType(rawType: unknown): ModelInputFieldType {
  const type = typeof rawType === "string" ? rawType.trim() : "text";
  if (
    type === "select"
    || type === "text"
    || type === "number"
    || type === "boolean"
    || type === "image_urls"
    || type === "video_urls"
    || type === "audio_urls"
    || type === "library_file"
  ) {
    return type;
  }
  return "text";
}

function normalizeModelInputSyncTarget(rawSyncWith: unknown): ModelInputSyncTarget | null {
  if (typeof rawSyncWith !== "string") {
    return null;
  }
  const sync = rawSyncWith.trim();
  if (
    sync === "none"
    || sync === "reference_images"
    || sync === "prompt"
    || sync === "aspect_ratio"
  ) {
    return sync;
  }
  return null;
}

function inferModelInputSyncTarget(
  key: string,
  type: ModelInputFieldType,
  explicit: ModelInputSyncTarget | null,
): ModelInputSyncTarget {
  if (explicit) {
    return explicit;
  }
  if (type === "image_urls" || type === "video_urls" || type === "audio_urls") {
    return "reference_images";
  }
  const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalizedKey === "prompt" || normalizedKey.endsWith("prompt")) {
    return "prompt";
  }
  if (normalizedKey.includes("aspect") && normalizedKey.includes("ratio")) {
    return "aspect_ratio";
  }
  if (
    normalizedKey.includes("imageurls")
    || normalizedKey.includes("imageurl")
    || normalizedKey.includes("referenceimages")
    || normalizedKey.includes("referenceimage")
  ) {
    return "reference_images";
  }
  return "none";
}

function parseModelInputFields(model?: ModelDefinition): ParsedModelInputField[] {
  const configJson = model?.configJson as { inputFields?: unknown } | undefined;
  const inputFields = Array.isArray(configJson?.inputFields) ? configJson.inputFields : [];
  if (inputFields.length === 0) {
    return [];
  }
  const parsed: ParsedModelInputField[] = [];
  for (const rawField of inputFields) {
    if (!rawField || typeof rawField !== "object") {
      continue;
    }
    const field = rawField as Record<string, unknown>;
    const rawKey = field.key;
    if (typeof rawKey !== "string" || rawKey.trim().length === 0) {
      continue;
    }
    const key = rawKey.trim();
    const type = normalizeModelInputFieldType(field.type);
    const explicitSyncWith = normalizeModelInputSyncTarget(field.syncWith);
    const options = Array.isArray(field.options)
      ? (field.options as unknown[])
          .filter((entry): entry is { value: unknown; label?: string } => (
            Boolean(entry)
            && typeof entry === "object"
            && "value" in (entry as Record<string, unknown>)
          ))
      : undefined;
    parsed.push({
      key,
      type,
      syncWith: inferModelInputSyncTarget(key, type, explicitSyncWith),
      default: field.default,
      required: Boolean(field.required),
      options,
    });
  }
  return parsed;
}

function buildImageExtraParams(model?: ModelDefinition): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (fields.length === 0) {
    return undefined;
  }
  const extraParams: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      extraParams[field.key] = field.default;
      continue;
    }
    if (field.required && field.type === "select" && field.options && field.options.length > 0) {
      extraParams[field.key] = field.options[0]?.value;
    }
  }
  return Object.keys(extraParams).length > 0 ? extraParams : undefined;
}

function mergeExtraParams(
  base: Record<string, unknown> | undefined,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!base && !override) {
    return undefined;
  }
  if (!base) {
    return override;
  }
  if (!override) {
    return base;
  }
  return { ...base, ...override };
}

function sanitizeRequestedModelExtraParams(
  requested: unknown,
  model?: ModelDefinition,
): Record<string, unknown> | undefined {
  if (!requested || typeof requested !== "object" || Array.isArray(requested)) {
    return undefined;
  }
  const fields = parseModelInputFields(model);
  if (fields.length === 0) {
    return undefined;
  }
  const requestedRecord = requested as Record<string, unknown>;
  const allowedKeys = new Set(fields.map((field) => field.key));
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(requestedRecord)) {
    if (!allowedKeys.has(key)) {
      continue;
    }
    next[key] = value;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function sanitizeCanvasDimension(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value);
  if (rounded < MIN_CANVAS_DIMENSION || rounded > MAX_CANVAS_DIMENSION) {
    return null;
  }
  return rounded;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const temp = x % y;
    x = y;
    y = temp;
  }
  return x || 1;
}

function toAspectRatio(width: number, height: number): string {
  const divisor = gcd(width, height);
  return `${Math.round(width / divisor)}:${Math.round(height / divisor)}`;
}

function parseAspectRatio(value: string): { width: number; height: number; ratio: number } | null {
  const match = value.trim().match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) {
    return null;
  }
  const width = Number.parseInt(match[1], 10);
  const height = Number.parseInt(match[2], 10);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return { width, height, ratio: width / height };
}

function selectAspectRatioForModel(
  targetAspectRatio: string,
  supportedAspectRatios?: string[],
): string {
  if (!Array.isArray(supportedAspectRatios) || supportedAspectRatios.length === 0) {
    return targetAspectRatio;
  }

  const normalizedSupported = supportedAspectRatios
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (normalizedSupported.length === 0) {
    return targetAspectRatio;
  }
  if (normalizedSupported.some((value) => value === targetAspectRatio)) {
    return targetAspectRatio;
  }
  if (normalizedSupported.some((value) => value.toLowerCase() === "auto")) {
    return "auto";
  }

  const target = parseAspectRatio(targetAspectRatio);
  if (!target) {
    return normalizedSupported[0];
  }

  let best = normalizedSupported[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of normalizedSupported) {
    const parsed = parseAspectRatio(candidate);
    if (!parsed) {
      continue;
    }
    // Compare ratio proximity in log space for symmetry (portrait vs landscape).
    const distance = Math.abs(Math.log(parsed.ratio / target.ratio));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

function sanitizePromptContext(value?: string): string | null {
  if (!value) {
    return null;
  }
  const sanitized = value.replace(/[\x00-\x1f\x7f]/g, " ").trim().slice(0, 1000);
  return sanitized.length > 0 ? sanitized : null;
}

function appendPromptContext(prompt: string, context?: string | null): string {
  const cleanedPrompt = prompt.trim();
  if (!context) {
    return cleanedPrompt;
  }
  // Always append the user's context — this is the user's explicit intent.
  // Even if the skill LLM may have rephrased the context into the prompt,
  // the explicit block ensures the media API always sees it verbatim.
  // Only skip if the exact "Additional visual requirements:" block is already present.
  if (cleanedPrompt.includes("Additional visual requirements:")) {
    return cleanedPrompt;
  }
  return `${cleanedPrompt}\n\nAdditional visual requirements:\n${context}`;
}

/**
 * Normalize the raw text returned by an image-prompt skill LLM.
 * Some models wrap the prompt in JSON (`{"prompt":"..."}`) or markdown
 * code fences.  This function strips those wrappers so downstream
 * consumers always receive a plain-text prompt string.
 */
function normalizeSkillPromptOutput(raw: string): string {
  let text = raw.trim();
  // Strip markdown code fences (```json ... ``` or ``` ... ```)
  const fenced = text.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (fenced) {
    text = fenced[1].trim();
  }
  // If the result looks like a JSON object, try to extract a prompt field
  if (text.startsWith("{") && text.endsWith("}")) {
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === "object" && parsed !== null) {
        // Look for common prompt field names
        const promptValue =
          parsed.prompt ?? parsed.imagePrompt ?? parsed.image_prompt ?? parsed.text ?? parsed.description;
        if (typeof promptValue === "string" && promptValue.trim().length > 0) {
          return promptValue.trim();
        }
      }
    } catch {
      // Not valid JSON — use as-is
    }
  }
  return text;
}

function compactUniquePromptLines(lines: Array<string | null | undefined>, limit: number): string[] {
  const next: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const normalized = String(line || "").replace(/\s+/g, " ").trim();
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push(normalized);
    if (next.length >= limit) {
      break;
    }
  }
  return next;
}

function deriveMediaGenerationPlanForSlide(
  slide: AIPresentationSlide,
  basePrompt: string,
  isVideoSkill: boolean,
): MediaGenerationPlanEntry[] {
  const normalizedBasePrompt = basePrompt.trim()
    // Fallback: if prompt is empty, derive from slide title/content to ensure image generation
    || slide.title?.trim()
    || slide.imagePromptKeywords?.trim()
    || (Array.isArray(slide.body) ? slide.body.filter(Boolean).join(", ").slice(0, 200) : "")?.trim()
    || (Array.isArray(slide.sections) ? slide.sections.map((s) => s.heading).filter(Boolean).join(", ").slice(0, 200) : "")?.trim()
    || "professional presentation slide visual";
  if (!normalizedBasePrompt) {
    return [];
  }
  if (Array.isArray(slide.mediaPlan) && slide.mediaPlan.length > 0) {
    const planEntries = slide.mediaPlan
      .map((entry) => ({
        slotId: entry.slotId,
        prompt: (entry.prompt?.trim() || "").length > 0
          ? entry.prompt!.trim()
          : normalizedBasePrompt,
      }))
      .filter((entry) => entry.prompt.length > 0);
    if (planEntries.length > 0) {
      return planEntries;
    }
    // mediaPlan entries were all empty — fall through to use normalizedBasePrompt
  }
  const recipeMediaSlots = slide.componentRecipeId
    ? PRESENTATION_COMPONENT_MEDIA_SLOTS[slide.componentRecipeId] ?? []
    : [];
  if (isVideoSkill || recipeMediaSlots.length <= 1) {
    return [{
      prompt: normalizedBasePrompt,
      slotId: recipeMediaSlots[0],
    }];
  }

  const sectionDetails = (slide.sections ?? []).flatMap((section) => [
    section.heading,
    ...section.details,
  ]);
  const supportingDetails = compactUniquePromptLines([
    slide.body[1],
    slide.body[2],
    sectionDetails[1],
    sectionDetails[2],
    slide.notes,
  ], 2);
  const focusPools = compactUniquePromptLines([
    slide.title,
    slide.body[0],
    slide.body[1],
    slide.body[2],
    ...sectionDetails.slice(0, 6),
    slide.notes,
  ], Math.max(4, recipeMediaSlots.length + 1));
  const primaryFocus = compactUniquePromptLines([
    slide.body[0],
    sectionDetails[0],
    slide.title,
  ], 2).join(". ");
  const supportingFocuses = compactUniquePromptLines([
    ...supportingDetails,
    ...focusPools.slice(1),
  ], Math.max(1, recipeMediaSlots.length - 1));

  if (slide.componentRecipeId === "photo-collage" && recipeMediaSlots.length === 2) {
    return [
      {
        slotId: recipeMediaSlots[0],
        prompt: `${normalizedBasePrompt}\n\nPrimary frame focus: ${primaryFocus || slide.title}`.trim(),
      },
      {
        slotId: recipeMediaSlots[1],
        prompt: `${normalizedBasePrompt}\n\nSecondary frame focus: ${(supportingFocuses[0] || focusPools[1] || slide.title)}. Use a distinct supporting angle, detail crop, or complementary scene rather than repeating the hero shot.`.trim(),
      },
    ];
  }

  return recipeMediaSlots.map((slotId, index) => {
    if (index === 0) {
      return {
        slotId,
        prompt: `${normalizedBasePrompt}\n\nHero frame focus: ${primaryFocus || slide.title}. Make this the dominant establishing image.`.trim(),
      };
    }
    const focus = supportingFocuses[index - 1]
      || focusPools[index]
      || slide.title;
    return {
      slotId,
      prompt: `${normalizedBasePrompt}\n\nSupporting frame ${index}: ${focus}. Use a distinct angle, crop, room, object, or contextual moment instead of repeating the hero image.`.trim(),
    };
  });
}

function normalizeReferenceImageUrls(referenceImageUrls?: string[]): string[] {
  if (!Array.isArray(referenceImageUrls) || referenceImageUrls.length === 0) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();

  for (const raw of referenceImageUrls) {
    if (typeof raw !== "string") {
      continue;
    }
    const url = raw.trim();
    if (
      url.length === 0
      || url.length > 2048
      || (!url.startsWith("/") && !/^https?:\/\//i.test(url))
    ) {
      continue;
    }
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    normalized.push(url);
    if (normalized.length >= 5) {
      break;
    }
  }

  return normalized;
}

function inferWatermarkFileExtension(sourceUrl: string): string | null {
  const trimmed = sourceUrl.trim();
  if (!trimmed) {
    return null;
  }
  const withoutQuery = trimmed.split(/[?#]/, 1)[0] ?? "";
  const ext = withoutQuery.slice(withoutQuery.lastIndexOf(".") + 1).toLowerCase();
  return ext.length > 0 ? ext : null;
}

function normalizeWatermarkInput(
  value: unknown,
  warnings: string[],
): AIWatermark | null {
  if (!value) {
    return null;
  }

  const parsed = AIWatermarkSchema.safeParse(value);
  if (!parsed.success) {
    warnings.push("Invalid watermark input detected; skipping watermark.");
    return null;
  }

  const normalized = parsed.data;
  const extension = inferWatermarkFileExtension(normalized.sourceUrl);
  if (extension !== "png" && extension !== "jpg" && extension !== "jpeg") {
    warnings.push("Watermark must use PNG/JPG source URL; skipping watermark.");
    return null;
  }

  const normalizedFormat = extension === "png" ? "png" : "jpg";
  if (normalized.format !== normalizedFormat) {
    warnings.push(
      `Watermark format "${normalized.format}" mismatched source extension "${extension}". Using "${normalizedFormat}".`,
    );
  }

  return {
    sourceUrl: normalized.sourceUrl,
    format: normalizedFormat,
    clarityPercent: normalized.clarityPercent,
  };
}

interface FieldSyncValues {
  referenceImageUrls?: string[];
  prompt?: string;
  aspectRatio?: string;
}

/**
 * Injects runtime context values into extraParams for fields that declare (or infer) a syncWith target.
 */
function applyFieldSyncTargets(
  baseExtraParams: Record<string, unknown> | undefined,
  model: ModelDefinition | undefined,
  syncValues: FieldSyncValues,
): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (fields.length === 0) {
    return baseExtraParams;
  }

  let next: Record<string, unknown> | undefined = baseExtraParams;

  for (const field of fields) {
    if (
      field.syncWith === "reference_images" &&
      syncValues.referenceImageUrls &&
      syncValues.referenceImageUrls.length > 0
    ) {
      next = next ?? {};
      next = { ...next, [field.key]: syncValues.referenceImageUrls };
      continue;
    }

    if (field.syncWith === "prompt" && syncValues.prompt) {
      next = next ?? {};
      next = { ...next, [field.key]: syncValues.prompt };
      continue;
    }

    if (field.syncWith === "aspect_ratio" && syncValues.aspectRatio) {
      next = next ?? {};
      next = { ...next, [field.key]: syncValues.aspectRatio };
    }
  }

  return next;
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "type" in part && (part as { type?: unknown }).type === "text") {
          const text = (part as { text?: unknown }).text;
          return typeof text === "string" ? text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

/** Max number of distinct models to try before giving up */
const MAX_CROSS_MODEL_ATTEMPTS = 5;

interface ModelAttemptLog {
  attempt: number;
  modelId: string;
  error: string;
  timestamp: string;
}

async function invokeSkillTextLLM(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  userId: number;
  tenantId?: string;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
  billingContext?: SkillLLMBillingContext;
  taskRunId?: number;
  plannerPlan?: import("./taskExecutionPlanner").TaskExecutionPlan;
  plannerSnapshot?: import("./modelResolver").ModelResolutionSnapshot | null;
}): Promise<string> {
  if (params.strictProviderPin && params.preferredProviderId) {
    const candidates = await resolveProviders(params.model).catch(() => []);
    const providerMatched = candidates.some((c) => c.providerId === params.preferredProviderId);
    if (!providerMatched) {
      throw new Error(`No providers available for model: ${params.model} with preferred provider ${params.preferredProviderId}`);
    }
  }

  // Build ordered list of up to MAX_CROSS_MODEL_ATTEMPTS enabled models to try
  const modelsToTry = await buildCrossModelFallbackCandidates(
    params.model,
    params.strictProviderPin,
    MAX_CROSS_MODEL_ATTEMPTS,
  );

  const attemptHistory: ModelAttemptLog[] = [];
  const messages = [
    { role: "system" as const, content: params.systemPrompt },
    { role: "user" as const, content: params.userPrompt },
  ];

  for (let i = 0; i < modelsToTry.length; i++) {
    const candidateModel = modelsToTry[i];
    const result = await executeWithFallback({
      model: candidateModel,
      messages,
      stream: false,
      userId: params.userId,
      preferredProvider: params.strictProviderPin
        ? params.preferredProviderId
        : undefined,
    });

    if (result.type === "error" || result.type === "fallback_required") {
      const errorMsg = result.type === "error"
        ? result.error
        : "LLM provider requires fallback consent";

      // Log this failed attempt for audit trail
      const attemptLog: ModelAttemptLog = {
        attempt: i + 1,
        modelId: candidateModel,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      };
      attemptHistory.push(attemptLog);

      auditLogger.log({
        traceId: params.billingContext?.taskId ?? "unknown",
        timestamp: attemptLog.timestamp,
        eventType: "llm_response",
        userId: params.userId,
        responsePayload: {
          crossModelFallback: true,
          attempt: i + 1,
          totalCandidates: modelsToTry.length,
          modelId: candidateModel,
          error: errorMsg,
          previousAttempts: attemptHistory.slice(0, -1),
        },
      });

      // If strict pin, don't try other models
      if (params.strictProviderPin) break;
      continue;
    }

    // Success — log if this was a fallback (not the first model)
    if (i > 0) {
      auditLogger.log({
        traceId: params.billingContext?.taskId ?? "unknown",
        timestamp: new Date().toISOString(),
        eventType: "llm_response",
        userId: params.userId,
        responsePayload: {
          crossModelFallback: true,
          resolvedOnAttempt: i + 1,
          resolvedModel: candidateModel,
          originalModel: params.model,
          failedAttempts: attemptHistory,
        },
      });
    }

    return processLLMSuccess(result, candidateModel, params);
  }

  // All models exhausted — throw with full attempt history
  const historyStr = attemptHistory
    .map((a) => `attempt ${a.attempt} ${a.modelId}: ${a.error}`)
    .join("; ");
  throw new Error(
    `All providers failed after ${attemptHistory.length} attempt(s): ${historyStr}`,
  );
}

/** Process a successful LLM result: deduct credits, record planner step, extract text */
async function processLLMSuccess(
  result: Extract<Awaited<ReturnType<typeof executeWithFallback>>, { type: "success" }>,
  actualModel: string,
  params: {
    userId: number;
    tenantId?: string;
    billingContext?: SkillLLMBillingContext;
    taskRunId?: number;
    plannerPlan?: import("./taskExecutionPlanner").TaskExecutionPlan;
    plannerSnapshot?: import("./modelResolver").ModelResolutionSnapshot | null;
  },
): Promise<string> {
  const usage = result.response?.usage ?? { prompt_tokens: 0, completion_tokens: 0 };
  const inputTokens = Number(usage.prompt_tokens ?? 0);
  const outputTokens = Number(usage.completion_tokens ?? 0);
  const costUsdValue = Number(usage.cost ?? 0);
  const costUsd = Number.isFinite(costUsdValue) && costUsdValue > 0 ? costUsdValue : undefined;
  const billing = params.billingContext;

  try {
    await deductCreditsForModel({
      userId: params.userId,
      tenantId: params.tenantId,
      model: actualModel,
      provider: result.providerName,
      inputTokens: Number.isFinite(inputTokens) ? inputTokens : 0,
      outputTokens: Number.isFinite(outputTokens) ? outputTokens : 0,
      costUsd,
      description: billing?.description,
      sourceType: "skill",
      metadata: billing
        ? {
            operation: "ai_draft_llm",
            taskId: billing.taskId,
            deckId: billing.deckId,
            phase: billing.phase,
            stage: billing.stage,
            ...(billing.slideIndex !== undefined ? { slideIndex: billing.slideIndex } : {}),
            ...(billing.promptPreview ? { promptPreview: billing.promptPreview.slice(0, 500) } : {}),
          }
        : undefined,
    });
  } catch (err) {
    throw new BillingChargeError(`LLM credit deduction failed: ${sanitizeErrorMessage(err)}`);
  }

  if (params.taskRunId && params.plannerPlan) {
    recordStepAttempt({
      taskRunId: params.taskRunId,
      plan: params.plannerPlan,
      model: actualModel,
      provider: result.providerName,
      inputTokens,
      outputTokens,
      costUsd: costUsd?.toString(),
      snapshot: params.plannerSnapshot,
    }).catch(() => {});
  }

  const content = result.response?.choices?.[0]?.message?.content;
  return extractTextContent(content) || JSON.stringify(content);
}

/**
 * Build an ordered list of up to `maxCandidates` enabled models for cross-model fallback.
 * Uses shared Feature 041 priority system: primary model → remaining by priority ASC.
 * All models are fetched from DB — no hardcoded model IDs.
 */
async function buildCrossModelFallbackCandidates(
  primaryModel: string,
  strictPin?: boolean,
  maxCandidates: number = MAX_CROSS_MODEL_ATTEMPTS,
): Promise<string[]> {
  if (strictPin) {
    return [primaryModel];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  const add = (m: string) => {
    const trimmed = m.trim();
    if (trimmed && !seen.has(trimmed) && result.length < maxCandidates) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  };

  // 1. Primary model is always first
  add(primaryModel);

  // 2. Fill remaining with all enabled models sorted by priority (cheapest first)
  try {
    const rows = await loadEnabledLlmModelRows();
    const sorted = [...rows].sort((a, b) => a.priority - b.priority);
    for (const row of sorted) {
      add(row.modelId);
    }
  } catch {
    // DB unavailable — we still have the primary model
  }

  return result;
}

function buildTextModelResolutionCandidates(preferredModel: string): string[] {
  const trimmed = preferredModel.trim();
  const candidates = new Set<string>();
  if (trimmed.length > 0) {
    candidates.add(trimmed);
  }

  const unprefixed = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1).trim()
    : "";
  if (unprefixed.length > 0) {
    candidates.add(unprefixed);
  }

  return Array.from(candidates);
}

async function resolveRoutableTextModel(
  preferredModel: string,
  preferredProviderId?: number,
  strictProviderPin?: boolean,
): Promise<string> {
  const preferred = preferredModel.trim();
  const preferredCandidates = buildTextModelResolutionCandidates(preferred);

  for (const candidate of preferredCandidates) {
    const candidateProviders = await resolveProviders(candidate).catch(() => []);
    if (preferredProviderId && candidateProviders.some((p) => p.providerId === preferredProviderId)) {
      return candidate;
    }
    if (candidateProviders.length > 0) {
      return candidate;
    }
  }

  const db = await getDb();
  if (db) {
    for (const candidate of preferredCandidates) {
      const byProviderModelId = await db
        .select({ modelId: modelProviderMap.modelId })
        .from(modelProviderMap)
        .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
        .where(
          and(
            eq(modelProviderMap.providerModelId, candidate),
            ...(preferredProviderId ? [eq(modelProviderMap.providerId, preferredProviderId)] : []),
            eq(modelProviderMap.isEnabled, true),
            eq(llmProviders.isEnabled, true),
          ),
        )
        .orderBy(asc(modelProviderMap.priority))
        .limit(1);
      if (byProviderModelId[0]?.modelId) {
        return byProviderModelId[0].modelId;
      }
    }
  }

  if (strictProviderPin && preferredProviderId) {
    throw new Error(`No providers available for model: ${preferred} with preferred provider ${preferredProviderId}`);
  }

  const dynamicDefault = await resolveDefaultTextModel();
  if (preferred !== dynamicDefault) {
    const defaultProviders = await resolveProviders(dynamicDefault).catch(() => []);
    if (defaultProviders.length > 0) {
      return dynamicDefault;
    }
  }

  if (db) {
    const rows = await db
      .select({ modelId: modelProviderMap.modelId })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(
        and(
          eq(modelProviderMap.isEnabled, true),
          eq(llmProviders.isEnabled, true),
        ),
      )
      .orderBy(asc(modelProviderMap.priority))
      .limit(1);
    if (rows[0]?.modelId) {
      return rows[0].modelId;
    }
  }

  const fallbackRows = await loadEnabledLlmModelRows().catch(() => []);
  const seenFallbacks = new Set<string>([
    ...preferredCandidates,
    dynamicDefault,
  ].map((value) => value.trim()).filter(Boolean));
  const sortedFallbackRows = [...fallbackRows].sort((a, b) => a.priority - b.priority);
  for (const row of sortedFallbackRows) {
    const candidate = row.modelId.trim();
    if (!candidate || seenFallbacks.has(candidate)) {
      continue;
    }
    const candidateProviders = await resolveProviders(candidate).catch(() => []);
    if (candidateProviders.length > 0) {
      return candidate;
    }
    seenFallbacks.add(candidate);
  }

  throw new Error(`No providers available for model: ${preferred}`);
}

export function relayoutExistingSlide(input: RelayoutSlideInput): RelayoutSlideOutput {
  const parsedContent = presentationSlideContentSchema.parse(input.slideContent);
  const warnings: string[] = [];
  const canvas = resolveSlideCanvasDimensions(parsedContent);
  const preserveVisualOnly = isVisualOnlySlideContent(parsedContent);
  const renderableSource = getRelayoutRenderableSourceContent(parsedContent);
  const analysisContent = renderableSource.slideContent;
  warnings.push(...renderableSource.warnings);
  const existingAIDesign = parsedContent.aiDesign?.source === "draft-with-ai"
    ? parsedContent.aiDesign
    : null;
  let preferredComponentRecipeId = input.preferredComponentRecipeId ?? resolveRelayoutComponentRecipeId(parsedContent);
  const narrative = extractRelayoutNarrative(input.slideTitle, parsedContent, analysisContent, input.slideNotes);
  const preferredMode = existingAIDesign?.userOverrideMode ?? null;
  if (preferredMode === "long_form_block") {
    preferredComponentRecipeId = "sectioned-explainer";
  } else if (preferredMode === "structured_block" && preferredComponentRecipeId === "sectioned-explainer") {
    preferredComponentRecipeId = undefined;
  } else if (preferredMode === "llm_layout_dsl" || preferredMode === "full_slide_media") {
    warnings.push(
      existingAIDesign?.modeLocked
        ? `Locked AI mode "${preferredMode}" is preserved in metadata, but auto relayout currently rebuilds this slide through the structured layout path.`
        : `Preferred AI mode "${preferredMode}" is preserved in metadata, but auto relayout currently rebuilds this slide through the structured layout path.`,
    );
  }
  const sourceImageElement = pickLargestImageElement(analysisContent);
  const sourceVideoElement = pickLargestVideoElement(analysisContent);
  const relayoutMediaSources = collectRelayoutMediaSources(analysisContent);
  const inheritedWatermark = extractWatermarkFromSlideContent(parsedContent);
  const watermark = normalizeWatermarkInput(input.watermark ?? inheritedWatermark, warnings);
  const inferredStylePresetId = inferStylePresetIdFromSlide(parsedContent);
  const stylePresetId = input.stylePresetId ?? inferredStylePresetId;
  const baseStylePreset = getBuiltInPreset(stylePresetId) ?? getBuiltInPreset("dark-professional")!;
  const stylePreset = applyRelayoutChromePolicy(baseStylePreset);
  const combinedText = `${narrative.title}\n${narrative.body.join("\n")}\n${narrative.notes ?? ""}`;
  const graphicCategory = inferGraphicCategoryFromText(combinedText);
  const templateId = resolveRelayoutTemplateId({
    requestedTemplateId: input.templateId,
    bodyCount: narrative.body.length,
    hasImage: Boolean(sourceImageElement?.src ?? sourceVideoElement?.src),
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    seed: input.layoutSeed ?? Date.now(),
  });
  if (preferredComponentRecipeId) {
    const preferredComponentMediaTypes = getRelayoutPreferredMediaTypes(preferredComponentRecipeId);
    if (preferredComponentMediaTypes.size === 1 && preferredComponentMediaTypes.has("image") && relayoutMediaSources.imageUrls.length === 0) {
      warnings.push(`Skipped image-only component recipe "${preferredComponentRecipeId}" because the slide has no reusable image.`);
      preferredComponentRecipeId = undefined;
    }
    if (preferredComponentMediaTypes.size === 1 && preferredComponentMediaTypes.has("video") && relayoutMediaSources.videoUrls.length === 0) {
      warnings.push(`Skipped video-only component recipe "${preferredComponentRecipeId}" because the slide has no reusable video.`);
      preferredComponentRecipeId = undefined;
    }
  }
  const recipeSelectionSeed = buildRelayoutRecipeSelectionSlide({
    narrative,
    templateId,
    graphicCategory,
    hasImage: relayoutMediaSources.imageUrls.length > 0,
    hasVideo: relayoutMediaSources.videoUrls.length > 0,
  });
  const relayoutTelemetrySelection = resolveAIComponentRecipeForSlide({
    slide: recipeSelectionSeed,
    slideIndex: Math.max(0, input.slideIndex - 1),
    preferVideoRecipes: relayoutMediaSources.videoUrls.length > 0 && relayoutMediaSources.imageUrls.length === 0,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    availableImageCount: relayoutMediaSources.imageUrls.length,
    availableVideoCount: relayoutMediaSources.videoUrls.length,
  });
  const recipeSelection = resolveRelayoutComponentRecipeSelection({
    preferredComponentRecipeId,
    slide: recipeSelectionSeed,
    templateId,
    hasImage: relayoutMediaSources.imageUrls.length > 0,
    hasVideo: relayoutMediaSources.videoUrls.length > 0,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    availableImageCount: relayoutMediaSources.imageUrls.length,
    availableVideoCount: relayoutMediaSources.videoUrls.length,
  });
  preferredComponentRecipeId = recipeSelection.componentRecipeId;
  warnings.push(...recipeSelection.warnings);

  const effectiveComponentMediaTypes = getRelayoutPreferredMediaTypes(preferredComponentRecipeId);
  const shouldUseImageAsPrimary = effectiveComponentMediaTypes.size === 0 || effectiveComponentMediaTypes.has("image");
  const shouldUseVideoAsPrimary = effectiveComponentMediaTypes.has("video")
    || (effectiveComponentMediaTypes.size === 0 && !sourceImageElement && Boolean(sourceVideoElement));
  const imageElement = shouldUseImageAsPrimary ? sourceImageElement : null;
  const videoElement = shouldUseVideoAsPrimary ? sourceVideoElement : null;
  const primaryMediaSrc = imageElement?.src ?? videoElement?.src ?? null;
  const relayoutMediaUrls = effectiveComponentMediaTypes.size === 1 && effectiveComponentMediaTypes.has("video")
    ? relayoutMediaSources.videoUrls
    : relayoutMediaSources.imageUrls.length > 0
      ? relayoutMediaSources.imageUrls
      : relayoutMediaSources.videoUrls;
  const componentFallbackElementIds = collectComponentFallbackExcludedElementIds(parsedContent);

  const recipeSlideSeed = recipeSelection.slide;
  const slideData = normalizeSlideHierarchyCore({
    ...recipeSlideSeed,
    templateId,
    ...(preferredComponentRecipeId ? { componentRecipeId: preferredComponentRecipeId } : {}),
    graphicCategory,
    imagePromptKeywords: combinedText.slice(0, 500) || narrative.title.slice(0, 500),
  });
  const svgGraphic = input.includeSvg === false
    ? null
    : pickRandomSvgFromCategory(graphicCategory);

  const result = generateSlide({
    slideData,
    // If no static image, pass video src so the template allocates a proper media zone.
    imageUrl: primaryMediaSrc,
    imageUrls: relayoutMediaUrls,
    svgGraphic,
    stylePreset,
    deckTitle: input.deckTitle,
    slideIndex: input.slideIndex,
    totalSlides: input.totalSlides,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    visualOnly: preserveVisualOnly,
    supplementalMediaOpacity: Math.max(0.05, Math.min(1, (input.supplementalMediaClarityPercent ?? 16) / 100)),
  });

  const imagePrompt = imageElement?.imagePrompt;
  const imageModelId = imageElement?.imageModelId;
  const imageReferenceUrls = imageElement?.imageReferenceUrls;
  let elements = result.slideContent.elements.map((element) => {
    if (element.type !== "image") {
      return element;
    }
    // Restore image metadata (prompt, model, reference URLs) on the generated image element.
    if (imageElement?.src && element.src === imageElement.src) {
      return {
        ...element,
        ...(imagePrompt ? { imagePrompt } : {}),
        ...(imageModelId ? { imageModelId } : {}),
        ...(Array.isArray(imageReferenceUrls) && imageReferenceUrls.length > 0
          ? { imageReferenceUrls }
          : {}),
      };
    }
    // When the template placed the primary video src into an image element, replace it with
    // a proper video element at the same template-determined position and size.
    if (videoElement && element.src === videoElement.src) {
      const vid = videoElement as any;
      const videoPrompt = typeof vid.videoPrompt === "string"
        ? vid.videoPrompt
        : (typeof vid.imagePrompt === "string" ? vid.imagePrompt : undefined);
      const videoModelId = typeof vid.videoModelId === "string"
        ? vid.videoModelId
        : (typeof vid.imageModelId === "string" ? vid.imageModelId : undefined);
      const videoReferenceUrls = normalizeReferenceImageUrls(
        Array.isArray(vid.videoReferenceUrls)
          ? (vid.videoReferenceUrls as string[])
          : undefined,
      );
      return {
        id: element.id,
        type: "video" as const,
        x: element.x,
        y: element.y,
        width: element.width,
        height: element.height,
        src: vid.src as string,
        poster: vid.poster ?? "",
        title: vid.title ?? "Video",
        muted: vid.muted ?? true,
        loop: vid.loop ?? true,
        ...(videoPrompt ? { videoPrompt: videoPrompt.slice(0, 4000) } : {}),
        ...(videoModelId ? { videoModelId: videoModelId.slice(0, 256) } : {}),
        ...(videoReferenceUrls.length > 0 ? { videoReferenceUrls } : {}),
        ...(vid.videoFit !== undefined ? { videoFit: vid.videoFit } : {}),
        ...(vid.videoPositionX !== undefined ? { videoPositionX: vid.videoPositionX } : {}),
        ...(vid.videoPositionY !== undefined ? { videoPositionY: vid.videoPositionY } : {}),
        ...(vid.videoZoom !== undefined ? { videoZoom: vid.videoZoom } : {}),
        ...(vid.videoExtraParams !== undefined ? { videoExtraParams: vid.videoExtraParams } : {}),
        ...(vid.autoplay !== undefined ? { autoplay: vid.autoplay } : {}),
        ...(vid.objectFit !== undefined ? { objectFit: vid.objectFit } : {}),
      } as SlideElement;
    }
    return element;
  });
  let appliedCropShape: Exclude<GeometricCropShapeId, "auto"> | null = null;
  if (input.includeGeometricCrop && !preserveVisualOnly) {
    const cropResult = applyGeometricImageCrop(elements, {
      requestedShape: input.geometricCropShape,
      seed: input.layoutSeed ?? Date.now(),
    });
    elements = cropResult.elements;
    appliedCropShape = cropResult.appliedShape;
  }
  let appliedAccentShape: Exclude<GeometricAccentShapeId, "auto"> | null = null;
  if (input.includeGeometricAccents && !preserveVisualOnly) {
    const accentResult = buildGeometricAccentElements({
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      seed: (input.layoutSeed ?? Date.now()) + 101,
      requestedShape: input.geometricAccentShape,
      stylePreset,
    });
    const filteredAccents = filterDecorativeGraphicElements(accentResult.elements, elements, canvas);
    const firstTextIndex = elements.findIndex((element) => element.type === "text");
    const nonBackgroundImageIndexes = elements
      .map((element, index) => ({ element, index }))
      .filter(({ element }) => (
        element.type === "image"
        && (
          element.x > 0
          || element.y > 0
          || element.width < canvas.width
          || element.height < canvas.height
        )
      ))
      .map(({ index }) => index);
    const lastNonBackgroundImageIndex = nonBackgroundImageIndexes.length > 0
      ? nonBackgroundImageIndexes[nonBackgroundImageIndexes.length - 1]!
      : -1;
    const insertionIndex = firstTextIndex >= 0
      ? firstTextIndex
      : (lastNonBackgroundImageIndex >= 0 ? lastNonBackgroundImageIndex + 1 : elements.length);
    if (filteredAccents.length > 0) {
      elements = [
        ...elements.slice(0, insertionIndex),
        ...filteredAccents,
        ...elements.slice(insertionIndex),
      ];
      appliedAccentShape = accentResult.appliedShape;
    }
  }

  const consumedRelayoutMediaUrls = collectRenderedMediaSourceUrls(elements);
  const preservedElements = buildRelayoutPreservedElements(
    analysisContent,
    canvas,
    consumedRelayoutMediaUrls,
    componentFallbackElementIds,
  );
  const preservedComponents = buildRelayoutPreservedComponents(
    parsedContent,
    elements,
    canvas,
    preferredComponentRecipeId,
  );
  const mergedElements = mergeRelayoutElementsWithPreserved(elements, preservedElements, canvas);
  const mergedComponents = [
    ...(result.slideContent.components ?? []),
    ...preservedComponents,
  ];
  const mergedRenderOrder = mergeRelayoutRenderOrder(
    result.slideContent,
    mergedElements,
    mergedComponents.length > 0 ? mergedComponents : undefined,
  );

  let relayoutContent: PresentationSlideContent = {
    ...result.slideContent,
    elements: mergedElements,
    ...(mergedComponents.length > 0 ? { components: mergedComponents } : {}),
    ...(mergedRenderOrder ? { renderOrder: mergedRenderOrder } : {}),
    transition: parsedContent.transition,
    durationMs: parsedContent.durationMs,
    canvas: {
      ...(canvas.preset ? { preset: canvas.preset } : {}),
      width: canvas.width,
      height: canvas.height,
    },
    ...(preserveVisualOnly ? { visualOnly: true } : {}),
  };
  if (existingAIDesign) {
    const relayoutMode = preferredComponentRecipeId
      ? resolveLayoutModeForRecipe(preferredComponentRecipeId)
      : (preferredMode ?? relayoutTelemetrySelection.mode);
    relayoutContent = {
      ...relayoutContent,
      aiDesign: {
        source: "draft-with-ai",
        ...(existingAIDesign.taskId ? { taskId: existingAIDesign.taskId } : {}),
        schemaVersion: "presentation_ai_layout_v1",
        mode: relayoutMode,
        ...(relayoutTelemetrySelection.candidateModes.length
          ? { candidateModes: relayoutTelemetrySelection.candidateModes }
          : {}),
        ...(existingAIDesign.modeLocked !== undefined ? { modeLocked: existingAIDesign.modeLocked } : {}),
        ...(existingAIDesign.userOverrideMode !== undefined
          ? { userOverrideMode: existingAIDesign.userOverrideMode }
          : {}),
        ...(existingAIDesign.fitScore ? { fitScore: existingAIDesign.fitScore } : {}),
        ...(existingAIDesign.compactionLevel ? { compactionLevel: existingAIDesign.compactionLevel } : {}),
        ...(preferredComponentRecipeId ? { componentRecipeId: preferredComponentRecipeId } : {}),
        selectionMode: input.preferredComponentRecipeId ? "manual-override" : relayoutTelemetrySelection.selectionMode,
        selectionReason: input.preferredComponentRecipeId
          ? `Auto relayout preserved the manually selected block recipe ${preferredComponentRecipeId}.`
          : relayoutTelemetrySelection.selectionReason,
        ...(relayoutTelemetrySelection.candidateRecipes.length
          ? { candidateRecipes: relayoutTelemetrySelection.candidateRecipes }
          : {}),
        narrative: {
          title: slideData.title,
          body: [...slideData.body],
          ...(slideData.notes ? { notes: slideData.notes } : {}),
          ...(slideData.sections?.length
            ? {
              sections: slideData.sections.map((section) => ({
                heading: section.heading,
                details: [...section.details],
              })),
            }
            : {}),
          ...(slideData.graphicCategory ? { graphicCategory: slideData.graphicCategory } : {}),
          templateId: slideData.templateId,
        },
        ...(existingAIDesign.overrideHistory?.length
          ? { overrideHistory: existingAIDesign.overrideHistory.map((entry) => ({ ...entry })) }
          : {}),
        ...(existingAIDesign.sourceTrace?.length
          ? { sourceTrace: existingAIDesign.sourceTrace.map((entry) => ({ ...entry })) }
          : {}),
        ...(existingAIDesign.fallbackHistory?.length
          ? { fallbackHistory: existingAIDesign.fallbackHistory.map((entry) => ({ ...entry })) }
          : {}),
        ...(existingAIDesign.mediaModeMetadata ? { mediaModeMetadata: existingAIDesign.mediaModeMetadata } : {}),
        generatedAt: new Date().toISOString(),
      },
    };
  }
  if (watermark) {
    const watermarkApplied = applyWatermarkToSlideContent(relayoutContent, watermark);
    relayoutContent = watermarkApplied.slideContent;
    warnings.push(...watermarkApplied.warnings);
    if (watermarkApplied.applied) {
      warnings.push(`Applied watermark (${watermark.format.toUpperCase()}, ${watermark.clarityPercent}%).`);
    }
  }

  warnings.push(...result.warnings);
  if (preservedElements.length > 0) {
    warnings.push(`Preserved ${preservedElements.length} existing user element(s) from the original slide.`);
  }
  if (preservedComponents.length > 0) {
    warnings.push(`Preserved ${preservedComponents.length} existing block(s) as reusable components during auto layout.`);
  }
  if (!primaryMediaSrc) {
    warnings.push("No reusable image or video found on this slide; used visual placeholder layout.");
  } else if (!imageElement?.src && videoElement?.src) {
    warnings.push("Reused existing video as the primary media during auto layout.");
  }
  if (preserveVisualOnly) {
    warnings.push("Preserved visual-only slide mode during auto layout.");
  }
  if (input.includeGeometricCrop && appliedCropShape) {
    warnings.push(`Applied geometric image crop shape "${appliedCropShape}".`);
  } else if (input.includeGeometricCrop && preserveVisualOnly) {
    warnings.push("Skipped geometric crop to preserve full-canvas visual-only slide.");
  } else if (input.includeGeometricCrop && !appliedCropShape) {
    warnings.push("Geometric crop requested but no eligible image was found on this slide.");
  }
  if (input.includeGeometricAccents && appliedAccentShape) {
    warnings.push(`Added geometric accents using "${appliedAccentShape}" shape.`);
  } else if (input.includeGeometricAccents && preserveVisualOnly) {
    warnings.push("Skipped geometric accents to preserve full-canvas visual-only slide.");
  }
  if (preferredComponentRecipeId) {
    warnings.push(`Applied block layout "${describeAIComponentRecipe(preferredComponentRecipeId)}" with preset "${stylePresetId}".`);
  } else {
    warnings.push(`Applied internal fallback layout with preset "${stylePresetId}".`);
  }
  relayoutContent = finalizeSlideContentAfterRelayout(relayoutContent, warnings);

  return {
    slideContent: relayoutContent,
    warnings,
    applied: {
      templateId,
      stylePresetId,
      graphicCategory,
      reusedImage: Boolean(primaryMediaSrc),
    },
  };
}

function appendRelayoutFallbackHistory(
  slideContent: PresentationSlideContent,
  entry: Omit<PresentationAIDesignFallbackHistory, "timestamp">,
): PresentationSlideContent {
  if (!slideContent.aiDesign || slideContent.aiDesign.source !== "draft-with-ai") {
    return slideContent;
  }
  return {
    ...slideContent,
    aiDesign: {
      ...slideContent.aiDesign,
      fallbackHistory: mergeFallbackHistoryEntries(
        slideContent.aiDesign.fallbackHistory,
        [makeFallbackHistoryEntry(entry)],
      ),
    },
  };
}

function buildAdvancedRelayoutNarrative(
  input: RelayoutSlideInput,
  parsedContent: PresentationSlideContent,
): AIPresentationSlide {
  const existingAIDesign = parsedContent.aiDesign?.source === "draft-with-ai"
    ? parsedContent.aiDesign
    : null;
  const existingNarrative = existingAIDesign?.narrative;
  if (existingNarrative) {
    return normalizeSlideHierarchy({
      templateId: existingNarrative.templateId ?? input.templateId ?? "split_right_image",
      title: existingNarrative.title,
      body: existingNarrative.body,
      ...(existingNarrative.notes ? { notes: existingNarrative.notes } : {}),
      ...(existingNarrative.sections?.length ? { sections: existingNarrative.sections } : {}),
      ...(existingNarrative.graphicCategory ? { graphicCategory: existingNarrative.graphicCategory } : {}),
      imagePromptKeywords: `${existingNarrative.title}\n${existingNarrative.body.join("\n")}`.slice(0, 500),
    });
  }

  const renderable = getRelayoutRenderableSourceContent(parsedContent).slideContent;
  const narrative = extractRelayoutNarrative(input.slideTitle, parsedContent, renderable, input.slideNotes);
  const combinedText = `${narrative.title}\n${narrative.body.join("\n")}\n${narrative.notes ?? ""}`;
  return normalizeSlideHierarchy({
    templateId: input.templateId ?? "split_right_image",
    title: narrative.title,
    body: narrative.body,
    ...(narrative.notes ? { notes: narrative.notes } : {}),
    ...(narrative.sections.length > 0 ? { sections: narrative.sections } : {}),
    graphicCategory: inferGraphicCategoryFromText(combinedText),
    imagePromptKeywords: combinedText.slice(0, 500),
  });
}

export async function relayoutExistingSlideAsync(
  input: RelayoutSlideInput,
  actor: PresentationActor,
): Promise<RelayoutSlideOutput> {
  const syncResult = relayoutExistingSlide(input);
  const parsedContent = presentationSlideContentSchema.parse(input.slideContent);
  const existingAIDesign = parsedContent.aiDesign?.source === "draft-with-ai"
    ? parsedContent.aiDesign
    : null;
  const preferredMode = existingAIDesign?.userOverrideMode ?? null;
  const shouldHonorAdvancedMode = existingAIDesign
    && (existingAIDesign.modeLocked || preferredMode === "llm_layout_dsl" || preferredMode === "full_slide_media");
  if (!shouldHonorAdvancedMode || (!preferredMode && existingAIDesign?.mode !== "llm_layout_dsl" && existingAIDesign?.mode !== "full_slide_media")) {
    return syncResult;
  }

  const targetMode = preferredMode ?? existingAIDesign?.mode;
  if (targetMode === "llm_layout_dsl") {
    if (!isPresentationLayoutDslEnabled()) {
      return {
        ...syncResult,
        slideContent: appendRelayoutFallbackHistory(syncResult.slideContent, {
          step: "blocked_provider_policy",
          from: "llm_layout_dsl",
          to: syncResult.slideContent.aiDesign?.mode ?? "structured_block",
          reason: "Layout DSL relayout is disabled for this environment.",
        }),
        warnings: [...syncResult.warnings, "Layout DSL mode is locked in metadata, but the DSL relayout feature flag is disabled."],
      };
    }
    const canvas = resolveSlideCanvasDimensions(parsedContent);
    const narrativeSlide = buildAdvancedRelayoutNarrative(input, parsedContent);
    const dsl = await callLLMStructured({
      systemPrompt: [
        "Design a bounded presentation slide as JSON only.",
        "Use only the allowed primitives.",
        "Keep within the provided element budgets.",
        "Do not emit HTML, markdown, or unsupported properties.",
      ].join("\n"),
      userMessage: buildLayoutDslPromptRequest({
        slide: narrativeSlide,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
      }),
      model: getDefaultTextModelSync(),
      zodSchema: presentationLayoutDslResponseSchema,
      userId: actor.userId,
      tenantId: actor.tenantId,
      billingDescription: `AI relayout layout DSL (${input.slideTitle.slice(0, 80)})`,
      billingMetadata: {
        operation: "ai_relayout_layout_dsl",
        deckTitle: input.deckTitle,
        slideIndex: input.slideIndex,
      },
    });
    const normalized = normalizePresentationLayoutDslToSlideContent({
      draft: dsl.data,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    if (dsl.data.status !== "ok" || !normalized) {
      return {
        ...syncResult,
        slideContent: appendRelayoutFallbackHistory(syncResult.slideContent, {
          step: "switch_mode",
          from: "llm_layout_dsl",
          to: syncResult.slideContent.aiDesign?.mode ?? "structured_block",
          reason: dsl.data.fallbackSuggestion?.reason ?? "Layout DSL relayout returned no usable content.",
        }),
        warnings: [
          ...syncResult.warnings,
          dsl.data.fallbackSuggestion?.reason ?? "Layout DSL relayout returned no usable content and fell back to structured layout.",
        ],
      };
    }
    return {
      ...syncResult,
      slideContent: finalizeSlideContentAfterRelayout({
        ...normalized,
        transition: parsedContent.transition,
        durationMs: parsedContent.durationMs,
        background: parsedContent.background,
        aiDesign: syncResult.slideContent.aiDesign
          ? {
            ...syncResult.slideContent.aiDesign,
            mode: "llm_layout_dsl",
            generatedAt: new Date().toISOString(),
          }
          : undefined,
      }, []),
      warnings: syncResult.warnings.filter((warning) => !warning.includes("auto relayout currently rebuilds this slide through the structured layout path.")),
      applied: syncResult.applied,
    };
  }

  if (targetMode === "full_slide_media") {
    if (!isPresentationFullSlideMediaEnabled()) {
      return {
        ...syncResult,
        slideContent: appendRelayoutFallbackHistory(syncResult.slideContent, {
          step: "blocked_provider_policy",
          from: "full_slide_media",
          to: syncResult.slideContent.aiDesign?.mode ?? "structured_block",
          reason: "Full-slide media relayout is disabled for this environment.",
        }),
        warnings: [...syncResult.warnings, "Full-slide media mode is locked in metadata, but the full-slide relayout feature flag is disabled."],
      };
    }
    const canvas = resolveSlideCanvasDimensions(parsedContent);
    const imageElement = pickLargestImageElement(parsedContent);
    const videoElement = pickLargestVideoElement(parsedContent);
    const narrativeSlide = buildAdvancedRelayoutNarrative(input, parsedContent);
    const preferGeneratedVideo = Boolean(videoElement?.src && !imageElement?.src);
    const generatedMedia = input.userToken
      ? await generateFullSlideMediaAssetForRelayout({
        slide: narrativeSlide,
        slideIndex: input.slideIndex,
        actor,
        userToken: input.userToken,
        preferredMediaType: preferGeneratedVideo ? "video" : "image",
      }).catch(() => null)
      : null;
    const mediaSrc = generatedMedia?.mediaUrl ?? imageElement?.src ?? videoElement?.src ?? null;
    if (!mediaSrc) {
      return {
        ...syncResult,
        slideContent: appendRelayoutFallbackHistory(syncResult.slideContent, {
          step: "switch_mode",
          from: "full_slide_media",
          to: syncResult.slideContent.aiDesign?.mode ?? "structured_block",
          reason: "Full-slide media relayout could not generate a new visual and found no reusable image or video.",
        }),
        warnings: [...syncResult.warnings, "Full-slide media relayout could not generate a new visual and found no reusable image or video on the slide."],
      };
    }
    const relayoutContent = buildFullSlideMediaContent({
      slide: narrativeSlide,
      mediaUrl: mediaSrc,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      isVideo: generatedMedia?.isVideo ?? Boolean(videoElement?.src && !imageElement?.src),
    });
    const relayoutElements = generatedMedia
      ? relayoutContent.elements.map((element) => {
        if (element.type === "image") {
          return {
            ...element,
            imagePrompt: generatedMedia.prompt.slice(0, 4000),
            ...(generatedMedia.modelId ? { imageModelId: generatedMedia.modelId.slice(0, 256) } : {}),
            ...(generatedMedia.extraParams && Object.keys(generatedMedia.extraParams).length > 0
              ? { imageExtraParams: generatedMedia.extraParams }
              : {}),
          };
        }
        if (element.type === "video") {
          return {
            ...element,
            videoPrompt: generatedMedia.prompt.slice(0, 4000),
            ...(generatedMedia.modelId ? { videoModelId: generatedMedia.modelId.slice(0, 256) } : {}),
            ...(generatedMedia.extraParams && Object.keys(generatedMedia.extraParams).length > 0
              ? { videoExtraParams: generatedMedia.extraParams }
              : {}),
          };
        }
        return element;
      })
      : relayoutContent.elements;
    return {
      ...syncResult,
      slideContent: finalizeSlideContentAfterRelayout({
        ...relayoutContent,
        elements: relayoutElements,
        transition: parsedContent.transition,
        durationMs: parsedContent.durationMs,
        background: parsedContent.background,
        aiDesign: syncResult.slideContent.aiDesign
          ? {
            ...syncResult.slideContent.aiDesign,
            mode: "full_slide_media",
            mediaModeMetadata: {
              editableSourceRetained: true,
              thaiTextRisk: estimateThaiTextRisk(narrativeSlide),
              visualIntent: detectFullSlideVisualIntent(narrativeSlide, Math.max(0, input.slideIndex - 1)),
              ...(generatedMedia?.modelId ? { modelId: generatedMedia.modelId } : {}),
              ...(generatedMedia ? { promptVersion: "full_slide_media_v1" } : {}),
            },
            generatedAt: new Date().toISOString(),
          }
          : undefined,
      }, []),
      warnings: [
        ...syncResult.warnings.filter((warning) => !warning.includes("auto relayout currently rebuilds this slide through the structured layout path.")),
        generatedMedia
          ? "Rebuilt this slide as a full-slide media layout with a newly generated visual."
          : "Rebuilt this slide as a full-slide media layout using the existing reusable visual.",
      ],
      applied: syncResult.applied,
    };
  }

  return syncResult;
}

export async function repairSlideFromSavedNote(
  input: RepairSlideFromSavedNoteInput,
  actor: PresentationActor,
  userToken: string,
): Promise<RepairSlideFromSavedNoteOutput> {
  const trimmedNotes = String(input.slideNotes ?? "").trim();
  if (!trimmedNotes) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.VALIDATION_FAILED,
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: saved slide note is required to repair a slide`,
    );
  }

  const warnings: string[] = [];
  const parsedContent = presentationSlideContentSchema.parse(input.slideContent);
  const canvas = parsedContent.canvas ?? {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  };
  const canvasAspectRatio = toAspectRatio(canvas.width, canvas.height);
  const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];
  const inferredStylePresetId = inferStylePresetIdFromSlide(parsedContent);
  const stylePresetId = input.stylePresetId ?? inferredStylePresetId;
  const baseStylePreset = getBuiltInPreset(stylePresetId) ?? getBuiltInPreset("dark-professional")!;
  const stylePreset = applyRelayoutChromePolicy(baseStylePreset);
  const watermark = normalizeWatermarkInput(extractWatermarkFromSlideContent(parsedContent), warnings);
  const noteNarrative = extractNarrativeFromSlideNotes(
    input.slideTitle,
    trimmedNotes,
    "split_right_image",
    Math.max(0, input.slideIndex - 1),
  );

  if (!noteNarrative) {
    throw new PresentationServiceError(
      PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
      `${PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED}: could not derive slide structure from the saved note`,
    );
  }

  const combinedText = `${noteNarrative.title}\n${noteNarrative.body.join("\n")}\n${noteNarrative.notes ?? ""}`;
  const graphicCategory = inferGraphicCategoryFromText(combinedText);
  const fullNoteHierarchy = buildMarkdownHierarchyFromCanonicalNote(trimmedNotes, noteNarrative.title);
  const hierarchyBodyLines = fullNoteHierarchy
    .filter((entry) => entry.level === "body")
    .map((entry) => entry.text);
  const portraitCanvas = canvas.height > canvas.width;
  const denseNarrative = (
    trimmedNotes.length >= 550
    || noteNarrative.body.length >= 5
    || noteNarrative.sections.length >= 4
    || fullNoteHierarchy.length >= 8
  );
  const shouldPreferPlainTextCoverage = denseNarrative || hierarchyBodyLines.length >= 7;
  const templateId = denseNarrative && portraitCanvas
    ? "bottom_image_text_top"
    : resolveRelayoutTemplateId({
      bodyCount: noteNarrative.body.length,
      hasImage: true,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      seed: Date.now(),
    });

  let repairedSlide = normalizeSlideHierarchy({
    templateId,
    title: noteNarrative.title.slice(0, 200),
    body: (hierarchyBodyLines.length > 0 ? hierarchyBodyLines : noteNarrative.body).slice(0, AI_NARRATIVE_MAX_BODY_LINES),
    ...(noteNarrative.notes ? { notes: noteNarrative.notes } : {}),
    ...(fullNoteHierarchy.length > 0 ? { markdownHierarchy: fullNoteHierarchy } : {}),
    ...(!shouldPreferPlainTextCoverage && noteNarrative.sections.length > 0 ? { sections: noteNarrative.sections } : {}),
    graphicCategory,
    imagePromptKeywords: combinedText.slice(0, 500) || noteNarrative.title.slice(0, 500),
  });

  let aiRecipeSelection: ResolvedAIComponentRecipeSelection | undefined;
  if (!shouldPreferPlainTextCoverage) {
    const aiRecipeAssignments = assignAIComponentRecipes([repairedSlide], {
      preferVideoRecipes: false,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    repairedSlide = aiRecipeAssignments.slides[0]!;
    aiRecipeSelection = aiRecipeAssignments.selections[0];
  } else {
    warnings.push("Dense slide note detected; prioritized full text coverage over block-based layout.");
  }

  const availableImageModels = await getModelsByTypeAsync("image");
  const textToImageModels = availableImageModels.filter(isTextToImageModel);
  const selectedImageModel = textToImageModels[0] ?? availableImageModels[0];
  const imageModelToUse: ImageModel = (selectedImageModel?.id || FALLBACK_IMAGE_MODEL) as ImageModel;
  const imageAspectRatio = selectAspectRatioForModel(
    canvasAspectRatio,
    selectedImageModel?.aspectRatios,
  );
  if (imageAspectRatio !== canvasAspectRatio) {
    warnings.push(`Image model "${imageModelToUse}" does not list aspect ratio "${canvasAspectRatio}"; using "${imageAspectRatio}"`);
  }
  const mediaApiConfig = buildImageApiConfig(selectedImageModel);
  const baseMediaExtraParams = applyFieldSyncTargets(
    buildImageExtraParams(selectedImageModel),
    selectedImageModel,
    { aspectRatio: imageAspectRatio },
  );
  const mediaGenerationPlan = deriveMediaGenerationPlanForSlide(
    repairedSlide,
    repairedSlide.imagePromptKeywords,
    false,
  );
  const mediaUrls: Array<string | null> = [];
  const repairTaskId = `repair-slide-${randomBytes(8).toString("hex")}`;
  const imagePollTimeoutMs = computeImagePollTimeoutMs(1);
  let firstResolvedExtraParams: Record<string, unknown> | undefined;

  for (const [variantIndex, mediaPlanEntry] of mediaGenerationPlan.entries()) {
    const promptVariant = mediaPlanEntry.prompt;
    const slideExtraParams = applyFieldSyncTargets(
      baseMediaExtraParams,
      selectedImageModel,
      { prompt: promptVariant },
    );
    if (variantIndex === 0) {
      firstResolvedExtraParams = slideExtraParams;
    }
    try {
      const mediaTask = await withTimeout(
        mediaGenerationService.generateImageAsync(
          {
            prompt: promptVariant,
            model: imageModelToUse,
            aspectRatio: imageAspectRatio,
            ...(Object.keys(mediaApiConfig ?? {}).length > 0 ? { apiConfig: mediaApiConfig } : {}),
            ...(slideExtraParams ? { extraParams: slideExtraParams } : {}),
            auditContext: {
              userId: actor.userId,
              traceId: `${repairTaskId}:slide:${input.slideIndex}:variant:${variantIndex + 1}:image`,
              source: "ai_draft.repairSlideFromSavedNote",
              stage: "repair_slide_media_submit",
              deckId: input.deckId,
              slideIndex: Math.max(0, input.slideIndex - 1),
            },
          },
          userToken,
        ),
        MEDIA_SUBMIT_TIMEOUT_MS,
        "media_submit_timeout",
      );
      const pollResult = await pollMediaTask(
        mediaTask.id,
        userToken,
        imagePollTimeoutMs,
        {
          auditContext: {
            userId: actor.userId,
            traceId: `${repairTaskId}:slide:${input.slideIndex}:variant:${variantIndex + 1}:image:poll`,
            source: "ai_draft.repairSlideFromSavedNote",
            stage: "repair_slide_media_poll",
            deckId: input.deckId,
            slideIndex: Math.max(0, input.slideIndex - 1),
          },
        },
      );
      if (pollResult.task) {
        await chargeMediaCreditsForAIDraftTask({
          userId: actor.userId,
          tenantId: actor.tenantId,
          deckId: input.deckId,
          aiDraftTaskId: repairTaskId,
          slideIndex: Math.max(0, input.slideIndex - 1),
          totalSlides: 1,
          mediaType: "image",
          modelId: imageModelToUse,
          provider: selectedImageModel?.provider,
          promptPreview: promptVariant,
          task: pollResult.task,
          fallbackCredits: selectedImageModel?.creditCost
            ?? await resolveMediaModelFallbackCreditCost(imageModelToUse, "image"),
          stage: "repair_slide_media_poll",
        });
      }
      if (!pollResult.url) {
        const reason = (pollResult.reason || "no output URL").replace(/\s+/g, " ").slice(0, 160);
        warnings.push(`Slide repair image variant ${variantIndex + 1} returned no media (${reason})`);
      }
      mediaUrls.push(pollResult.url ?? null);
    } catch (err) {
      warnings.push(`Slide repair image variant ${variantIndex + 1} failed (${sanitizeErrorMessage(err)})`);
      mediaUrls.push(null);
    }
  }

  let slideContent: PresentationSlideContent;
  if (shouldPreferPlainTextCoverage) {
    // Use algorithmic layout for dense content — preserves ALL text without slot truncation
    const algoResult = buildAlgorithmicSlideLayout({
      title: repairedSlide.title,
      body: repairedSlide.body,
      sections: repairedSlide.sections ?? [],
      notes: trimmedNotes,
      imageUrls: mediaUrls.filter((url): url is string => Boolean(url)),
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      stylePreset,
      idPrefix: `repair-${repairTaskId.slice(-6)}`,
      existingBackground: parsedContent.background,
      existingTransition: parsedContent.transition,
      existingDurationMs: parsedContent.durationMs,
      canvasPreset,
    });
    slideContent = algoResult.slideContent;
    warnings.push(...algoResult.warnings);
  } else {
    // Use recipe-based layout for short content
    const svgGraphic = pickRandomSvgFromCategory(repairedSlide.graphicCategory);
    const genResult = generateSlide({
      slideData: repairedSlide,
      imageUrl: mediaUrls[0] ?? null,
      imageUrls: mediaUrls,
      svgGraphic,
      stylePreset,
      deckTitle: input.slideIndex === 1 ? input.deckTitle?.slice(0, 36) : undefined,
      slideIndex: Math.max(0, input.slideIndex - 1),
      totalSlides: input.totalSlides,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    slideContent = genResult.slideContent;
    warnings.push(...genResult.warnings);
  }

  const promptForSlide = mediaGenerationPlan[0]?.prompt?.trim();
  const elementsWithMediaMetadata = slideContent.elements.map((element) => {
    if (element.type !== "image") {
      return element;
    }
    return {
      ...element,
      ...(promptForSlide ? { imagePrompt: promptForSlide.slice(0, 4000) } : {}),
      ...(imageModelToUse ? { imageModelId: imageModelToUse } : {}),
    };
  });
  const slideContentWithMediaMetadata = applyAIRecipeMediaMetadata(
    {
      ...slideContent,
      elements: elementsWithMediaMetadata,
    },
    {
      mediaType: "image",
      prompt: promptForSlide,
      modelId: imageModelToUse,
      extraParams: firstResolvedExtraParams,
    },
  );

  const narrativeBody = repairedSlide.body
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0)
    .slice(0, AI_NARRATIVE_MAX_BODY_LINES);
  const narrativeSections = (repairedSlide.sections ?? [])
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section))
    .slice(0, 6);
  const generatedAt = new Date().toISOString();
  let repairedContent: PresentationSlideContent = {
    ...slideContentWithMediaMetadata,
    canvas: {
      ...(canvasPreset ? { preset: canvasPreset } : {}),
      width: canvas.width,
      height: canvas.height,
    },
    ...(parsedContent.transition ? { transition: parsedContent.transition } : {}),
    ...(parsedContent.durationMs ? { durationMs: parsedContent.durationMs } : {}),
        aiDesign: {
          source: "draft-with-ai",
          taskId: repairTaskId,
          schemaVersion: "presentation_ai_layout_v1",
          mode: aiRecipeSelection?.mode ?? "structured_block",
          ...(aiRecipeSelection?.candidateModes?.length
            ? { candidateModes: aiRecipeSelection.candidateModes }
            : {}),
          componentRecipeId: aiRecipeSelection?.componentRecipeId,
          selectionMode: aiRecipeSelection?.selectionMode ?? "none",
          ...(aiRecipeSelection?.selectionReason ? { selectionReason: aiRecipeSelection.selectionReason } : {}),
      ...(aiRecipeSelection?.candidateRecipes?.length
        ? { candidateRecipes: aiRecipeSelection.candidateRecipes }
        : {}),
      narrative: {
        title: repairedSlide.title,
        body: narrativeBody.length > 0 ? narrativeBody : ["Key point"],
        ...(repairedSlide.notes ? { notes: repairedSlide.notes } : {}),
        ...(narrativeSections.length > 0 ? { sections: narrativeSections } : {}),
        ...(repairedSlide.mediaPlan?.length ? { mediaPlan: repairedSlide.mediaPlan } : {}),
        ...(repairedSlide.graphicCategory ? { graphicCategory: repairedSlide.graphicCategory } : {}),
        templateId: repairedSlide.templateId,
      },
      generatedAt,
    },
  };

  if (watermark) {
    const watermarkApplied = applyWatermarkToSlideContent(repairedContent, watermark);
    repairedContent = watermarkApplied.slideContent;
    warnings.push(...watermarkApplied.warnings);
  }

  repairedContent = finalizeSlideContentAfterRepair(repairedContent, warnings);

  return {
    title: repairedSlide.title,
    slideContent: repairedContent,
    warnings,
    applied: {
      templateId: repairedSlide.templateId,
      stylePresetId,
      graphicCategory: repairedSlide.graphicCategory,
      regeneratedImage: mediaUrls.some((url) => Boolean(url)),
    },
  };
}

// ── Slide Split System Prompt ──────────────────────────────

const SLIDE_SPLIT_SYSTEM_PROMPT = `You are a presentation content structurer. Your job is to split an article into individual presentation slides.

For each slide, produce a JSON object with these fields:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)}
- componentRecipeId (optional): one of ${JSON.stringify(AI_COMPONENT_RECIPE_IDS)} when a slide should use a richer component layout instead of the internal fallback layout
- mediaPlan (optional): an array of slot-specific media prompts when the chosen componentRecipeId has one or more media slots
  - slotId: the exact component media slot identifier
  - prompt: a vivid generation prompt for that slot (max 500 chars)
- title: a short, compelling title for the slide (max 200 chars)
- body: an array of 1-10 bullet point strings summarizing the key points
- notes: the full slide note text for this slide (max 5000 chars)
- sections (optional but strongly recommended): an array of section objects with:
  - heading: medium-size subheading text (max 180 chars)
  - details: array of 1-4 supporting detail lines (max 260 chars each)
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} - pick the most relevant category for a decorative SVG icon
- imagePromptKeywords: a descriptive prompt (max 500 chars) for generating a relevant background/hero image

Output ONLY a valid JSON array. No markdown code fences, no explanatory text.

You MUST return exactly the number of slides requested by the user message.

The first slide MUST keep templateId "hero_center" as the intro fallback frame.
For every slide after planning the content, prefer setting componentRecipeId whenever one built-in block clearly fits.
Use templateId only as an internal fallback frame for rendering compatibility. Do not force template variety when a block layout is a better fit.
IMPORTANT: Vary the componentRecipeId across slides. Do NOT use the same componentRecipeId on two or more consecutive slides. Choose the most fitting distinct layout for each slide — use the content type and information density to guide selection.

Component recipe guide:
${COMPONENT_RECIPE_PROMPT_GUIDE}

Media slot guide:
${COMPONENT_RECIPE_MEDIA_PLAN_GUIDE}

Coverage and quality requirements:
- Preserve all major ideas from the source article across the full deck; do not drop sections.
- notes must keep the substantive article excerpt assigned to this slide and must not be shorter or less informative than the visible slide text.
- Keep slide text concise but substantive:
  - hero_center: 2-4 body points
  - split_left_image / split_right_image / top_image_text_bottom / bottom_image_text_top: 3-6 body points
  - feature_boxes_right: 3-5 body points
- Body points should be short, information-dense phrases (not full paragraphs).
- Prefer 3-level readable hierarchy when possible:
  - Level 1: title (largest)
  - Level 2: sections[].heading (medium)
  - Level 3: sections[].details[] (small detail text)
- When one component recipe clearly fits the slide, set componentRecipeId explicitly instead of leaving it blank.
- Favor block layouts over legacy image-left/image-right template patterns whenever the content can fit a built-in block cleanly.`;

const TOPIC_TO_SLIDES_SYSTEM_PROMPT = `You are a presentation strategist. Convert a topic brief directly into a slide plan.

For each slide, produce a JSON object with these fields:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)}
- componentRecipeId (optional): one of ${JSON.stringify(AI_COMPONENT_RECIPE_IDS)} when a slide should use a richer component layout instead of the internal fallback layout
- mediaPlan (optional): an array of slot-specific media prompts when the chosen componentRecipeId has one or more media slots
  - slotId: the exact component media slot identifier
  - prompt: a vivid generation prompt for that slot (max 500 chars)
- title: a short, compelling title for the slide (max 200 chars)
- body: an array of 1-10 bullet point strings summarizing the key points
- notes: the full slide note text for this slide (max 5000 chars)
- sections (optional but strongly recommended): an array of section objects with:
  - heading: medium-size subheading text (max 180 chars)
  - details: array of 1-4 supporting detail lines (max 260 chars each)
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} - pick the most relevant category for a decorative SVG icon
- imagePromptKeywords: a descriptive prompt (max 500 chars) for generating a relevant background or hero visual

Output ONLY a valid JSON array. No markdown code fences, no explanatory text.

You MUST return exactly the number of slides requested by the user message.

The first slide MUST keep templateId "hero_center" as the intro fallback frame.
For every slide after planning the content, prefer setting componentRecipeId whenever one built-in block clearly fits.
Use templateId only as an internal fallback frame for rendering compatibility. Do not force template variety when a block layout is a better fit.
IMPORTANT: Vary the componentRecipeId across slides. Do NOT use the same componentRecipeId on two or more consecutive slides. Choose the most fitting distinct layout for each slide — use the content type and information density to guide selection.

Component recipe guide:
${COMPONENT_RECIPE_PROMPT_GUIDE}

Media slot guide:
${COMPONENT_RECIPE_MEDIA_PLAN_GUIDE}

Planning rules:
- Build a coherent beginning, middle, and end even when only a short topic is provided.
- Keep each slide focused on one clear idea.
- notes must include the full narration/reference text for that slide and must not be shorter or less informative than the visible slide text.
- Use concise but substantive points, suitable for presentation slides rather than prose paragraphs.
- When one component recipe clearly fits the slide, set componentRecipeId explicitly instead of leaving it blank.
- Favor block layouts over legacy image-left/image-right template patterns whenever the content can fit a built-in block cleanly.
- When the brief suggests a visual campaign, product reveal, or creative concept, make imagePromptKeywords vivid and production-ready.`;

function buildSlideSplitUserPrompt(articleText: string, requestedSlides: number): string {
  return `Target slide count: ${requestedSlides}

Article:
${articleText}`;
}

function buildTopicToSlidesUserPrompt(
  topic: string,
  requestedSlides: number,
  language: GenerateAIDraftInput["language"],
  draftSkillCapability: string,
  skillParams?: Record<string, unknown>,
): string {
  const lines = [
    `Target slide count: ${requestedSlides}`,
    `Language: ${language}`,
    `Draft skill mode: ${draftSkillCapability}`,
    "",
    "Topic brief:",
    topic,
  ];

  const paramLines = Object.entries(skillParams ?? {})
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `- ${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);

  if (paramLines.length > 0) {
    lines.push("", "Additional user inputs:", ...paramLines);
  }

  lines.push(
    "",
    "Requirements:",
    "- Make the deck feel complete even without a source article.",
    "- Each slide should have useful text structure plus strong imagePromptKeywords.",
    "- Prefer titles and bullets that are presentation-ready, not essay-style paragraphs.",
  );

  return lines.join("\n");
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function normalizeArticleLanguagePreference(value: unknown): "auto" | "th" | "en" | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized === "th" || normalized === "thai" || normalized.includes("ภาษาไทย")) {
    return "th";
  }
  if (normalized === "en" || normalized === "english") {
    return "en";
  }
  if (normalized === "auto" || normalized === "auto-detect" || normalized === "autodetect") {
    return "auto";
  }
  return null;
}

function resolveArticleLanguagePreference(
  language: string,
  skillParams?: Record<string, unknown>,
): "auto" | "th" | "en" {
  return normalizeArticleLanguagePreference(skillParams?.language)
    ?? normalizeArticleLanguagePreference(language)
    ?? "auto";
}

function inferArticleLanguage(
  language: string,
  topic: string,
  skillParams?: Record<string, unknown>,
): "th" | "en" {
  const preferredLanguage = resolveArticleLanguagePreference(language, skillParams);
  if (preferredLanguage === "th") {
    return "th";
  }
  if (preferredLanguage === "en") {
    return "en";
  }
  if (language === "en") {
    return "en";
  }
  return /[\u0e00-\u0e7f]/.test(topic) ? "th" : "en";
}

function computeSlideRecommendedWords(
  language: "th" | "en",
  numSlides: number,
): number {
  const wordsPerSlide = language === "th"
    ? ARTICLE_WORDS_PER_SLIDE_TH
    : ARTICLE_WORDS_PER_SLIDE_EN;
  return clampInteger(
    Math.max(1, numSlides) * wordsPerSlide,
    ARTICLE_TARGET_WORDS_MIN,
    ARTICLE_TARGET_WORDS_MAX,
  );
}

function resolveExplicitWordCount(
  skillParams?: Record<string, unknown>,
): number | null {
  if (!skillParams) {
    return null;
  }
  const candidateKeys = [
    "word_count",
    "wordCount",
    "max_words",
    "maxWords",
    "target_words",
    "targetWords",
  ];
  for (const key of candidateKeys) {
    const parsed = parsePositiveInteger(skillParams[key]);
    if (parsed && parsed >= 120) {
      return clampInteger(parsed, 120, 8000);
    }
  }
  return null;
}

function resolveLengthPresetTarget(
  skillParams?: Record<string, unknown>,
): { preset: "short" | "medium" | "long"; words: number } | null {
  const rawLength = typeof skillParams?.length === "string"
    ? skillParams.length.trim().toLowerCase()
    : "";
  if (rawLength === "short" || rawLength === "medium" || rawLength === "long") {
    return {
      preset: rawLength,
      words: ARTICLE_WORD_PRESET_TARGETS[rawLength],
    };
  }
  return null;
}

function buildArticleWordPlan(
  topic: string,
  language: string,
  numSlides: number,
  skillParams?: Record<string, unknown>,
): {
  targetWords: number;
  perSectionWords: number;
  slideRecommendedWords: number;
  hardMaxWords: number | null;
  lengthPreset: "short" | "medium" | "long" | null;
} {
  const resolvedLanguage = inferArticleLanguage(language, topic, skillParams);
  const slideRecommendedWords = computeSlideRecommendedWords(resolvedLanguage, numSlides);
  const explicitWordCount = resolveExplicitWordCount(skillParams);
  const lengthPresetTarget = resolveLengthPresetTarget(skillParams);

  let targetWords = slideRecommendedWords;
  let hardMaxWords: number | null = null;
  let lengthPreset: "short" | "medium" | "long" | null = null;

  if (explicitWordCount) {
    hardMaxWords = explicitWordCount;
    targetWords = Math.min(slideRecommendedWords, explicitWordCount);
  } else if (lengthPresetTarget) {
    targetWords = lengthPresetTarget.words;
    lengthPreset = lengthPresetTarget.preset;
  }

  const perSectionWords = clampInteger(
    targetWords / Math.max(1, numSlides),
    40,
    180,
  );

  return {
    targetWords,
    perSectionWords,
    slideRecommendedWords,
    hardMaxWords,
    lengthPreset,
  };
}

function buildSlideSplitArticleExcerpt(
  articleText: string,
  requestedSlides: number,
  warnings: string[],
): string {
  const tokens = articleText.split(/\s+/).filter((token) => token.trim().length > 0);
  const dynamicLimit = Math.round(requestedSlides * 450);
  const maxWords = Math.max(
    SLIDE_SPLIT_MIN_WORDS,
    Math.min(SLIDE_SPLIT_MAX_WORDS, dynamicLimit),
  );
  if (tokens.length <= maxWords) {
    return tokens.join(" ");
  }

  const headCount = Math.max(1, Math.round(maxWords * 0.72));
  const tailCount = Math.max(1, maxWords - headCount);
  const excerpt = [
    ...tokens.slice(0, headCount),
    "[...continued summary context...]",
    ...tokens.slice(Math.max(0, tokens.length - tailCount)),
  ].join(" ");
  warnings.push(
    `Article is long (${tokens.length} words). Slide split used ${maxWords} words with head+tail sampling for better coverage.`,
  );
  return excerpt;
}

function splitWords(value: string): string[] {
  return value
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function countApproxWords(value: string): number {
  return splitWords(value).length;
}

function trimToMaxWords(value: string, maxWords: number): string {
  const tokens = splitWords(value);
  if (tokens.length <= maxWords) {
    return value;
  }
  return tokens.slice(0, maxWords).join(" ");
}

function parseStructuredSectionFromLine(line: string): { heading: string; details: string[] } | null {
  const normalized = normalizeCoverageText(line);
  if (!normalized) {
    return null;
  }

  const separators = [":", " - ", " — ", " – ", "|"];
  for (const separator of separators) {
    const index = normalized.indexOf(separator);
    if (index <= 0) {
      continue;
    }
    const heading = normalizeCoverageText(normalized.slice(0, index));
    const detailText = normalizeCoverageText(normalized.slice(index + separator.length));
    if (heading.length < 3 || detailText.length < 4) {
      continue;
    }
    return { heading, details: [detailText] };
  }

  return null;
}

function buildSlideSectionsFromBody(
  body: string[],
  templateId: (typeof AI_LAYOUT_TEMPLATE_IDS)[number],
): Array<{ heading: string; details: string[] }> {
  const sections: Array<{ heading: string; details: string[] }> = [];
  const maxSections = templateId === "hero_center" ? 2 : (templateId === "feature_boxes_right" ? 5 : 4);
  let index = 0;

  while (index < body.length && sections.length < maxSections) {
    const current = normalizeCoverageText(body[index] ?? "");
    if (!current) {
      index += 1;
      continue;
    }

    const parsed = parseStructuredSectionFromLine(current);
    if (parsed) {
      sections.push({
        heading: parsed.heading,
        details: parsed.details,
      });
      index += 1;
      continue;
    }

    const next = normalizeCoverageText(body[index + 1] ?? "");
    if (next.length >= 12 && next.toLowerCase() !== current.toLowerCase()) {
      sections.push({
        heading: current,
        details: [next],
      });
      index += 2;
      continue;
    }

    sections.push({
      heading: current,
      details: [],
    });
    index += 1;
  }

  return sections;
}

function getTemplateBodyLimits(templateId: LayoutTemplateId): { min: number; max: number } {
  const limits: Record<LayoutTemplateId, { min: number; max: number }> = {
    hero_center: { min: 2, max: 12 },
    split_left_image: { min: 3, max: 12 },
    split_right_image: { min: 3, max: 12 },
    top_image_text_bottom: { min: 3, max: 12 },
    bottom_image_text_top: { min: 3, max: 12 },
    feature_boxes_right: { min: 3, max: 8 },
  };
  return limits[templateId];
}

function splitCanonicalTextIntoClauses(value: string): string[] {
  const fragments = value
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .flatMap((line) => line.split(/[.!?。！？]+|(?<=\S)[;:]+|(?<=\S)\s+[•\-*]\s+/))
    .flatMap((line) => line.split(/\s*[|/]\s*|\s*[+＋]\s*|,\s*/))
    .map((line) => normalizeCoverageText(line))
    .filter((line) => line.length >= 12);

  // For Thai text (and other CJK-style text without sentence delimiters),
  // long fragments need additional splitting at space boundaries.
  const TARGET_CHUNK_LEN = 120;
  const result: string[] = [];
  for (const fragment of fragments) {
    if (fragment.length <= TARGET_CHUNK_LEN * 1.5) {
      result.push(fragment);
      continue;
    }
    // Split long fragments at Thai/CJK space boundaries
    const words = fragment.split(/\s+/);
    if (words.length <= 1) {
      result.push(fragment);
      continue;
    }
    let chunk = "";
    for (const word of words) {
      if (chunk && (chunk.length + 1 + word.length) > TARGET_CHUNK_LEN) {
        const trimmed = chunk.trim();
        if (trimmed.length >= 12) {
          result.push(trimmed);
        }
        chunk = word;
      } else {
        chunk = chunk ? `${chunk} ${word}` : word;
      }
    }
    if (chunk.trim().length >= 12) {
      result.push(chunk.trim());
    }
  }
  return result;
}

function isSubstringOverlap(a: string, b: string): boolean {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  if (la.includes(lb) || lb.includes(la)) {
    return true;
  }
  // Check for high token overlap (>70% shared tokens)
  const tokensA = new Set(la.match(/[a-z0-9\u0e00-\u0e7f]{2,}/g) ?? []);
  const tokensB = new Set(lb.match(/[a-z0-9\u0e00-\u0e7f]{2,}/g) ?? []);
  if (tokensA.size === 0 || tokensB.size === 0) {
    return false;
  }
  const smaller = tokensA.size <= tokensB.size ? tokensA : tokensB;
  const larger = tokensA.size <= tokensB.size ? tokensB : tokensA;
  let overlap = 0;
  for (const token of smaller) {
    if (larger.has(token)) {
      overlap += 1;
    }
  }
  return overlap / smaller.size > 0.7;
}

function deriveBodyFromCanonicalNote(note: string, templateId: LayoutTemplateId): string[] {
  const { min, max } = getTemplateBodyLimits(templateId);
  const candidates = [
    ...extractCoveragePointsFromArticle(note, max * 2),
    ...splitCanonicalTextIntoClauses(note),
  ];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const normalized = normalizeCoverageText(candidate);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    // Check substring/overlap with already-accepted lines
    const overlaps = unique.some((existing) => isSubstringOverlap(existing, normalized));
    if (overlaps) {
      continue;
    }
    seen.add(key);
    unique.push(normalized);
    if (unique.length >= max) {
      break;
    }
  }
  if (unique.length === 0) {
    unique.push("Key point");
  }
  // Do NOT pad with duplicate lines — fewer unique lines is better than repeated text
  return unique.slice(0, max);
}

function buildMarkdownHierarchyFromCanonicalNote(
  note: string,
  title: string,
): Array<{ level: "h2" | "h3" | "body"; text: string }> {
  const titleKey = normalizeSlideText(title).toLowerCase();
  const normalizedLines = canonicalizeSlideNotesForNarrative(note)
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => normalizeSlideText(line))
    .filter((line) => line.length > 0);

  const contentLines = normalizedLines.filter((line, index) => {
    if (index !== 0 || !titleKey) {
      return true;
    }
    const lower = line.toLowerCase();
    return !(
      lower === titleKey
      || lower.startsWith(`${titleKey} `)
      || titleKey.startsWith(lower)
    );
  });

  return contentLines
    .flatMap((line, index, arr) => {
      const next = arr[index + 1] ?? "";
      const looksLikeHeading = !/^(?:\d+\s*[\).:]|[•▪◦·-]\s+)/.test(line)
        && /^(?:\d+\s*[\).:]|[•▪◦·-]\s+)/.test(next);
      const chunks = splitLongTextAtSpaces(line, 180, 18)
        .map((chunk) => normalizeSlideText(chunk).slice(0, 260))
        .filter((chunk) => chunk.length > 0);
      return chunks.map((chunk, chunkIndex) => ({
        level: looksLikeHeading && chunkIndex === 0 ? "h3" as const : "body" as const,
        text: chunk,
      }));
    })
    .slice(0, 24);
}

function stripArticleHeadingPrefix(value: string): string {
  return stripMarkdownFormatting(value)
    .replace(/^(?:title|หัวข้อ|เรื่อง)\s*:\s*/i, "")
    .replace(/^\d+\s*[\).:\-]\s*/, "")
    .replace(/^section\s+\d+\s*[\).:\-]?\s*/i, "")
    .trim();
}

function normalizeNarrativeTitleCandidate(value: string): string {
  const stripped = stripArticleHeadingPrefix(value);
  const segments = splitInlineStructuredListSegments(stripped);
  const preferred = segments[0] ?? stripped;
  return normalizeSlideText(stripArticleHeadingPrefix(preferred)).slice(0, 200);
}

function deriveTitleFromCanonicalNote(
  note: string,
  fallbackTitle: string,
  slideIndex: number,
): string {
  const normalizedFallback = normalizeNarrativeTitleCandidate(fallbackTitle);
  const noteTokens = new Set(tokenizeCoverage(note));
  const fallbackTokens = tokenizeCoverage(normalizedFallback);
  const overlap = fallbackTokens.filter((token) => noteTokens.has(token)).length;
  if (
    normalizedFallback
    && fallbackTokens.length > 0
    && overlap / fallbackTokens.length >= 0.34
  ) {
    return normalizedFallback;
  }

  // Prefer markdown headings (#, ##) as title — they're concise by nature
  const mdHeadingMatch = note.match(/^#{1,3}\s+(.+)/m);
  if (mdHeadingMatch) {
    const heading = normalizeNarrativeTitleCandidate(mdHeadingMatch[1]);
    if (heading.length >= 6) {
      return heading;
    }
  }

  const lines = note
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => normalizeNarrativeTitleCandidate(line))
    .filter((line) => line.length >= 6);
  if (lines.length > 0) {
    // If the first line is very long, try to extract a shorter title from it
    const firstLine = lines[0];
    if (firstLine.length > 100) {
      // Try to find a natural break point (space boundary) within first 100 chars
      const spaceIdx = firstLine.lastIndexOf(" ", 100);
      if (spaceIdx > 30) {
        return firstLine.slice(0, spaceIdx);
      }
    }
    return firstLine.slice(0, 200);
  }

  const firstSentence = note
    .split(/[.!?。！？\n]+/)
    .map((segment) => normalizeNarrativeTitleCandidate(segment))
    .find((segment) => segment.length >= 6);
  if (firstSentence) {
    return firstSentence.slice(0, 200);
  }

  return normalizedFallback || `Slide ${slideIndex + 1}`;
}

function splitParagraphSentences(paragraph: string): string[] {
  return paragraph
    .split(/[.!?。！？\n]+/)
    .map((sentence) => normalizeSlideText(sentence))
    .filter((sentence) => sentence.length > 0);
}

function buildFallbackCanonicalSlideNotes(articleText: string, slideCount: number): string[] {
  const paragraphs = articleText
    .replace(/\r/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  const units = paragraphs.length > 0
    ? paragraphs
    : splitParagraphSentences(articleText);
  if (units.length === 0) {
    return Array.from({ length: slideCount }, () => "");
  }
  if (units.length < slideCount) {
    const expanded = [...units];
    for (const unit of units) {
      if (expanded.length >= slideCount) {
        break;
      }
      const parts = splitParagraphSentences(unit);
      for (const part of parts) {
        if (expanded.length >= slideCount) {
          break;
        }
        if (!expanded.includes(part)) {
          expanded.push(part);
        }
      }
    }
    while (expanded.length < slideCount) {
      expanded.push(expanded[expanded.length - 1] ?? expanded[0] ?? "");
    }
    return expanded.slice(0, slideCount).map((unit) => unit.trim());
  }
  return Array.from({ length: slideCount }, (_, index) => {
    const start = Math.floor((index * units.length) / slideCount);
    const end = Math.floor(((index + 1) * units.length) / slideCount);
    return units.slice(start, Math.max(start + 1, end)).join("\n\n").trim();
  });
}

function extractCanonicalArticleBlocks(articleText: string): { title: string | null; blocks: string[] } {
  const normalizedArticle = articleText.replace(/\r/g, "\n").trim();
  if (!normalizedArticle) {
    return { title: null, blocks: [] };
  }

  // Strategy 1: Split on markdown ## headers (most reliable for LLM output)
  const mdHeadingMatches = Array.from(normalizedArticle.matchAll(/^#{2,3}\s+/gm));
  if (mdHeadingMatches.length >= 2) {
    // Extract title from # heading or text before first ##
    const firstH2Start = mdHeadingMatches[0]?.index ?? 0;
    const preamble = normalizedArticle.slice(0, firstH2Start).trim();
    const h1Match = preamble.match(/^#\s+(.+)/m);
    const titleCandidate = h1Match
      ? stripMarkdownFormatting(h1Match[1]).trim()
      : (preamble ? stripMarkdownFormatting(preamble.split("\n")[0]).trim() : null);

    const blocks = mdHeadingMatches.map((match, index) => {
      const start = match.index ?? 0;
      const end = mdHeadingMatches[index + 1]?.index ?? normalizedArticle.length;
      return normalizedArticle.slice(start, end).trim();
    }).filter((block) => block.length > 0);

    if (blocks.length > 0) {
      return { title: titleCandidate || null, blocks };
    }
  }

  // Strategy 2: Split on numbered headings (1), 2), etc.)
  const numberedHeadingPattern = /(?:^|\n|\s)(?:section\s+)?\d+\s*[\).:\-]\s+/gi;
  const matches = Array.from(normalizedArticle.matchAll(numberedHeadingPattern));
  if (matches.length > 0) {
    const titleCandidate = normalizedArticle.slice(0, matches[0]?.index ?? 0).trim();
    const blocks = matches.map((match, index) => {
      const rawStart = match.index ?? 0;
      const start = rawStart > 0 && /\s/.test(normalizedArticle[rawStart] ?? "")
        ? rawStart + 1
        : rawStart;
      const nextRawStart = matches[index + 1]?.index ?? normalizedArticle.length;
      const end = nextRawStart > 0 && /\s/.test(normalizedArticle[nextRawStart] ?? "")
        ? nextRawStart
        : nextRawStart;
      return normalizedArticle.slice(start, end).trim();
    }).filter((block) => block.length > 0);
    return {
      title: titleCandidate || null,
      blocks,
    };
  }

  // Strategy 3: Fall back to paragraph splitting
  const paragraphs = normalizedArticle
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);
  if (paragraphs.length === 0) {
    return { title: null, blocks: [] };
  }
  const titleParagraph = paragraphs[0] ?? null;
  return {
    title: titleParagraph,
    blocks: paragraphs.slice(1).length > 0 ? paragraphs.slice(1) : paragraphs,
  };
}

function buildCanonicalSlideNotesFromArticle(
  articleText: string,
  slideCount: number,
): string[] {
  const normalizedArticle = articleText.trim();
  if (!normalizedArticle) {
    return Array.from({ length: slideCount }, () => "");
  }

  const { title, blocks } = extractCanonicalArticleBlocks(normalizedArticle);
  const sourceBlocks = blocks.length > 0
    ? blocks
    : buildFallbackCanonicalSlideNotes(normalizedArticle, slideCount);
  const grouped = sourceBlocks.length === slideCount
    ? [...sourceBlocks]
    : Array.from({ length: slideCount }, (_, index) => {
        const start = Math.floor((index * sourceBlocks.length) / slideCount);
        const end = Math.floor(((index + 1) * sourceBlocks.length) / slideCount);
        return sourceBlocks.slice(start, Math.max(start + 1, end)).join("\n\n").trim();
      });

  const normalizeTitleCandidate = (value: string): string => stripMarkdownFormatting(value).trim().toLowerCase();
  if (title && grouped.length > 0) {
    const firstBlockFirstLine = grouped[0]
      .split(/\n+/)[0]
      ?.trim() ?? "";
    const firstLineMatchesTitle = normalizeTitleCandidate(firstBlockFirstLine) === normalizeTitleCandidate(title);
    if (!firstLineMatchesTitle) {
      grouped[0] = `# ${title}\n\n${grouped[0]}`.trim();
    }
  }
  return grouped.map((group) => group.trim().slice(0, 5_000));
}

function applyCanonicalArticleTextToSlides(
  articleText: string,
  slides: AIPresentationSlide[],
): AIPresentationSlide[] {
  const canonicalNotes = buildCanonicalSlideNotesFromArticle(articleText, slides.length);
  return slides.map((slide, index) => {
    const rawNote = (canonicalNotes[index] ?? "").trim().slice(0, 5_000);
    if (!rawNote) {
      return normalizeSlideHierarchy(slide);
    }

    // Parse markdown structure to separate headings from body content.
    // # → slide title, ## → section headings, plain text → body lines.
    const mdStructure = parseMarkdownNoteStructure(rawNote);

    let title: string;
    let body: string[];
    let sections: Array<{ heading: string; details: string[] }>;
    let markdownHierarchy: Array<{ level: "h2" | "h3" | "body"; text: string }> = [];

    if (mdStructure.sections.length > 0 || mdStructure.title) {
      // Markdown-structured note: use parsed structure
      title = mdStructure.title
        || deriveTitleFromCanonicalNote(rawNote, slide.title, index);
      markdownHierarchy = mdStructure.hierarchy;

      // Build body from section body lines + plain lines (NOT headings)
      const allBodyLines = [
        ...mdStructure.plainLines,
        ...mdStructure.sections.flatMap((s) => s.bodyLines),
      ];
      body = allBodyLines.length > 0
        ? allBodyLines
        : deriveBodyFromCanonicalNote(rawNote, slide.templateId);

      // Build sections from ## headings with their body lines as details
      sections = mdStructure.sections
        .filter((s) => s.heading.length > 0)
        .map((s) => ({
          heading: s.heading,
          details: s.bodyLines.slice(0, 6),
        }));
      if (sections.length === 0) {
        sections = buildSlideSectionsFromBody(body, slide.templateId);
      }
    } else {
      // No markdown structure — fall back to text-based extraction
      title = deriveTitleFromCanonicalNote(rawNote, slide.title, index);
      body = deriveBodyFromCanonicalNote(rawNote, slide.templateId);
      sections = buildSlideSectionsFromBody(body, slide.templateId);
    }

    // Store the clean (markdown-stripped) note text
    const notes = normalizeSlideText(rawNote);
    return normalizeSlideHierarchy({
      ...slide,
      title,
      body,
      notes,
      ...(markdownHierarchy.length > 0 ? { markdownHierarchy } : {}),
      sections,
    });
  });
}

function normalizeSlideHierarchyCore(slide: AIPresentationSlide): AIPresentationSlide {
  const title = normalizeSlideText(slide.title).slice(0, 200) || "Key Insight";
  const titleLower = title.toLowerCase();
  const body = clampBodyLinesForTemplate(slide.body, slide.templateId)
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0 && line.toLowerCase() !== titleLower);
  const markdownHierarchy = (slide.markdownHierarchy ?? [])
    .map((line) => ({
      level: line.level,
      text: normalizeSlideText(line.text).slice(0, 260),
    }))
    .filter((line) => line.text.length > 0 && line.text.toLowerCase() !== titleLower)
    .slice(0, 24);
  const notes = normalizeSlideText(slide.notes ?? "").slice(0, 5_000);
  const mediaSlots = slide.componentRecipeId
    ? PRESENTATION_COMPONENT_MEDIA_SLOTS[slide.componentRecipeId]
    : undefined;
  const mediaPlan = (slide.mediaPlan ?? [])
    .map((entry) => ({
      slotId: normalizeSlideText(entry.slotId).slice(0, 64),
      prompt: normalizeSlideText(entry.prompt).slice(0, 500),
    }))
    .filter((entry) => (
      entry.slotId.length > 0
      && entry.prompt.length > 0
      && (!mediaSlots?.length || mediaSlots.includes(entry.slotId))
    ))
    .slice(0, mediaSlots?.length ?? 8);
  const maxSections = slide.templateId === "hero_center" ? 2 : 6;

  const explicitSections = (slide.sections ?? [])
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section))
    .slice(0, maxSections);

  const sectionKeys = new Set(
    explicitSections.flatMap((section) => [
      section.heading.toLowerCase(),
      ...section.details.map((detail) => detail.toLowerCase()),
    ]),
  );
  const uncoveredBodyLines = body.filter((line) => !sectionKeys.has(line.toLowerCase()));
  const derivedFallback = buildSlideSectionsFromBody(uncoveredBodyLines, slide.templateId)
    .map((section) => normalizeNarrativeSection(section))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));
  const mergedSections = [...explicitSections];
  for (const candidate of derivedFallback) {
    if (mergedSections.length >= maxSections) {
      break;
    }
    const key = `${candidate.heading}||${candidate.details.join("||")}`.toLowerCase();
    if (sectionKeys.has(candidate.heading.toLowerCase()) || sectionKeys.has(key)) {
      continue;
    }
    mergedSections.push(candidate);
    sectionKeys.add(candidate.heading.toLowerCase());
    sectionKeys.add(key);
  }

  const sections = mergedSections.length > 0
    ? mergedSections
    : buildSlideSectionsFromBody(body, slide.templateId)
      .map((section) => normalizeNarrativeSection(section))
      .filter((section): section is { heading: string; details: string[] } => Boolean(section))
      .slice(0, maxSections);

  return {
    ...slide,
    title,
    body: body.slice(0, AI_NARRATIVE_MAX_BODY_LINES).length > 0
      ? body.slice(0, AI_NARRATIVE_MAX_BODY_LINES)
      : ["Key point"],
    ...(mediaPlan.length > 0 ? { mediaPlan } : {}),
    ...(markdownHierarchy.length > 0 ? { markdownHierarchy } : {}),
    ...(notes ? { notes } : {}),
    ...(sections.length > 0 ? { sections } : {}),
  };
}

function normalizeSlideHierarchy(slide: AIPresentationSlide): AIPresentationSlide {
  const normalized = normalizeSlideHierarchyCore(slide);
  const reconciled = reconcileSlideVisibleContentWithNotes(normalized);
  if (reconciled === normalized) {
    return normalized;
  }
  return normalizeSlideHierarchyCore(reconciled);
}

function coerceNarrativeLines(
  values: unknown[] | undefined,
  maxItems: number,
  maxChars: number,
): string[] {
  if (!values?.length) {
    return [];
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (
      typeof value !== "string"
      && typeof value !== "number"
      && typeof value !== "boolean"
    ) {
      continue;
    }
    for (const line of normalizeTextLines(String(value))) {
      const cleaned = normalizeSlideText(line).slice(0, maxChars);
      const key = cleaned.toLowerCase();
      if (!cleaned || seen.has(key)) {
        continue;
      }
      seen.add(key);
      normalized.push(cleaned);
      if (normalized.length >= maxItems) {
        return normalized;
      }
    }
  }
  return normalized;
}

function repairPlannedSlide(
  slide: LenientAIPresentationSlide,
  index: number,
): AIPresentationSlide {
  const fallback = buildFallbackSlide(index);
  const templateId = isSupportedLayoutTemplateId(slide.templateId)
    ? slide.templateId
    : fallback.templateId;
  const rawNote = typeof slide.notes === "string"
    ? canonicalizeSlideNotesForNarrative(slide.notes).slice(0, 5_000)
    : "";
  const normalizedNote = normalizeSlideText(rawNote).slice(0, 5_000);
  const fallbackTitle = typeof slide.title === "string" && slide.title.trim().length > 0
    ? slide.title
    : fallback.title;
  const noteNarrative = rawNote
    ? extractNarrativeFromSlideNotes(fallbackTitle, rawNote, templateId, index)
    : null;
  const title = (
    normalizeSlideText(slide.title ?? "").slice(0, 200)
    || noteNarrative?.title
    || fallback.title
  );
  const { min, max } = getTemplateBodyLimits(templateId);

  const bodyFromResponse = coerceNarrativeLines(
    slide.body,
    max,
    AI_NARRATIVE_MAX_BODY_CHARS,
  );
  const bodyFromHierarchy = (slide.markdownHierarchy ?? [])
    .filter((line) => line.level === "body" || line.level === "h3")
    .flatMap((line) => normalizeTextLines(line.text ?? ""))
    .map((line) => normalizeNarrativeBodyLine(line))
    .filter((line) => line.length > 0);

  const explicitSections = (slide.sections ?? [])
    .map((section) => normalizeNarrativeSection({
      heading: section.heading ?? "",
      details: coerceNarrativeLines(
        section.details,
        AI_NARRATIVE_MAX_SECTION_DETAILS,
        AI_NARRATIVE_MAX_SECTION_DETAIL_CHARS,
      ),
    }))
    .filter((section): section is { heading: string; details: string[] } => Boolean(section));

  const seededBody = bodyFromResponse.length >= min
    ? bodyFromResponse
    : mergeUniqueNarrativeLines(
      bodyFromResponse,
      [
        ...bodyFromHierarchy,
        ...explicitSections.flatMap((section) => section.details),
        ...(noteNarrative?.body ?? []),
      ],
      max,
    );
  const body = seededBody.length >= min
    ? seededBody
    : mergeUniqueNarrativeLines(
      seededBody,
      deriveBodyFromCanonicalNote(rawNote || title, templateId),
      max,
    );

  const sections = mergeUniqueNarrativeSections(
    explicitSections,
    noteNarrative?.sections ?? buildSlideSectionsFromBody(body, templateId),
    templateId === "hero_center" ? 2 : 6,
  );

  const markdownHierarchy = (slide.markdownHierarchy ?? [])
    .map((line) => ({
      level: line.level === "h2" || line.level === "h3" || line.level === "body"
        ? line.level
        : "body",
      text: normalizeSlideText(line.text ?? "").slice(0, 260),
    }))
    .filter((line) => line.text.length > 0)
    .slice(0, 24);

  const mediaPlan = (slide.mediaPlan ?? [])
    .map((entry) => ({
      slotId: normalizeSlideText(entry.slotId ?? "").slice(0, 64),
      prompt: normalizeSlideText(entry.prompt ?? "").slice(0, 500),
    }))
    .filter((entry) => entry.slotId.length > 0 && entry.prompt.length > 0)
    .slice(0, 8);

  return normalizeSlideHierarchy({
    templateId,
    ...(isSupportedAIComponentRecipeId(slide.componentRecipeId)
      ? { componentRecipeId: slide.componentRecipeId }
      : {}),
    ...(mediaPlan.length > 0 ? { mediaPlan } : {}),
    title,
    body: body.length > 0 ? body : fallback.body,
    ...(normalizedNote ? { notes: normalizedNote } : {}),
    ...(markdownHierarchy.length > 0 ? { markdownHierarchy } : {}),
    ...(sections.length > 0 ? { sections } : {}),
    graphicCategory: isSupportedGraphicCategoryId(slide.graphicCategory)
      ? slide.graphicCategory
      : fallback.graphicCategory,
    imagePromptKeywords:
      normalizeSlideText(slide.imagePromptKeywords ?? "").slice(0, 500)
      || fallback.imagePromptKeywords,
  });
}

function repairPlannedSlides(
  slides: LenientAIPresentationSlide[],
  warnings: string[],
): AIPresentationSlide[] {
  let repairedCount = 0;
  const normalizedSlides = slides.map((slide, index) => {
    const parsed = AIPresentationSlideSchema.safeParse(slide);
    if (parsed.success) {
      return normalizeSlideHierarchy(parsed.data);
    }
    repairedCount += 1;
    return repairPlannedSlide(slide, index);
  });

  if (repairedCount > 0) {
    warnings.push(
      `Slide structuring repaired incomplete AI output for ${repairedCount} slide(s) before rendering.`,
    );
  }

  return normalizedSlides;
}

function buildFallbackSlide(index: number, seed?: AIPresentationSlide): AIPresentationSlide {
  const templateId =
    index === 0
      ? "hero_center"
      : "split_right_image";
  const baseTitle = seed?.title?.trim() || "Key Insight";
  const title =
    index === 0
      ? baseTitle.slice(0, 200)
      : `${baseTitle} (Part ${index + 1})`.slice(0, 200);
  const body =
    seed?.body?.filter((line) => line.trim().length > 0).slice(0, 5)
    ?? [];
  return {
    templateId,
    title,
    body: body.length > 0 ? body : [`Key point ${index + 1}`],
    ...(seed?.notes?.trim() ? { notes: seed.notes.trim().slice(0, 5_000) } : {}),
    ...(seed?.mediaPlan?.length ? { mediaPlan: seed.mediaPlan.slice(0, 8) } : {}),
    sections: body.length > 0
      ? buildSlideSectionsFromBody(body, templateId)
      : [{
          heading: `Key insight ${index + 1}`,
          details: [`Key point ${index + 1}`],
        }],
    graphicCategory: seed?.graphicCategory ?? "Business",
    imagePromptKeywords:
      seed?.imagePromptKeywords?.trim().slice(0, 500)
      || `${baseTitle}, presentation visual, professional style`,
  };
}

function normalizeSlidesToRequestedCount(
  slides: AIPresentationSlide[],
  requestedCount: number,
  warnings: string[],
): AIPresentationSlide[] {
  if (slides.length === requestedCount) {
    return slides;
  }

  if (slides.length > requestedCount) {
    warnings.push(
      `Slide structuring returned ${slides.length} slides; trimmed to requested ${requestedCount}.`,
    );
    return slides.slice(0, requestedCount);
  }

  warnings.push(
    `Slide structuring returned ${slides.length} slides; padded to requested ${requestedCount}.`,
  );
  const padded = [...slides];
  while (padded.length < requestedCount) {
    const seed = slides.length > 0
      ? slides[padded.length % slides.length]
      : undefined;
    padded.push(buildFallbackSlide(padded.length, seed));
  }
  return padded;
}

function normalizeCoverageText(value: string): string {
  return stripMarkdownFormatting(value)
    .replace(/^[\s\u2022\-*•]+/, "")
    .replace(/^\d+[\).:\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLongTextAtSpaces(text: string, targetLen: number, minLen: number): string[] {
  if (text.length <= targetLen * 1.5) {
    return [text];
  }
  const words = text.split(/\s+/);
  if (words.length <= 1) {
    return [text];
  }
  const chunks: string[] = [];
  let chunk = "";
  for (const word of words) {
    if (chunk && (chunk.length + 1 + word.length) > targetLen) {
      const trimmed = chunk.trim();
      if (trimmed.length >= minLen) {
        chunks.push(trimmed);
      }
      chunk = word;
    } else {
      chunk = chunk ? `${chunk} ${word}` : word;
    }
  }
  if (chunk.trim().length >= minLen) {
    chunks.push(chunk.trim());
  }
  return chunks.length > 0 ? chunks : [text];
}

function extractCoveragePointsFromArticle(articleText: string, maxPoints: number): string[] {
  const rawLines = articleText
    .split(/\r?\n/)
    .map((line) => normalizeCoverageText(line))
    .filter((line) => line.length >= 18);

  const linePoints = rawLines
    .filter((line) => !/^(title|บทนำ|introduction)\s*[:\-]/i.test(line))
    .flatMap((line) => splitLongTextAtSpaces(line, 120, 18))
    .slice(0, maxPoints * 2);

  const sentencePoints = articleText
    .replace(/\r/g, " ")
    .split(/[.!?。！？\n]+/)
    .map((sentence) => normalizeCoverageText(sentence))
    .filter((sentence) => sentence.length >= 24)
    .flatMap((sentence) => splitLongTextAtSpaces(sentence, 120, 18))
    .slice(0, maxPoints * 2);

  const merged = [...linePoints, ...sentencePoints];
  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const point of merged) {
    const key = point.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(point);
    }
    if (deduped.length >= maxPoints) {
      break;
    }
  }
  return deduped;
}

function tokenizeCoverage(value: string): string[] {
  const matches = value
    .toLowerCase()
    .match(/[a-z0-9\u0e00-\u0e7f]{2,}/g);
  if (!matches) {
    return [];
  }
  return matches.filter((token) => token.length >= 2);
}

interface SlideCoverageStats {
  score: number;
  coveredPoints: number;
  totalPoints: number;
  avgBulletsPerSlide: number;
}

export function assessSlideCoverage(
  articleText: string,
  slides: AIPresentationSlide[],
): SlideCoverageStats {
  if (slides.length === 0) {
    return { score: 0, coveredPoints: 0, totalPoints: 0, avgBulletsPerSlide: 0 };
  }

  const coveragePoints = extractCoveragePointsFromArticle(
    articleText,
    Math.max(slides.length * 3, 8),
  );
  if (coveragePoints.length === 0) {
    const totalBullets = slides.reduce((sum, slide) => sum + slide.body.length, 0);
    return {
      score: 1,
      coveredPoints: 0,
      totalPoints: 0,
      avgBulletsPerSlide: totalBullets / slides.length,
    };
  }

  const slideTokenSets = slides.map((slide) => {
    const sectionText = (slide.sections ?? [])
      .map((section) => `${section.heading} ${section.details.join(" ")}`)
      .join(" ");
    return new Set(tokenizeCoverage(`${slide.title} ${slide.body.join(" ")} ${sectionText}`));
  });

  let coveredPoints = 0;
  for (const point of coveragePoints) {
    const pointTokens = tokenizeCoverage(point);
    if (pointTokens.length === 0) {
      continue;
    }
    const uniquePointTokens = Array.from(new Set(pointTokens));
    let isCovered = false;
    for (const slideTokens of slideTokenSets) {
      let overlap = 0;
      for (const token of uniquePointTokens) {
        if (slideTokens.has(token)) {
          overlap += 1;
        }
      }
      const overlapRatio = overlap / uniquePointTokens.length;
      if (overlap >= 2 || overlapRatio >= 0.34) {
        isCovered = true;
        break;
      }
    }
    if (isCovered) {
      coveredPoints += 1;
    }
  }

  const totalBullets = slides.reduce((sum, slide) => sum + slide.body.length, 0);
  return {
    score: coveragePoints.length > 0 ? coveredPoints / coveragePoints.length : 1,
    coveredPoints,
    totalPoints: coveragePoints.length,
    avgBulletsPerSlide: totalBullets / slides.length,
  };
}

function topUpSlideBodiesFromArticle(
  articleText: string,
  slides: AIPresentationSlide[],
): AIPresentationSlide[] {
  const coveragePoints = extractCoveragePointsFromArticle(
    articleText,
    Math.max(slides.length * 4, 12),
  );
  if (coveragePoints.length === 0) {
    return slides;
  }

  const used = new Set<string>();
  const perSlideCandidates = slides.map((_, index) => {
    const start = Math.floor((index * coveragePoints.length) / slides.length);
    const end = Math.floor(((index + 1) * coveragePoints.length) / slides.length);
    return coveragePoints.slice(start, Math.max(start + 1, end));
  });

  return slides.map((slide, index) => {
    const normalizedBody = slide.body
      .map((line) => normalizeCoverageText(line))
      .filter((line) => line.length > 0)
      .slice(0, 8);

    const bodySet = new Set(normalizedBody.map((line) => line.toLowerCase()));
    const titleTokens = new Set(tokenizeCoverage(slide.title));
    const maxBody = slide.templateId === "hero_center" ? 5 : 7;
    const minBody = slide.templateId === "hero_center" ? 2 : 3;

    function tryAppendCandidate(candidate: string): boolean {
      const normalized = normalizeCoverageText(candidate);
      if (normalized.length < 14 || normalized.length > 240) {
        return false;
      }
      const key = normalized.toLowerCase();
      if (bodySet.has(key) || used.has(key)) {
        return false;
      }
      bodySet.add(key);
      used.add(key);
      normalizedBody.push(normalized);
      return true;
    }

    while (normalizedBody.length < minBody && normalizedBody.length < maxBody) {
      const localCandidates = [...perSlideCandidates[index], ...coveragePoints];
      let bestCandidate: string | null = null;
      let bestScore = -1;
      for (const candidate of localCandidates) {
        const normalized = normalizeCoverageText(candidate);
        if (normalized.length === 0) {
          continue;
        }
        const key = normalized.toLowerCase();
        if (bodySet.has(key) || used.has(key)) {
          continue;
        }
        const candidateTokens = tokenizeCoverage(normalized);
        let score = 0;
        for (const token of candidateTokens) {
          if (titleTokens.has(token)) {
            score += 2;
          }
        }
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = normalized;
        }
      }
      if (!bestCandidate || !tryAppendCandidate(bestCandidate)) {
        break;
      }
    }

    if (normalizedBody.length === 0) {
      normalizedBody.push(`Key point ${index + 1}`);
    }

    return {
      ...slide,
      body: normalizedBody.slice(0, maxBody),
    };
  });
}

// ── Public Functions ───────────────────────────────────────

export function estimateCreditCost(numSlides: number, includeAudio = false): number {
  const basePerSlide = CREDIT_IMAGE_SKILL + CREDIT_IMAGE_GEN + (includeAudio ? CREDIT_AUDIO_GEN : 0);
  const base = CREDIT_ARTICLE + CREDIT_SPLIT + (basePerSlide * numSlides);
  return Math.round(base * CREDIT_BUFFER_MULTIPLIER);
}

export function buildArticlePrompt(
  topic: string,
  language: string,
  numSlides: number,
  skillParams?: Record<string, unknown>,
): string {
  const requestedLanguage = resolveArticleLanguagePreference(language, skillParams);
  const langInstruction =
    requestedLanguage === "auto"
      ? "Write in the same language as the topic. If the topic is in Thai, write in Thai. If in English, write in English."
      : requestedLanguage === "th"
        ? "Write the entire article in Thai."
        : "Write the entire article in English.";

  let paramSection = "";
  if (skillParams && Object.keys(skillParams).length > 0) {
    const lines = Object.entries(skillParams)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
    if (lines.length > 0) {
      paramSection = `\n\nAdditional parameters provided by the user:\n${lines.join("\n")}`;
    }
  }

  const wordPlan = buildArticleWordPlan(topic, language, numSlides, skillParams);
  const wordPlanLines = [
    `- Slide-based recommendation (${numSlides} slides): around ${wordPlan.slideRecommendedWords} words total.`,
    `- Target draft length: around ${wordPlan.targetWords} words.`,
    `- Suggested section size: around ${wordPlan.perSectionWords} words per section.`,
  ];
  if (wordPlan.lengthPreset) {
    wordPlanLines.push(
      `- Length preset "${wordPlan.lengthPreset}" detected. Keep behavior consistent with this preset unless constraints conflict.`,
    );
  }
  if (wordPlan.hardMaxWords) {
    wordPlanLines.push(
      `- STRICT LIMIT: The article MUST NOT exceed ${wordPlan.hardMaxWords} words.`,
    );
  }

  return `Write a well-structured article about: ${topic}

${langInstruction}

The article will be split into approximately ${numSlides} presentation slides, so organize the content into ${numSlides} clearly numbered sections. Each section should cover one main idea and be 2-4 sentences long.

Word planning instructions:
${wordPlanLines.join("\n")}

Include a clear, descriptive title at the top.${paramSection}`;
}

// ── Main Pipeline ──────────────────────────────────────────

export async function generateAIDraft(
  input: GenerateAIDraftInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void> {
  const redis = getRedisClient();
  const progressKey = `ai_draft_progress:${taskId}`;
  const lockKey = `ai_draft_lock:${actor.userId}`;
  const cancelKey = `ai_draft_cancel:${taskId}`;
  const warnings: string[] = [];
  const requestedTextModel = input.textModel?.trim() || undefined;
  let latestProgress: (AIDraftProgress & { userId: number }) | null = null;

  function buildProgressDiagnostics(partial?: Partial<NonNullable<AIDraftProgress["diagnostics"]>>): NonNullable<AIDraftProgress["diagnostics"]> {
    return {
      taskId,
      ...(latestProgress?.diagnostics ?? {}),
      ...(partial ?? {}),
    };
  }

  async function updateProgress(partial: Partial<AIDraftProgress>): Promise<void> {
    const progress: AIDraftProgress & { userId: number } = {
      ...(latestProgress ?? {}),
      userId: actor.userId,
      phase: 0,
      phaseLabel: "Initializing...",
      slidesCompleted: 0,
      totalSlides: input.numSlides,
      slidePreview: [],
      completed: false,
      updatedAt: new Date().toISOString(),
      diagnostics: latestProgress?.diagnostics ?? buildProgressDiagnostics(),
      ...partial,
    };
    latestProgress = progress;
    await redis.set(progressKey, JSON.stringify(progress), "EX", PROGRESS_TTL_SECONDS);
  }

  async function refreshProgressHeartbeat(): Promise<void> {
    if (!latestProgress || latestProgress.completed) {
      return;
    }
    latestProgress = {
      ...latestProgress,
      updatedAt: new Date().toISOString(),
    };
    await redis.set(progressKey, JSON.stringify(latestProgress), "EX", PROGRESS_TTL_SECONDS);
  }

  async function isCancelled(): Promise<boolean> {
    const val = await redis.get(cancelKey);
    return val !== null;
  }

  async function setCancelled(): Promise<void> {
    await updateProgress({
      completed: true,
      cancelled: true,
      phaseLabel: "Cancelled",
    });
  }

  function isCancellationError(error: unknown): error is AIDraftCancelledError {
    return error instanceof AIDraftCancelledError;
  }

  async function awaitUntilCancellable<T>(
    promise: Promise<T>,
    label: string,
  ): Promise<T> {
    let stopped = false;
    const cancellationWatcher = (async () => {
      while (!stopped) {
        if (await isCancelled()) {
          throw new AIDraftCancelledError(label);
        }
        await sleep(AI_DRAFT_CANCEL_POLL_INTERVAL_MS);
      }
      throw new Error("cancellation_watcher_stopped");
    })();

    try {
      return await Promise.race([promise, cancellationWatcher]);
    } finally {
      stopped = true;
    }
  }

  async function awaitDraftStep<T>(
    promise: Promise<T>,
    config: DraftAwaitConfig,
  ): Promise<T> {
    const progressHeartbeatIntervalMs = resolveAIDraftProgressHeartbeatIntervalMs();
    const heartbeat = progressHeartbeatIntervalMs > 0
      ? setInterval(() => {
          refreshProgressHeartbeat().catch(() => {});
        }, progressHeartbeatIntervalMs)
      : null;
    try {
      return await awaitUntilCancellable(
        withTimeout(promise, config.timeoutMs, config.timeoutLabel),
        config.cancelLabel,
      );
    } finally {
      if (heartbeat) {
        clearInterval(heartbeat);
      }
    }
  }

  async function refreshLockIfOwned(): Promise<void> {
    const owner = await redis.get(lockKey);
    if (owner === taskId) {
      await redis.expire(lockKey, LOCK_TTL_SECONDS);
    }
  }

  async function releaseLockIfOwned(): Promise<void> {
    const owner = await redis.get(lockKey);
    if (owner === taskId) {
      await redis.del(lockKey);
    }
  }

  // ── Heartbeat ─────────────────────────────────────────
  const heartbeat = setInterval(() => {
    refreshLockIfOwned().catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);

  try {
    // Sanitize user inputs
    const sanitizedPrompt = input.prompt.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 1000);
    const sanitizedCustomArticleText = input.customArticleText
      ?.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "")
      .trim();
    const sanitizedImagePromptContext = sanitizePromptContext(input.imagePromptContext);
    const normalizedReferenceImageUrls = normalizeReferenceImageUrls(input.referenceImageUrls);
    const normalizedWatermark = normalizeWatermarkInput(input.watermark, warnings);
    const canvasWidth = sanitizeCanvasDimension(input.canvasWidth) ?? DEFAULT_CANVAS_WIDTH;
    const canvasHeight = sanitizeCanvasDimension(input.canvasHeight) ?? DEFAULT_CANVAS_HEIGHT;
    const canvasAspectRatio = toAspectRatio(canvasWidth, canvasHeight);
    const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];
    const requestedImageModel = input.imageModel?.trim();
    const primaryDraftSkillId = input.draftSkillId?.trim() || input.articleSkillId?.trim() || undefined;
    const primaryDraftSkillParams = input.draftSkillParams ?? input.articleSkillParams;
    const primaryDraftSkill = primaryDraftSkillId
      ? await getSkillByIdAsync(primaryDraftSkillId)
      : undefined;
    const primaryDraftSkillCapability = classifyDraftSkillCapability(primaryDraftSkill);

    // Load explicit media skill early to determine media type (image vs video)
    const explicitImageSkill = input.imageSkillId
      ? await getSkillByIdAsync(input.imageSkillId)
      : undefined;
    const effectiveMediaSkill = explicitImageSkill
      ?? (shouldUseDraftSkillForMedia(primaryDraftSkill) ? primaryDraftSkill : undefined);
    const isVideoSkill = getDraftSkillMediaType(effectiveMediaSkill) === "video";
    const mediaModelQueryType = isVideoSkill ? "video" : "image";

    const availableImageModels = await getModelsByTypeAsync(mediaModelQueryType);
    const textToImageModels = isVideoSkill ? [] : availableImageModels.filter(isTextToImageModel);
    const requestedModelMatch = requestedImageModel
      ? availableImageModels.find((model) => model.id === requestedImageModel)
      : undefined;

    let selectedImageModel =
      requestedModelMatch
      ?? (isVideoSkill ? availableImageModels[0] : (textToImageModels[0] ?? availableImageModels[0]));

    if (requestedImageModel && !requestedModelMatch) {
      warnings.push(
        `${isVideoSkill ? "Video" : "Image"} model "${requestedImageModel}" not found; using "${selectedImageModel?.id ?? (isVideoSkill ? FALLBACK_VIDEO_MODEL : FALLBACK_IMAGE_MODEL)}"`,
      );
    }

    if (!isVideoSkill && selectedImageModel && !isTextToImageModel(selectedImageModel) && textToImageModels[0]) {
      const generateType = String((selectedImageModel.configJson as Record<string, unknown> | undefined)?.generateType || "unknown");
      warnings.push(
        `Image model "${selectedImageModel.id}" uses generateType "${generateType}" and is not text-to-image; using "${textToImageModels[0].id}" instead`,
      );
      selectedImageModel = textToImageModels[0];
    }

    const imageModelToUse: ImageModel = (
      selectedImageModel?.id
      || (isVideoSkill ? FALLBACK_VIDEO_MODEL : FALLBACK_IMAGE_MODEL)
    ) as ImageModel;
    const mediaApiConfig = buildImageApiConfig(selectedImageModel);
    const imageAspectRatio = selectAspectRatioForModel(
      canvasAspectRatio,
      selectedImageModel?.aspectRatios,
    );
    if (imageAspectRatio !== canvasAspectRatio) {
      warnings.push(
        `${isVideoSkill ? "Video" : "Image"} model "${imageModelToUse}" does not list aspect ratio "${canvasAspectRatio}"; using "${imageAspectRatio}"`,
      );
    }
    const userSelectedExtraParams = sanitizeRequestedModelExtraParams(
      input.mediaModelExtraParams,
      selectedImageModel,
    );
    // Merge media skill params (from skill dynamic form) into extra params.
    // These are user-selected overrides from the skill's ui.schema (e.g., duration, resolution).
    // Only include non-sentinel values; "auto"/empty values use model defaults.
    const skillDerivedExtraParams: Record<string, unknown> = {};
    if (input.mediaSkillParams) {
      for (const [k, v] of Object.entries(input.mediaSkillParams)) {
        if (v !== undefined && v !== null && v !== "" && v !== "auto" && v !== false && v !== "none") {
          skillDerivedExtraParams[k] = v;
        }
      }
    }
    // Base extra params: field defaults + skill params + user-selected advanced params + sync targets.
    // Prompt sync is applied per-slide (see below) since the prompt varies per slide.
    const mediaExtraParams = applyFieldSyncTargets(
      mergeExtraParams(
        mergeExtraParams(
          buildImageExtraParams(selectedImageModel),
          skillDerivedExtraParams,
        ),
        userSelectedExtraParams,
      ),
      selectedImageModel,
      { referenceImageUrls: normalizedReferenceImageUrls, aspectRatio: imageAspectRatio },
    );
    const selectedVideoDuration = isVideoSkill
      ? selectVideoDuration(selectedImageModel, mediaExtraParams)
      : undefined;
    const shouldGenerateAudio = Boolean(input.generateAudio);
    const requestedAudioModel = input.audioModel?.trim();
    const availableAudioModels = shouldGenerateAudio
      ? await getModelsByTypeAsync("audio")
      : [];
    const requestedAudioModelMatch = requestedAudioModel
      ? availableAudioModels.find((model) => model.id === requestedAudioModel)
      : undefined;
    const selectedAudioModel = shouldGenerateAudio
      ? (requestedAudioModelMatch ?? availableAudioModels[0])
      : undefined;
    if (shouldGenerateAudio && requestedAudioModel && !requestedAudioModelMatch) {
      warnings.push(
        `Audio model "${requestedAudioModel}" not found; using "${selectedAudioModel?.id ?? FALLBACK_AUDIO_MODEL}"`,
      );
    }
    const audioModelToUse = selectedAudioModel?.id || FALLBACK_AUDIO_MODEL;
    const audioApiConfig = shouldGenerateAudio
      ? buildImageApiConfig(selectedAudioModel)
      : undefined;
    const userSelectedAudioExtraParams = shouldGenerateAudio
      ? sanitizeRequestedModelExtraParams(input.audioModelExtraParams, selectedAudioModel)
      : undefined;
    const audioExtraParams = shouldGenerateAudio
      ? mergeExtraParams(
          buildImageExtraParams(selectedAudioModel),
          userSelectedAudioExtraParams,
        )
      : undefined;

    // ── Credit pre-check (UX fast-fail; actual deductions happen in downstream LLM/media services)
    const estimatedCost = estimateCreditCost(input.numSlides, shouldGenerateAudio);
    const hasCredits = await hasEnoughCredits(actor.userId, estimatedCost);
    if (!hasCredits) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS,
          message: "Insufficient credits for AI presentation generation",
        },
      });
      return;
    }

    // ── Planner: create one task_run for the entire presentation ──
    const plannerResult = await runPlanner({
      sourceType: "presentation",
      userId: actor.userId,
      tenantId: actor.tenantId,
      conversationModel: await resolveDefaultTextModel(),
      skillSlug: "ai-presentation",
    }).catch(() => null);
    const taskRunId = plannerResult?.taskRunId;

    // ── Phase 1: Draft Source Preparation ────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    const shouldPlanSlidesDirectlyFromTopic =
      !input.useCustomArticle && primaryDraftSkillCapability !== "article";
    const shouldPreferVisibleNotesForAutoTopic =
      shouldPlanSlidesDirectlyFromTopic
      || (
        !input.useCustomArticle
        && Boolean(input.draftSkillId?.trim())
        && !input.articleSkillId?.trim()
      );

    let articleText = "";
    let articleModel = await resolveRoutableTextModel(
      requestedTextModel ?? await resolveDefaultTextModel(),
    );
    let articlePreferredProviderId: number | undefined;
    let articleStrictProviderPin = false;

    if (input.useCustomArticle && sanitizedCustomArticleText) {
      await updateProgress({
        phase: 1,
        phaseLabel: "Using provided article...",
        phaseDetail: "Preparing slide structure from the article you provided.",
        diagnostics: buildProgressDiagnostics({
          operation: "article_provided",
          model: articleModel,
          startedAt: new Date().toISOString(),
          deadlineAt: new Date(Date.now() + resolveAIDraftStructuredTimeoutMs()).toISOString(),
        }),
      });
      auditLogger.log({
        traceId: taskId,
        timestamp: new Date().toISOString(),
        eventType: "skill_execute",
        userId: actor.userId,
        requestPayload: {
          phase: 1,
          stage: "article_provided",
          topic: sanitizedPrompt,
          approxWords: countApproxWords(sanitizedCustomArticleText),
        },
      });
      articleText = sanitizedCustomArticleText;
      articleModel = await resolveRoutableTextModel(
        requestedTextModel ?? await resolveDefaultTextModel(),
      );
    } else if (shouldPlanSlidesDirectlyFromTopic) {
      if (!primaryDraftSkillId || !primaryDraftSkill) {
        await updateProgress({
          completed: true,
          error: {
            code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
            message: `Draft skill not found: ${primaryDraftSkillId ?? "unknown"}`,
          },
        });
        return;
      }
      if (primaryDraftSkillCapability === "unknown") {
        await updateProgress({
          completed: true,
          error: {
            code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
            message: `Draft skill "${primaryDraftSkillId}" is not supported for Draft with AI`,
          },
        });
        return;
      }

      await updateProgress({
        phase: 1,
        phaseLabel: "Planning slides from topic...",
        phaseDetail: "Choosing a slide structure directly from your topic.",
        diagnostics: buildProgressDiagnostics({
          operation: "topic_to_slide_plan_prepare",
          model: articleModel,
          startedAt: new Date().toISOString(),
          deadlineAt: new Date(Date.now() + resolveAIDraftStructuredTimeoutMs()).toISOString(),
        }),
      });
      auditLogger.log({
        traceId: taskId,
        timestamp: new Date().toISOString(),
        eventType: "skill_execute",
        userId: actor.userId,
        requestPayload: {
          phase: 1,
          stage: "topic_to_slide_plan",
          skillId: primaryDraftSkillId,
          mode: primaryDraftSkillCapability,
          topic: sanitizedPrompt,
        },
      });
      articlePreferredProviderId = primaryDraftSkill.preferredProviderId;
      articleStrictProviderPin = Boolean(primaryDraftSkill.strictProviderPin);
      articleModel = await resolveRoutableTextModel(
        requestedTextModel ?? (
          primaryDraftSkill.systemPrompt
          ? resolveSkillModel(primaryDraftSkill)
          : getDefaultTextModelSync()
        ),
        articlePreferredProviderId,
        articleStrictProviderPin,
      );
      articleText = sanitizedPrompt;
    } else {
      await updateProgress({
        phase: 1,
        phaseLabel: "Writing article...",
        phaseDetail: "Generating a source article before splitting it into slides.",
        diagnostics: buildProgressDiagnostics({
          operation: "article_generation",
          model: articleModel,
          startedAt: new Date().toISOString(),
          deadlineAt: new Date(Date.now() + resolveAIDraftTextTimeoutMs()).toISOString(),
        }),
      });

      auditLogger.log({
        traceId: taskId,
        timestamp: new Date().toISOString(),
        eventType: "skill_execute",
        userId: actor.userId,
        requestPayload: { phase: 1, skillId: primaryDraftSkillId, topic: sanitizedPrompt },
      });

      // Skills are system-level (filesystem-based), already validated by Zod in router.
      // No per-user scoping needed — all enabled skills are visible to all users.
      const articleSkill = primaryDraftSkill;
      if (!articleSkill?.systemPrompt) {
        await updateProgress({
          completed: true,
          error: {
            code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
            message: `Article skill not found: ${primaryDraftSkillId ?? "unknown"}`,
          },
        });
        return;
      }
      articlePreferredProviderId = articleSkill.preferredProviderId;
      articleStrictProviderPin = Boolean(articleSkill.strictProviderPin);
      articleModel = await resolveRoutableTextModel(
        requestedTextModel ?? resolveSkillModel(articleSkill),
        articlePreferredProviderId,
        articleStrictProviderPin,
      );

      const articlePrompt = buildArticlePrompt(
        sanitizedPrompt,
        input.language,
        input.numSlides,
        primaryDraftSkillParams,
      );

      try {
        articleText = await awaitDraftStep(invokeSkillTextLLM({
          model: articleModel,
          systemPrompt: articleSkill.systemPrompt,
          userPrompt: articlePrompt,
          userId: actor.userId,
          tenantId: actor.tenantId,
          preferredProviderId: articlePreferredProviderId,
          strictProviderPin: articleStrictProviderPin,
          billingContext: {
            description: `AI Draft article generation (Deck #${input.deckId})`,
            taskId,
            deckId: input.deckId,
            phase: 1,
            stage: "article_generation",
            promptPreview: articlePrompt.slice(0, 500),
          },
          taskRunId,
          plannerPlan: plannerResult?.plan,
          plannerSnapshot: plannerResult?.snapshot,
        }), {
          cancelLabel: "article_generation_cancelled",
          timeoutLabel: "article_generation_timeout",
          timeoutMs: resolveAIDraftTextTimeoutMs(),
        });
      } catch (err) {
        if (isCancellationError(err)) {
          await setCancelled();
          return;
        }
        const sanitizedError = sanitizeErrorMessage(err);
        auditLogger.log({
          traceId: taskId,
          timestamp: new Date().toISOString(),
          eventType: "skill_execute",
          userId: actor.userId,
          responsePayload: {
            phase: "error",
            stage: "article_generation",
            model: articleModel,
            preferredProviderId: articlePreferredProviderId ?? null,
            strictProviderPin: articleStrictProviderPin,
            errorMessage: sanitizedError,
          },
        });
        await updateProgress({
          completed: true,
          error: {
            code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
            message: formatArticleGenerationError(err),
          },
        });
        return;
      }
    }

    const explicitWordLimit = shouldPlanSlidesDirectlyFromTopic
      ? null
      : resolveExplicitWordCount(primaryDraftSkillParams);
    if (explicitWordLimit && articleText) {
      const originalWordCount = countApproxWords(articleText);
      if (originalWordCount > explicitWordLimit) {
        articleText = trimToMaxWords(articleText, explicitWordLimit);
        warnings.push(
          `Applied explicit article word limit: ${explicitWordLimit} words (original ${originalWordCount}).`,
        );
      }
    }

    // ── Phase 2: Slide Planning / Split ───────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({
      phase: 2,
      phaseLabel: shouldPlanSlidesDirectlyFromTopic
        ? "Structuring slides from topic..."
        : "Splitting into slides...",
      phaseDetail: shouldPlanSlidesDirectlyFromTopic
        ? `Waiting for ${articleModel} to return structured slide JSON from your topic.`
        : `Waiting for ${articleModel} to split the generated article into structured slides.`,
      diagnostics: buildProgressDiagnostics({
        operation: shouldPlanSlidesDirectlyFromTopic ? "topic_to_slide_plan" : "article_split",
        model: articleModel,
        attempt: 1,
        maxAttempts: 2,
        startedAt: new Date().toISOString(),
        deadlineAt: new Date(Date.now() + resolveAIDraftStructuredTimeoutMs()).toISOString(),
      }),
    });

    let slides: AIPresentationSlide[];
    try {
      if (shouldPlanSlidesDirectlyFromTopic) {
        const planResult = await awaitDraftStep(callLLMStructured({
          systemPrompt: TOPIC_TO_SLIDES_SYSTEM_PROMPT,
          userMessage: buildTopicToSlidesUserPrompt(
            sanitizedPrompt,
            input.numSlides,
            input.language,
            primaryDraftSkillCapability,
            primaryDraftSkillParams,
          ),
          model: articleModel,
          preferredProviderId: articlePreferredProviderId,
          strictProviderPin: articleStrictProviderPin,
          zodSchema: LenientAIPresentationSchema,
          userId: actor.userId,
          tenantId: actor.tenantId,
          billingDescription: `AI Draft topic-to-slide planning (Deck #${input.deckId})`,
          billingMetadata: {
            operation: "ai_draft_topic_to_slide_plan",
            taskId,
            deckId: input.deckId,
            phase: 2,
            stage: "topic_to_slide_plan",
            promptPreview: sanitizedPrompt.slice(0, 500),
          },
        }), {
          cancelLabel: "topic_to_slide_plan_cancelled",
          timeoutLabel: "topic_to_slide_plan_timeout",
          timeoutMs: resolveAIDraftStructuredTimeoutMs(),
        });
        slides = normalizeSlidesToRequestedCount(repairPlannedSlides(planResult.data, warnings), input.numSlides, warnings)
          .map((slide) => normalizeSlideHierarchy(slide));
      } else {
        const splitArticleExcerpt = buildSlideSplitArticleExcerpt(articleText, input.numSlides, warnings);
        const splitResult = await awaitDraftStep(callLLMStructured({
          systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT,
          userMessage: buildSlideSplitUserPrompt(splitArticleExcerpt, input.numSlides),
          model: articleModel,
          preferredProviderId: articlePreferredProviderId,
          strictProviderPin: articleStrictProviderPin,
          zodSchema: LenientAIPresentationSchema,
          userId: actor.userId,
          tenantId: actor.tenantId,
          billingDescription: `AI Draft slide structuring (Deck #${input.deckId})`,
          billingMetadata: {
            operation: "ai_draft_slide_split",
            taskId,
            deckId: input.deckId,
            phase: 2,
            stage: "slide_split",
            promptPreview: splitArticleExcerpt.slice(0, 500),
          },
        }), {
          cancelLabel: "article_split_cancelled",
          timeoutLabel: "article_split_timeout",
          timeoutMs: resolveAIDraftStructuredTimeoutMs(),
        });
        slides = normalizeSlidesToRequestedCount(repairPlannedSlides(splitResult.data, warnings), input.numSlides, warnings)
          .map((slide) => normalizeSlideHierarchy(slide));
      }
    } catch (err) {
      if (isCancellationError(err)) {
        await setCancelled();
        return;
      }
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
          message: formatSlidePlanningError(
            shouldPlanSlidesDirectlyFromTopic ? "Topic planning" : "Article split",
            err,
          ),
        },
      });
      return;
    }

    // Force slide 1 to hero_center
    if (slides.length > 0 && slides[0].templateId !== "hero_center") {
      slides[0] = normalizeSlideHierarchy({ ...slides[0], templateId: "hero_center" });
    }

    if (!shouldPlanSlidesDirectlyFromTopic) {
      slides = applyCanonicalArticleTextToSlides(articleText, slides);
      const coverage = assessSlideCoverage(articleText, slides);
      warnings.push(
        `Slide coverage check: ${Math.round(coverage.score * 100)}%, avg bullets ${coverage.avgBulletsPerSlide.toFixed(1)}.`,
      );
    } else if (shouldPreferVisibleNotesForAutoTopic) {
      slides = synchronizeSlideNotesWithVisibleContent(slides, "visible_only");
    }

    let slidePreview: Array<{ title: string; imageStatus: "pending" | "done" | "placeholder" }> = slides.map((slide) => ({
      title: slide.title,
      imageStatus: "pending",
    }));

    await updateProgress({
      phase: 2,
      phaseLabel: "Refining slide layouts...",
      phaseDetail: "Matching each planned slide to an editable layout recipe.",
      slidesCompleted: 0,
      totalSlides: slides.length,
      slidePreview,
      diagnostics: buildProgressDiagnostics({
        operation: "recipe_assignment",
        model: articleModel,
        startedAt: new Date().toISOString(),
      }),
    });

    const aiRecipeAssignments = assignAIComponentRecipes(slides, {
      preferVideoRecipes: isVideoSkill,
      canvasWidth,
      canvasHeight,
    });
    slides = aiRecipeAssignments.slides;
    let aiRecipeSelections = aiRecipeAssignments.selections;
    let aiRecipeCompactionResults: RecipeCompactionOutcome[] = [];
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const compactionOutcome = await compactSlideForRecipe({
        slide: slides[slideIndex]!,
        selection: aiRecipeSelections[slideIndex],
        actor,
        taskId,
        deckId: input.deckId,
        model: articleModel,
        preferredProviderId: articlePreferredProviderId,
        strictProviderPin: articleStrictProviderPin,
        awaitStep: awaitDraftStep,
        onAttempt: async ({ recipeId, compactionLevel, attempt, maxAttempts, deadlineAt }) => {
          await updateProgress({
            phase: 2,
            phaseLabel: `Refining slide layouts: ${slideIndex + 1}/${slides.length}`,
            phaseDetail: `Compacting "${slides[slideIndex]?.title ?? `Slide ${slideIndex + 1}`}" with ${recipeId} (${compactionLevel}).`,
            slidesCompleted: slideIndex,
            totalSlides: slides.length,
            slidePreview,
            diagnostics: buildProgressDiagnostics({
              operation: "recipe_compaction",
              model: articleModel,
              recipeId,
              compactionLevel,
              attempt,
              maxAttempts,
              startedAt: new Date().toISOString(),
              deadlineAt,
            }),
          });
        },
      });
      slides[slideIndex] = compactionOutcome.slide;
      aiRecipeCompactionResults.push(compactionOutcome);
      slidePreview[slideIndex] = {
        ...slidePreview[slideIndex]!,
        title: slides[slideIndex]!.title,
      };
      await updateProgress({
        phase: 2,
        phaseLabel: `Refining slide layouts: ${slideIndex + 1}/${slides.length}`,
        phaseDetail: `Finished refining "${slides[slideIndex]?.title ?? `Slide ${slideIndex + 1}`}".`,
        slidesCompleted: slideIndex + 1,
        totalSlides: slides.length,
        slidePreview,
        diagnostics: buildProgressDiagnostics({
          operation: "recipe_compaction_complete",
          model: articleModel,
          startedAt: new Date().toISOString(),
        }),
      });
    }
    await updateProgress({
      phase: 2,
      phaseLabel: "Resolving dense slides...",
      phaseDetail: "Applying overflow fallback rules for slides that remain too dense.",
      slidesCompleted: 0,
      totalSlides: slides.length,
      slidePreview,
      diagnostics: buildProgressDiagnostics({
        operation: "overflow_fallback_scan",
        model: articleModel,
        startedAt: new Date().toISOString(),
      }),
    });
    const overflowFallbackResolution = await applyOverflowFallbacks({
      slides,
      selections: aiRecipeSelections,
      compactionResults: aiRecipeCompactionResults,
      actor,
      taskId,
      deckId: input.deckId,
      model: articleModel,
      preferredProviderId: articlePreferredProviderId,
      strictProviderPin: articleStrictProviderPin,
      awaitStep: awaitDraftStep,
      onCompactionAttempt: async ({ slideIndex, slideTitle, recipeId, compactionLevel, attempt, maxAttempts, deadlineAt }) => {
        await updateProgress({
          phase: 2,
          phaseLabel: `Resolving dense slides: ${Math.min(slideIndex + 1, slides.length)}/${slides.length}`,
          phaseDetail: `Retrying dense slide "${slideTitle}" with ${recipeId} (${compactionLevel}).`,
          slidesCompleted: slideIndex,
          totalSlides: slides.length,
          slidePreview,
          diagnostics: buildProgressDiagnostics({
            operation: "overflow_recipe_compaction",
            model: articleModel,
            recipeId,
            compactionLevel,
            attempt,
            maxAttempts,
            startedAt: new Date().toISOString(),
            deadlineAt,
          }),
        });
      },
    });
    slides = overflowFallbackResolution.slides;
    aiRecipeSelections = overflowFallbackResolution.selections;
    aiRecipeCompactionResults = overflowFallbackResolution.compactionResults;
    if (shouldPreferVisibleNotesForAutoTopic) {
      slides = synchronizeSlideNotesWithVisibleContent(slides, "visible_only");
    }
    const aiRecipeFallbackMetadata = overflowFallbackResolution.fallbackMetadata;
    slidePreview = slides.map((slide) => ({
      title: slide.title,
      imageStatus: "pending",
    }));
    await updateProgress({
      phase: 2,
      phaseLabel: "Applying advanced layouts...",
      phaseDetail: "Checking for bounded board layouts and visual-first slide modes.",
      slidesCompleted: 0,
      totalSlides: slides.length,
      slidePreview,
      diagnostics: buildProgressDiagnostics({
        operation: "advanced_layout_modes",
        model: articleModel,
        startedAt: new Date().toISOString(),
      }),
    });
    const advancedModeResolution = await resolveAdvancedLayoutModes({
      slides,
      selections: aiRecipeSelections,
      actor,
      taskId,
      deckId: input.deckId,
      model: articleModel,
      canvasWidth,
      canvasHeight,
      preferredProviderId: articlePreferredProviderId,
      strictProviderPin: articleStrictProviderPin,
      awaitStep: awaitDraftStep,
      onLayoutDslAttempt: async ({ slideIndex, slideTitle, attempt, maxAttempts, deadlineAt }) => {
        await updateProgress({
          phase: 2,
          phaseLabel: `Applying advanced layouts: ${slideIndex + 1}/${slides.length}`,
          phaseDetail: `Generating bounded layout JSON for "${slideTitle}" (attempt ${attempt}/2).`,
          slidesCompleted: slideIndex,
          totalSlides: slides.length,
          slidePreview,
          diagnostics: buildProgressDiagnostics({
            operation: "layout_dsl",
            model: articleModel,
            attempt,
            maxAttempts,
            startedAt: new Date().toISOString(),
            deadlineAt,
          }),
        });
      },
    });
    slides = advancedModeResolution.slides;
    const aiAdvancedModeMetadata = advancedModeResolution.metadata;
    for (let slideIndex = 0; slideIndex < slides.length; slideIndex += 1) {
      const selection = aiRecipeSelections[slideIndex];
      if (!selection) {
        continue;
      }
      const profile = buildPresentationContentProfile(slides[slideIndex]!);
      logLayoutTelemetryEvent(
        actor,
        taskId,
        buildModeSelectedEvent({
          deckId: input.deckId,
          slideIndex,
          selectedMode: aiAdvancedModeMetadata[slideIndex]?.mode ?? selection.mode,
          recommendedMode: selection.recommendedMode,
          candidateModes: selection.candidateModes,
          enabledModes: {
            structured_block: true,
            long_form_block: true,
            llm_layout_dsl: isPresentationLayoutDslEnabled(),
            full_slide_media: isPresentationFullSlideMediaEnabled(),
          },
          contentMetrics: {
            totalChars: profile.totalChars,
            paragraphCount: profile.paragraphCount,
            sectionCount: profile.sectionCount,
            denseTextCandidate: profile.denseTextCandidate,
            visualFirstCandidate: profile.visualFirstCandidate,
          },
        }),
      );
    }
    // Build slide preview
    slidePreview = slides.map((s) => ({
      title: s.title,
      imageStatus: "pending" as const,
    }));

    await updateProgress({
      phase: 2,
      phaseLabel: "Slides structured",
      totalSlides: slides.length,
      slidePreview,
      diagnostics: buildProgressDiagnostics({
        operation: "slides_structured",
        model: articleModel,
        startedAt: new Date().toISOString(),
      }),
    });

    // ── Phase 3+4: Media Enhancement + Generation ─────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 3, phaseLabel: isVideoSkill ? "Generating videos..." : "Generating images..." });
    const mediaPollTimeoutMs = isVideoSkill
      ? computeVideoPollTimeoutMs(input.numSlides)
      : computeImagePollTimeoutMs(input.numSlides);
    const mediaActiveGraceMs = isVideoSkill
      ? Math.min(
          VIDEO_POLL_ACTIVE_GRACE_MAX_MS,
          VIDEO_POLL_ACTIVE_GRACE_BASE_MS + (Math.max(1, Math.round(input.numSlides)) * VIDEO_POLL_ACTIVE_GRACE_PER_SLIDE_MS),
        )
      : 0;

    // Use explicit or implicit media skill (already fetched above for media type detection)
    let imageSkillSystemPrompt: string | null = null;
    let imageSkillModel = getDefaultTextModelSync();
    let imageSkillPreferredProviderId: number | undefined;
    let imageSkillStrictProviderPin: boolean | undefined;
    if (effectiveMediaSkill) {
      imageSkillSystemPrompt = effectiveMediaSkill.systemPrompt ?? null;
      imageSkillPreferredProviderId = effectiveMediaSkill.preferredProviderId;
      imageSkillStrictProviderPin = effectiveMediaSkill.strictProviderPin;
      imageSkillModel = await resolveRoutableTextModel(
        resolveSkillModel(effectiveMediaSkill),
        imageSkillPreferredProviderId,
        imageSkillStrictProviderPin,
      );
    }

    const mediaUrlsPerSlide: Array<Array<string | null>> = Array.from(
      { length: slides.length },
      () => [],
    );
    const imagePromptsPerSlide: MediaGenerationPlanEntry[][] = Array.from(
      { length: slides.length },
      () => [],
    );
    const slideAudioTracks: Array<AudioTrackInput | null> = new Array(slides.length).fill(null);
    const slideAudioDurationsMs: Array<number | null> = new Array(slides.length).fill(null);
    const slideVideoDurationsMs: Array<number | null> = new Array(slides.length).fill(
      isVideoSkill && selectedVideoDuration
        ? clampGeneratedSlideDurationMs(selectedVideoDuration * 1000)
        : null,
    );
    const mediaExtraParamsPerSlide: Array<Record<string, unknown> | undefined> = new Array(slides.length).fill(undefined);
    const mediaFailureReasons: Array<string | null> = new Array(slides.length).fill(null);
    const deferredMediaTasksPerSlide: DeferredMediaTaskInfo[][] = Array.from(
      { length: slides.length },
      () => [],
    );
    let mediaSlidesFinalized = 0;
    let phase4AbortError: BillingChargeError | null = null;

    const setPhase4AbortError = (err: BillingChargeError) => {
      if (!phase4AbortError) {
        phase4AbortError = err;
      }
    };
    const throwIfPhase4Aborted = () => {
      if (phase4AbortError) {
        throw phase4AbortError;
      }
    };

    // Process slides with bounded concurrency
    try {
      await mapWithConcurrency(
        slides,
        async (slide, index) => {
          throwIfPhase4Aborted();
          if (await isCancelled()) {
            mediaUrlsPerSlide[index] = [];
            return;
          }
          const advancedMode = aiAdvancedModeMetadata[index];
          if (
            advancedMode?.mode === "llm_layout_dsl"
            && advancedMode.slideContentOverride
            && !getPresentationSlideRenderableElements(advancedMode.slideContentOverride).elements.some(
              (element) => element.type === "image" || element.type === "video",
            )
          ) {
            mediaUrlsPerSlide[index] = [];
            deferredMediaTasksPerSlide[index] = [];
            slidePreview[index] = {
              ...slidePreview[index],
              imageStatus: "placeholder",
            };
            mediaSlidesFinalized += 1;
            await updateProgress({
              phase: 4,
              phaseLabel: `${isVideoSkill ? "Videos" : "Images"}: ${mediaSlidesFinalized}/${slides.length}`,
              slidesCompleted: mediaSlidesFinalized,
              totalSlides: slides.length,
              slidePreview,
            });
            return;
          }

          // Phase 3: Image prompt enhancement
          // Build a meaningful prompt from the slide's own content.
          // Cascade: imagePromptKeywords → title → body text → sections → generic fallback.
          const rawImageKeywords =
            slide.imagePromptKeywords?.trim()
            || slide.title?.trim()
            || (Array.isArray(slide.body) ? slide.body.filter(Boolean).join(". ").slice(0, 300) : "")?.trim()
            || (Array.isArray(slide.sections) ? slide.sections.map((s) => s.heading).filter(Boolean).join(". ").slice(0, 300) : "")?.trim()
            || `presentation slide ${index + 1}`;
          // Do NOT append imagePromptContext to the raw keywords yet — it will be
          // appended once after skill enhancement (or as-is when no skill is used)
          // to avoid duplicate "Additional visual requirements:" blocks.
          let imagePrompt = rawImageKeywords;

          await updateProgress({
            phase: 4,
            phaseLabel: `${isVideoSkill ? "Videos" : "Images"}: preparing ${index + 1}/${slides.length}`,
            slidesCompleted: mediaSlidesFinalized,
            totalSlides: slides.length,
            slidePreview,
          });

          if (imageSkillSystemPrompt) {
            try {
              // Enrich prompt with media skill params if provided
              let enrichedImagePrompt = rawImageKeywords;
              if (sanitizedImagePromptContext) {
                enrichedImagePrompt = appendPromptContext(enrichedImagePrompt, sanitizedImagePromptContext);
              }
              const msp = input.mediaSkillParams;
              if (msp && Object.keys(msp).length > 0) {
                const paramLines = Object.entries(msp)
                  .filter(([, v]) => v !== undefined && v !== null && v !== "" && v !== "auto" && v !== false && v !== "none")
                  .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
                if (paramLines.length > 0) {
                  enrichedImagePrompt += `\n\nUser-selected skill parameters:\n${paramLines.join("\n")}`;
                }
              }
              let skillResult = await awaitUntilCancellable(withTimeout(
                invokeSkillTextLLM({
                  model: imageSkillModel,
                  systemPrompt: imageSkillSystemPrompt,
                  userPrompt: enrichedImagePrompt,
                  userId: actor.userId,
                  tenantId: actor.tenantId,
                  preferredProviderId: imageSkillPreferredProviderId,
                  strictProviderPin: imageSkillStrictProviderPin,
                  billingContext: {
                    description: `AI Draft prompt enhancement (Deck #${input.deckId}, Slide ${index + 1}/${slides.length})`,
                    taskId,
                    deckId: input.deckId,
                    phase: 3,
                    stage: "image_prompt_enhancement",
                    slideIndex: index,
                    promptPreview: rawImageKeywords.slice(0, 500),
                  },
                  taskRunId,
                  plannerPlan: plannerResult?.plan,
                  plannerSnapshot: plannerResult?.snapshot,
                }),
                IMAGE_PROMPT_ENHANCE_TIMEOUT_MS,
                "image_prompt_enhancement_timeout",
              ), "image_prompt_enhancement_cancelled");
              // Normalize: strip JSON/markdown wrappers if the LLM returned them
              skillResult = normalizeSkillPromptOutput(skillResult);
              imagePrompt = skillResult;
            } catch (err) {
              if (isCancellationError(err)) {
                throw err;
              }
              if (err instanceof BillingChargeError) {
                setPhase4AbortError(err);
                throw err;
              }
              warnings.push(`Slide ${index + 1}: image prompt enhancement failed (${sanitizeErrorMessage(err)}), using raw keywords`);
            }
          }
          // ALWAYS append the user's imagePromptContext to the final prompt.
          // This is the user's explicit intent — it must be present on every
          // prompt sent out, regardless of whether a skill was used or not.
          // appendPromptContext already deduplicates if the text is already present.
          imagePrompt = appendPromptContext(imagePrompt, sanitizedImagePromptContext);
          const rawMediaGenerationPlan = deriveMediaGenerationPlanForSlide(slide, imagePrompt, isVideoSkill);
          // Ensure every prompt variant carries the user's imagePromptContext.
          // deriveMediaGenerationPlanForSlide may return mediaPlan prompts that
          // were generated by the LLM and don't include the user's context yet.
          const mediaGenerationPlan = sanitizedImagePromptContext
            ? rawMediaGenerationPlan.map((entry) => ({
              ...entry,
              prompt: appendPromptContext(entry.prompt, sanitizedImagePromptContext),
            }))
            : rawMediaGenerationPlan;
          imagePromptsPerSlide[index] = mediaGenerationPlan;
          const mediaApiConfigForSlide = {
            ...(mediaApiConfig ?? {}),
            trace_id: `${taskId}:slide:${index + 1}:${isVideoSkill ? "video" : "image"}`,
          };

          // Phase 4: Media generation (image or video depending on skill type)
          const resolvedMediaUrls: Array<string | null> = [];
          const deferredTasksForSlide: DeferredMediaTaskInfo[] = [];
          for (const [variantIndex, mediaPlanEntry] of mediaGenerationPlan.entries()) {
            const promptVariant = mediaPlanEntry.prompt;
            const slideExtraParams = applyFieldSyncTargets(
              mediaExtraParams,
              selectedImageModel,
              { prompt: promptVariant },
            );
            if (variantIndex === 0) {
              mediaExtraParamsPerSlide[index] = slideExtraParams;
            }
            const mediaTraceId = `${taskId}:slide:${index + 1}:variant:${variantIndex + 1}:${isVideoSkill ? "video" : "image"}:poll`;
            let resolvedMediaUrl: string | null = null;
            try {
              throwIfPhase4Aborted();
              const mediaTask = await awaitUntilCancellable(withTimeout(
                isVideoSkill
                  ? mediaGenerationService.generateVideoAsync(
                      {
                        prompt: promptVariant,
                        model: imageModelToUse as string,
                        ...(selectedVideoDuration ? { duration: selectedVideoDuration } : {}),
                        aspectRatio: imageAspectRatio,
                        ...(normalizedReferenceImageUrls.length > 0
                          ? { referenceImageUrls: normalizedReferenceImageUrls }
                          : {}),
                        ...(Object.keys(mediaApiConfigForSlide).length > 0 ? { apiConfig: mediaApiConfigForSlide } : {}),
                        ...(slideExtraParams ? { extraParams: slideExtraParams } : {}),
                        auditContext: {
                          userId: actor.userId,
                          traceId: `${taskId}:slide:${index + 1}:variant:${variantIndex + 1}:video`,
                          source: "ai_draft.generateAIDraft",
                          stage: "phase_4_media_submit",
                          deckId: input.deckId,
                          slideIndex: index,
                        },
                      },
                      userToken,
                    )
                  : mediaGenerationService.generateImageAsync(
                      {
                        prompt: promptVariant,
                        model: imageModelToUse,
                        aspectRatio: imageAspectRatio,
                        ...(normalizedReferenceImageUrls.length > 0
                          ? { referenceImageUrls: normalizedReferenceImageUrls }
                          : {}),
                        ...(Object.keys(mediaApiConfigForSlide).length > 0 ? { apiConfig: mediaApiConfigForSlide } : {}),
                        ...(slideExtraParams ? { extraParams: slideExtraParams } : {}),
                        auditContext: {
                          userId: actor.userId,
                          traceId: `${taskId}:slide:${index + 1}:variant:${variantIndex + 1}:image`,
                          source: "ai_draft.generateAIDraft",
                          stage: "phase_4_media_submit",
                          deckId: input.deckId,
                          slideIndex: index,
                        },
                      },
                      userToken,
                    ),
                MEDIA_SUBMIT_TIMEOUT_MS,
                "media_submit_timeout",
              ), "media_submit_cancelled");
              const pollResult = await awaitUntilCancellable(pollMediaTask(
                mediaTask.id,
                userToken,
                mediaPollTimeoutMs,
                {
                  activeGraceMs: mediaActiveGraceMs,
                  shouldAbort: () => Boolean(phase4AbortError),
                  auditContext: {
                    userId: actor.userId,
                    traceId: mediaTraceId,
                    source: "ai_draft.generateAIDraft",
                    stage: "phase_4_media_poll",
                    deckId: input.deckId,
                    slideIndex: index,
                  },
                },
              ), "media_poll_cancelled");
              throwIfPhase4Aborted();
              if (pollResult.task) {
                await chargeMediaCreditsForAIDraftTask({
                  userId: actor.userId,
                  tenantId: actor.tenantId,
                  deckId: input.deckId,
                  aiDraftTaskId: taskId,
                  slideIndex: index,
                  totalSlides: slides.length,
                  mediaType: isVideoSkill ? "video" : "image",
                  modelId: imageModelToUse,
                  provider: selectedImageModel?.provider,
                  promptPreview: promptVariant,
                  task: pollResult.task,
                  fallbackCredits: selectedImageModel?.creditCost
                    ?? await resolveMediaModelFallbackCreditCost(
                      imageModelToUse,
                      isVideoSkill ? "video" : "image",
                    ),
                  stage: "phase_4_media_poll",
                });
              }
              resolvedMediaUrl = pollResult.url;
              if (isVideoSkill) {
                slideVideoDurationsMs[index] = resolveGeneratedMediaDurationMs(
                  pollResult.task,
                  selectedVideoDuration,
                ) ?? slideVideoDurationsMs[index] ?? null;
              }
              if (!resolvedMediaUrl) {
                const reason = (pollResult.reason || "no output URL")
                  .replace(/\s+/g, " ")
                  .slice(0, 160);
                mediaFailureReasons[index] = reason;
                const taskRef = pollResult.task?.taskId || mediaTask.taskId || mediaTask.id;
                warnings.push(`Slide ${index + 1}: ${isVideoSkill ? "video" : "image"} generation variant ${variantIndex + 1} returned no media (${reason}) [task=${taskRef}]`);
                if (
                  pollResult.status === "timeout"
                  || pollResult.status === "pending"
                  || pollResult.status === "processing"
                ) {
                  deferredTasksForSlide.push({
                    mediaType: isVideoSkill ? "video" : "image",
                    mediaTaskId: mediaTask.id,
                    providerTaskId: mediaTask.taskId,
                    modelId: imageModelToUse,
                    prompt: promptVariant,
                    ...(mediaPlanEntry.slotId ? { slotId: mediaPlanEntry.slotId } : {}),
                    reason,
                  });
                }
              }
            } catch (err) {
              if (isCancellationError(err)) {
                throw err;
              }
              if (err instanceof BillingChargeError) {
                setPhase4AbortError(err);
                throw err;
              }
              const reason = sanitizeErrorMessage(err);
              mediaFailureReasons[index] = reason;
              warnings.push(`Slide ${index + 1}: ${isVideoSkill ? "video" : "image"} generation variant ${variantIndex + 1} failed (${reason})`);
            }
            resolvedMediaUrls.push(resolvedMediaUrl);
          }

          mediaUrlsPerSlide[index] = resolvedMediaUrls;
          deferredMediaTasksPerSlide[index] = deferredTasksForSlide;

          // Update slide preview
          slidePreview[index] = {
            ...slidePreview[index],
            imageStatus: resolvedMediaUrls.some((url) => Boolean(url)) ? "done" : "placeholder",
          };
          mediaSlidesFinalized += 1;

          await updateProgress({
            phase: 4,
            phaseLabel: `${isVideoSkill ? "Videos" : "Images"}: ${mediaSlidesFinalized}/${slides.length}`,
            slidesCompleted: mediaSlidesFinalized,
            totalSlides: slides.length,
            slidePreview,
          });
        },
        MAX_IMAGE_CONCURRENCY,
        { stopOnError: true },
      );
    } catch (err) {
      if (isCancellationError(err)) {
        await setCancelled();
        return;
      }
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Media generation failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // ── Phase 5: Slide Audio Generation (optional) ────────
    if (await isCancelled()) { await setCancelled(); return; }

    if (shouldGenerateAudio) {
      await updateProgress({ phase: 5, phaseLabel: "Generating slide audio..." });
      const audioPollTimeoutMs = computeAudioPollTimeoutMs(slides.length);
      let audioSlidesCompleted = 0;

      for (let index = 0; index < slides.length; index += 1) {
        if (await isCancelled()) { await setCancelled(); return; }
        const slide = slides[index];
        const narrationText = resolveTtsTextFromSlideNote(
          slide.notes,
          buildSlideNarrationText(slide, index, slides.length),
        );
        await updateProgress({
          phase: 5,
          phaseLabel: `Audio: preparing ${index + 1}/${slides.length}`,
          slidesCompleted: audioSlidesCompleted,
          totalSlides: slides.length,
          slidePreview,
        });

        try {
          const audioApiConfigForSlide = {
            ...(audioApiConfig ?? {}),
            trace_id: `${taskId}:slide:${index + 1}:audio`,
          };
          const audioExtraParamsForSlide = applyFieldSyncTargets(
            audioExtraParams,
            selectedAudioModel,
            { prompt: narrationText },
          );
          const audioTask = await awaitUntilCancellable(withTimeout(
            mediaGenerationService.generateAudioAsync(
              {
                text: narrationText,
                model: audioModelToUse,
                ...(Object.keys(audioApiConfigForSlide).length > 0 ? { apiConfig: audioApiConfigForSlide } : {}),
                ...(audioExtraParamsForSlide ? { extraParams: audioExtraParamsForSlide } : {}),
                auditContext: {
                  userId: actor.userId,
                  traceId: `${taskId}:slide:${index + 1}:audio`,
                  source: "ai_draft.generateAIDraft",
                  stage: "phase_5_audio_submit",
                  deckId: input.deckId,
                  slideIndex: index,
                },
              },
              userToken,
            ),
            MEDIA_SUBMIT_TIMEOUT_MS,
            "media_submit_timeout",
          ), "audio_submit_cancelled");
          const pollResult = await awaitUntilCancellable(pollMediaTask(
            audioTask.id,
            userToken,
            audioPollTimeoutMs,
            {
              auditContext: {
                userId: actor.userId,
                traceId: `${taskId}:slide:${index + 1}:audio:poll`,
                source: "ai_draft.generateAIDraft",
                stage: "phase_5_audio_poll",
                deckId: input.deckId,
                slideIndex: index,
              },
            },
          ), "audio_poll_cancelled");
          if (pollResult.task) {
            await chargeMediaCreditsForAIDraftTask({
              userId: actor.userId,
              tenantId: actor.tenantId,
              deckId: input.deckId,
              aiDraftTaskId: taskId,
              slideIndex: index,
              totalSlides: slides.length,
              mediaType: "audio",
              modelId: audioModelToUse,
              provider: selectedAudioModel?.provider,
              promptPreview: narrationText,
              task: pollResult.task,
              fallbackCredits: selectedAudioModel?.creditCost
                ?? await resolveMediaModelFallbackCreditCost(audioModelToUse, "audio"),
              stage: "phase_5_audio_poll",
            });
          }

          if (!pollResult.url || pollResult.status !== "completed") {
            const reason = (pollResult.reason || pollResult.status || "audio_generation_failed")
              .replace(/\s+/g, " ")
              .slice(0, 160);
            warnings.push(`Slide ${index + 1}: audio generation failed (${reason})`);
          } else {
            const audioTaskIdForLibrary = pollResult.task?.id || audioTask.id;
            const audioLibrary = await addMediaTaskToLibrary(
              {
                mediaTaskId: audioTaskIdForLibrary,
                userToken,
                title: `${slide.title.slice(0, 80)} narration`,
                visibility: "private",
              },
              actor,
            );
            slideAudioDurationsMs[index] =
              resolveGeneratedMediaDurationMs(pollResult.task)
              ?? estimateAudioDurationMs(narrationText);
            slideAudioTracks[index] = {
              libraryItemId: audioLibrary.itemId,
              volume: 1,
              startAtMs: 0,
              endAtMs: null,
            };
          }
        } catch (err) {
          if (isCancellationError(err)) {
            await setCancelled();
            return;
          }
          warnings.push(`Slide ${index + 1}: audio generation failed (${sanitizeErrorMessage(err)})`);
        }

        audioSlidesCompleted += 1;
        await updateProgress({
          phase: 5,
          phaseLabel: `Audio: ${audioSlidesCompleted}/${slides.length}`,
          slidesCompleted: audioSlidesCompleted,
          totalSlides: slides.length,
          slidePreview,
        });
      }
    } else {
      await updateProgress({
        phase: 5,
        phaseLabel: "Skipping slide audio",
        slidesCompleted: slides.length,
        totalSlides: slides.length,
        slidePreview,
      });
    }

    // ── Phase 6: Layout Compilation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 6, phaseLabel: "Compiling layouts..." });

    const preset = getBuiltInPreset(input.stylePresetId);
    if (!preset) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Unknown style preset: ${input.stylePresetId}`,
        },
      });
      return;
    }

    // Override footer text if provided (sanitize user input)
    const presetCopy = JSON.parse(JSON.stringify(preset));
    if (input.headerCustomText) {
      if (!presetCopy.header) {
        presetCopy.header = { enabled: false, height: 60, backgroundColor: "transparent" };
      }
      presetCopy.header.customTitle = escapeHtml(input.headerCustomText.slice(0, 200));
      presetCopy.header.showDeckTitle = true;
    }
    if (input.footerCustomText && presetCopy.footer) {
      presetCopy.footer.customText = escapeHtml(input.footerCustomText.slice(0, 200));
      presetCopy.footer.showCustomText = true;
    }

    // Apply style overrides from user (header/footer toggles)
    if (input.styleOverrides) {
      const ov = input.styleOverrides;
      if (ov.headerEnabled !== undefined) {
        if (!presetCopy.header) {
          presetCopy.header = { enabled: false, height: 60, backgroundColor: "transparent" };
        }
        presetCopy.header.enabled = ov.headerEnabled;
      }
      if (ov.showDeckTitle !== undefined && presetCopy.header) {
        presetCopy.header.showDeckTitle = ov.showDeckTitle;
      }
      if (ov.footerEnabled !== undefined) {
        if (!presetCopy.footer) {
          presetCopy.footer = { enabled: false, height: 40, backgroundColor: "transparent" };
        }
        presetCopy.footer.enabled = ov.footerEnabled;
      }
      if (ov.showPageNumber !== undefined && presetCopy.footer) {
        presetCopy.footer.showPageNumber = ov.showPageNumber;
      }
    }

    if (input.hideTextOnSlides) {
      if (presetCopy.header) {
        presetCopy.header.enabled = false;
        presetCopy.header.showDeckTitle = false;
      }
      if (presetCopy.footer) {
        presetCopy.footer.enabled = false;
        presetCopy.footer.showPageNumber = false;
        presetCopy.footer.showCustomText = false;
      }
    }

    const compiledSlides: PresentationSlideContent[] = [];
    const aiDesignGeneratedAt = new Date().toISOString();
    for (let i = 0; i < slides.length; i++) {
      const svg = pickRandomSvgFromCategory(slides[i].graphicCategory);
      const mediaUrlsForSlide = mediaUrlsPerSlide[i] ?? [];
      // Use algorithmic layout for text-dense slides, recipe layout for short/visual slides
      const slideBodyChars = slides[i].body.reduce((s, l) => s + l.length, 0);
      const slideSectionChars = (slides[i].sections ?? []).reduce(
        (s, sec) => s + sec.heading.length + sec.details.reduce((d, t) => d + t.length, 0), 0,
      );
      const useAlgorithmicLayout = (slideBodyChars + slideSectionChars) >= 200
        || (slides[i].sections?.length ?? 0) >= 3;

      let slideContent: PresentationSlideContent;
      let layoutWarnings: string[];
      if (useAlgorithmicLayout && !input.hideTextOnSlides) {
        const algoResult = buildAlgorithmicSlideLayout({
          title: slides[i].title,
          body: slides[i].body,
          sections: slides[i].sections ?? [],
          notes: slides[i].notes ?? "",
          imageUrls: mediaUrlsForSlide.filter((u): u is string => Boolean(u)),
          canvasWidth,
          canvasHeight,
          stylePreset: presetCopy,
          idPrefix: `draft-${taskId.slice(-6)}-s${i}`,
        });
        slideContent = algoResult.slideContent;
        layoutWarnings = algoResult.warnings;
      } else {
        const genResult = generateSlide({
          slideData: slides[i],
          imageUrl: mediaUrlsForSlide[0] ?? null,
          imageUrls: mediaUrlsForSlide,
          svgGraphic: svg,
          stylePreset: presetCopy,
          deckTitle: i === 0 ? sanitizedPrompt.slice(0, 36) : undefined,
          slideIndex: i,
          totalSlides: slides.length,
          canvasWidth,
          canvasHeight,
          visualOnly: input.hideTextOnSlides,
        });
        slideContent = genResult.slideContent;
        layoutWarnings = genResult.warnings;
      }
      const promptForSlide = imagePromptsPerSlide[i]?.[0]?.prompt?.trim();
      const imageModelIdForSlide = selectedImageModel?.id ?? imageModelToUse;
      const extraParamsForSlide = mediaExtraParamsPerSlide[i];
      const elementsWithMediaMetadata = slideContent.elements.map((element) => {
        if (element.type !== "image") {
          return element;
        }
        if (!element.src || !element.src.trim()) {
          // Placeholder element (no src yet) — still attach prompt/model so generation can proceed later
          return {
            ...element,
            ...(promptForSlide ? { imagePrompt: promptForSlide.slice(0, 4000) } : {}),
            ...(imageModelIdForSlide ? { imageModelId: imageModelIdForSlide } : {}),
          };
        }
        if (isVideoSkill) {
          return {
            id: element.id,
            type: "video" as const,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            ...(element.opacity !== undefined ? { opacity: element.opacity } : {}),
            ...(element.rotation !== undefined ? { rotation: element.rotation } : {}),
            src: element.src,
            title: slides[i].title,
            muted: true,
            loop: true,
            videoFit: "cover" as const,
            videoPositionX: 50,
            videoPositionY: 50,
            videoZoom: 1,
            ...(promptForSlide ? { videoPrompt: promptForSlide.slice(0, 4000) } : {}),
            ...(imageModelIdForSlide ? { videoModelId: imageModelIdForSlide } : {}),
            ...(normalizedReferenceImageUrls.length > 0
              ? { videoReferenceUrls: normalizedReferenceImageUrls }
              : {}),
            ...(extraParamsForSlide && Object.keys(extraParamsForSlide).length > 0
              ? { videoExtraParams: extraParamsForSlide }
              : {}),
          };
        }
        return {
          ...element,
          ...(promptForSlide ? { imagePrompt: promptForSlide.slice(0, 4000) } : {}),
          ...(imageModelIdForSlide ? { imageModelId: imageModelIdForSlide } : {}),
          ...(normalizedReferenceImageUrls.length > 0
            ? { imageReferenceUrls: normalizedReferenceImageUrls }
            : {}),
        };
      });
      let slideContentWithMediaMetadata = applyAIRecipeMediaMetadata(
        {
          ...slideContent,
          elements: elementsWithMediaMetadata,
        },
        {
          mediaType: isVideoSkill ? "video" : "image",
          prompt: promptForSlide,
          modelId: imageModelIdForSlide,
          referenceUrls: normalizedReferenceImageUrls,
          extraParams: extraParamsForSlide,
        },
      );
      const aiRecipeSelection = aiRecipeSelections[i];
      const aiRecipeCompaction = aiRecipeCompactionResults[i];
      const aiRecipeFallback = aiRecipeFallbackMetadata[i];
      const aiAdvancedMode = aiAdvancedModeMetadata[i];
      const deferredTasks = deferredMediaTasksPerSlide[i] ?? [];
      const pendingMediaJobs: SlidePendingMediaJob[] = [];
      if (deferredTasks.length > 0) {
        const renderable = getPresentationSlideRenderableElements(slideContentWithMediaMetadata);
        const recipeTargets = findAIRecipePendingMediaTargets(slideContentWithMediaMetadata);
        const fallbackRecipeTarget = recipeTargets.length > 0
          ? null
          : findAIRecipePendingMediaTarget(slideContentWithMediaMetadata);
        const targets = recipeTargets.length > 0
          ? recipeTargets
          : fallbackRecipeTarget
            ? [fallbackRecipeTarget]
            : [];
        if (targets.length === 0) {
          const fallbackTarget = findPendingMediaTarget(
            renderable.elements,
            slides[i].templateId,
            canvasWidth,
            canvasHeight,
          );
          if (fallbackTarget) {
            targets.push(fallbackTarget);
          }
        }
        if (targets.length > 0) {
          if (deferredTasks.length > 1 && targets.length > 1) {
            const remainingTargets = [...targets];
            deferredTasks.forEach((task, taskIndex) => {
              const matchedTargetIndex = task.slotId
                ? remainingTargets.findIndex((target) => target.slotId === task.slotId)
                : -1;
              const fallbackIndex = Math.min(taskIndex, remainingTargets.length - 1);
              const nextTargetIndex = matchedTargetIndex >= 0 ? matchedTargetIndex : fallbackIndex;
              const target = remainingTargets[nextTargetIndex] ?? targets[Math.min(taskIndex, targets.length - 1)]!;
              if (remainingTargets[nextTargetIndex]) {
                remainingTargets.splice(nextTargetIndex, 1);
              }
              pendingMediaJobs.push(buildPendingMediaJob(task, target));
            });
          } else {
            for (const deferredTask of deferredTasks) {
              for (const target of targets) {
                pendingMediaJobs.push(buildPendingMediaJob(deferredTask, target));
              }
            }
          }
          const taskRefs = deferredTasks
            .map((task) => task.providerTaskId || task.mediaTaskId)
            .join(", ");
          warnings.push(`Slide ${i + 1}: queued deferred ${deferredTasks[0]?.mediaType ?? "media"} tasks for later fetch [tasks=${taskRefs}, targets=${targets.length}]`);
        } else {
          warnings.push(`Slide ${i + 1}: deferred media task could not find a target region on slide`);
        }
      }
      const narrativeBody = slides[i].body
        .map((line) => normalizeNarrativeBodyLine(line))
        .filter((line) => line.length > 0)
        .slice(0, AI_NARRATIVE_MAX_BODY_LINES);
      const narrativeSections = (slides[i].sections ?? [])
        .map((section) => normalizeNarrativeSection(section))
        .filter((section): section is { heading: string; details: string[] } => Boolean(section))
        .slice(0, 6);
      const mergedSourceTrace = mergeSourceTraceEntries(aiRecipeFallback?.sourceTrace, aiRecipeCompaction?.sourceTrace);
      const mergedFallbackHistory = mergeFallbackHistoryEntries(
        aiRecipeFallback?.fallbackHistory,
        aiRecipeCompaction?.fallbackHistory,
        aiAdvancedMode?.fallbackHistory,
      );
      let slideWithCanvas: PresentationSlideContent = {
        ...(aiAdvancedMode?.slideContentOverride
          ? aiAdvancedMode.slideContentOverride
          : aiAdvancedMode?.mode === "full_slide_media" && mediaUrlsForSlide[0]
            ? buildFullSlideMediaContent({
              slide: slides[i],
              mediaUrl: mediaUrlsForSlide[0]!,
              canvasWidth,
              canvasHeight,
              isVideo: isVideoSkill,
            })
            : slideContentWithMediaMetadata),
        canvas: {
          ...(canvasPreset ? { preset: canvasPreset } : {}),
          width: canvasWidth,
          height: canvasHeight,
        },
        ...(input.hideTextOnSlides ? { visualOnly: true } : {}),
        ...(pendingMediaJobs.length > 0 ? { pendingMediaJobs } : {}),
        aiDesign: {
          source: "draft-with-ai",
          taskId,
          schemaVersion: "presentation_ai_layout_v1",
          mode: aiAdvancedMode?.mode ?? aiRecipeSelection?.mode ?? "structured_block",
          ...(aiRecipeSelection?.candidateModes?.length
            ? { candidateModes: aiRecipeSelection.candidateModes }
            : {}),
          componentRecipeId: input.hideTextOnSlides
            ? (canvasWidth >= canvasHeight
              ? (isVideoSkill ? "fullpage-video-landscape" : "fullpage-image-landscape")
              : (isVideoSkill ? "fullpage-video" : "fullpage-image"))
            : aiRecipeSelection?.componentRecipeId,
          ...(aiRecipeCompaction?.fitScore ? { fitScore: aiRecipeCompaction.fitScore } : {}),
          ...(aiRecipeCompaction?.compactionLevel
            ? { compactionLevel: normalizeRecipeCompactionLevel(aiRecipeCompaction.compactionLevel) }
            : {}),
          selectionMode: aiRecipeSelection?.selectionMode ?? "none",
          ...(aiRecipeSelection?.selectionReason ? { selectionReason: aiRecipeSelection.selectionReason } : {}),
          ...(aiRecipeSelection?.candidateRecipes?.length
            ? { candidateRecipes: aiRecipeSelection.candidateRecipes }
            : {}),
          ...(mergedSourceTrace?.length
            ? { sourceTrace: mergedSourceTrace }
            : {}),
          ...(mergedFallbackHistory?.length
            ? {
              fallbackHistory: mergedFallbackHistory,
            }
            : {}),
          ...(aiAdvancedMode?.mediaModeMetadata ? { mediaModeMetadata: aiAdvancedMode.mediaModeMetadata } : {}),
          narrative: {
            title: slides[i].title,
            body: narrativeBody.length > 0 ? narrativeBody : ["Key point"],
            ...(slides[i].notes ? { notes: slides[i].notes } : {}),
            ...(narrativeSections.length > 0 ? { sections: narrativeSections } : {}),
            ...(slides[i].mediaPlan?.length ? { mediaPlan: slides[i].mediaPlan } : {}),
            ...(slides[i].graphicCategory ? { graphicCategory: slides[i].graphicCategory } : {}),
            templateId: slides[i].templateId,
          },
          generatedAt: aiDesignGeneratedAt,
        },
      };
      const qualityGate = buildSlideQualityGateMetadata({
        recipeId: aiRecipeSelection?.componentRecipeId,
        slotBindings: slides[i].componentSlotBindings,
        fitScore: aiRecipeCompaction?.fitScore,
        sourceTrace: mergedSourceTrace,
      });
      if (qualityGate.warnings.length > 0) {
        warnings.push(...qualityGate.warnings.map((warning) => `Slide ${i + 1}: ${warning}`));
      }
      if (qualityGate.verdict) {
        logLayoutTelemetryEvent(
          actor,
          taskId,
          buildQualityGateEvent({
            deckId: input.deckId,
            slideIndex: i,
            verdict: qualityGate.verdict,
            fitScore: aiRecipeCompaction?.fitScore,
            issues: qualityGate.issues,
          }),
        );
      }
      if (normalizedWatermark) {
        const watermarkApplied = applyWatermarkToSlideContent(slideWithCanvas, normalizedWatermark);
        slideWithCanvas = watermarkApplied.slideContent;
        warnings.push(...watermarkApplied.warnings.map((warning) => `Slide ${i + 1}: ${warning}`));
      }
      const generatedDurationMs = resolveGeneratedSlideDurationMs({
        audioDurationMs: slideAudioDurationsMs[i],
        videoDurationMs: slideVideoDurationsMs[i],
      });
      if (generatedDurationMs != null) {
        slideWithCanvas = {
          ...slideWithCanvas,
          durationMs: generatedDurationMs,
        };
      }
      compiledSlides.push(slideWithCanvas);
      if (mediaFailureReasons[i]) {
        warnings.push(
          ...layoutWarnings.filter((warning) => !warning.toLowerCase().includes("placeholder")),
        );
      } else {
        warnings.push(...layoutWarnings);
      }
    }

    // ── Phase 6b: Deck Consistency ──────────────────────────
    {
      const deckSlideInputs = compiledSlides.map((s, i) => ({
        slideIndex: i,
        mode: (s.aiDesign?.mode ?? "structured_block") as PresentationAILayoutMode,
        modeLocked: s.aiDesign?.modeLocked,
        recipeId: s.aiDesign?.componentRecipeId,
      }));
      const consistency = evaluateDeckConsistency(deckSlideInputs);
      if (consistency.warnings.length > 0) {
        warnings.push(
          ...consistency.warnings.map((w) => `Deck consistency: ${w.message}`),
        );
      }
      logLayoutTelemetryEvent(actor, taskId, buildDeckConsistencyEvent({
        deckId: input.deckId,
        consistencyScore: consistency.score,
        warnings: consistency.warnings,
        slideCount: compiledSlides.length,
      }));
      for (const slideContent of compiledSlides) {
        if (!slideContent.aiDesign?.fitScore) {
          continue;
        }
        slideContent.aiDesign.fitScore = {
          ...slideContent.aiDesign.fitScore,
          deckConsistency: consistency.score,
        };
      }
    }

    // ── Phase 7: Deck Insertion ───────────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 7, phaseLabel: "Saving slides..." });

    const db = await getDb();
    if (!db) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: "Database not available",
        },
      });
      return;
    }

    const presentationNote = articleText.trim();
    let insertionBaseVersion = input.expectedVersion;
    let finalDeckVersion = input.expectedVersion;
    try {
      await db.transaction(async (tx) => {
        const deckRows = await tx
          .select({ version: presentationDecks.version })
          .from(presentationDecks)
          .where(
            and(
              eq(presentationDecks.id, input.deckId),
              eq(presentationDecks.tenantId, actor.tenantId),
            ),
          )
          .limit(1);

        const deckRow = deckRows[0];
        if (!deckRow) {
          throw new Error(`${PRESENTATION_ERROR_CODE.NOT_FOUND}: deck ${input.deckId} not found`);
        }

        let expectedVersion = deckRow.version;
        insertionBaseVersion = expectedVersion;
        for (let index = 0; index < compiledSlides.length; index += 1) {
          const slideContent = compiledSlides[index];
          const slidePlan = slides[index];
          const visibleNarrationNote = buildSlideNarrationTextFromSlideContent(
            slideContent,
            index,
            slides.length,
          );
          const shouldPreferVisibleSlideNote = shouldPreferVisibleNotesForAutoTopic
            || slideContent.aiDesign?.componentRecipeId === "sectioned-explainer"
            || Boolean(slideContent.aiDesign?.fallbackHistory?.some((entry) => (
              entry.step === "switch_recipe"
              || entry.step === "split_slide"
            )));
          const slideNote = shouldPreferVisibleSlideNote
            ? visibleNarrationNote
            : slidePlan?.notes?.trim()
              ? slidePlan.notes.trim().slice(0, 5_000)
              : visibleNarrationNote;
          await addSlideToDeck(
            {
              deckId: input.deckId,
              expectedVersion,
              slideContent: slideContent as Record<string, unknown>,
              audioTrack: slideAudioTracks[index] ?? undefined,
              notes: slideNote,
            },
            actor,
            tx as unknown as DrizzleDB,
          );
          expectedVersion++;
        }

        if (presentationNote) {
          await updatePresentationDeckMetadata(
            {
              deckId: input.deckId,
              expectedVersion,
              notes: presentationNote.slice(0, 20_000),
            },
            actor,
            tx as unknown as DrizzleDB,
          );
          expectedVersion++;
        }

        finalDeckVersion = expectedVersion;
      });
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Slide insertion failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // Link artifact to task run on success
    if (taskRunId) {
      linkArtifactToTaskRun(taskRunId, {
        presentationDeckId: input.deckId,
      }).catch(() => {});
    }

    // ── Success ─────────────────────────────────────────
    await updateProgress({
      phase: 7,
      phaseLabel: "Complete",
      completed: true,
      slidesCompleted: compiledSlides.length,
      totalSlides: compiledSlides.length,
      slidePreview,
      result: {
        slidesAdded: compiledSlides.length,
        newDeckVersion: finalDeckVersion || (insertionBaseVersion + compiledSlides.length),
        articlePreview: (articleText || sanitizedPrompt).slice(0, 200),
        warnings,
      },
    });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      responsePayload: {
        phase: "complete",
        slidesAdded: compiledSlides.length,
        warnings: warnings.length,
      },
    });
  } catch (err) {
    if (err instanceof AIDraftCancelledError) {
      await setCancelled().catch(() => {});
      return;
    }
    // Unexpected error — catch-all
    await updateProgress({
      completed: true,
      error: {
        code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
        message: `Unexpected error: ${sanitizeErrorMessage(err)}`,
      },
    }).catch(() => {});
  } finally {
    clearInterval(heartbeat);
    await releaseLockIfOwned().catch(() => {});
  }
}

export interface ResolvePendingMediaForDeckInput {
  deckId: number;
  maxJobs?: number;
}

export interface ResolvePendingMediaForDeckResult {
  slidesUpdated: number;
  jobsChecked: number;
  jobsResolved: number;
  jobsRemaining: number;
  warnings: string[];
}

export async function resolvePendingMediaForDeck(
  input: ResolvePendingMediaForDeckInput,
  actor: PresentationActor,
  userToken: string,
): Promise<ResolvePendingMediaForDeckResult> {
  const maxJobs = Number.isFinite(input.maxJobs)
    ? Math.max(1, Math.min(200, Math.round(input.maxJobs as number)))
    : 30;
  const warnings: string[] = [];
  let slidesUpdated = 0;
  let jobsChecked = 0;
  let jobsResolved = 0;
  let jobsRemaining = 0;

  const detail = await getPresentationDeckDetail(input.deckId, actor);
  const orderedSlides = [...detail.slides].sort((a, b) => a.orderIndex - b.orderIndex);

  for (const slide of orderedSlides) {
    const parsed = presentationSlideContentSchema.safeParse(slide.slideContent);
    if (!parsed.success) {
      warnings.push(`Slide ${slide.orderIndex + 1}: invalid slide content, skipped pending media resolution`);
      continue;
    }

    const baseContent = parsed.data;
    const existingJobs = baseContent.pendingMediaJobs ?? [];
    if (existingJobs.length === 0) {
      continue;
    }
    if (jobsChecked >= maxJobs) {
      jobsRemaining += existingJobs.length;
      continue;
    }

    let nextSlideContent = baseContent;
    const nextJobs: Array<SlidePendingMediaJob | null> = [...existingJobs];
    let nextDurationMs = resolveStoredSlideDurationMs(baseContent);
    let slideMutated = false;
    let slideResolvedCount = 0;

    for (let i = 0; i < nextJobs.length; i++) {
      if (jobsChecked >= maxJobs) {
        break;
      }
      const job = nextJobs[i];
      if (!job) {
        continue;
      }
      jobsChecked += 1;
      const checkedAt = toIsoNow();

      let task;
      try {
        task = await withTimeout(
          mediaGenerationService.getTask(job.mediaTaskId, userToken, {
            userId: actor.userId,
            traceId: `resolve-pending:${input.deckId}:slide:${slide.orderIndex + 1}:job:${job.mediaTaskId}`,
            source: "ai_draft.resolvePendingMediaForDeck",
            stage: "pending_media_poll",
          }),
          MEDIA_STATUS_FETCH_TIMEOUT_MS,
          "media_status_fetch_timeout",
        );
      } catch (err) {
        const reason = sanitizeErrorMessage(err).slice(0, 256);
        nextJobs[i] = {
          ...job,
          status: "pending",
          reason,
          lastCheckedAt: checkedAt,
        };
        slideMutated = true;
        warnings.push(`Slide ${slide.orderIndex + 1}: failed to fetch task ${job.mediaTaskId} (${reason})`);
        continue;
      }

      const isTerminalTaskStatus =
        task.status === "completed"
        || task.status === "failed"
        || task.status === "cancelled";
      if (isTerminalTaskStatus) {
        try {
          await chargeMediaCreditsForAIDraftTask({
            userId: actor.userId,
            tenantId: actor.tenantId,
            deckId: input.deckId,
            slideIndex: slide.orderIndex,
            totalSlides: orderedSlides.length,
            mediaType: job.mediaType,
            modelId: job.modelId || task.model || "unknown",
            promptPreview: job.prompt,
            task,
            fallbackCredits: await resolveMediaModelFallbackCreditCost(job.modelId || task.model, job.mediaType),
            stage: "pending_media_poll",
          });
        } catch (err) {
          const reason = sanitizeErrorMessage(err).slice(0, 256);
          nextJobs[i] = {
            ...job,
            status: "pending",
            reason: `billing_failed: ${reason}`.slice(0, 256),
            lastCheckedAt: checkedAt,
          };
          slideMutated = true;
          warnings.push(`Slide ${slide.orderIndex + 1}: billing failed for task ${job.mediaTaskId} (${reason})`);
          continue;
        }
      }

      if (task.status === "completed") {
        const resolvedUrl = task.resultUrl || extractMediaUrlFromResultData(task.resultData);
        if (resolvedUrl) {
          const resolvedRecipeContent = applyResolvedMediaToAIRecipeSlideContent(
            nextSlideContent,
            job,
            resolvedUrl,
            slide.title,
          );
          if (resolvedRecipeContent === nextSlideContent) {
            nextSlideContent = {
              ...resolvedRecipeContent,
              elements: applyResolvedMediaToElements(
                resolvedRecipeContent.elements,
                job,
                resolvedUrl,
                slide.title,
              ),
            };
          } else {
            nextSlideContent = resolvedRecipeContent;
          }
          if (job.mediaType === "video") {
            const resolvedVideoDurationMs = resolveGeneratedMediaDurationMs(task);
            if (resolvedVideoDurationMs != null) {
              const mergedDurationMs = resolveGeneratedSlideDurationMs({
                audioDurationMs: nextDurationMs,
                videoDurationMs: resolvedVideoDurationMs,
              });
              if (mergedDurationMs != null && mergedDurationMs !== nextDurationMs) {
                nextDurationMs = mergedDurationMs;
              }
            }
          }
          nextJobs[i] = null;
          slideMutated = true;
          slideResolvedCount += 1;
          continue;
        }

        warnings.push(`Slide ${slide.orderIndex + 1}: task ${job.mediaTaskId} completed without media URL`);
        nextJobs[i] = null;
        slideMutated = true;
        continue;
      }

      if (task.status === "failed" || task.status === "cancelled") {
        const reason = (task.errorMessage || `task_${task.status}`).slice(0, 256);
        warnings.push(`Slide ${slide.orderIndex + 1}: task ${job.mediaTaskId} ${task.status} (${reason})`);
        nextJobs[i] = null;
        slideMutated = true;
        continue;
      }

      const nextStatus = task.status === "processing" ? "processing" : "pending";
      const nextReason = task.errorMessage?.slice(0, 256);
      const hasStatusChange = job.status !== nextStatus;
      const hasReasonChange = (job.reason || "") !== (nextReason || "");
      if (hasStatusChange || hasReasonChange || job.lastCheckedAt !== checkedAt) {
        nextJobs[i] = {
          ...job,
          status: nextStatus,
          ...(nextReason ? { reason: nextReason } : {}),
          lastCheckedAt: checkedAt,
        };
        slideMutated = true;
      }
    }

    if (!slideMutated) {
      jobsRemaining += existingJobs.length;
      continue;
    }

    const compactJobs = nextJobs.filter((job): job is SlidePendingMediaJob => Boolean(job));
    const { pendingMediaJobs: _existingPendingMediaJobs, ...contentWithoutPending } = nextSlideContent;
    const finalSlideContent: PresentationSlideContent = {
      ...contentWithoutPending,
      ...(nextDurationMs != null ? { durationMs: nextDurationMs } : {}),
      ...(compactJobs.length > 0 ? { pendingMediaJobs: compactJobs } : {}),
    };

    try {
      await updateSlideInDeck(
        {
          deckId: input.deckId,
          slideId: slide.id,
          expectedVersion: slide.version,
          saveMode: "autosave",
          title: slide.title,
          notes: slide.notes,
          slideContent: finalSlideContent,
        },
        actor,
      );
      slidesUpdated += 1;
      jobsResolved += slideResolvedCount;
      jobsRemaining += compactJobs.length;
    } catch (err) {
      warnings.push(`Slide ${slide.orderIndex + 1}: failed to save resolved media (${sanitizeErrorMessage(err)})`);
      jobsRemaining += existingJobs.length;
    }
  }

  return {
    slidesUpdated,
    jobsChecked,
    jobsResolved,
    jobsRemaining,
    warnings,
  };
}

// ── Helpers ────────────────────────────────────────────────

interface PollMediaTaskResult {
  url: string | null;
  status: TaskStatus | "timeout";
  reason?: string;
  task?: MediaTask;
}

interface PollMediaTaskOptions {
  activeGraceMs?: number;
  shouldAbort?: () => boolean;
  auditContext?: {
    userId?: number;
    traceId?: string;
    source?: string;
    stage?: string;
    [key: string]: unknown;
  };
}

const mediaModelFallbackCreditCostCache = new Map<string, number>();

async function resolveMediaModelFallbackCreditCost(
  modelId: string | undefined,
  mediaType: "image" | "video" | "audio",
): Promise<number | undefined> {
  if (!modelId || !modelId.trim()) {
    return undefined;
  }
  const normalizedModelId = modelId.trim();
  const cacheKey = `${mediaType}:${normalizedModelId}`;
  if (mediaModelFallbackCreditCostCache.has(cacheKey)) {
    return mediaModelFallbackCreditCostCache.get(cacheKey);
  }
  const models = await getModelsByTypeAsync(mediaType).catch(() => []);
  const matched = models.find((m) => m.id === normalizedModelId);
  const cost = Number(matched?.creditCost ?? 0);
  if (Number.isFinite(cost) && cost > 0) {
    mediaModelFallbackCreditCostCache.set(cacheKey, cost);
    return cost;
  }
  return undefined;
}

async function chargeMediaCreditsForAIDraftTask(context: MediaBillingContext): Promise<void> {
  if (!Number.isFinite(context.userId) || context.userId <= 0) {
    return;
  }

  const isTerminalTaskStatus =
    context.task.status === "completed"
    || context.task.status === "failed"
    || context.task.status === "cancelled";
  if (!isTerminalTaskStatus) {
    return;
  }

  const providerReportedCredits = Number(context.task.creditsUsed ?? 0);
  const normalizedProviderCredits = Number.isFinite(providerReportedCredits) && providerReportedCredits > 0
    ? providerReportedCredits
    : 0;
  const fallbackCredits = Number(context.fallbackCredits ?? 0);
  const normalizedFallbackCredits = Number.isFinite(fallbackCredits) && fallbackCredits > 0
    ? fallbackCredits
    : 0;
  const shouldUseFallback =
    normalizedProviderCredits <= 0
    && context.task.status === "completed"
    && normalizedFallbackCredits > 0;
  const creditsToChargeRaw = normalizedProviderCredits > 0
    ? normalizedProviderCredits
    : shouldUseFallback
      ? normalizedFallbackCredits
      : 0;
  const creditsToCharge = creditsToChargeRaw > 0 ? Math.max(1, Math.ceil(creditsToChargeRaw)) : 0;
  if (creditsToCharge <= 0) {
    return;
  }

  const sourceType = context.mediaType === "video"
    ? "media_video"
    : context.mediaType === "audio"
      ? "media_audio"
      : "media_image";
  const slideNumber = context.slideIndex + 1;
  const taskRef = context.task.taskId || context.task.id;
  const providerFromTask = context.task.parameters && typeof context.task.parameters === "object"
    ? (context.task.parameters as Record<string, unknown>).provider
    : undefined;
  const provider = context.provider
    || (typeof providerFromTask === "string" ? providerFromTask : undefined);

  try {
    await deductCredits({
      userId: context.userId,
      tenantId: context.tenantId,
      amount: creditsToCharge,
      description: `AI Draft ${context.mediaType} generation (Deck #${context.deckId}, Slide ${slideNumber}/${context.totalSlides}, Task ${taskRef})`,
      sourceType,
      idempotencyKey: `ai_draft:${context.mediaType}:task:${context.task.id}:charge`,
      metadata: {
        operation: "ai_draft_media_generation",
        stage: context.stage,
        deckId: context.deckId,
        ...(context.aiDraftTaskId ? { taskId: context.aiDraftTaskId } : {}),
        slideIndex: context.slideIndex,
        slideNumber,
        totalSlides: context.totalSlides,
        mediaType: context.mediaType,
        model: context.modelId,
        ...(provider ? { provider } : {}),
        mediaTaskId: context.task.id,
        ...(context.task.taskId ? { providerTaskId: context.task.taskId } : {}),
        taskStatus: context.task.status,
        ...(context.promptPreview ? { promptPreview: context.promptPreview.slice(0, 500) } : {}),
        billingBasis: normalizedProviderCredits > 0 ? "provider_reported" : "model_fallback",
        providerReportedCredits: normalizedProviderCredits > 0 ? normalizedProviderCredits : 0,
        fallbackCredits: normalizedFallbackCredits > 0 ? normalizedFallbackCredits : 0,
        ...(context.aiDraftTaskId ? { traceId: context.aiDraftTaskId } : {}),
      },
    });
  } catch (err) {
    throw new BillingChargeError(`Media credit deduction failed for task ${taskRef}: ${sanitizeErrorMessage(err)}`);
  }
}

function extractMediaUrlFromResultData(resultData: unknown): string | null {
  const seen = new Set<unknown>();
  const directUrlKeys = [
    "url",
    "result_url",
    "output_url",
    "video_url",
    "image_url",
    "file_url",
    "download_url",
  ];
  const nestedKeys = [
    "data",
    "result",
    "output",
    "response",
    "media",
    "assets",
    "files",
    "items",
    "urls",
  ];

  const walk = (value: unknown, depth: number): string | null => {
    if (depth > 6 || value === null || value === undefined) {
      return null;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) {
        return null;
      }
      if (trimmed.startsWith("/") || /^https?:\/\//i.test(trimmed)) {
        return trimmed;
      }
      return null;
    }
    if (typeof value !== "object") {
      return null;
    }
    if (seen.has(value)) {
      return null;
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        const nested = walk(item, depth + 1);
        if (nested) {
          return nested;
        }
      }
      return null;
    }

    const obj = value as Record<string, unknown>;
    for (const key of directUrlKeys) {
      const nested = walk(obj[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
    for (const key of nestedKeys) {
      const nested = walk(obj[key], depth + 1);
      if (nested) {
        return nested;
      }
    }
    return null;
  };

  return walk(resultData, 0);
}

async function pollMediaTask(
  mediaTaskId: string,
  userToken: string,
  timeoutMs: number,
  options?: PollMediaTaskOptions,
): Promise<PollMediaTaskResult> {
  const start = Date.now();
  let deadline = start + timeoutMs;
  let remainingActiveGraceMs = Math.max(0, options?.activeGraceMs ?? 0);
  const initialActiveGraceMs = remainingActiveGraceMs;
  let lastStatusError: string | null = null;
  let lastObservedStatus: TaskStatus | null = null;
  while (true) {
    if (options?.shouldAbort?.()) {
      return {
        url: null,
        status: "cancelled",
        reason: "aborted_due_to_billing_failure",
      };
    }
    if (Date.now() > deadline) {
      if (
        remainingActiveGraceMs > 0
        && (lastObservedStatus === "pending" || lastObservedStatus === "processing")
      ) {
        const extensionMs = Math.min(remainingActiveGraceMs, 30000);
        remainingActiveGraceMs -= extensionMs;
        deadline += extensionMs;
      } else {
        break;
      }
    }

    let task;
    try {
      task = await withTimeout(
        mediaGenerationService.getTask(mediaTaskId, userToken, options?.auditContext),
        MEDIA_STATUS_FETCH_TIMEOUT_MS,
        "media_status_fetch_timeout",
      );
    } catch (err) {
      lastStatusError = sanitizeErrorMessage(err);
      await sleep(IMAGE_POLL_INTERVAL_MS);
      continue;
    }
    lastObservedStatus = task.status;

    if (task.status === "completed") {
      const resolvedUrl = task.resultUrl || extractMediaUrlFromResultData(task.resultData);
      if (resolvedUrl) {
        return { url: resolvedUrl, status: "completed", task };
      }
      return {
        url: null,
        status: "completed",
        reason: task.errorMessage || "completed_without_output_url",
        task,
      };
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return {
        url: null,
        status: task.status,
        reason: task.errorMessage || `task_${task.status}`,
        task,
      };
    }
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  const elapsedMs = Date.now() - start;
  const usedGraceMs = Math.max(0, initialActiveGraceMs - remainingActiveGraceMs);
  return {
    url: null,
    status: "timeout",
    reason: lastStatusError
      ? `timeout_waiting_for_result status=${lastObservedStatus || "unknown"} elapsed_ms=${elapsedMs} grace_ms=${usedGraceMs} (${lastStatusError})`
      : `timeout_waiting_for_result status=${lastObservedStatus || "unknown"} elapsed_ms=${elapsedMs} grace_ms=${usedGraceMs}`,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
  options?: { stopOnError?: boolean },
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  let firstError: unknown = null;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      if (options?.stopOnError && firstError) {
        return;
      }
      const i = nextIndex++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        if (!firstError) {
          firstError = err;
        }
        if (!options?.stopOnError) {
          throw err;
        }
        return;
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  if (firstError) {
    throw firstError;
  }
  return results;
}

// ── Generate Layout from Note ──────────────────────────────

function buildLayoutGenerationSystemPrompt(opts: {
  mode: "single_slide" | "full_presentation";
  stylePreset: SlideStylePreset;
  canvasWidth: number;
  canvasHeight: number;
  preferredRecipeId?: string;
  numSlides?: number;
}): string {
  const { stylePreset: preset, canvasWidth, canvasHeight, mode } = opts;
  const colorBlock = [
    `- background: ${preset.colors.background}`,
    `- backgroundAlt: ${preset.colors.backgroundAlt}`,
    `- primary: ${preset.colors.primary}`,
    `- secondary: ${preset.colors.secondary}`,
    `- text: ${preset.colors.text}`,
    `- textMuted: ${preset.colors.textMuted}`,
    `- cardBg: ${preset.colors.cardBg.join(", ")}`,
    `- overlay: ${preset.colors.overlay}`,
  ].join("\n");
  const typoBlock = [
    `- Title font: ${preset.typography.titleFontFamily} (weight ${preset.typography.titleFontWeight})`,
    `- Body font: ${preset.typography.bodyFontFamily} (weight ${preset.typography.bodyFontWeight})`,
  ].join("\n");

  const recipeConstraint = opts.preferredRecipeId
    ? `\nThe user prefers layout "${opts.preferredRecipeId}". Use it if the content fits; otherwise pick the best alternative.`
    : "";

  const modeInstructions = mode === "single_slide"
    ? `Format the provided note text into exactly ONE slide with a visually stunning, modern layout.
CRITICAL: Preserve ALL content from the note — every sentence, detail, and step. Do NOT summarize.
Choose the most visually appropriate componentRecipeId based on content type:
- Step/process content → "process-steps" or "timeline-flow" (shows numbered steps with icons and accent colors)
- Long articles/paragraphs → "article-focus", "two-column-article", "sectioned-explainer", or "compact-article"
- Data/metrics → "stat-cards" or "infographic-grid" (shows numbers in styled cards)
- Image-heavy → "framed-image-story", "photo-collage", "poster-spotlight", or "landscape-photo-story"
- Quotes/testimonials → "quote-callout" (large quote with accent line and attribution)
- People/profiles → "profile-summary" or "profile-board" (photo frame + bio sections)
- FAQ/Q&A → "faq-stack" (question-answer pairs)
- Features/benefits → "feature-highlights" (3-column cards with icons)`
    : `Split the provided article into ${opts.numSlides ?? "an appropriate number of"} slides. Each slide MUST have a DIFFERENT visual layout.
CRITICAL: Preserve ALL content across slides. Do NOT drop any information.
The first slide MUST use templateId "hero_center".

MANDATORY VARIETY — use a DIFFERENT componentRecipeId for each slide. Example flow for a 5-slide deck:
  Slide 1: hero_center (intro)
  Slide 2: "process-steps" or "timeline-flow" (steps)
  Slide 3: "article-focus" or "framed-image-story" (detail)
  Slide 4: "stat-cards" or "infographic-grid" (data)
  Slide 5: "quote-callout" or "poster-spotlight" (conclusion)
NEVER use the same recipe on two consecutive slides.`;

  return `You are a world-class presentation designer known for creating visually stunning, modern slide layouts. You combine bold typography, geometric shapes, accent lines, SVG icons, and varied image framing to make each slide unique and magazine-quality.

## Instructions
${modeInstructions}${recipeConstraint}

## Design Theme: "${preset.name}"

### Color Palette (use ONLY these colors)
${colorBlock}

### Typography
${typoBlock}

## Canvas
- Width: ${canvasWidth}px, Height: ${canvasHeight}px

## Output Format
For each slide, produce a JSON object:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)} — this is the fallback frame; the visual design comes from componentRecipeId
- componentRecipeId: one of ${JSON.stringify(AI_COMPONENT_RECIPE_IDS)} — ALWAYS set this. This determines the visual layout style (cards, grids, editorial, photo frames, etc.)
- mediaPlan (optional): array of { slotId, prompt } for media slots — generate vivid, specific image prompts
- title: compelling slide title (max 200 chars)
- body: array of 1-10 strings with FULL text from the source (not abbreviated bullets)
- notes: the COMPLETE original text for this slide (max 5000 chars)
- sections (REQUIRED): array of { heading (max 180 chars), details: string[] (1-4 items, full sentences up to 260 chars each) }. Use 3-6 sections to organize all content.
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} — pick the most relevant category for decorative SVG icons. Icons add visual interest alongside text.
- imagePromptKeywords: vivid, detailed prompt for AI image generation (max 500 chars). Be specific about style, composition, and mood.

${mode === "single_slide" ? "Output ONLY a single valid JSON object (not an array)." : "Output ONLY a valid JSON array. No markdown fences, no explanatory text."}

## Component Recipe Guide (each creates a DISTINCT visual layout)
${COMPONENT_RECIPE_PROMPT_GUIDE}

## Media Slot Guide (for recipes with image/video areas)
${COMPONENT_RECIPE_MEDIA_PLAN_GUIDE}

## Visual Design Principles
1. **Color discipline**: Use ONLY colors from the palette. Use primary for headings/accents, secondary for cards/borders, cardBg for section backgrounds.
2. **Content preservation**: Keep ALL text from source notes. Reorganize into sections but never drop content.
3. **Visual hierarchy**: title (large, bold) → sections[].heading (medium, colored) → sections[].details[] (body text with full sentences).
4. **Recipe variety**: ALWAYS set componentRecipeId. Each recipe produces a different visual structure (cards, columns, grids, editorial layouts, photo frames). For multi-slide decks, NEVER repeat the same recipe consecutively.
5. **Rich visual elements**: The layout engine automatically adds decorative elements based on the recipe — accent lines, colored rectangles, SVG icons, geometric image frames (circle, rounded, diamond crops). Pick the right graphicCategory to get relevant icons.
6. **Image generation**: Write imagePromptKeywords as detailed prompts — specify subject, style (photorealistic, illustration, infographic), composition, lighting, and mood. This directly drives AI image generation quality.
7. **Content-to-recipe matching**:
   - Steps/processes → process-steps, timeline-flow (numbered cards with icons)
   - Long text → article-focus, two-column-article, sectioned-explainer (editorial layouts with image area)
   - Statistics → stat-cards, infographic-grid (metric cards with large numbers)
   - Photos → photo-collage, framed-image-story, landscape-photo-story (multiple image frames)
   - Quotes → quote-callout (large quote with accent decoration)
   - People → profile-summary, profile-board (portrait frame + bio)
   - Marketing → poster-spotlight, feature-highlights (hero image + benefit cards)
   - Q&A → faq-stack (question-answer pairs)
8. **Modern aesthetics**: Think magazine editorial, not PowerPoint. Bold type, asymmetric layouts, accent colors, whitespace.`;
}

interface GenerateLayoutFromNoteServiceInput {
  deckId: number;
  slideId: number;
  expectedVersion: number;
  stylePresetId: StylePresetId;
  componentRecipeId?: AIPresentationComponentRecipeId;
}

interface GenerateLayoutFromNoteServiceOutput {
  title: string;
  slideContent: PresentationSlideContent;
  warnings: string[];
  applied: {
    templateId: LayoutTemplateId;
    stylePresetId: StylePresetId;
    componentRecipeId?: string;
    graphicCategory: GraphicCategoryId;
    regeneratedImage: boolean;
  };
}

export async function generateLayoutFromNoteAsync(
  input: GenerateLayoutFromNoteServiceInput,
  actor: PresentationActor,
  userToken: string,
): Promise<GenerateLayoutFromNoteServiceOutput> {
  const detail = await getPresentationDeckDetail(input.deckId, actor);
  const slide = detail.slides.find((s) => s.id === input.slideId);
  if (!slide) {
    throw new Error(
      `${PRESENTATION_ERROR_CODE.NOT_FOUND}: slide ${input.slideId} not found in deck ${input.deckId}`,
    );
  }

  const trimmedNotes = String(slide.notes ?? "").trim();
  if (!trimmedNotes) {
    throw new Error(
      `${PRESENTATION_ERROR_CODE.VALIDATION_FAILED}: slide note text is required to generate layout`,
    );
  }

  const warnings: string[] = [];
  const parsedContent = presentationSlideContentSchema.parse(slide.slideContent ?? { elements: [] });
  const canvas = parsedContent.canvas ?? {
    width: DEFAULT_CANVAS_WIDTH,
    height: DEFAULT_CANVAS_HEIGHT,
  };
  const canvasAspectRatio = toAspectRatio(canvas.width, canvas.height);
  const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];

  const baseStylePreset = getBuiltInPreset(input.stylePresetId) ?? getBuiltInPreset("dark-professional")!;
  const stylePreset = applyRelayoutChromePolicy(baseStylePreset);
  const watermark = normalizeWatermarkInput(extractWatermarkFromSlideContent(parsedContent), warnings);

  // Check credit balance before proceeding
  const estimatedCost = CREDIT_SPLIT + CREDIT_IMAGE_GEN;
  const hasCredits = await hasEnoughCredits(actor.userId, estimatedCost);
  if (!hasCredits) {
    throw new Error(
      `${PRESENTATION_ERROR_CODE.AI_INSUFFICIENT_CREDITS ?? "INSUFFICIENT_CREDITS"}: not enough credits for layout generation (estimated ${estimatedCost} credits)`,
    );
  }

  // Extract ALL existing images from slide — elements, components, and background
  const collectedImageSrcs: string[] = [];
  const seenSrcs = new Set<string>();
  for (const el of parsedContent.elements) {
    const src = (el as any).src as string | undefined;
    if (el.type === "image" && src && !src.startsWith("data:") && !(el as any).svgContent && !seenSrcs.has(src)) {
      seenSrcs.add(src);
      collectedImageSrcs.push(src);
    }
  }
  for (const comp of parsedContent.components ?? []) {
    for (const fbEl of comp.fallbackElements ?? []) {
      const src = (fbEl as any).src as string | undefined;
      if (fbEl.type === "image" && src && !src.startsWith("data:") && !(fbEl as any).svgContent && !seenSrcs.has(src)) {
        seenSrcs.add(src);
        collectedImageSrcs.push(src);
      }
    }
    for (const binding of comp.slotBindings ?? []) {
      if (binding.type === "image" && binding.src && !seenSrcs.has(binding.src)) {
        seenSrcs.add(binding.src);
        collectedImageSrcs.push(binding.src);
      }
    }
  }
  if (parsedContent.background?.type === "image" && (parsedContent.background as any).url) {
    const bgUrl = (parsedContent.background as any).url as string;
    if (!seenSrcs.has(bgUrl)) {
      collectedImageSrcs.push(bgUrl);
    }
  }
  const hasImages = collectedImageSrcs.length > 0;
  const primaryImageUrl = collectedImageSrcs[0] ?? null;

  // Build LLM prompt — LLM structures content AND picks the best recipe
  const systemPrompt = buildLayoutGenerationSystemPrompt({
    mode: "single_slide",
    stylePreset: baseStylePreset,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    preferredRecipeId: input.componentRecipeId,
  });

  const userMessage = `จัดเรียงข้อความต่อไปนี้เข้า slide โดย:

**กฎสำคัญที่สุด: ห้ามเปลี่ยนข้อความ ห้ามแปลภาษา ห้ามเขียนใหม่ ให้คัดลอกข้อความต้นฉบับเท่านั้น**

1. หาหัวข้อหลักจากข้อความ → ใส่ใน title (คัดลอกคำต่อคำ)
2. แยกหัวข้อย่อยและเนื้อหา → ใส่ใน sections[].heading + sections[].details[] (คัดลอกประโยคจากต้นฉบับ)
3. จัดเนื้อหาที่เหลือ → ใส่ใน body[] (คัดลอกประโยคจากต้นฉบับ)
4. ใส่ข้อความทั้งหมดใน notes (คัดลอกทั้งหมด)
5. body ต้องมีอย่างน้อย 1 รายการเสมอ — ใส่สรุปเนื้อหาหลักหรือประโยคแรกของข้อความ

เลือก componentRecipeId ที่เหมาะสม:
${hasImages ? `มีรูปภาพ → "image-top-article", "image-left-article", "image-right-article", "article-focus", "framed-image-story"` : `ไม่มีรูป → "sectioned-explainer", "compact-article", "faq-stack", "two-column-article"`}
- เนื้อหาเป็นขั้นตอน → "process-steps" หรือ "timeline-flow"
- เนื้อหาเป็นตัวเลข → "stat-cards" หรือ "infographic-grid"

ข้อความต้นฉบับ (คัดลอกเท่านั้น ห้ามแก้ไข):

${trimmedNotes}`;

  const textModel = await resolveDefaultTextModel();
  let aiSlide: AIPresentationSlide;
  try {
    const structuredResult = await callLLMStructured({
      systemPrompt,
      userMessage,
      model: textModel,
      zodSchema: AIPresentationSlideSchema,
      userId: actor.userId,
      tenantId: actor.tenantId,
      billingDescription: `AI Layout from Note (Deck #${input.deckId}, Slide #${input.slideId})`,
      billingMetadata: {
        operation: "ai_layout_from_note",
        deckId: input.deckId,
        slideId: input.slideId,
      },
    });
    aiSlide = structuredResult.data;
  } catch (err) {
    throw new Error(
      `${PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED}: LLM layout generation failed — ${sanitizeErrorMessage(err)}`,
    );
  }

  // Deduct flat overhead fee (in addition to per-token cost already charged by callLLMStructured)
  try {
    await deductCredits({
      userId: actor.userId,
      tenantId: actor.tenantId,
      amount: CREDIT_SPLIT,
      description: "AI Layout from Note (orchestration fee)",
      metadata: { type: "ai_layout_from_note", deckId: input.deckId, slideId: input.slideId },
    });
  } catch {
    warnings.push("Credit deduction failed — layout was still generated.");
  }

  // Use shared algorithmic layout engine
  const normalizedSlide = normalizeSlideHierarchy(aiSlide);
  const taskId = `layout-note-${randomBytes(8).toString("hex")}`;
  const generatedAt = new Date().toISOString();

  const { slideContent: layoutContent, warnings: layoutWarnings } = buildAlgorithmicSlideLayout({
    title: normalizedSlide.title,
    body: normalizedSlide.body,
    sections: normalizedSlide.sections ?? [],
    notes: trimmedNotes,
    imageUrls: collectedImageSrcs,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
    stylePreset,
    idPrefix: `ai-el-${taskId.slice(-6)}`,
    existingBackground: parsedContent.background,
    existingTransition: parsedContent.transition,
    existingDurationMs: parsedContent.durationMs,
    canvasPreset,
  });
  warnings.push(...layoutWarnings);

  let finalContent: PresentationSlideContent = {
    ...layoutContent,
    aiDesign: {
      source: "draft-with-ai",
      taskId,
      schemaVersion: "presentation_ai_layout_v1",
      mode: "structured_block" as PresentationAILayoutMode,
      selectionMode: "heuristic",
      narrative: {
        title: normalizedSlide.title,
        body: normalizedSlide.body.slice(0, AI_NARRATIVE_MAX_BODY_LINES),
        ...(normalizedSlide.notes ? { notes: normalizedSlide.notes } : {}),
        templateId: "hero_center" as LayoutTemplateId,
      },
      generatedAt,
    },
  };

  if (watermark) {
    const watermarkApplied = applyWatermarkToSlideContent(finalContent, watermark);
    finalContent = watermarkApplied.slideContent;
    warnings.push(...watermarkApplied.warnings);
  }

  finalContent = finalizeSlideContentAfterRepair(finalContent, warnings);

  return {
    title: normalizedSlide.title,
    slideContent: finalContent,
    warnings,
    applied: {
      templateId: normalizedSlide.templateId,
      stylePresetId: input.stylePresetId,
      graphicCategory: normalizedSlide.graphicCategory,
      regeneratedImage: false,
    },
  };
}

// ── Generate Layout from Deck Note (multi-slide) ───────────

interface GenerateLayoutFromDeckNoteServiceInput {
  deckId: number;
  expectedVersion: number;
  numSlides?: number;
  stylePresetId: StylePresetId;
}

export async function generateLayoutFromDeckNoteAsync(
  input: GenerateLayoutFromDeckNoteServiceInput,
  actor: PresentationActor,
  userToken: string,
  taskId: string,
): Promise<void> {
  const redis = getRedisClient();
  const progressKey = `ai_draft_progress:${taskId}`;
  const lockKey = `ai_draft_lock:${actor.userId}`;

  async function updateProgress(data: Record<string, unknown>): Promise<void> {
    try {
      await redis.set(progressKey, JSON.stringify({
        ...data,
        userId: actor.userId,
        updatedAt: new Date().toISOString(),
      }), "EX", PROGRESS_TTL_SECONDS);
    } catch { /* ignore Redis write failures */ }
  }

  // Acquire lock
  const lockAcquired = await redis.set(lockKey, taskId, "EX", LOCK_TTL_SECONDS, "NX");
  if (!lockAcquired) {
    await updateProgress({
      phase: 0,
      phaseLabel: "Error",
      phaseDetail: "Another generation is in progress for this deck",
      slidesCompleted: 0,
      totalSlides: 0,
      slidePreview: [],
      completed: true,
      error: { code: "LOCK_CONFLICT", message: "มีการสร้าง layout อื่นกำลังทำงานอยู่ กรุณารอสักครู่" },
    });
    return;
  }

  try {
    const detail = await getPresentationDeckDetail(input.deckId, actor);
    const deckNotes = String(detail.deck.notes ?? "").trim();

    if (!deckNotes) {
      await updateProgress({
        phase: 0,
        phaseLabel: "Error",
        slidesCompleted: 0,
        totalSlides: 0,
        slidePreview: [],
        completed: true,
        error: { code: PRESENTATION_ERROR_CODE.VALIDATION_FAILED, message: "Deck note text is required" },
      });
      return;
    }

    // Auto-calculate slide count if not specified
    const wordCount = deckNotes.split(/\s+/).filter(Boolean).length;
    const wordsPerSlide = /[\u0E00-\u0E7F]/.test(deckNotes) ? ARTICLE_WORDS_PER_SLIDE_TH : ARTICLE_WORDS_PER_SLIDE_EN;
    const autoSlideCount = clampInteger(Math.ceil(wordCount / wordsPerSlide), 3, MAX_AI_DRAFT_SLIDES);
    const numSlides = input.numSlides ?? autoSlideCount;

    const baseStylePreset = getBuiltInPreset(input.stylePresetId) ?? getBuiltInPreset("dark-professional")!;
    const stylePreset = applyRelayoutChromePolicy(baseStylePreset);
    const canvas = {
      width: DEFAULT_CANVAS_WIDTH,
      height: DEFAULT_CANVAS_HEIGHT,
    };
    // Use existing deck's canvas if slides exist
    if (detail.slides.length > 0) {
      const firstSlideContent = presentationSlideContentSchema.safeParse(detail.slides[0]?.slideContent);
      if (firstSlideContent.success && firstSlideContent.data.canvas) {
        canvas.width = firstSlideContent.data.canvas.width;
        canvas.height = firstSlideContent.data.canvas.height;
      }
    }
    const canvasAspectRatio = toAspectRatio(canvas.width, canvas.height);
    const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];

    // Check credit balance
    const estimatedCost = CREDIT_SPLIT + (5 * numSlides);
    const hasCredits = await hasEnoughCredits(actor.userId, estimatedCost);
    if (!hasCredits) {
      await updateProgress({
        phase: 0,
        phaseLabel: "Error",
        slidesCompleted: 0,
        totalSlides: 0,
        slidePreview: [],
        completed: true,
        error: { code: "INSUFFICIENT_CREDITS", message: `เครดิตไม่เพียงพอ ต้องใช้ประมาณ ${estimatedCost} credits` },
      });
      return;
    }

    // Phase 1: LLM split into slides
    await updateProgress({
      phase: 1,
      phaseLabel: "Designing slides",
      phaseDetail: `Splitting content into ${numSlides} slides with AI...`,
      slidesCompleted: 0,
      totalSlides: numSlides,
      slidePreview: [],
      completed: false,
    });

    const systemPrompt = buildLayoutGenerationSystemPrompt({
      mode: "full_presentation",
      stylePreset: baseStylePreset,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
      numSlides,
    });

    const userMessage = `Target slide count: ${numSlides}\n\nArticle:\n${deckNotes}`;
    const textModel = await resolveDefaultTextModel();

    let aiSlides: AIPresentationSlide[];
    try {
      const structuredResult = await callLLMStructured({
        systemPrompt,
        userMessage,
        model: textModel,
        zodSchema: AIPresentationSchema,
        userId: actor.userId,
        tenantId: actor.tenantId,
        billingDescription: `AI Layout from Deck Note (Deck #${input.deckId})`,
        billingMetadata: {
          operation: "ai_layout_from_deck_note",
          taskId,
          deckId: input.deckId,
          numSlides,
        },
      });
      aiSlides = structuredResult.data;
    } catch (err) {
      await updateProgress({
        phase: 1,
        phaseLabel: "Error",
        slidesCompleted: 0,
        totalSlides: numSlides,
        slidePreview: [],
        completed: true,
        error: { code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED, message: sanitizeErrorMessage(err) },
      });
      return;
    }

    // Deduct flat overhead fee (in addition to per-token cost already charged by callLLMStructured).
    // This covers orchestration + recipe assignment + slide persistence pipeline.
    try {
      await deductCredits({
        userId: actor.userId,
        tenantId: actor.tenantId,
        amount: CREDIT_SPLIT + (5 * aiSlides.length),
        description: "AI Layout from Deck Note (orchestration fee)",
        metadata: {
          type: "ai_layout_from_deck_note",
          deckId: input.deckId,
          numSlides: aiSlides.length,
        },
      });
    } catch {
      // Non-blocking
    }

    // Phase 2: Normalize + assign recipes
    await updateProgress({
      phase: 2,
      phaseLabel: "Assigning layouts",
      phaseDetail: "Selecting best component recipe for each slide...",
      slidesCompleted: 0,
      totalSlides: aiSlides.length,
      slidePreview: aiSlides.map((s) => ({ title: s.title, imageStatus: "pending" as const })),
      completed: false,
    });

    const normalizedSlides = aiSlides.map((s) => normalizeSlideHierarchy(s));
    const aiRecipeAssignments = assignAIComponentRecipes(normalizedSlides, {
      preferVideoRecipes: false,
      canvasWidth: canvas.width,
      canvasHeight: canvas.height,
    });
    const finalSlides = aiRecipeAssignments.slides;

    // Phase 3: Generate slide content for each
    const existingSlideCount = detail.slides.length;
    let latestVersion = detail.deck.version;

    for (let i = 0; i < finalSlides.length; i++) {
      const slideData = finalSlides[i]!;
      const selection = aiRecipeAssignments.selections[i];

      await updateProgress({
        phase: 3,
        phaseLabel: "Building slides",
        phaseDetail: `Creating slide ${i + 1}/${finalSlides.length}: ${slideData.title}`,
        slidesCompleted: i,
        totalSlides: finalSlides.length,
        slidePreview: finalSlides.map((s, idx) => ({
          title: s.title,
          imageStatus: idx < i ? "done" as const : idx === i ? "generating" as const : "pending" as const,
        })),
        completed: false,
      });

      // Use algorithmic layout for full text preservation
      const { slideContent, warnings: layoutWarnings } = buildAlgorithmicSlideLayout({
        title: slideData.title,
        body: slideData.body,
        sections: slideData.sections ?? [],
        notes: slideData.notes ?? "",
        imageUrls: [],
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        stylePreset,
        idPrefix: `deck-${taskId.slice(-6)}-s${i}`,
        canvasPreset,
      });

      // Build narrative for aiDesign
      const narrativeBody = slideData.body
        .map((line) => normalizeNarrativeBodyLine(line))
        .filter((line) => line.length > 0)
        .slice(0, AI_NARRATIVE_MAX_BODY_LINES);
      const narrativeSections = (slideData.sections ?? [])
        .map((section) => normalizeNarrativeSection(section))
        .filter((section): section is { heading: string; details: string[] } => Boolean(section))
        .slice(0, 6);
      const generatedAt = new Date().toISOString();

      let finalContent: PresentationSlideContent = {
        ...slideContent,
        canvas: {
          ...(canvasPreset ? { preset: canvasPreset } : {}),
          width: canvas.width,
          height: canvas.height,
        },
        aiDesign: {
          source: "draft-with-ai",
          taskId,
          schemaVersion: "presentation_ai_layout_v1",
          mode: selection?.mode ?? "structured_block",
          componentRecipeId: selection?.componentRecipeId,
          selectionMode: selection?.selectionMode ?? "none",
          narrative: {
            title: slideData.title,
            body: narrativeBody.length > 0 ? narrativeBody : ["Key point"],
            ...(slideData.notes ? { notes: slideData.notes } : {}),
            ...(narrativeSections.length > 0 ? { sections: narrativeSections } : {}),
            ...(slideData.graphicCategory ? { graphicCategory: slideData.graphicCategory } : {}),
            templateId: slideData.templateId,
          },
          generatedAt,
        },
      };

      finalContent = finalizeSlideContentAfterRepair(finalContent, layoutWarnings);

      // Persist slide — re-fetch version to handle concurrent writes
      try {
        const freshDetail = await getPresentationDeckDetail(input.deckId, actor);
        latestVersion = freshDetail.deck.version;
        await addSlideToDeck(
          {
            deckId: input.deckId,
            expectedVersion: latestVersion,
            title: slideData.title.slice(0, 255),
            notes: slideData.notes ?? "",
            slideContent: finalContent as Record<string, unknown>,
          },
          actor,
        );
        latestVersion++;
      } catch (err) {
        await updateProgress({
          phase: 3,
          phaseLabel: "Error",
          phaseDetail: `Failed to save slide ${i + 1}: ${sanitizeErrorMessage(err)}`,
          slidesCompleted: i,
          totalSlides: finalSlides.length,
          slidePreview: finalSlides.map((s) => ({ title: s.title, imageStatus: "pending" as const })),
          completed: true,
          error: { code: PRESENTATION_ERROR_CODE.INTERNAL_ERROR, message: sanitizeErrorMessage(err) },
        });
        return;
      }
    }

    // Phase 4: Complete
    await updateProgress({
      phase: 4,
      phaseLabel: "Complete",
      phaseDetail: `Generated ${finalSlides.length} slides from deck notes`,
      slidesCompleted: finalSlides.length,
      totalSlides: finalSlides.length,
      slidePreview: finalSlides.map((s) => ({ title: s.title, imageStatus: "done" as const })),
      completed: true,
      result: {
        slidesAdded: finalSlides.length,
        newDeckVersion: latestVersion,
        articlePreview: deckNotes.slice(0, 200),
        warnings: [],
      },
    });
  } catch (err) {
    await updateProgress({
      phase: 0,
      phaseLabel: "Error",
      slidesCompleted: 0,
      totalSlides: 0,
      slidePreview: [],
      completed: true,
      error: { code: PRESENTATION_ERROR_CODE.INTERNAL_ERROR, message: sanitizeErrorMessage(err) },
    });
  } finally {
    try {
      const currentLock = await redis.get(lockKey);
      if (currentLock === taskId) {
        await redis.del(lockKey);
      }
    } catch { /* ignore */ }
  }
}
