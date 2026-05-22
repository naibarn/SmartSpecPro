/**
 * Media Generation tRPC Router
 * Handles image, video, and audio generation via Python backend
 */

import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import {
  mediaGenerationService,
  MEDIA_MODELS,
  DEFAULT_MODELS,
  type MediaType,
  type AudioModel,
  type TaskStatus,
} from "../services/mediaGenerationService";
import { deductCredits, hasEnoughCredits, refundCredits } from "../services/creditService";
import { calculateCreditCost, type UserSelections } from "../services/pricingCalculator";
import {
  GEMINI_OMNI_AUDIO_CAPABILITY,
  GEMINI_OMNI_CHARACTER_CAPABILITY,
  GEMINI_OMNI_VIDEO_MODEL_ID,
  buildGeminiOmniProviderExtraParams,
  validateGeminiOmniVideoInput,
} from "../../shared/geminiOmni";
import { signBearerToken } from "../_core/tokens";
import { mediaGenerationLimiter, isLuxTtsModel, checkLuxTtsRateLimit } from "../services/rateLimiter";
import { auditLogger } from "../services/auditLogger";
import { addMediaTaskToLibrary } from "../services/mediaLibraryService";
import { isLibraryEnabledForTenant } from "../services/libraryFeatureFlags";
import { resolveTenantIdVarchar } from "../services/tenantContext";
import { getDb } from "../db";
import { mediaModels, mediaProviders, users } from "../../drizzle/schema";
import { eq, asc, and } from "drizzle-orm";
import { shouldUseSandbox, dispatchToSandbox } from "../services/sandbox/dispatchService";
import { checkAbuseGuard, hashPrompt } from "../services/abuseGuard";
import { getAppRuntimeConfig } from "../services/appRuntimeConfig";
import { decrypt } from "../services/crypto";
import {
  assertPublicSafeHttpUrl,
  assertRelativeUploadMediaReferencePath,
  getAllowedAspectRatiosFromConfig,
  getAllowedDurationsFromConfig,
  getReferenceImageLimitFromConfig,
  isReferenceImageRequiredFromConfig,
  normalizeMediaProviderName,
} from "../services/mediaProviderUtils";
import {
  getAllModelsAsync,
  getDefaultModel,
  getModelMetadata,
  getModelsByTypeAsync,
  getStaticModelById,
  refreshModelCache,
  mapToApiModelId,
} from "../services/modelRegistry";
import {
  inferMediaModelHintFromText,
  resolveEnabledMediaModelSelection,
} from "../services/enabledMediaModelSelection";
import {
  GEMINI_3_1_FLASH_TTS_MODEL_ID,
  validateGemini31FlashTtsAudioRequest,
  validateGemini31FlashTtsExtraParams,
  normalizeGemini31FlashTtsExtraParams,
} from "../services/falGeminiTts";

import { validateExtraParamsNoSsrf } from "../services/ssrfValidation";
import {
  cancelDeferredMediaTask,
  deleteDeferredMediaTask,
  getDeferredMediaTask,
  getMediaRetryDelayMsFromError,
  isMediaProviderCapacityError,
  listDeferredMediaTasks,
  scheduleDeferredVideoRetry,
} from "../services/deferredMediaRetryService";
import { assertMediaProviderAssetsUsable } from "../services/mediaProviderAssetService";

const extraParamsSchema = z
  .record(z.any())
  .optional()
  .superRefine((val, ctx) => {
    const errors = validateExtraParamsNoSsrf(val);
    for (const msg of errors) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: msg });
    }
  });

const creditOriginSurfaceSchema = z.enum(["media_studio"]).optional();

function getGeminiOmniIds(extraParams: Record<string, any> | undefined, key: "character_ids" | "audio_ids"): string[] {
  const value = extraParams?.[key];
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

async function preflightGeminiOmniVideoRequest(params: {
  model: string;
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } };
  prompt: string;
  duration?: number;
  resolution?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceVideoUrl?: string;
  extraParams?: Record<string, any>;
}): Promise<Record<string, unknown> | null> {
  if (params.model !== GEMINI_OMNI_VIDEO_MODEL_ID) {
    return null;
  }

  const characterIds = getGeminiOmniIds(params.extraParams, "character_ids");
  const audioIds = getGeminiOmniIds(params.extraParams, "audio_ids");
  const validation = validateGeminiOmniVideoInput({
    prompt: params.prompt,
    imageUrls: params.referenceImageUrls ?? params.extraParams?.image_urls,
    videoList: params.extraParams?.video_list,
    referenceVideoUrls: params.referenceVideoUrls,
    referenceVideoUrl: params.referenceVideoUrl,
    characterIds,
    audioIds,
    duration: params.duration,
    resolution: params.resolution,
  });

  if (!validation.ok) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Gemini Omni validation failed: ${validation.issues.map((issue) => issue.message).join("; ")}`,
    });
  }

  const tenantId = resolveTenantIdVarchar(params.ctx.tenantId, params.ctx.user.currentTenantId);
  if (!tenantId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Tenant context is required for Gemini Omni assets" });
  }

  await assertMediaProviderAssetsUsable({
    tenantId,
    userId: params.ctx.user.id,
    capability: GEMINI_OMNI_CHARACTER_CAPABILITY,
    providerAssetIds: characterIds,
  });
  await assertMediaProviderAssetsUsable({
    tenantId,
    userId: params.ctx.user.id,
    capability: GEMINI_OMNI_AUDIO_CAPABILITY,
    providerAssetIds: audioIds,
  });

  return buildGeminiOmniProviderExtraParams({
    prompt: params.prompt,
    imageUrls: params.referenceImageUrls,
    referenceVideoUrls: params.referenceVideoUrls,
    referenceVideoUrl: params.referenceVideoUrl,
    videoList: params.extraParams?.video_list,
    characterIds,
    audioIds,
    duration: params.duration,
    resolution: params.resolution,
  });
}

const DESKTOP_MEDIA_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
]);

function isDesktopMediaRequest(req: { headers?: Record<string, unknown> } | undefined): boolean {
  if (!req?.headers) return false;

  const origin = req.headers.origin;
  if (typeof origin === "string" && DESKTOP_MEDIA_ORIGINS.has(origin)) {
    return true;
  }

  const referer = req.headers.referer;
  if (typeof referer === "string") {
    try {
      const refererOrigin = new URL(referer).origin;
      if (DESKTOP_MEDIA_ORIGINS.has(refererOrigin)) {
        return true;
      }
    } catch {
      // Ignore malformed referers.
    }
  }

  return false;
}

function getBase64SizeInBytes(base64: string): number {
  const normalized = base64.replace(/\s+/g, "");
  if (!normalized) return 0;
  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  return Math.floor((normalized.length * 3) / 4) - padding;
}

function assertOmnivoiceReferenceAudioSize(extraParams: Record<string, unknown> | undefined): void {
  if (!extraParams) return;

  const rawBase64 = extraParams.reference_audio_base64 ?? extraParams.referenceAudioBase64;
  if (typeof rawBase64 !== "string" || rawBase64.trim().length === 0) return;

  const maxBytes = 10 * 1024 * 1024;
  const sizeBytes = getBase64SizeInBytes(rawBase64);
  if (sizeBytes > maxBytes) {
    throw new TRPCError({
      code: "PAYLOAD_TOO_LARGE",
      message: `OmniVoice reference audio exceeds the ${Math.floor(maxBytes / (1024 * 1024))} MB limit.`,
    });
  }
}

function assertAudioModelExtraParamsValid(
  modelId: string,
  extraParams: Record<string, unknown> | undefined,
): void {
  if (mapToApiModelId(modelId) === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
    const errors = validateGemini31FlashTtsExtraParams(extraParams);
    if (errors.length > 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Gemini 3.1 Flash TTS input validation failed: ${errors.join("; ")}`,
      });
    }
  }
}

// Helper to create secure token for Python backend (fallback)
function createMediaToken(userId: number): string {
  return signBearerToken({
    sub: String(userId),
    type: "access", // Required by Python backend for token validation
    scopes: ["media:generate"],
    jti: `media_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
  }, "15m"); // Short-lived token for single request
}

// Get user token - prefer session token from context, fallback to creating new one
function getUserToken(ctx: { userToken: string | null; user: { id: number } }): string {
  return ctx.userToken || createMediaToken(ctx.user.id);
}

async function resolveLibraryTenantIdForMedia(
  ctx: { tenantId: unknown; user: { id: number; currentTenantId?: unknown } },
): Promise<string | null> {
  return resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
}

function isLibraryUrlValidationError(error: unknown): boolean {
  return error instanceof Error && error.name === "LibraryUrlValidationError";
}

const mediaModelLookupCounters = {
  pricingDbMissFallback: 0,
  metadataDbMissFallback: 0,
  unknownModelRejected: 0,
  defaultFromDb: 0,
  defaultFallbackStatic: 0,
};

export function getMediaModelLookupCounters(): Readonly<typeof mediaModelLookupCounters> {
  return { ...mediaModelLookupCounters };
}

export function resetMediaModelLookupCounters(): void {
  mediaModelLookupCounters.pricingDbMissFallback = 0;
  mediaModelLookupCounters.metadataDbMissFallback = 0;
  mediaModelLookupCounters.unknownModelRejected = 0;
  mediaModelLookupCounters.defaultFromDb = 0;
  mediaModelLookupCounters.defaultFallbackStatic = 0;
}

/**
 * Look up a media model from the DB to get its configJson (pricingTiers).
 * Falls back to static metadata only when DB is unavailable or missing the model.
 */
async function getModelWithPricing(modelId: string): Promise<{
  creditCost: number;
  configJson: Record<string, any> | null;
}> {
  const staticConfig = getStaticModelById(modelId)?.configJson as Record<string, any> | null | undefined;
  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ creditCost: mediaModels.creditCost, configJson: mediaModels.configJson })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);
      if (dbModel) {
        const dbConfig = dbModel.configJson as Record<string, any> | null;
        return {
          creditCost: dbModel.creditCost,
          configJson: dbConfig
            ? {
                ...(staticConfig ?? {}),
                ...dbConfig,
              }
            : null,
        };
      }
    }
  } catch (error) {
    console.warn("[MediaModelLookup] Pricing DB lookup failed, fallback to static/default", {
      modelId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
  mediaModelLookupCounters.pricingDbMissFallback += 1;
  const staticModel = getStaticModelById(modelId);
  const hardcoded = MEDIA_MODELS[modelId];
  if (!hardcoded) {
    console.warn("[MediaModelLookup] Pricing fallback used default credit cost", { modelId });
  }
  return {
    creditCost: staticModel?.creditCost ?? hardcoded?.creditCost ?? 10,
    configJson: (staticModel?.configJson as Record<string, any> | null | undefined) ?? null,
  };
}

function resolveConfiguredMaxPromptLength(configJson: Record<string, any> | null | undefined): number | null {
  if (!configJson || typeof configJson !== "object") {
    return null;
  }

  const raw = configJson.maxPromptLength ?? configJson.max_prompt_length;
  if (typeof raw !== "number" && typeof raw !== "string") {
    return null;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.floor(parsed);
}

function resolveModelMaxPromptLength(
  modelId: string,
  configJson: Record<string, any> | null | undefined,
): number | null {
  const dbLimit = resolveConfiguredMaxPromptLength(configJson);
  if (dbLimit !== null) {
    return dbLimit;
  }

  return resolveConfiguredMaxPromptLength(getStaticModelById(modelId)?.configJson);
}

function assertMediaPromptWithinModelLimit(params: {
  value: string;
  modelId: string;
  configJson: Record<string, any> | null | undefined;
  fieldLabel: string;
}): void {
  const maxPromptLength = resolveModelMaxPromptLength(params.modelId, params.configJson);
  if (maxPromptLength !== null && params.value.length > maxPromptLength) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `${params.fieldLabel} is ${params.value.length} characters and exceeds model limit ${maxPromptLength} for the selected model. Shorten it or choose a model with a higher prompt limit.`,
    });
  }
}

/**
 * Post-completion credit reconciliation for async media tasks.
 * Compares actual output (duration/resolution) against pre-reserved credits.
 */
export async function reconcileTaskCredits(params: {
  task: {
    id: string;
    status: string;
    model: string;
    resultData?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
    errorMessage?: string | null;
  };
  userId: number;
}): Promise<{ adjusted: boolean; difference: number; action: "refund" | "charge" | "none" }> {
  const noOp = { adjusted: false, difference: 0, action: "none" as const };
  const { task, userId } = params;

  try {
    const { getCacheClient } = await import("../services/redisClients");
    const redis = getCacheClient();
    const reconcileKey = `credit:reconciled:${task.id}`;
    const alreadyReconciled = await redis.get(reconcileKey);
    if (alreadyReconciled) return noOp;

    // Get reserved credits from task parameters (stored during submission)
    const taskParams = task.parameters ?? {};
    const extraParams = (taskParams as Record<string, unknown>).extraParams as Record<string, unknown> | undefined
      ?? taskParams;
    const originSurface = typeof extraParams.__origin_surface === "string"
      ? extraParams.__origin_surface
      : undefined;
    const reservedCredits = Number(extraParams.__reserved_credits);
    if (!reservedCredits || reservedCredits <= 0) return noOp;

    if (task.status === "failed") {
      await refundCredits({
        userId,
        amount: reservedCredits,
        description: `Credit reconciliation refund: ${task.model} failed`,
        idempotencyKey: `media:${task.id}:failed-refund`,
        sourceType: "media_video",
        metadata: {
          model: task.model,
          taskId: task.id,
          type: "failed_task_refund",
          reservedCost: reservedCredits,
          error: task.errorMessage ?? undefined,
          ...(originSurface ? { originSurface } : {}),
        },
      });

      const difference = -reservedCredits;
      await redis.set(reconcileKey, JSON.stringify({ action: "refund", difference, timestamp: Date.now() }), "EX", 86400);
      return { adjusted: true, difference, action: "refund" };
    }

    // Guard: only completed tasks need actual output reconciliation.
    if (task.status !== "completed") return noOp;

    // Guard: must have actual_duration
    const resultData = task.resultData;
    if (!resultData || typeof resultData.actual_duration !== "number" || resultData.actual_duration <= 0) return noOp;

    // Get model pricing
    let dbModel: { creditCost: number; configJson: Record<string, any> | null };
    try {
      dbModel = await getModelWithPricing(task.model);
    } catch {
      console.warn("[CreditReconciliation] Model not found:", task.model);
      return noOp;
    }

    // Skip per-unit pricing here; output duration/resolution reconciliation does not apply.
    const formula = dbModel.configJson?.pricingFormula;
    if (formula === "per_unit") return noOp;

    // Compute actual cost
    const actualDuration = resultData.actual_duration as number;
    const actualResolution = (resultData.actual_resolution as string) ?? (extraParams.__reserved_resolution as string);
    const actualCost = calculateCreditCost(dbModel, {
      ...(extraParams ?? {}),
      duration: actualDuration,
      resolution: actualResolution,
    });

    const difference = actualCost - reservedCredits;

    if (difference === 0) {
      await redis.set(reconcileKey, JSON.stringify({ action: "none", difference: 0 }), "EX", 86400);
      return noOp;
    }

    let action: "refund" | "charge" = difference < 0 ? "refund" : "charge";

    if (action === "refund") {
      await refundCredits({
        userId,
        amount: Math.abs(difference),
        description: `Credit reconciliation refund: ${task.model} (actual ${actualDuration}s)`,
        idempotencyKey: `media:${task.id}:reconcile-refund`,
        sourceType: "media_video",
        metadata: {
          model: task.model,
          taskId: task.id,
          type: "reconciliation_refund",
          actualCost,
          reservedCost: reservedCredits,
          actualDuration,
          actualResolution,
          ...(originSurface ? { originSurface } : {}),
        },
      });
    } else {
      await deductCredits({
        userId,
        amount: difference,
        description: `Credit reconciliation charge: ${task.model} (actual ${actualDuration}s)`,
        idempotencyKey: `media:${task.id}:reconcile-charge`,
        sourceType: "media_video",
        metadata: {
          model: task.model,
          taskId: task.id,
          type: "reconciliation_charge",
          actualCost,
          reservedCost: reservedCredits,
          actualDuration,
          actualResolution,
          ...(originSurface ? { originSurface } : {}),
        },
      });
    }

    await redis.set(reconcileKey, JSON.stringify({ action, difference, timestamp: Date.now() }), "EX", 86400);
    return { adjusted: true, difference, action };
  } catch (error) {
    console.warn("[CreditReconciliation] Failed:", error instanceof Error ? error.message : error);
    return noOp;
  }
}

function toMediaModelResponse(model: {
  id: string;
  type: MediaType;
  name: string;
  description: string;
  provider: string;
  aliases?: string[];
  creditCost: number;
  supportsAspectRatios?: string[];
  supportsSizes?: string[];
  supportsDurations?: number[];
  supportsVoices?: string[];
  configJson?: Record<string, unknown>;
}) {
  return {
    id: model.id,
    type: model.type,
    name: model.name,
    description: model.description,
    provider: model.provider,
    aliases: model.aliases ?? [],
    creditCost: model.creditCost,
    supportsAspectRatios: model.supportsAspectRatios,
    supportsSizes: model.supportsSizes,
    supportsDurations: model.supportsDurations,
    supportsVoices: model.supportsVoices,
    configJson: model.configJson,
  };
}

type ModelFieldOption = {
  value: string;
  label: string;
  previewUrl?: string;
};

type ProviderApiOptionsSource = {
  type?: string;
  endpoint?: string;
  method?: string;
  headers?: Record<string, unknown>;
  queryParam?: string;
  body?: unknown;
  itemsPath?: string;
  valueField?: string;
  labelField?: string;
  previewField?: string;
  previewBaseUrl?: string;
  valueTransform?: string;
  cacheTtlSeconds?: number;
  voiceLanguageTag?: string;
};

const UVOICE_PUBLIC_VOICE_FILTERS = ["Standard", "Natural", "Premium"] as const;
type UvoiceVoiceTier = "standard" | "natural" | "premium";

function buildUvoiceVoiceSources(
  languageTag: "en" | "th",
  filters: readonly (typeof UVOICE_PUBLIC_VOICE_FILTERS)[number][],
): ProviderApiOptionsSource[] {
  return filters.map((filter) => ({
    type: "public_api",
    endpoint: `https://uvoice.app/?getVoice=true&lang_selected=${languageTag}&filter=${filter}&source=API-DOCS`,
    method: "GET",
    itemsPath: "",
    valueField: "voiceID",
    labelField: "displayName",
    previewField: "path",
    previewBaseUrl: "https://uvoice.app/",
    cacheTtlSeconds: 86400,
    voiceLanguageTag: languageTag,
  }));
}

const modelFieldOptionsCache = new Map<string, { expiresAt: number; options: ModelFieldOption[] }>();
const uvoicePreviewConfigCache: { expiresAt: number; config: { baseUrl: string; token: string } | null } = {
  expiresAt: 0,
  config: null,
};

function isVoiceFieldKey(fieldKey: string): boolean {
  const normalizedFieldKey = fieldKey.trim().toLowerCase();
  return normalizedFieldKey === "voiceid" || normalizedFieldKey === "voice_id" || normalizedFieldKey === "voice";
}

function getPathValue(source: unknown, path: string): unknown {
  if (!path) return source;
  const segments = path.split(".").filter(Boolean);
  let current: unknown = source;
  for (const segment of segments) {
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function normalizeFieldOptions(raw: unknown): ModelFieldOption[] {
  if (!Array.isArray(raw)) return [];

  const options: ModelFieldOption[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const value = item.trim();
      if (!value) continue;
      options.push({ value, label: value });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const valueRaw = record.value;
    const labelRaw = record.label;
    const previewUrlRaw = record.previewUrl;
    const value = typeof valueRaw === "string" ? valueRaw.trim() : "";
    const label = typeof labelRaw === "string" ? labelRaw.trim() : value;
    const previewUrl = typeof previewUrlRaw === "string" ? previewUrlRaw.trim() : "";
    if (!value) continue;
    options.push({ value, label: label || value, ...(previewUrl ? { previewUrl } : {}) });
  }
  return options;
}

function dedupeFieldOptions(options: ModelFieldOption[]): ModelFieldOption[] {
  const seen = new Set<string>();
  const deduped: ModelFieldOption[] = [];
  for (const option of options) {
    const key = option.value.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function applyOptionValueTransform(value: unknown, transform?: string): string {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (transform === "before_dash") {
    return trimmed.split(/\s*-\s*/, 1)[0]?.trim() || trimmed;
  }

  return trimmed;
}

function resolvePreviewUrl(
  item: unknown,
  previewField: string,
  previewBaseUrl?: string,
): string | undefined {
  if (!previewField) {
    return undefined;
  }
  const rawPreview = getPathValue(item, previewField);
  if (typeof rawPreview !== "string") {
    return undefined;
  }
  const trimmed = rawPreview.trim();
  if (!trimmed) {
    return undefined;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return /^https:\/\//i.test(trimmed) ? trimmed : undefined;
  }

  if (previewBaseUrl && /^https:\/\//i.test(previewBaseUrl)) {
    try {
      return new URL(trimmed.replace(/^\//, ""), previewBaseUrl).toString();
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function buildUvoicePreviewUrl(
  relativePath: string,
  config: { baseUrl: string; token: string },
): string | undefined {
  const cleanedPath = relativePath.trim().replace(/^\//, "");
  if (!cleanedPath) {
    return undefined;
  }
  if (!/^https:\/\//i.test(config.baseUrl)) {
    return undefined;
  }
  const token = config.token.trim();
  const normalizedToken = token ? (token.startsWith("?") ? token : `?${token}`) : "";
  return `${config.baseUrl}${cleanedPath}${normalizedToken}`;
}

function isThaiTranslationLanguage(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  return normalized === "thai" || normalized.startsWith("th");
}

function inferUvoiceVoiceTierFromModelId(modelId: string): UvoiceVoiceTier | null {
  const normalized = modelId.trim().toLowerCase();
  if (normalized.endsWith("/tts-premium")) return "premium";
  if (normalized.endsWith("/tts-natural")) return "natural";
  if (normalized.endsWith("/tts-standard")) return "standard";
  return null;
}

function getUvoiceVoiceOptionSources(modelId: string, _includeThai: boolean): ProviderApiOptionsSource[] {
  const tier = inferUvoiceVoiceTierFromModelId(modelId);
  const filters: readonly (typeof UVOICE_PUBLIC_VOICE_FILTERS)[number][] = tier === "premium"
    ? ["Premium"]
    : tier === "natural"
      ? ["Natural"]
      : tier === "standard"
        ? ["Standard"]
        : UVOICE_PUBLIC_VOICE_FILTERS;
  return [
    ...buildUvoiceVoiceSources("en", filters),
    ...buildUvoiceVoiceSources("th", filters),
  ];
}

function applyUvoiceLanguagePrefix(label: string, languageTag: string): string {
  const normalizedTag = languageTag.trim().toLowerCase();
  if (!normalizedTag) {
    return label;
  }
  const prefix = `${normalizedTag} - `;
  return label.toLowerCase().startsWith(prefix) ? label : `${prefix}${label}`;
}

function buildUvoiceVoiceLabel(item: unknown, languageTag: string): string | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const nameRaw = getPathValue(item, "displayName");
  const fallbackNameRaw = getPathValue(item, "name");
  const ageRaw = getPathValue(item, "age");

  const name = typeof nameRaw === "string" && nameRaw.trim().length > 0
    ? nameRaw.trim()
    : typeof fallbackNameRaw === "string" && fallbackNameRaw.trim().length > 0
      ? fallbackNameRaw.trim()
      : "";
  if (!name) {
    return null;
  }
  const age = typeof ageRaw === "string" || typeof ageRaw === "number"
    ? String(ageRaw).trim()
    : "";
  const normalizedAge = age.toUpperCase();
  const ageLabel = normalizedAge === "A"
    ? "Adult"
    : normalizedAge === "YA"
      ? "Young Adult"
      : normalizedAge === "C"
      ? "Child"
      : age;
  const label = ageLabel ? `${name} (${ageLabel})` : name;
  return applyUvoiceLanguagePrefix(label, languageTag);
}

async function fetchUvoiceCombinedVoiceOptions(
  modelId: string,
  query?: string,
  includeThai = false,
): Promise<ModelFieldOption[]> {
  const sources = getUvoiceVoiceOptionSources(modelId, includeThai);
  const merged: ModelFieldOption[] = [];
  for (const source of sources) {
    const options = await fetchProviderApiFieldOptions("uvoice", source, query);
    merged.push(...options);
  }
  return dedupeFieldOptions(merged);
}

async function getUserTranslationLanguagePreference(
  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
  userId: number,
): Promise<string> {
  const [user] = await db
    .select({ userPreferences: users.userPreferences })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const prefs = (user?.userPreferences as Record<string, unknown> | null | undefined) ?? {};
  const rawLanguage = prefs.translationLanguage;
  return typeof rawLanguage === "string" ? rawLanguage : "";
}

async function resolveUvoicePreviewConfig(): Promise<{ baseUrl: string; token: string } | null> {
  const now = Date.now();
  if (uvoicePreviewConfigCache.config && uvoicePreviewConfigCache.expiresAt > now) {
    return uvoicePreviewConfigCache.config;
  }

  try {
    const response = await fetch("https://uvoice.app/", {
      headers: { Accept: "text/html" },
    });
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    const baseUrlMatch = html.match(/var\s+apiBaseAudioUrl\s*=\s*"([^"]+)"/i);
    const tokenMatch = html.match(/var\s+storageToken\s*=\s*"([^"]+)"/i);
    const baseUrl = baseUrlMatch?.[1]?.trim() ?? "";
    const token = tokenMatch?.[1]?.trim() ?? "";
    if (!baseUrl || !token) {
      return null;
    }

    const config = { baseUrl, token };
    uvoicePreviewConfigCache.config = config;
    uvoicePreviewConfigCache.expiresAt = now + (5 * 60 * 1000);
    return config;
  } catch {
    return null;
  }
}

function interpolateTemplateValue(template: unknown, query: string): unknown {
  if (typeof template === "string") {
    return template.replaceAll("{{query}}", query);
  }
  if (Array.isArray(template)) {
    return template.map((entry) => interpolateTemplateValue(entry, query));
  }
  if (!template || typeof template !== "object") {
    return template;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
    out[key] = interpolateTemplateValue(value, query);
  }
  return out;
}

async function resolveProviderConnection(providerName: string): Promise<{ baseUrl: string; apiKey: string } | null> {
  const db = await getDb();
  if (!db) return null;

  const normalizedProviderName = normalizeMediaProviderName(providerName);
  const providers = await db
    .select({
      providerName: mediaProviders.providerName,
      baseUrl: mediaProviders.baseUrl,
      apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
    })
    .from(mediaProviders)
    .where(eq(mediaProviders.isEnabled, true))
    .limit(200);

  const provider = providers.find((candidate) => (
    normalizeMediaProviderName(candidate.providerName) === normalizedProviderName
  ));

  if (!provider?.baseUrl || !provider.apiKeyEncrypted) {
    return null;
  }

  const apiKey = decrypt(provider.apiKeyEncrypted);
  if (!apiKey) {
    return null;
  }

  return {
    baseUrl: provider.baseUrl,
    apiKey,
  };
}

function resolveOptionsSourceForField(
  providerName: string,
  fieldKey: string,
  fieldOptionsSource: unknown,
): ProviderApiOptionsSource | undefined {
  const normalizedProvider = providerName.trim().toLowerCase();
  if (normalizedProvider === "uvoice" && isVoiceFieldKey(fieldKey)) {
    if (fieldOptionsSource && typeof fieldOptionsSource === "object") {
      return fieldOptionsSource as ProviderApiOptionsSource;
    }
    return buildUvoiceVoiceSources("en", ["Standard"])[0];
  }

  if (fieldOptionsSource && typeof fieldOptionsSource === "object") {
    return fieldOptionsSource as ProviderApiOptionsSource;
  }

  return undefined;
}

async function fetchProviderApiFieldOptions(
  providerName: string,
  source: ProviderApiOptionsSource,
  query?: string,
): Promise<ModelFieldOption[]> {
  const sourceTypeRaw = typeof source.type === "string" ? source.type.trim().toLowerCase() : "provider_api";
  const sourceType = sourceTypeRaw === "public_api" ? "public_api" : "provider_api";
  const endpointRaw = typeof source.endpoint === "string" ? source.endpoint.trim() : "";
  if (!endpointRaw) return [];
  const methodRaw = typeof source.method === "string" ? source.method.toUpperCase() : "GET";
  const method = methodRaw === "POST" ? "POST" : "GET";
  const itemsPath = typeof source.itemsPath === "string" ? source.itemsPath : "data";
  const valueField = typeof source.valueField === "string" ? source.valueField : "id";
  const labelField = typeof source.labelField === "string" ? source.labelField : "name";
  const previewField = typeof source.previewField === "string" ? source.previewField : "";
  const previewBaseUrl = typeof source.previewBaseUrl === "string" ? source.previewBaseUrl.trim() : "";
  const valueTransform = typeof source.valueTransform === "string" ? source.valueTransform : "none";
  const previewResolverVersion = providerName.trim().toLowerCase() === "uvoice"
    ? "uvoice_preview_tokenized_v1"
    : "default";
  const cacheTtlSeconds = (
    typeof source.cacheTtlSeconds === "number" && source.cacheTtlSeconds > 0
      ? Math.floor(source.cacheTtlSeconds)
      : 300
  );

  const cacheKey = `${sourceType}|${providerName}|${endpointRaw}|${method}|${itemsPath}|${valueField}|${labelField}|${previewField}|${previewBaseUrl}|${valueTransform}|${previewResolverVersion}|${query ?? ""}`;
  const now = Date.now();
  const cached = modelFieldOptionsCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.options;
  }

  let url: URL;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };

  if (sourceType === "provider_api") {
    // Prevent arbitrary-host fetching from model config. Endpoint must be relative to provider baseUrl.
    if (/^https?:\/\//i.test(endpointRaw)) return [];
    if (endpointRaw.startsWith("//")) return [];
    if (endpointRaw.includes("..")) return [];

    const connection = await resolveProviderConnection(providerName);
    if (!connection) return [];

    url = new URL(endpointRaw.replace(/^\//, ""), `${connection.baseUrl.replace(/\/$/, "")}/`);
    const normalizedProviderName = providerName.trim().toLowerCase();
    if (normalizedProviderName === "magnific") {
      headers["x-magnific-api-key"] = connection.apiKey;
    } else if (normalizedProviderName === "elevenlabs") {
      headers["xi-api-key"] = connection.apiKey;
    } else {
      headers.Authorization = `Bearer ${connection.apiKey}`;
    }
  } else if (sourceType === "public_api") {
    // Public endpoints must be explicit HTTPS URLs.
    if (!/^https:\/\//i.test(endpointRaw)) {
      return [];
    }
    if (endpointRaw.includes("..")) return [];
    url = new URL(endpointRaw);
  } else {
    return [];
  }

  if (query && typeof source.queryParam === "string" && source.queryParam.trim().length > 0) {
    url.searchParams.set(source.queryParam.trim(), query);
  }

  if (method === "POST") {
    headers["Content-Type"] = "application/json";
  }
  if (source.headers && typeof source.headers === "object") {
    for (const [key, value] of Object.entries(source.headers)) {
      if (typeof value === "string" && value.trim().length > 0) {
        headers[key] = value;
      }
    }
  }

  const payload = method === "POST"
    ? interpolateTemplateValue(source.body ?? {}, query ?? "")
    : undefined;

  const response = await fetch(url.toString(), {
    method,
    headers,
    ...(method === "POST" ? { body: JSON.stringify(payload) } : {}),
  });
  if (!response.ok) {
    console.warn("[MediaFieldOptions] provider API returned non-OK", {
      providerName,
      endpoint: endpointRaw,
      status: response.status,
    });
    return [];
  }

  let parsed: unknown = null;
  try {
    parsed = await response.json();
  } catch {
    return [];
  }

  const items = itemsPath ? getPathValue(parsed, itemsPath) : parsed;
  if (!Array.isArray(items)) {
    return [];
  }
  const isUvoiceVoiceSource = (
    providerName.trim().toLowerCase() === "uvoice"
    && sourceType === "public_api"
    && /uvoice\.app/i.test(endpointRaw)
    && endpointRaw.includes("getVoice=true")
  );
  const uvoiceLanguageTag = isUvoiceVoiceSource && typeof source.voiceLanguageTag === "string"
    ? source.voiceLanguageTag.trim().toLowerCase()
    : "";
  const useUvoicePreviewToken = providerName.trim().toLowerCase() === "uvoice" && previewField.length > 0;
  const uvoicePreviewConfig = useUvoicePreviewToken ? await resolveUvoicePreviewConfig() : null;

  const options: ModelFieldOption[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const value = item.trim();
      if (!value) continue;
      options.push({ value, label: value });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const valueRaw = getPathValue(item, valueField);
    const labelRaw = getPathValue(item, labelField);
    const previewPathRaw = getPathValue(item, previewField);
    const value = applyOptionValueTransform(valueRaw, valueTransform);
    const labelFromSource = typeof labelRaw === "string" ? labelRaw.trim() : value;
    const label = isUvoiceVoiceSource
      ? (buildUvoiceVoiceLabel(item, uvoiceLanguageTag) ?? applyUvoiceLanguagePrefix(labelFromSource, uvoiceLanguageTag))
      : labelFromSource;
    const rawPreviewPath = typeof previewPathRaw === "string"
      ? previewPathRaw.trim()
      : "";
    const previewUrl = (
      rawPreviewPath && uvoicePreviewConfig
        ? buildUvoicePreviewUrl(rawPreviewPath, uvoicePreviewConfig)
        : undefined
    ) ?? resolvePreviewUrl(item, previewField, previewBaseUrl);
    if (!value) continue;
    options.push({ value, label: label || value, ...(previewUrl ? { previewUrl } : {}) });
  }

  const deduped = dedupeFieldOptions(options);
  modelFieldOptionsCache.set(cacheKey, {
    expiresAt: now + cacheTtlSeconds * 1000,
    options: deduped,
  });
  return deduped;
}

async function getModelName(modelId: string): Promise<string> {
  try {
    const db = await getDb();
    if (db) {
      const [dbModel] = await db
        .select({ name: mediaModels.name })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);
      if (dbModel?.name) {
        return dbModel.name;
      }
    }
  } catch {
    // Fall through to hardcoded metadata.
  }
  mediaModelLookupCounters.metadataDbMissFallback += 1;
  return MEDIA_MODELS[modelId]?.name ?? modelId;
}

async function getConfiguredMediaProviderNames(): Promise<{
  providerRowsAvailable: boolean;
  names: Set<string>;
}> {
  try {
    const db = await getDb();
    if (!db) {
      return { providerRowsAvailable: false, names: new Set() };
    }

    const rows = await db
      .select({
        providerName: mediaProviders.providerName,
        hasApiKey: mediaProviders.hasApiKey,
        apiKeyEncrypted: mediaProviders.apiKeyEncrypted,
      })
      .from(mediaProviders)
      .where(eq(mediaProviders.isEnabled, true))
      .limit(50);

    return {
      providerRowsAvailable: rows.length > 0,
      names: new Set(
        rows
          .filter((row) =>
            row.hasApiKey ||
            (typeof row.apiKeyEncrypted === "string" && row.apiKeyEncrypted.trim().length > 0),
          )
          .map((row) => normalizeMediaProviderName(row.providerName)),
      ),
    };
  } catch (error) {
    console.warn("[MediaModelLookup] Media provider config lookup failed, falling back to sorted defaults", {
      error: error instanceof Error ? error.message : String(error),
    });
    return { providerRowsAvailable: false, names: new Set() };
  }
}

function pickConfiguredDefaultModelId<T extends { modelId: string; provider: string | null }>(
  rows: T[],
  configuredProviders: ReadonlySet<string>,
): string | null {
  if (rows.length === 0) {
    return null;
  }
  if (configuredProviders.size === 0) {
    return null;
  }
  return (
    rows.find((row) => configuredProviders.has(normalizeMediaProviderName(row.provider)))?.modelId
    ?? rows[0]?.modelId
    ?? null
  );
}

function filterModelsByConfiguredProviders<T extends { provider: string | null }>(
  rows: T[],
  configuredProviderInfo: { providerRowsAvailable: boolean; names: ReadonlySet<string> },
): T[] {
  if (!configuredProviderInfo.providerRowsAvailable) {
    return rows;
  }
  return rows.filter((row) =>
    configuredProviderInfo.names.has(normalizeMediaProviderName(row.provider)),
  );
}

function getAllowedAspectRatiosForModel(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
  fallback: readonly string[] = [],
): string[] {
  return getAllowedAspectRatiosFromConfig(
    configJson ?? getStaticModelById(modelId)?.configJson,
    fallback,
  );
}

function getAllowedDurationsForModel(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
  fallback: readonly number[] = [],
): number[] {
  return getAllowedDurationsFromConfig(
    configJson ?? getStaticModelById(modelId)?.configJson,
    fallback,
  );
}

function getReferenceImageLimitForModel(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
): number | null {
  return getReferenceImageLimitFromConfig(
    configJson ?? getStaticModelById(modelId)?.configJson,
  );
}

function getConfigInputFields(configJson: Record<string, unknown> | null | undefined): Record<string, unknown>[] {
  return Array.isArray(configJson?.inputFields)
    ? configJson.inputFields.filter((field): field is Record<string, unknown> => (
      Boolean(field) && typeof field === "object" && !Array.isArray(field)
    ))
    : [];
}

function getFieldKey(field: Record<string, unknown>): string {
  return typeof field.key === "string" ? field.key.trim() : "";
}

function getFieldType(field: Record<string, unknown>): string {
  return typeof field.type === "string" ? field.type.trim().toLowerCase() : "text";
}

function getFieldSyncTarget(field: Record<string, unknown>): string {
  return typeof field.syncWith === "string" ? field.syncWith.trim().toLowerCase() : "";
}

function getPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
}

function getNumberValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getReferenceVideoField(configJson: Record<string, unknown> | null | undefined): Record<string, unknown> | undefined {
  return getConfigInputFields(configJson).find((field) => (
    getFieldSyncTarget(field) === "reference_videos"
    || getFieldType(field) === "video_urls"
  ));
}

function getReferenceVideoLimitForModel(configJson: Record<string, unknown> | null | undefined): number | null {
  const field = getReferenceVideoField(configJson);
  return getPositiveInteger(field?.maxItems) ?? getPositiveInteger(field?.maxCount);
}

function isReferenceVideoRequiredForModel(configJson: Record<string, unknown> | null | undefined): boolean {
  return Boolean(getReferenceVideoField(configJson)?.required);
}

function getAllowedResolutionsForModel(configJson: Record<string, unknown> | null | undefined): string[] {
  const field = getConfigInputFields(configJson).find((entry) => getFieldKey(entry) === "resolution");
  if (!field || !Array.isArray(field.options)) return [];
  return field.options
    .map((option) => (
      option && typeof option === "object"
        ? String((option as Record<string, unknown>).value ?? "").trim()
        : ""
    ))
    .filter(Boolean);
}

function getFieldOptionValues(field: Record<string, unknown>): string[] {
  if (!Array.isArray(field.options)) return [];
  return field.options
    .map((option) => (
      option && typeof option === "object"
        ? String((option as Record<string, unknown>).value ?? "").trim()
        : ""
    ))
    .filter(Boolean);
}

function getStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
}

function assertPublicOrTenantMediaUrls(urls: readonly string[], label: string): void {
  for (const rawUrl of urls) {
    try {
      if (rawUrl.startsWith("/")) {
        assertRelativeUploadMediaReferencePath(rawUrl, label);
      } else {
        assertPublicSafeHttpUrl(rawUrl, label);
      }
    } catch (error) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: error instanceof Error ? error.message : `${label} must point to a public host.`,
      });
    }
  }
}

function assertNoMagnificWebhookParams(extraParams: Record<string, unknown> | undefined): void {
  if (!extraParams) return;
  const visit = (value: unknown, path: string): void => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    for (const [key, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
      if (normalized === "webhookurl" || normalized === "callbackurl") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Magnific does not allow user-supplied ${key}.`,
        });
      }
      visit(nestedValue, path ? `${path}.${key}` : key);
    }
  };
  visit(extraParams, "");
}

function assertMagnificInputFieldsValid(params: {
  modelId: string;
  configJson: Record<string, unknown> | null | undefined;
  provider?: string | null;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  extraParams?: Record<string, unknown>;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceVideoUrl?: string;
}): void {
  const normalizedProvider = normalizeMediaProviderName(
    params.provider ?? (typeof params.configJson?.provider === "string" ? params.configJson.provider : ""),
  );
  if (normalizedProvider !== "magnific") {
    return;
  }

  assertNoMagnificWebhookParams(params.extraParams);

  const allowedResolutions = getAllowedResolutionsForModel(params.configJson);
  if (params.resolution && allowedResolutions.length > 0 && !allowedResolutions.includes(params.resolution)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported resolution "${params.resolution}" for model "${params.modelId}".`,
    });
  }

  const allReferenceVideos = [
    ...(params.referenceVideoUrls ?? []),
    ...(params.referenceVideoUrl ? [params.referenceVideoUrl] : []),
  ];
  if (isReferenceVideoRequiredForModel(params.configJson) && allReferenceVideos.length === 0) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The selected model "${params.modelId}" requires at least one reference video.`,
    });
  }
  const videoLimit = getReferenceVideoLimitForModel(params.configJson);
  if (videoLimit !== null && allReferenceVideos.length > videoLimit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The selected model allows at most ${videoLimit} reference videos.`,
    });
  }
  assertPublicOrTenantMediaUrls(allReferenceVideos, "Reference video URL");

  const fields = getConfigInputFields(params.configJson);
  for (const field of fields) {
    const key = getFieldKey(field);
    if (!key) continue;
    const type = getFieldType(field);
    const syncTarget = getFieldSyncTarget(field);
    const label = typeof field.label === "string" && field.label.trim() ? field.label.trim() : key;
    let value: unknown = params.extraParams?.[key];
    if (syncTarget === "prompt") value = params.prompt;
    if (syncTarget === "aspect_ratio") value = params.aspectRatio;
    if (syncTarget === "reference_images") value = params.referenceImageUrls;
    if (syncTarget === "reference_videos") value = allReferenceVideos;

    const isMissing = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
    if (field.required && isMissing) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Missing required Magnific field "${label}".`,
      });
    }
    if (isMissing) continue;

    const maxLength = getPositiveInteger(field.maxLength);
    if (maxLength !== null && typeof value === "string" && value.length > maxLength) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `${label} must be at most ${maxLength} characters.`,
      });
    }

    if (type === "select") {
      const allowed = getFieldOptionValues(field);
      if (allowed.length > 0 && !allowed.includes(String(value))) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unsupported ${label} "${String(value)}" for model "${params.modelId}".`,
        });
      }
    }

    if (type === "number") {
      const numericValue = getNumberValue(value);
      if (numericValue === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${label} must be numeric.` });
      }
      const min = getNumberValue(field.min);
      const max = getNumberValue(field.max);
      if (min !== null && numericValue < min) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${label} must be at least ${min}.` });
      }
      if (max !== null && numericValue > max) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `${label} must be at most ${max}.` });
      }
    }

    if (type === "image_urls" || type === "video_urls") {
      const urls = getStringArray(value);
      const maxItems = getPositiveInteger(field.maxItems) ?? getPositiveInteger(field.maxCount);
      if (maxItems !== null && urls.length > maxItems) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `${label} allows at most ${maxItems} item${maxItems === 1 ? "" : "s"}.`,
        });
      }
      assertPublicOrTenantMediaUrls(urls, type === "video_urls" ? "Reference video URL" : "Reference image URL");
    }
  }

  if (params.extraParams?.use_google_search_tool && !params.modelId.includes("nano-banana")) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "use_google_search_tool is only supported on Magnific Nano Banana models.",
    });
  }
}

function isReferenceImageRequiredForModel(
  modelId: string,
  configJson: Record<string, unknown> | null | undefined,
): boolean {
  return isReferenceImageRequiredFromConfig(
    configJson ?? getStaticModelById(modelId)?.configJson,
  );
}

function assertModelAwareVideoRequest(params: {
  modelId: string;
  configJson: Record<string, unknown> | null | undefined;
  provider?: string | null;
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  resolution?: string;
  referenceImageUrls?: string[];
  referenceVideoUrls?: string[];
  referenceVideoUrl?: string;
  extraParams?: Record<string, unknown>;
}): void {
  const hasReferenceImages = (params.referenceImageUrls?.length ?? 0) > 0;
  if (isReferenceImageRequiredForModel(params.modelId, params.configJson) && !hasReferenceImages) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The selected model "${params.modelId}" requires at least one reference image.`,
    });
  }

  const imageLimit = params.configJson
    ? getReferenceImageLimitForModel(params.modelId, params.configJson)
    : null;
  if (imageLimit !== null && (params.referenceImageUrls?.length ?? 0) > imageLimit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The selected model allows at most ${imageLimit} reference images.`,
    });
  }

  const allowedAspectRatios = params.configJson
    ? getAllowedAspectRatiosForModel(params.modelId, params.configJson)
    : [];
  if (params.aspectRatio && allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(params.aspectRatio)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported aspect ratio "${params.aspectRatio}" for model "${params.modelId}".`,
    });
  }

  const allowedDurations = params.configJson
    ? getAllowedDurationsForModel(params.modelId, params.configJson)
    : [];
  if (params.duration !== undefined && allowedDurations.length > 0 && !allowedDurations.includes(params.duration)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported duration "${params.duration}" for model "${params.modelId}".`,
    });
  }

  assertPublicOrTenantMediaUrls(params.referenceImageUrls ?? [], "Reference image URL");
  assertMagnificInputFieldsValid(params);
}

function assertModelAwareImageRequest(params: {
  modelId: string;
  configJson: Record<string, unknown> | null | undefined;
  provider?: string | null;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  referenceImageUrls?: string[];
  extraParams?: Record<string, unknown>;
}): void {
  const imageLimit = params.configJson
    ? getReferenceImageLimitForModel(params.modelId, params.configJson)
    : null;
  if (imageLimit !== null && (params.referenceImageUrls?.length ?? 0) > imageLimit) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `The selected model allows at most ${imageLimit} reference images.`,
    });
  }

  const allowedAspectRatios = params.configJson
    ? getAllowedAspectRatiosForModel(params.modelId, params.configJson)
    : [];
  if (params.aspectRatio && allowedAspectRatios.length > 0 && !allowedAspectRatios.includes(params.aspectRatio)) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Unsupported aspect ratio "${params.aspectRatio}" for model "${params.modelId}".`,
    });
  }

  assertPublicOrTenantMediaUrls(params.referenceImageUrls ?? [], "Reference image URL");
  assertMagnificInputFieldsValid(params);
}

async function getDefaultModelId(type: MediaType, promptText?: string | null): Promise<string> {
  const selection = await resolveEnabledMediaModelSelection({
    mediaType: type,
    requestedModel: inferMediaModelHintFromText(type, promptText),
    requireConfiguredProvider: true,
    allowSubstitution: true,
  });
  if (selection.ok) {
    mediaModelLookupCounters.defaultFromDb += 1;
    return selection.modelId;
  }
  if (selection.reasonCode === "media_registry_unavailable") {
    console.warn("[MediaModelLookup] Default model DB lookup failed, using static default", {
      type,
      error: selection.message,
    });
    mediaModelLookupCounters.defaultFallbackStatic += 1;
    return DEFAULT_MODELS[type];
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: selection.message,
  });
}

async function resolveModelMeta(
  modelId: string,
  expectedType: MediaType,
): Promise<{ provider: string; type: MediaType; name: string }> {
  const db = await getDb();
  if (db) {
    try {
      const [dbModel] = await db
        .select({
          name: mediaModels.name,
          modelType: mediaModels.modelType,
          provider: mediaModels.provider,
          isEnabled: mediaModels.isEnabled,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, modelId))
        .limit(1);

      if (!dbModel) {
        mediaModelLookupCounters.unknownModelRejected += 1;
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid model: ${modelId}`,
        });
      }

      if (!dbModel.isEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Model "${modelId}" is disabled`,
        });
      }

      if (dbModel.modelType !== expectedType) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Model "${modelId}" is not a ${expectedType} model`,
        });
      }

      return { provider: dbModel.provider, type: dbModel.modelType as MediaType, name: dbModel.name || modelId };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.warn("[MediaModelLookup] Metadata DB lookup failed, trying static fallback", {
        modelId,
        expectedType,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const hardcodedModel = MEDIA_MODELS[modelId];
  if (hardcodedModel) {
    mediaModelLookupCounters.metadataDbMissFallback += 1;
    console.warn("[MediaModelLookup] Model metadata fallback hit", { modelId, expectedType });
    if (hardcodedModel.type !== expectedType) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Model "${modelId}" is not a ${expectedType} model`,
      });
    }
    return { provider: hardcodedModel.provider, type: hardcodedModel.type, name: hardcodedModel.name ?? modelId };
  }

  mediaModelLookupCounters.unknownModelRejected += 1;
  throw new TRPCError({
    code: "BAD_REQUEST",
    message: `Invalid model: ${modelId}`,
  });
}

function stableSerializeForAudioHash(value: unknown): string {
  if (value === undefined) {
    return "undefined";
  }
  if (value === null) {
    return "null";
  }
  if (typeof value !== "object") {
    const json = JSON.stringify(value);
    return json === undefined ? String(value) : json;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerializeForAudioHash(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableSerializeForAudioHash(record[key])}`).join(",")}}`;
}

function buildAudioAbuseGuardHash(params: {
  text: string;
  model?: string;
  voice?: string;
  speed?: number;
  extraParams?: Record<string, unknown>;
}): string {
  const normalizedModelId = mapToApiModelId(params.model ?? "");
  const hasGeminiSpeakers =
    normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID
    && Array.isArray(params.extraParams?.speakers)
    && (params.extraParams?.speakers as unknown[]).length > 0;
  return hashPrompt(
    params.text,
    stableSerializeForAudioHash({
      model: params.model ?? "",
      // Gemini ignores top-level voice whenever multi-speaker dialogue is present,
      // so do not let a cosmetic top-level voice change the duplicate key.
      voice: hasGeminiSpeakers ? "" : (params.voice ?? ""),
      speed: params.speed ?? "",
      extraParams: params.extraParams ?? {},
    }),
  );
}

// ==================== Zod Schemas ====================

const mediaTypeSchema = z.enum(["image", "video", "audio"]);
const taskStatusSchema = z.enum(["pending", "processing", "completed", "failed", "cancelled"]);
const mediaModelIdSchema = z.string().min(1).max(120);
const mediaPromptSchema = z.string().min(1);
const flexibleAspectRatioSchema = z.string().min(2).max(20);
const referenceMediaUrlSchema = z
  .string()
  .min(1)
  .max(2048)
  .superRefine((value, ctx) => {
    try {
      if (value.startsWith("/")) {
        assertRelativeUploadMediaReferencePath(value, "Reference URL");
      } else {
        assertPublicSafeHttpUrl(value, "Reference URL");
      }
    } catch (error) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: error instanceof Error ? error.message : "Reference URL is invalid.",
      });
    }
  });

const audioModelSchema = mediaModelIdSchema;

// ==================== Router ====================

export const mediaRouter = router({
  // Get available models (from DB, falls back to hardcoded registry)
  getModels: protectedProcedure
    .input(
      z.object({
        type: mediaTypeSchema.optional(),
      }).optional()
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (db) {
        const conditions = [eq(mediaModels.isEnabled, true)];
        if (input?.type) {
          conditions.push(eq(mediaModels.modelType, input.type as "image" | "video" | "audio"));
        }
        const rows = await db
          .select({
            id: mediaModels.modelId,
            name: mediaModels.name,
            description: mediaModels.description,
            type: mediaModels.modelType,
            provider: mediaModels.provider,
            aliases: mediaModels.aliases,
            creditCost: mediaModels.creditCost,
            supportsAspectRatios: mediaModels.aspectRatios,
            supportsSizes: mediaModels.sizes,
            supportsDurations: mediaModels.durations,
            configJson: mediaModels.configJson,
          })
          .from(mediaModels)
          .where(and(...conditions))
          .orderBy(asc(mediaModels.sortOrder), asc(mediaModels.priority), asc(mediaModels.id));

        const configuredProviderInfo = await getConfiguredMediaProviderNames();
        const selectableRows = filterModelsByConfiguredProviders(rows, configuredProviderInfo);
        const defaultImage = pickConfiguredDefaultModelId(
          selectableRows
            .filter((model) => model.type === "image")
            .map((model) => ({ modelId: model.id, provider: model.provider ?? null })),
          configuredProviderInfo.names,
        );
        const defaultVideo = pickConfiguredDefaultModelId(
          selectableRows
            .filter((model) => model.type === "video")
            .map((model) => ({ modelId: model.id, provider: model.provider ?? null })),
          configuredProviderInfo.names,
        );
        const defaultAudio = pickConfiguredDefaultModelId(
          selectableRows
            .filter((model) => model.type === "audio")
            .map((model) => ({ modelId: model.id, provider: model.provider ?? null })),
          configuredProviderInfo.names,
        );

        const allowStaticDefaultFallback = !configuredProviderInfo.providerRowsAvailable;
        return {
          models: selectableRows,
          defaults: {
            image: defaultImage ?? (allowStaticDefaultFallback ? DEFAULT_MODELS.image : null),
            video: defaultVideo ?? (allowStaticDefaultFallback ? DEFAULT_MODELS.video : null),
            audio: defaultAudio ?? (allowStaticDefaultFallback ? DEFAULT_MODELS.audio : null),
          },
        };
      }
      await refreshModelCache().catch(() => {});
      const registryModels = input?.type
        ? await getModelsByTypeAsync(input.type)
        : await getAllModelsAsync();
      const models = registryModels.map((model) => toMediaModelResponse({
        id: model.id,
        type: model.type,
        name: model.name,
        description: model.description,
        provider: model.provider,
        creditCost: model.creditCost,
        supportsAspectRatios: model.aspectRatios,
        supportsSizes: model.sizes,
        supportsDurations: model.durations,
        supportsVoices: model.voices,
        configJson: model.configJson,
      }));
      return {
        models,
        defaults: {
          image: getDefaultModel("image")?.id ?? DEFAULT_MODELS.image,
          video: getDefaultModel("video")?.id ?? DEFAULT_MODELS.video,
          audio: getDefaultModel("audio")?.id ?? DEFAULT_MODELS.audio,
        },
      };
    }),

  // Get single model details
  getModel: protectedProcedure
    .input(z.object({ modelId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (db) {
        try {
          const [dbModel] = await db
            .select({
              id: mediaModels.modelId,
              type: mediaModels.modelType,
              name: mediaModels.name,
              provider: mediaModels.provider,
              description: mediaModels.description,
              creditCost: mediaModels.creditCost,
              supportsAspectRatios: mediaModels.aspectRatios,
              supportsSizes: mediaModels.sizes,
              supportsDurations: mediaModels.durations,
              supportsVoices: mediaModels.voices,
            })
            .from(mediaModels)
            .where(and(eq(mediaModels.modelId, input.modelId), eq(mediaModels.isEnabled, true)))
            .limit(1);

          if (!dbModel) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `Model ${input.modelId} not found`,
            });
          }

          return dbModel;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.warn("[MediaModelLookup] getModel DB lookup failed, fallback to static registry", {
            modelId: input.modelId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      await refreshModelCache().catch(() => {});
      const model = getModelMetadata(input.modelId);
      if (!model) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Model ${input.modelId} not found`,
        });
      }
      return toMediaModelResponse(model);
    }),

  // Generate image (synchronous)
  generateImage: protectedProcedure
    .input(
      z.object({
        prompt: mediaPromptSchema,
        model: mediaModelIdSchema.optional(),
        size: z.string().optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        negativePrompt: z.string().max(1000).optional(),
        numImages: z.number().min(1).max(4).optional(),
        resolution: z.string().optional(),
        outputFormat: z.string().optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:image",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("image", input.prompt);
      const modelMeta = await resolveModelMeta(model, "image");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.prompt,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Prompt",
      });
      assertModelAwareImageRequest({
        modelId: model,
        configJson: dbModel.configJson,
        provider: modelMeta.provider,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        extraParams: input.extraParams,
      });

      // Check if media should route through sandbox
      if (
        shouldUseSandbox("sandbox-media") &&
        process.env.SANDBOX_REQUIRE_FOR_MEDIA === "true"
      ) {
        const tenantId = resolveTenantIdVarchar(ctx.tenantId, ctx.user.currentTenantId);
        const sandboxResult = await dispatchToSandbox({
          featureType: "media",
          executionMode: "sandbox-media",
          tenantId: tenantId || "",
          userId: ctx.user.id,
          inputFiles: [],
          metadata: {
            model,
            prompt: input.prompt,
            aspectRatio: input.aspectRatio,
            numImages: input.numImages,
            ...input.extraParams,
          },
        });

        return {
          success: true,
          taskId: sandboxResult.jobId,
          isAsync: true,
          message: "Media generation dispatched to secure sandbox",
          isSandboxJob: true,
        };
      }

      const creditCost = calculateCreditCost(dbModel, {
        ...(input.extraParams ?? {}),
        numImages: input.numImages,
        resolution: input.resolution,
      });

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const result = await mediaGenerationService.generateImage(
          {
            prompt: input.prompt,
            model,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
            apiConfig: apiConfigWithProvider,
            extraParams: input.extraParams,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateImage",
              stage: "submission",
            },
          },
          userToken
        );

        // Deduct credits on success — use backend-reported cost if available
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Image generation: ${modelMeta.name}`,
          sourceType: "media_image",
          metadata: {
            model,
            modelDisplayName: modelMeta.name,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            endpoint: "generateImage",
            creditCost,
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Image generation failed",
        });
      }
    }),

  // Generate video (synchronous)
  generateVideo: protectedProcedure
    .input(
      z.object({
        prompt: mediaPromptSchema,
        model: mediaModelIdSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        fps: z.number().min(15).max(60).optional(),
        resolution: z.string().optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        referenceImageUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrl: referenceMediaUrlSchema.optional(),
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:video",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("video", input.prompt);
      const modelMeta = await resolveModelMeta(model, "video");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.prompt,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Prompt",
      });
      const geminiOmniExtraParams = await preflightGeminiOmniVideoRequest({
        model,
        ctx,
        prompt: input.prompt,
        duration: input.duration,
        resolution: input.resolution,
        referenceImageUrls: input.referenceImageUrls,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        extraParams: input.extraParams,
      });
      const normalizedExtraParams = geminiOmniExtraParams
        ? { ...input.extraParams, ...geminiOmniExtraParams }
        : input.extraParams;
      assertModelAwareVideoRequest({
        modelId: model,
        configJson: dbModel.configJson,
        provider: modelMeta.provider,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        duration: input.duration,
        resolution: input.resolution,
        referenceImageUrls: input.referenceImageUrls,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        extraParams: normalizedExtraParams,
      });
      const creditCost = calculateCreditCost(dbModel, {
        ...(normalizedExtraParams ?? {}),
        duration: input.duration,
        resolution: input.resolution,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        video_list: normalizedExtraParams?.video_list,
      });

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const result = await mediaGenerationService.generateVideo(
          {
            prompt: input.prompt,
            model,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
            resolution: input.resolution,
            referenceImageUrls: input.referenceImageUrls,
            referenceVideoUrls: input.referenceVideoUrls,
            referenceVideoUrl: input.referenceVideoUrl,
            apiConfig: apiConfigWithProvider,
            extraParams: normalizedExtraParams,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateVideo",
              stage: "submission",
            },
          },
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Video generation: ${model}`,
          sourceType: "media_video",
          metadata: {
            model,
            provider: modelMeta.provider,
            prompt: input.prompt.slice(0, 100),
            duration: input.duration,
            endpoint: "generateVideo",
            creditCost,
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Video generation failed",
        });
      }
    }),

  // Generate audio (synchronous)
  generateAudio: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        model: audioModelSchema.optional(),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const model = input.model || await getDefaultModelId("audio", input.text);
      const modelMeta = await resolveModelMeta(model, "audio");
      const normalizedModelId = mapToApiModelId(model);
      if (normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
        const errors = validateGemini31FlashTtsAudioRequest(input);
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Gemini 3.1 Flash TTS input validation failed: ${errors.join("; ")}`,
          });
        }
      }
      const normalizedExtraParams = normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID
        ? normalizeGemini31FlashTtsExtraParams(input.extraParams)
        : input.extraParams;
      assertAudioModelExtraParamsValid(model, normalizedExtraParams);

      // Lux TTS rate limit (5 requests per 10 minutes)
      if (isLuxTtsModel(model)) {
        const luxLimit = await checkLuxTtsRateLimit(ctx.user.id);
        if (!luxLimit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Lux TTS rate limit exceeded (5 requests per 10 minutes). Try again in ${luxLimit.retryAfter} seconds.`,
          });
        }
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:audio",
        promptHash: buildAudioAbuseGuardHash({
          text: input.text,
          model,
          voice: input.voice,
          speed: input.speed,
          extraParams: normalizedExtraParams,
        }),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      if (normalizeMediaProviderName(modelMeta.provider) === "omnivoice" && !isDesktopMediaRequest(ctx.req)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OmniVoice voice cloning is available only in the desktop app.",
        });
      }

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.text,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Text",
      });
      if (normalizeMediaProviderName(modelMeta.provider) === "omnivoice") {
        assertOmnivoiceReferenceAudioSize(normalizedExtraParams);
      }
      const creditCost = calculateCreditCost(dbModel, {
        text: input.text,
        ...(normalizedExtraParams ?? {}),
      });

      // Check credits
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const result = await mediaGenerationService.generateAudio(
          {
            text: input.text,
            model: model as AudioModel,
            voice: input.voice,
            speed: input.speed,
            apiConfig: apiConfigWithProvider,
            extraParams: normalizedExtraParams,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateAudio",
              stage: "submission",
            },
          },
          userToken
        );

        // Deduct credits on success
        await deductCredits({
          userId: ctx.user.id,
          amount: result.creditsUsed || creditCost,
          description: `Audio generation: ${model}`,
          sourceType: "media_audio",
          metadata: {
            model,
            provider: modelMeta.provider,
            textLength: input.text.length,
            endpoint: "generateAudio",
            creditCost,
            ...(input.originSurface ? { originSurface: input.originSurface } : {}),
          },
        });

        return result;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Audio generation failed",
        });
      }
    }),

  // Generate audio async (returns task ID)
  generateAudioAsync: protectedProcedure
    .input(
      z.object({
        text: z.string().min(1),
        model: audioModelSchema.optional(),
        voice: z.string().optional(),
        speed: z.number().min(0.5).max(2.0).optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const model = input.model || await getDefaultModelId("audio", input.text);
      const modelMeta = await resolveModelMeta(model, "audio");
      const normalizedModelId = mapToApiModelId(model);
      if (normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID) {
        const errors = validateGemini31FlashTtsAudioRequest(input);
        if (errors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Gemini 3.1 Flash TTS input validation failed: ${errors.join("; ")}`,
          });
        }
      }
      const normalizedExtraParams = normalizedModelId === GEMINI_3_1_FLASH_TTS_MODEL_ID
        ? normalizeGemini31FlashTtsExtraParams(input.extraParams)
        : input.extraParams;
      assertAudioModelExtraParamsValid(model, normalizedExtraParams);

      // Lux TTS rate limit (5 requests per 10 minutes)
      if (isLuxTtsModel(model)) {
        const luxLimit = await checkLuxTtsRateLimit(ctx.user.id);
        if (!luxLimit.allowed) {
          throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Lux TTS rate limit exceeded (5 requests per 10 minutes). Try again in ${luxLimit.retryAfter} seconds.`,
          });
        }
      }

      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:audio_async",
        promptHash: buildAudioAbuseGuardHash({
          text: input.text,
          model,
          voice: input.voice,
          speed: input.speed,
          extraParams: normalizedExtraParams,
        }),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      if (normalizeMediaProviderName(modelMeta.provider) === "omnivoice" && !isDesktopMediaRequest(ctx.req)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "OmniVoice voice cloning is available only in the desktop app.",
        });
      }
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.text,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Text",
      });
      if (normalizeMediaProviderName(modelMeta.provider) === "omnivoice") {
        assertOmnivoiceReferenceAudioSize(normalizedExtraParams);
      }
      const creditCost = calculateCreditCost(dbModel, {
        text: input.text,
        ...(normalizedExtraParams ?? {}),
      });

      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      await deductCredits({
        userId: ctx.user.id,
        amount: creditCost,
        description: `Async audio generation: ${model} (reserved)`,
        sourceType: "media_audio",
        metadata: {
          model,
          provider: modelMeta.provider,
          textLength: input.text.length,
          endpoint: "generateAudioAsync",
          type: "reservation",
          creditCost,
          ...(input.originSurface ? { originSurface: input.originSurface } : {}),
        },
      });

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        return await mediaGenerationService.generateAudioAsync(
          {
            text: input.text,
            model,
            voice: input.voice,
            speed: input.speed,
            apiConfig: apiConfigWithProvider,
            extraParams: normalizedExtraParams,
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateAudioAsync",
              stage: "submission",
            },
          },
          userToken
        );
      } catch (error) {
        console.error("[Media] Audio generation failed, refunding credits:", error);
        try {
          await refundCredits({
            userId: ctx.user.id,
            amount: creditCost,
            description: `Refund: Audio generation failed (${model})`,
            sourceType: "media_audio",
            metadata: {
              model,
              textLength: input.text.length,
              error: error instanceof Error ? error.message : "Unknown error",
              ...(input.originSurface ? { originSurface: input.originSurface } : {}),
            },
          });
        } catch (refundError) {
          console.error("[Media] Failed to refund credits:", refundError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Async audio generation failed",
        });
      }
    }),

  // Generate image async (returns task ID)
  generateImageAsync: protectedProcedure
    .input(
      z.object({
        prompt: mediaPromptSchema,
        model: mediaModelIdSchema.optional(),
        size: z.string().optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        negativePrompt: z.string().max(1000).optional(),
        numImages: z.number().min(1).max(4).optional(),
        resolution: z.string().optional(),
        outputFormat: z.string().optional(),
        referenceImageUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceStyleUrl: referenceMediaUrlSchema.optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:image_async",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("image", input.prompt);
      const modelMeta = await resolveModelMeta(model, "image");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.prompt,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Prompt",
      });
      assertModelAwareImageRequest({
        modelId: model,
        configJson: dbModel.configJson,
        provider: modelMeta.provider,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        resolution: input.resolution,
        referenceImageUrls: input.referenceImageUrls,
        extraParams: input.extraParams,
      });
      const creditCost = calculateCreditCost(dbModel, {
        ...(input.extraParams ?? {}),
        numImages: input.numImages,
        resolution: input.resolution,
      });

      // Check and deduct credits upfront to prevent race condition
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost}`,
        });
      }

      // Deduct credits BEFORE starting the task
      await deductCredits({
        userId: ctx.user.id,
        amount: creditCost,
        description: `Async image generation: ${modelMeta.name} (reserved)`,
        sourceType: "media_image",
        metadata: {
          model,
          modelDisplayName: modelMeta.name,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          endpoint: "generateImageAsync",
          type: "reservation",
          creditCost,
          ...(input.originSurface ? { originSurface: input.originSurface } : {}),
        },
      });

      try {
        const userToken = getUserToken(ctx);
        const debugTraceId = crypto.randomUUID();
        const apiConfigWithProvider = {
          ...(input.apiConfig ?? {}),
          provider: modelMeta.provider,
          trace_id: debugTraceId,
        };

        const task = await mediaGenerationService.generateImageAsync(
          {
            prompt: input.prompt,
            model,
            size: input.size,
            aspectRatio: input.aspectRatio,
            negativePrompt: input.negativePrompt,
            numImages: input.numImages,
            resolution: input.resolution,
            outputFormat: input.outputFormat,
	            referenceImageUrls: input.referenceImageUrls,
	            referenceStyleUrl: input.referenceStyleUrl,
	            apiConfig: apiConfigWithProvider,
	            extraParams: {
	              ...input.extraParams,
	              __reserved_credits: creditCost,
	              __reserved_resolution: input.resolution,
	              ...(input.originSurface ? { __origin_surface: input.originSurface } : {}),
	            },
	            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateImageAsync",
              stage: "submission",
            },
          },
          userToken
        );

        return task;
      } catch (error) {
        // Refund credits on failure
        console.error("[Media] Image generation failed, refunding credits:", error);
        try {
          await refundCredits({
            userId: ctx.user.id,
            amount: creditCost,
            description: `Refund: Image generation failed (${modelMeta.name})`,
            sourceType: "media_image",
            metadata: {
              model,
              modelDisplayName: modelMeta.name,
              prompt: input.prompt.slice(0, 100),
              error: error instanceof Error ? error.message : "Unknown error",
              ...(input.originSurface ? { originSurface: input.originSurface } : {}),
            },
          });
        } catch (refundError) {
          console.error("[Media] Failed to refund credits:", refundError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Async image generation failed",
        });
      }
    }),

  // Generate video async (returns task ID)
  generateVideoAsync: protectedProcedure
    .input(
      z.object({
        prompt: mediaPromptSchema,
        model: mediaModelIdSchema.optional(),
        duration: z.number().min(1).max(60).optional(),
        aspectRatio: flexibleAspectRatioSchema.optional(),
        fps: z.number().min(15).max(60).optional(),
        resolution: z.string().optional(),
        referenceImageUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrl: referenceMediaUrlSchema.optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: extraParamsSchema,
        originSurface: creditOriginSurfaceSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!mediaGenerationLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for media generation. Try again in ${Math.ceil(mediaGenerationLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Abuse guard: detect duplicate/burst/loop patterns
      const abuseResult = await checkAbuseGuard({
        userId: ctx.user.id,
        namespace: "media:video_async",
        promptHash: hashPrompt(input.prompt, input.model),
      });
      if (!abuseResult.allowed) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Request blocked: ${abuseResult.reason}. Retry after ${abuseResult.retryAfter}s.`,
        });
      }

      const model = input.model || await getDefaultModelId("video", input.prompt);
      const modelMeta = await resolveModelMeta(model, "video");

      // Calculate credit cost from DB pricingTiers
      const dbModel = await getModelWithPricing(model);
      assertMediaPromptWithinModelLimit({
        value: input.prompt,
        modelId: model,
        configJson: dbModel.configJson,
        fieldLabel: "Prompt",
      });
      const duration = input.duration || 5;
      const geminiOmniExtraParams = await preflightGeminiOmniVideoRequest({
        model,
        ctx,
        prompt: input.prompt,
        duration,
        resolution: input.resolution,
        referenceImageUrls: input.referenceImageUrls,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        extraParams: input.extraParams,
      });
      const normalizedExtraParams = geminiOmniExtraParams
        ? { ...input.extraParams, ...geminiOmniExtraParams }
        : input.extraParams;
      assertModelAwareVideoRequest({
        modelId: model,
        configJson: dbModel.configJson,
        provider: modelMeta.provider,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        duration,
        resolution: input.resolution,
        referenceImageUrls: input.referenceImageUrls,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        extraParams: normalizedExtraParams,
      });
      const creditCost = calculateCreditCost(dbModel, {
        ...(normalizedExtraParams ?? {}),
        duration,
        resolution: input.resolution,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        video_list: normalizedExtraParams?.video_list,
      });

      // Check and deduct credits upfront to prevent race condition
      const hasCredits = await hasEnoughCredits(ctx.user.id, creditCost);
      if (!hasCredits) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `Insufficient credits. Required: ${creditCost} for ${duration}s video`,
        });
      }

      // Deduct credits BEFORE starting the task
      await deductCredits({
        userId: ctx.user.id,
        amount: creditCost,
        description: `Async video generation: ${model} ${duration}s (reserved)`,
        sourceType: "media_video",
        metadata: {
          model,
          provider: modelMeta.provider,
          prompt: input.prompt.slice(0, 100),
          duration,
          endpoint: "generateVideoAsync",
          type: "reservation",
          creditCost,
          ...(input.originSurface ? { originSurface: input.originSurface } : {}),
        },
      });

      const userToken = getUserToken(ctx);
      const debugTraceId = crypto.randomUUID();
      const apiConfigWithProvider = {
        ...(input.apiConfig ?? {}),
        provider: modelMeta.provider,
        trace_id: debugTraceId,
      };

      try {
        const task = await mediaGenerationService.generateVideoAsync(
          {
            prompt: input.prompt,
            model,
            duration: input.duration,
            aspectRatio: input.aspectRatio,
            fps: input.fps,
            resolution: input.resolution,
            referenceImageUrls: input.referenceImageUrls,
            referenceVideoUrls: input.referenceVideoUrls,
            referenceVideoUrl: input.referenceVideoUrl,
            apiConfig: apiConfigWithProvider,
            extraParams: {
              ...normalizedExtraParams,
              __reserved_credits: creditCost,
              __reserved_resolution: input.resolution,
              __reserved_duration: duration,
              ...(input.originSurface ? { __origin_surface: input.originSurface } : {}),
            },
            publicUrl: ctx.publicUrl ?? undefined,
            auditContext: {
              userId: ctx.user.id,
              traceId: debugTraceId,
              source: "trpc.media.generateVideoAsync",
              stage: "submission",
            },
          },
          userToken
        );

        return task;
      } catch (error) {
        if (isMediaProviderCapacityError(error)) {
          const retryDelayMs = getMediaRetryDelayMsFromError(error) ?? 5 * 60 * 1000;
          console.warn("[Media] Video generation deferred due to provider capacity/rate limit:", {
            model,
            duration,
            retryDelayMs,
            error: error instanceof Error ? error.message : String(error ?? "Unknown error"),
          });
          return await scheduleDeferredVideoRetry({
            userId: ctx.user.id,
            userToken,
            retryDelayMs,
            errorMessage: error instanceof Error ? error.message : "Provider capacity limit",
            request: {
              prompt: input.prompt,
              model,
              duration: input.duration,
              aspectRatio: input.aspectRatio,
              fps: input.fps,
              resolution: input.resolution,
              referenceImageUrls: input.referenceImageUrls,
              referenceVideoUrls: input.referenceVideoUrls,
              referenceVideoUrl: input.referenceVideoUrl,
              apiConfig: apiConfigWithProvider,
              extraParams: {
                ...normalizedExtraParams,
                __reserved_credits: creditCost,
                __reserved_resolution: input.resolution,
                __reserved_duration: duration,
                ...(input.originSurface ? { __origin_surface: input.originSurface } : {}),
              },
              publicUrl: ctx.publicUrl ?? undefined,
              auditContext: {
                userId: ctx.user.id,
                traceId: debugTraceId,
                source: "trpc.media.generateVideoAsync",
                stage: "deferred_after_capacity_limit",
              },
            },
          });
        }

        // Refund credits on failure
        console.error("[Media] Video generation failed, refunding credits:", error);
        try {
          await refundCredits({
            userId: ctx.user.id,
            amount: creditCost,
            description: `Refund: Video generation failed (${model})`,
            sourceType: "media_video",
            metadata: {
              model,
              duration,
              prompt: input.prompt.slice(0, 100),
              error: error instanceof Error ? error.message : "Unknown error",
              ...(input.originSurface ? { originSurface: input.originSurface } : {}),
            },
          });
        } catch (refundError) {
          console.error("[Media] Failed to refund credits:", refundError);
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Async video generation failed",
        });
      }
    }),

  // Get task status
  getTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const deferredTask = await getDeferredMediaTask(
          input.taskId,
          ctx.user.id,
          userToken,
          {
            userId: ctx.user.id,
            source: "trpc.media.getTask",
            stage: "deferred_poll",
          },
        );
        if (deferredTask) {
          return deferredTask;
        }

        const task = await mediaGenerationService.getTask(
          input.taskId,
          userToken,
          {
            userId: ctx.user.id,
            source: "trpc.media.getTask",
            stage: "poll",
          },
        );

        // Credit reconciliation for completed or failed async tasks (non-blocking)
        if (task?.status === "completed" || task?.status === "failed") {
          reconcileTaskCredits({ task: task as any, userId: ctx.user.id }).catch(() => {});
        }

        return task;
      } catch (error) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: error instanceof Error ? error.message : "Task not found",
        });
      }
    }),

  // Persist a failed provider-capacity task as a deferred retry job.
  retryTaskLater: protectedProcedure
    .input(z.object({
      taskId: z.string().min(1),
      retryDelayMs: z.number().min(1000).max(60 * 60 * 1000).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const userToken = getUserToken(ctx);
      const task = await mediaGenerationService.getTask(input.taskId, userToken, {
        userId: ctx.user.id,
        source: "trpc.media.retryTaskLater",
        stage: "inspect_failed_task",
      });
      if (task.mediaType !== "video") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Only video tasks can be deferred for retry." });
      }

      const retryDelayMs =
        input.retryDelayMs
        ?? getMediaRetryDelayMsFromError(task.errorMessage || task.resultData)
        ?? 5 * 60 * 1000;

      const parameters = task.parameters ?? {};
      const extraParams = typeof parameters.extra_params === "object" && parameters.extra_params
        ? parameters.extra_params as Record<string, unknown>
        : typeof parameters.extraParams === "object" && parameters.extraParams
          ? parameters.extraParams as Record<string, unknown>
          : undefined;

      return await scheduleDeferredVideoRetry({
        userId: ctx.user.id,
        userToken,
        retryDelayMs,
        errorMessage: task.errorMessage || "Provider capacity limit",
        request: {
          prompt: task.prompt,
          model: task.model,
          duration: typeof parameters.duration === "number" ? parameters.duration : undefined,
          aspectRatio: typeof parameters.aspect_ratio === "string" ? parameters.aspect_ratio : typeof parameters.aspectRatio === "string" ? parameters.aspectRatio : undefined,
          fps: typeof parameters.fps === "number" ? parameters.fps : undefined,
          resolution: typeof parameters.resolution === "string" ? parameters.resolution : undefined,
          referenceImageUrls: Array.isArray(parameters.reference_image_urls) ? parameters.reference_image_urls.filter((url): url is string => typeof url === "string") : undefined,
          referenceVideoUrls: Array.isArray(parameters.reference_video_urls) ? parameters.reference_video_urls.filter((url): url is string => typeof url === "string") : undefined,
          referenceVideoUrl: typeof parameters.reference_video_url === "string" ? parameters.reference_video_url : undefined,
          extraParams,
          apiConfig: { provider: "kie.ai" },
          publicUrl: ctx.publicUrl ?? undefined,
          auditContext: {
            userId: ctx.user.id,
            source: "trpc.media.retryTaskLater",
            stage: "scheduled_from_failed_task",
          },
        },
      });
    }),

  // Add completed media task result into library + enqueue indexing
  addTaskToLibrary: protectedProcedure
    .input(
      z.object({
        taskId: z.string().min(1),
        title: z.string().min(1).max(255).optional(),
        visibility: z.enum(["private", "team", "public"]).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const tenantId = await resolveLibraryTenantIdForMedia(ctx);
      if (tenantId === null || tenantId === undefined) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Tenant context is required for add-to-library",
        });
      }
      if (!isLibraryEnabledForTenant(tenantId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Library feature is disabled for this tenant",
        });
      }

      try {
        const userToken = getUserToken(ctx);
        const result = await addMediaTaskToLibrary(
          {
            mediaTaskId: input.taskId,
            userToken,
            title: input.title,
            visibility: input.visibility,
          },
          {
            userId: ctx.user.id,
            tenantId: tenantId as any,
            role: ctx.user.role,
          },
        );
        auditLogger.log({
          eventType: "library_mutation",
          userId: ctx.user.id,
          endpoint: "media.addTaskToLibrary",
          requestType: "mutation",
          requestPayload: {
            tenantId,
            taskId: input.taskId,
            visibility: input.visibility ?? "private",
          },
          responsePayload: {
            itemId: result.itemId,
            created: result.created,
            indexJobId: result.indexJob?.jobId ?? null,
          },
        });
        return result;
      } catch (error) {
        const rootCause =
          error instanceof Error && error.cause instanceof Error
            ? error.cause.message
            : null;
        const message = rootCause || (error instanceof Error ? error.message : "Failed to add media task to library");
        if (isLibraryUrlValidationError(error)) {
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
        if (message.includes("Only completed media tasks")) {
          throw new TRPCError({ code: "BAD_REQUEST", message });
        }
        if (message.includes("not found")) {
          throw new TRPCError({ code: "NOT_FOUND", message });
        }
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message });
      }
    }),

  // List user's tasks
  listTasks: protectedProcedure
    .input(
      z.object({
        mediaType: mediaTypeSchema.optional(),
        status: taskStatusSchema.optional(),
        limit: z.number().min(1).max(100).optional(),
        offset: z.number().min(0).optional(),
        daysAgo: z.number().min(1).max(365).optional(),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const result = await mediaGenerationService.listTasks(userToken, {
          mediaType: input?.mediaType as MediaType,
          status: input?.status as TaskStatus,
          limit: input?.limit,
          offset: input?.offset,
          daysAgo: input?.daysAgo,
        });
        const deferredTasks = await listDeferredMediaTasks(ctx.user.id, input?.limit ?? 50);
        const filteredDeferredTasks = deferredTasks.filter((task) => {
          if (input?.mediaType && task.mediaType !== input.mediaType) return false;
          if (input?.status && task.status !== input.status) return false;
          return true;
        });
        const providerTasksForShadowCheck = result.tasks ?? [];
        const activeDeferredTasks = filteredDeferredTasks.filter((task) => {
          if (task.status !== "pending" && task.status !== "processing") {
            return true;
          }
          const deferredCreatedAt = Date.parse(task.createdAt) || 0;
          const hasCompletedReplacement = providerTasksForShadowCheck.some((providerTask) => {
            if (providerTask.mediaType !== task.mediaType) return false;
            if (providerTask.status !== "completed") return false;
            if ((providerTask.prompt || "").trim() !== (task.prompt || "").trim()) return false;
            if ((providerTask.model || "").trim() !== (task.model || "").trim()) return false;
            const providerCreatedAt = Date.parse(providerTask.createdAt) || Date.parse(providerTask.completedAt ?? "") || 0;
            return providerCreatedAt >= deferredCreatedAt;
          });
          return !hasCompletedReplacement;
        });
        const deferredLinkedIds = new Set<string>();
        for (const task of activeDeferredTasks) {
          const parameters = task.parameters ?? {};
          const resultData = typeof task.resultData === "object" && task.resultData ? task.resultData : {};
          for (const candidate of [
            parameters.linkedTaskId,
            parameters.linkedBackendTaskId,
            parameters.linkedProviderTaskId,
            (resultData as Record<string, unknown>).linkedBackendTaskId,
            (resultData as Record<string, unknown>).linkedProviderTaskId,
          ]) {
            if (typeof candidate === "string" && candidate.trim()) {
              deferredLinkedIds.add(candidate);
            }
          }
        }
        const providerTasks = (result.tasks ?? []).filter((task) => {
          if (deferredLinkedIds.has(task.id)) return false;
          if (task.taskId && deferredLinkedIds.has(task.taskId)) return false;
          return true;
        });
        const mergedTasks = [...activeDeferredTasks, ...providerTasks]
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
          .slice(0, input?.limit ?? 50);
        return {
          ...result,
          tasks: mergedTasks,
          total: (result.total ?? result.tasks?.length ?? 0) + activeDeferredTasks.length,
          limit: input?.limit ?? result.limit,
          offset: input?.offset ?? result.offset,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list tasks",
        });
      }
    }),

  // List ALL tasks (admin only)
  listAllTasks: adminProcedure
    .input(
      z.object({
        mediaType: z.enum(["image", "video", "audio"]).optional(),
        status: z.enum(["pending", "processing", "completed", "failed", "cancelled"]).optional(),
        limit: z.number().min(1).max(200).default(50),
        offset: z.number().min(0).default(0),
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const runtime = await getAppRuntimeConfig();

        const params = new URLSearchParams();
        if (input?.mediaType) params.append("media_type", input.mediaType);
        if (input?.status) params.append("status_filter", input.status);
        if (input?.limit) params.append("limit", input.limit.toString());
        if (input?.offset) params.append("offset", input.offset.toString());

        const url = `${runtime.pythonBackendUrl}/api/v1/media/tasks/admin${params.toString() ? `?${params}` : ""}`;
        const response = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          const msg = error.detail || `Admin list tasks failed: ${response.status}`;
          const code = response.status === 401 ? "UNAUTHORIZED"
            : response.status === 403 ? "FORBIDDEN"
            : response.status === 404 ? "NOT_FOUND"
            : "INTERNAL_SERVER_ERROR";
          throw new TRPCError({ code, message: msg });
        }

        return await response.json();
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to list all tasks",
        });
      }
    }),

  // Cancel a task
  cancelTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const deferredTask = await cancelDeferredMediaTask(input.taskId, ctx.user.id);
        if (deferredTask) {
          return deferredTask;
        }

        const userToken = getUserToken(ctx);
        const task = await mediaGenerationService.cancelTask(input.taskId, userToken);
        return task;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to cancel task",
        });
      }
    }),

  // Delete a task (removes from history)
  deleteTask: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const deletedDeferredTask = await deleteDeferredMediaTask(input.taskId, ctx.user.id);
        if (deletedDeferredTask) {
          return { success: true, taskId: input.taskId };
        }

        const userToken = getUserToken(ctx);
        const runtime = await getAppRuntimeConfig();

        const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/media/tasks/${input.taskId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Delete task failed: ${response.status}`);
        }

        return { success: true, taskId: input.taskId };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete task",
        });
      }
    }),

  // Fetch task result from provider (useful when callback/polling update wasn't received)
  fetchTaskResult: protectedProcedure
    .input(z.object({ taskId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userToken = getUserToken(ctx);
        const runtime = await getAppRuntimeConfig();

        const response = await fetch(`${runtime.pythonBackendUrl}/api/v1/media/tasks/${input.taskId}/fetch-result`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${userToken}`,
          },
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: "Unknown error" }));
          throw new Error(error.detail || `Fetch result failed: ${response.status}`);
        }

        const payload = await response.json() as Record<string, unknown>;
        const taskPayload = payload.task;
        return {
          ...payload,
          task: taskPayload && typeof taskPayload === "object"
            ? mediaGenerationService.mapTask(taskPayload as Record<string, unknown>)
            : undefined,
        };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch task result",
        });
      }
    }),

  // Resolve selectable options for a dynamic model field (table-driven, supports provider API sources)
  listModelFieldOptions: protectedProcedure
    .input(
      z.object({
        modelId: mediaModelIdSchema,
        fieldKey: z.string().min(1).max(120),
        query: z.string().max(120).optional(),
        limit: z.number().min(1).max(2000).default(200),
      })
    )
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) {
        return { options: [] as ModelFieldOption[], source: "none" as const };
      }

      const [model] = await db
        .select({
          modelType: mediaModels.modelType,
          provider: mediaModels.provider,
          configJson: mediaModels.configJson,
          isEnabled: mediaModels.isEnabled,
        })
        .from(mediaModels)
        .where(eq(mediaModels.modelId, input.modelId))
        .limit(1);

      if (!model || !model.isEnabled) {
        return { options: [] as ModelFieldOption[], source: "none" as const };
      }

      const config = model.configJson as Record<string, unknown> | null | undefined;
      const inputFields = Array.isArray(config?.inputFields) ? config?.inputFields as Record<string, any>[] : [];
      const field = inputFields.find((entry) => entry?.key === input.fieldKey);
      if (!field) {
        return { options: [] as ModelFieldOption[], source: "none" as const };
      }
      const isUvoiceVoiceField = model.provider.trim().toLowerCase() === "uvoice"
        && isVoiceFieldKey(String(field.key ?? ""));

      const staticOptions = normalizeFieldOptions(field.options);

      let dynamicOptions: ModelFieldOption[] = [];
      if (isUvoiceVoiceField) {
        let includeThaiVoices = false;
        const userId = ctx?.user?.id;
        if (typeof userId === "number" && Number.isFinite(userId)) {
          try {
            const translationLanguage = await getUserTranslationLanguagePreference(db, userId);
            includeThaiVoices = isThaiTranslationLanguage(translationLanguage);
          } catch {
            includeThaiVoices = false;
          }
        }
        dynamicOptions = await fetchUvoiceCombinedVoiceOptions(input.modelId, input.query, includeThaiVoices);
      } else {
        const optionsSource = resolveOptionsSourceForField(model.provider, String(field.key ?? ""), field.optionsSource);
        const sourceType = typeof optionsSource?.type === "string"
          ? optionsSource.type.trim().toLowerCase()
          : "provider_api";
        if (
          optionsSource
          && typeof optionsSource === "object"
          && (sourceType === "provider_api" || sourceType === "public_api")
        ) {
          dynamicOptions = await fetchProviderApiFieldOptions(model.provider, optionsSource, input.query);
        }
      }

      const merged = isUvoiceVoiceField
        ? dedupeFieldOptions([
          ...dynamicOptions,
          ...staticOptions,
        ])
        : dedupeFieldOptions([
          ...dynamicOptions,
          ...staticOptions,
        ]);

      const normalizedQuery = input.query?.trim().toLowerCase();
      const filtered = normalizedQuery
        ? merged.filter((opt) =>
            opt.label.toLowerCase().includes(normalizedQuery) ||
            opt.value.toLowerCase().includes(normalizedQuery),
          )
        : merged;

      return {
        options: filtered.slice(0, input.limit),
        source:
          dynamicOptions.length > 0
            ? staticOptions.length > 0
              ? "merged"
              : "dynamic"
            : staticOptions.length > 0
              ? "static"
              : "none",
      };
    }),

  // Estimate credits for generation
  estimateCredits: protectedProcedure
    .input(
      z.object({
        type: mediaTypeSchema,
        model: z.string().optional(),
        numImages: z.number().optional(),
        duration: z.number().optional(),
        resolution: z.string().optional(),
        text: z.string().optional(),
        referenceVideoUrls: z.array(referenceMediaUrlSchema).max(5).optional(),
        referenceVideoUrl: referenceMediaUrlSchema.optional(),
        extraParams: z.record(z.any()).optional(),
      })
    )
    .query(async ({ input }) => {
      const modelId = input.model || await getDefaultModelId(input.type);
      await resolveModelMeta(modelId, input.type);
      const modelName = await getModelName(modelId);

      // Calculate from DB pricingTiers
      const dbModel = await getModelWithPricing(modelId);
      const estimatedCredits = calculateCreditCost(dbModel, {
        numImages: input.numImages,
        duration: input.duration,
        resolution: input.resolution,
        text: input.text,
        referenceVideoUrls: input.referenceVideoUrls,
        referenceVideoUrl: input.referenceVideoUrl,
        ...(input.extraParams ?? {}),
        video_list: input.extraParams?.video_list ?? input.referenceVideoUrls ?? (input.referenceVideoUrl ? [input.referenceVideoUrl] : undefined),
      });

      return {
        model: modelId,
        modelName,
        baseCredits: dbModel.creditCost,
        estimatedCredits,
        multiplier: input.numImages || 1,
      };
    }),
});
