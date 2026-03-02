import type {
  GenerateAIDraftInput,
  AIPresentationSlide,
  AIDraftProgress,
} from "@shared/presentation/aiTypes";
import {
  AIPresentationSchema,
  AI_LAYOUT_TEMPLATE_IDS,
  AI_SVG_CATEGORIES,
} from "@shared/presentation/aiTypes";
import { getBuiltInPreset } from "@shared/presentation/aiStylePresets";
import { pickRandomSvgFromCategory } from "@shared/presentation/svgGraphicsCatalog";
import { PRESENTATION_ERROR_CODE } from "@shared/presentation/constants";

import { callLLMStructured } from "./callLLMStructured";
import { getSkillByIdAsync } from "./skillRegistry";
import { mediaGenerationService, type ImageModel } from "./mediaGenerationService";
import { getModelsByTypeAsync, type ModelDefinition } from "./modelRegistry";
import { addSlideToDeck, type PresentationActor } from "./presentationService";
import { hasEnoughCredits } from "./creditService";
import { getRedisClient } from "./redis";
import { auditLogger } from "./auditLogger";
import { getDb, type DrizzleDB } from "../db";
import { generateSlide } from "./aiPresentationLayoutEngine";
import { executeWithFallback, resolveProviders } from "./llmRouter";
import { llmProviders, modelProviderMap, presentationDecks } from "../../drizzle/schema";
import { and, asc, eq } from "drizzle-orm";

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
const LOCK_TTL_SECONDS = 300;
const HEARTBEAT_INTERVAL_MS = 30000;
const MAX_IMAGE_CONCURRENCY = 3;

const CREDIT_ARTICLE = 30;
const CREDIT_SPLIT = 10;
const CREDIT_IMAGE_SKILL = 75;
const CREDIT_IMAGE_GEN = 40;
const CREDIT_BUFFER_MULTIPLIER = 1.2;
const DEFAULT_TEXT_MODEL = "claude-sonnet-4-6";

const FALLBACK_IMAGE_MODEL: ImageModel = "flux-2.0";
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

function sanitizeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : "Unknown error";
  return msg
    .replace(/https?:\/\/[^\s]+/g, "[redacted-url]")
    .replace(/\/[\w/.-]+\.(ts|js|json)/g, "[redacted-path]")
    .slice(0, 200);
}

export function computeImagePollTimeoutMs(numSlides: number): number {
  const safeSlides = Number.isFinite(numSlides)
    ? Math.max(1, Math.round(numSlides))
    : 1;
  const scaledTimeout = IMAGE_POLL_BASE_TIMEOUT_MS
    + ((safeSlides - 1) * IMAGE_POLL_TIMEOUT_PER_SLIDE_MS);
  return Math.min(IMAGE_POLL_TIMEOUT_MAX_MS, scaledTimeout);
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
  return DEFAULT_TEXT_MODEL;
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
  }

  return Object.keys(apiConfig).length > 0 ? apiConfig : undefined;
}

function buildImageExtraParams(model?: ModelDefinition): Record<string, unknown> | undefined {
  const configJson = model?.configJson as { inputFields?: unknown } | undefined;
  const inputFields = Array.isArray(configJson?.inputFields) ? configJson.inputFields : [];
  if (inputFields.length === 0) {
    return undefined;
  }

  const extraParams: Record<string, unknown> = {};
  for (const field of inputFields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const key = (field as { key?: unknown }).key;
    const defaultValue = (field as { default?: unknown }).default;
    if (typeof key === "string" && key.trim().length > 0 && defaultValue !== undefined) {
      extraParams[key] = defaultValue;
    }
  }

  return Object.keys(extraParams).length > 0 ? extraParams : undefined;
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
  const normalizedContext = context.toLowerCase();
  if (cleanedPrompt.toLowerCase().includes(normalizedContext)) {
    return cleanedPrompt;
  }
  return `${cleanedPrompt}\n\nAdditional visual requirements:\n${context}`;
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

function applyReferenceImagesToExtraParams(
  baseExtraParams: Record<string, unknown> | undefined,
  model: ModelDefinition | undefined,
  referenceImageUrls: string[],
): Record<string, unknown> | undefined {
  if (!model || referenceImageUrls.length === 0) {
    return baseExtraParams;
  }

  const configJson = model.configJson as { inputFields?: unknown } | undefined;
  const inputFields = Array.isArray(configJson?.inputFields) ? configJson.inputFields : [];
  const imageUrlsField = inputFields.find((field) => {
    if (!field || typeof field !== "object") {
      return false;
    }
    const type = (field as { type?: unknown }).type;
    const key = (field as { key?: unknown }).key;
    return type === "image_urls" && typeof key === "string" && key.trim().length > 0;
  }) as { key: string } | undefined;

  if (!imageUrlsField) {
    return baseExtraParams;
  }

  const next = { ...(baseExtraParams ?? {}) };
  if (next[imageUrlsField.key] === undefined || next[imageUrlsField.key] === null || next[imageUrlsField.key] === "") {
    next[imageUrlsField.key] = referenceImageUrls;
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

async function invokeSkillTextLLM(params: {
  model: string;
  systemPrompt: string;
  userPrompt: string;
  userId: number;
  preferredProviderId?: number;
  strictProviderPin?: boolean;
}): Promise<string> {
  if (params.strictProviderPin && params.preferredProviderId) {
    const candidates = await resolveProviders(params.model).catch(() => []);
    const providerMatched = candidates.some((c) => c.providerId === params.preferredProviderId);
    if (!providerMatched) {
      throw new Error(`No providers available for model: ${params.model} with preferred provider ${params.preferredProviderId}`);
    }
  }

  const result = await executeWithFallback({
    model: params.model,
    messages: [
      { role: "system", content: params.systemPrompt },
      { role: "user", content: params.userPrompt },
    ],
    stream: false,
    userId: params.userId,
    preferredProvider: params.preferredProviderId,
  });

  if (result.type === "error") {
    if (result.error === "No providers available for model") {
      throw new Error(`No providers available for model: ${params.model}`);
    }
    throw new Error(result.error);
  }
  if (result.type === "fallback_required") {
    throw new Error("LLM provider requires fallback consent");
  }

  const content = result.response?.choices?.[0]?.message?.content;
  return extractTextContent(content) || JSON.stringify(content);
}

async function resolveRoutableTextModel(
  preferredModel: string,
  preferredProviderId?: number,
  strictProviderPin?: boolean,
): Promise<string> {
  const preferred = preferredModel.trim();

  const preferredProviders = await resolveProviders(preferred).catch(() => []);
  if (preferredProviderId && preferredProviders.some((p) => p.providerId === preferredProviderId)) {
    return preferred;
  }
  if (preferredProviders.length > 0) {
    return preferred;
  }

  const db = await getDb();
  if (db) {
    const byProviderModelId = await db
      .select({ modelId: modelProviderMap.modelId })
      .from(modelProviderMap)
      .innerJoin(llmProviders, eq(modelProviderMap.providerId, llmProviders.id))
      .where(
        and(
          eq(modelProviderMap.providerModelId, preferred),
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

  if (strictProviderPin && preferredProviderId) {
    throw new Error(`No providers available for model: ${preferred} with preferred provider ${preferredProviderId}`);
  }

  if (preferred !== DEFAULT_TEXT_MODEL) {
    const defaultProviders = await resolveProviders(DEFAULT_TEXT_MODEL).catch(() => []);
    if (defaultProviders.length > 0) {
      return DEFAULT_TEXT_MODEL;
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

  return preferred;
}

// ── Slide Split System Prompt ──────────────────────────────

const SLIDE_SPLIT_SYSTEM_PROMPT = `You are a presentation content structurer. Your job is to split an article into individual presentation slides.

For each slide, produce a JSON object with these fields:
- templateId: one of ${JSON.stringify(AI_LAYOUT_TEMPLATE_IDS)}
- title: a short, compelling title for the slide (max 200 chars)
- body: an array of 1-10 bullet point strings summarizing the key points
- graphicCategory: one of ${JSON.stringify(AI_SVG_CATEGORIES)} - pick the most relevant category for a decorative SVG icon
- imagePromptKeywords: a descriptive prompt (max 500 chars) for generating a relevant background/hero image

Output ONLY a valid JSON array. No markdown code fences, no explanatory text.

You MUST return exactly the number of slides requested by the user message.

The first slide MUST use templateId "hero_center" as the title/intro slide.
Distribute remaining slides among "split_left_image", "split_right_image", and "feature_boxes_right" for visual variety.`;

function buildSlideSplitUserPrompt(articleText: string, requestedSlides: number): string {
  return `Target slide count: ${requestedSlides}

Article:
${articleText}`;
}

function buildFallbackSlide(index: number, seed?: AIPresentationSlide): AIPresentationSlide {
  const nonIntroTemplates: Array<(typeof AI_LAYOUT_TEMPLATE_IDS)[number]> = [
    "split_right_image",
    "split_left_image",
    "feature_boxes_right",
  ];
  const templateId =
    index === 0
      ? "hero_center"
      : nonIntroTemplates[(index - 1) % nonIntroTemplates.length];
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

// ── Public Functions ───────────────────────────────────────

export function estimateCreditCost(numSlides: number): number {
  const base = CREDIT_ARTICLE + CREDIT_SPLIT + (CREDIT_IMAGE_SKILL + CREDIT_IMAGE_GEN) * numSlides;
  return Math.round(base * CREDIT_BUFFER_MULTIPLIER);
}

export function buildArticlePrompt(
  topic: string,
  language: string,
  numSlides: number,
  skillParams?: Record<string, unknown>,
): string {
  const langInstruction =
    language === "auto"
      ? "Write in the same language as the topic. If the topic is in Thai, write in Thai. If in English, write in English."
      : language === "th"
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

  return `Write a well-structured article about: ${topic}

${langInstruction}

The article will be split into approximately ${numSlides} presentation slides, so organize the content into ${numSlides} clearly numbered sections. Each section should cover one main idea and be 2-4 sentences long.

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

  async function updateProgress(partial: Partial<AIDraftProgress>): Promise<void> {
    const progress: AIDraftProgress & { userId: number } = {
      userId: actor.userId,
      phase: 0,
      phaseLabel: "Initializing...",
      slidesCompleted: 0,
      totalSlides: input.numSlides,
      slidePreview: [],
      completed: false,
      ...partial,
    };
    await redis.set(progressKey, JSON.stringify(progress), "EX", LOCK_TTL_SECONDS);
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
    const sanitizedImagePromptContext = sanitizePromptContext(input.imagePromptContext);
    const normalizedReferenceImageUrls = normalizeReferenceImageUrls(input.referenceImageUrls);
    const canvasWidth = sanitizeCanvasDimension(input.canvasWidth) ?? DEFAULT_CANVAS_WIDTH;
    const canvasHeight = sanitizeCanvasDimension(input.canvasHeight) ?? DEFAULT_CANVAS_HEIGHT;
    const canvasAspectRatio = toAspectRatio(canvasWidth, canvasHeight);
    const canvasPreset = CANVAS_PRESET_BY_RATIO[canvasAspectRatio];
    const requestedImageModel = input.imageModel?.trim();
    const availableImageModels = await getModelsByTypeAsync("image");
    const textToImageModels = availableImageModels.filter(isTextToImageModel);

    let selectedImageModel =
      (requestedImageModel
        ? availableImageModels.find((model) => model.id === requestedImageModel)
        : undefined)
      ?? textToImageModels[0]
      ?? availableImageModels[0];

    if (selectedImageModel && !isTextToImageModel(selectedImageModel) && textToImageModels[0]) {
      const generateType = String((selectedImageModel.configJson as Record<string, unknown> | undefined)?.generateType || "unknown");
      warnings.push(
        `Image model "${selectedImageModel.id}" uses generateType "${generateType}" and is not text-to-image; using "${textToImageModels[0].id}" instead`,
      );
      selectedImageModel = textToImageModels[0];
    }

    const imageModelToUse: ImageModel = (selectedImageModel?.id || FALLBACK_IMAGE_MODEL) as ImageModel;
    const imageApiConfig = buildImageApiConfig(selectedImageModel);
    const imageAspectRatio = selectAspectRatioForModel(
      canvasAspectRatio,
      selectedImageModel?.aspectRatios,
    );
    if (imageAspectRatio !== canvasAspectRatio) {
      warnings.push(
        `Image model "${imageModelToUse}" does not list aspect ratio "${canvasAspectRatio}"; using "${imageAspectRatio}"`,
      );
    }
    const imageExtraParams = applyReferenceImagesToExtraParams(
      buildImageExtraParams(selectedImageModel),
      selectedImageModel,
      normalizedReferenceImageUrls,
    );

    // ── Credit pre-check (UX fast-fail; actual deductions happen in downstream LLM/media services)
    const estimatedCost = estimateCreditCost(input.numSlides);
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

    // ── Phase 1: Article Generation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 1, phaseLabel: "Writing article..." });

    auditLogger.log({
      traceId: taskId,
      timestamp: new Date().toISOString(),
      eventType: "skill_execute",
      userId: actor.userId,
      requestPayload: { phase: 1, skillId: input.articleSkillId, topic: sanitizedPrompt },
    });

    // Skills are system-level (filesystem-based), already validated by Zod in router.
    // No per-user scoping needed — all enabled skills are visible to all users.
    const articleSkill = await getSkillByIdAsync(input.articleSkillId);
    if (!articleSkill?.systemPrompt) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article skill not found: ${input.articleSkillId}`,
        },
      });
      return;
    }
    const articleModel = await resolveRoutableTextModel(
      resolveSkillModel(articleSkill),
      articleSkill?.preferredProviderId,
      articleSkill?.strictProviderPin,
    );

    let articleText: string;
    try {
      articleText = await invokeSkillTextLLM({
        model: articleModel,
        systemPrompt: articleSkill.systemPrompt,
        userPrompt: buildArticlePrompt(sanitizedPrompt, input.language, input.numSlides, input.articleSkillParams),
        userId: actor.userId,
        preferredProviderId: articleSkill.preferredProviderId,
        strictProviderPin: articleSkill.strictProviderPin,
      });
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_GENERATION_FAILED,
          message: `Article generation failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // ── Phase 2: Article to Slide Split ───────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 2, phaseLabel: "Splitting into slides..." });

    // Truncate article to prevent token overflow
    const truncatedArticle = articleText.split(/\s+/).slice(0, 2000).join(" ");

    let slides: AIPresentationSlide[];
    try {
      const splitResult = await callLLMStructured({
        systemPrompt: SLIDE_SPLIT_SYSTEM_PROMPT,
        userMessage: buildSlideSplitUserPrompt(truncatedArticle, input.numSlides),
        model: articleModel,
        preferredProviderId: articleSkill.preferredProviderId,
        strictProviderPin: articleSkill.strictProviderPin,
        zodSchema: AIPresentationSchema,
        userId: actor.userId,
        tenantId: actor.tenantId,
      });
      slides = normalizeSlidesToRequestedCount(splitResult.data, input.numSlides, warnings);
    } catch (err) {
      await updateProgress({
        completed: true,
        error: {
          code: PRESENTATION_ERROR_CODE.AI_INVALID_RESPONSE,
          message: `Article split failed: ${sanitizeErrorMessage(err)}`,
        },
      });
      return;
    }

    // Force slide 1 to hero_center
    if (slides.length > 0 && slides[0].templateId !== "hero_center") {
      slides[0] = { ...slides[0], templateId: "hero_center" };
    }

    // Build slide preview
    const slidePreview: Array<{ title: string; imageStatus: "pending" | "done" | "placeholder" }> = slides.map((s) => ({
      title: s.title,
      imageStatus: "pending" as const,
    }));

    await updateProgress({
      phase: 2,
      phaseLabel: "Slides structured",
      totalSlides: slides.length,
      slidePreview,
    });

    // ── Phase 3+4: Image Enhancement + Generation ─────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 3, phaseLabel: "Generating images..." });
    const imagePollTimeoutMs = computeImagePollTimeoutMs(input.numSlides);

    // Load image skill if provided
    let imageSkillSystemPrompt: string | null = null;
    let imageSkillModel = DEFAULT_TEXT_MODEL;
    let imageSkillPreferredProviderId: number | undefined;
    let imageSkillStrictProviderPin: boolean | undefined;
    if (input.imageSkillId) {
      const imageSkill = await getSkillByIdAsync(input.imageSkillId);
      imageSkillSystemPrompt = imageSkill?.systemPrompt ?? null;
      imageSkillPreferredProviderId = imageSkill?.preferredProviderId;
      imageSkillStrictProviderPin = imageSkill?.strictProviderPin;
      imageSkillModel = await resolveRoutableTextModel(
        resolveSkillModel(imageSkill),
        imageSkillPreferredProviderId,
        imageSkillStrictProviderPin,
      );
    }

    const imageUrls: (string | null)[] = [];
    const imagePrompts: string[] = [];

    // Process slides with bounded concurrency
    await mapWithConcurrency(
      slides,
      async (slide, index) => {
        if (await isCancelled()) {
          imageUrls[index] = null;
          return;
        }

        // Phase 3: Image prompt enhancement
        const baseImagePrompt = appendPromptContext(slide.imagePromptKeywords, sanitizedImagePromptContext);
        let imagePrompt = baseImagePrompt;
        if (imageSkillSystemPrompt) {
          try {
            imagePrompt = await invokeSkillTextLLM({
              model: imageSkillModel,
              systemPrompt: imageSkillSystemPrompt,
              userPrompt: baseImagePrompt,
              userId: actor.userId,
              preferredProviderId: imageSkillPreferredProviderId,
              strictProviderPin: imageSkillStrictProviderPin,
            });
            imagePrompt = appendPromptContext(imagePrompt, sanitizedImagePromptContext);
          } catch {
            warnings.push(`Slide ${index + 1}: image prompt enhancement failed, using raw keywords`);
          }
        }
        imagePrompts[index] = imagePrompt;

        // Phase 4: Image generation
        let imageUrl: string | null = null;
        try {
          const mediaTask = await mediaGenerationService.generateImageAsync(
            {
              prompt: imagePrompt,
              model: imageModelToUse,
              aspectRatio: imageAspectRatio,
              ...(normalizedReferenceImageUrls.length > 0
                ? { referenceImageUrls: normalizedReferenceImageUrls }
                : {}),
              ...(imageApiConfig ? { apiConfig: imageApiConfig } : {}),
              ...(imageExtraParams ? { extraParams: imageExtraParams } : {}),
            },
            userToken,
          );
          imageUrl = await pollMediaTask(mediaTask.id, userToken, imagePollTimeoutMs);
        } catch (err) {
          warnings.push(`Slide ${index + 1}: image generation failed (${sanitizeErrorMessage(err)})`);
        }

        imageUrls[index] = imageUrl;

        // Update slide preview
        slidePreview[index] = {
          ...slidePreview[index],
          imageStatus: imageUrl ? "done" : "placeholder",
        };

        await updateProgress({
          phase: 4,
          phaseLabel: `Images: ${index + 1}/${slides.length}`,
          slidesCompleted: index + 1,
          totalSlides: slides.length,
          slidePreview,
        });
      },
      MAX_IMAGE_CONCURRENCY,
    );

    // ── Phase 5: Layout Compilation ───────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 5, phaseLabel: "Compiling layouts..." });

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

    const compiledSlides: unknown[] = [];
    for (let i = 0; i < slides.length; i++) {
      const svg = pickRandomSvgFromCategory(slides[i].graphicCategory);
      const { slideContent, warnings: layoutWarnings } = generateSlide({
        slideData: slides[i],
        imageUrl: imageUrls[i] ?? null,
        svgGraphic: svg,
        stylePreset: presetCopy,
        deckTitle: i === 0 ? sanitizedPrompt.slice(0, 36) : undefined,
        slideIndex: i,
        totalSlides: slides.length,
        canvasWidth,
        canvasHeight,
      });
      const promptForSlide = imagePrompts[i]?.trim();
      const imageModelIdForSlide = selectedImageModel?.id ?? imageModelToUse;
      const elementsWithImageMetadata = slideContent.elements.map((element) => {
        if (element.type !== "image") {
          return element;
        }
        if (!element.src || !element.src.trim()) {
          return element;
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
      const slideWithCanvas = {
        ...slideContent,
        elements: elementsWithImageMetadata,
        canvas: {
          ...(canvasPreset ? { preset: canvasPreset } : {}),
          width: canvasWidth,
          height: canvasHeight,
        },
      };
      compiledSlides.push(slideWithCanvas);
      warnings.push(...layoutWarnings);
    }

    // ── Phase 6: Deck Insertion ───────────────────────────
    if (await isCancelled()) { await setCancelled(); return; }

    await updateProgress({ phase: 6, phaseLabel: "Saving slides..." });

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

    let insertionBaseVersion = input.expectedVersion;
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
        for (const slideContent of compiledSlides) {
          await addSlideToDeck(
            { deckId: input.deckId, expectedVersion, slideContent: slideContent as Record<string, unknown> },
            actor,
            tx as unknown as DrizzleDB,
          );
          expectedVersion++;
        }
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

    // ── Success ─────────────────────────────────────────
    await updateProgress({
      phase: 6,
      phaseLabel: "Complete",
      completed: true,
      slidesCompleted: compiledSlides.length,
      totalSlides: compiledSlides.length,
      slidePreview,
      result: {
        slidesAdded: compiledSlides.length,
        newDeckVersion: insertionBaseVersion + compiledSlides.length,
        articlePreview: articleText.slice(0, 200),
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

// ── Helpers ────────────────────────────────────────────────

async function pollMediaTask(
  mediaTaskId: string,
  userToken: string,
  timeoutMs: number,
): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const task = await mediaGenerationService.getTask(mediaTaskId, userToken);
    if (task.status === "completed" && task.resultUrl) {
      return task.resultUrl;
    }
    if (task.status === "failed" || task.status === "cancelled") {
      return null;
    }
    await sleep(IMAGE_POLL_INTERVAL_MS);
  }
  return null; // timeout
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results;
}
