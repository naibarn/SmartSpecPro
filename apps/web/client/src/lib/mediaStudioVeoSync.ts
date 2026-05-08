export const VEO_STORYBOARD_SKILL_ID = "video-storyboard-to-prompts";
export const SELECTED_MEDIA_STUDIO_VEO_MODEL = "__selected_media_studio_veo_model__";

export type MediaStudioVeoModelLike = {
  modelId?: string | null;
  id?: string | null;
  name?: string | null;
  configJson?: unknown;
};

const KNOWN_VEO_MODEL_VALUES = new Set(["veo3_lite", "veo3_fast", "veo3"]);
const NEWS_NARRATION_ONLY_FIELDS = [
  "newsScript",
  "newsLanguageMode",
  "newsNarrationStyle",
  "newsSpeechPace",
  "newsBackgroundStyle",
  "newsClipDensity",
  "maxSpokenSecondsPerClip",
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function parseConfigJson(configJson: unknown): Record<string, unknown> | null {
  if (typeof configJson === "string") {
    try {
      return asRecord(JSON.parse(configJson));
    } catch {
      return null;
    }
  }
  return asRecord(configJson);
}

function cleanString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getVeoProviderModelId(model: MediaStudioVeoModelLike | null | undefined): string {
  const config = parseConfigJson(model?.configJson);
  const configured = cleanString(config?.kieModelId ?? config?.kie_model_id ?? config?.modelId ?? config?.model_id);
  if (configured) return configured;

  const modelId = cleanString(model?.modelId ?? model?.id);
  const normalizedModelId = modelId.toLowerCase();
  const isKnownVeo31Route =
    /(?:^|[-_/])veo[-_/.]?3(?:[-_/.]?1)?(?:$|[-_/])/.test(normalizedModelId)
    || normalizedModelId.includes("generate-veo-3");
  if (isKnownVeo31Route && /lite/i.test(modelId)) return "veo3_lite";
  if (isKnownVeo31Route && /fast/i.test(modelId)) return "veo3_fast";
  if (isKnownVeo31Route) return "veo3";
  if (/veo/i.test(modelId)) return modelId;
  return "";
}

export function isVeoProviderModelId(value: unknown): boolean {
  const normalized = cleanString(value).toLowerCase();
  return /(?:^|[-_/])veo(?:\d|[-_/.]|$)/.test(normalized);
}

export function isFastVeoProviderModelId(value: unknown): boolean {
  return isVeoProviderModelId(value) && /(?:^|[-_/])fast(?:$|[-_/])/.test(cleanString(value).toLowerCase());
}

export function hasThaiText(value: unknown): boolean {
  return /[\u0E00-\u0E7F]/.test(cleanString(value));
}

export function resolveNewsDialogueLanguage(values: Record<string, unknown>): "th" | "en" | null {
  const mode = cleanString(values.newsLanguageMode).toLowerCase();
  if (mode === "thai") return "th";
  if (mode === "english") return "en";

  const source = [
    cleanString(values.newsScript),
    cleanString(values.userIdea),
    cleanString(values.prompt),
    cleanString(values.request),
  ].filter(Boolean).join("\n");

  if (!source) return null;
  return hasThaiText(source) ? "th" : "en";
}

export function sanitizeVeoStoryboardSkillInputs(values: Record<string, unknown>): Record<string, unknown> {
  const next = { ...values };
  if (next.contentMode !== "news_narration") {
    for (const field of NEWS_NARRATION_ONLY_FIELDS) {
      delete next[field];
    }
    return next;
  }

  const dialogueLanguage = resolveNewsDialogueLanguage(next);
  if (dialogueLanguage) {
    next.dialogueLanguage = dialogueLanguage;
  }
  return next;
}

export function isVeoMediaModel(model: MediaStudioVeoModelLike | null | undefined): boolean {
  return isVeoProviderModelId(getVeoProviderModelId(model));
}

export function skillModelValueForMediaModel(model: MediaStudioVeoModelLike | null | undefined): string {
  const providerModel = getVeoProviderModelId(model);
  if (!providerModel) return "";
  if (KNOWN_VEO_MODEL_VALUES.has(providerModel)) return providerModel;
  return isVeoProviderModelId(providerModel) ? SELECTED_MEDIA_STUDIO_VEO_MODEL : "";
}

export function findMediaModelIdForVeoSkillModel(
  visibleModels: readonly MediaStudioVeoModelLike[],
  skillModelValue: unknown,
): string | null {
  const requested = cleanString(skillModelValue);
  if (!requested || requested === SELECTED_MEDIA_STUDIO_VEO_MODEL) return null;

  const match = visibleModels.find((model) => getVeoProviderModelId(model) === requested);
  return cleanString(match?.modelId ?? match?.id) || null;
}

function findFastVeoMediaModelId(visibleModels: readonly MediaStudioVeoModelLike[]): string | null {
  const match = visibleModels.find((model) => isFastVeoProviderModelId(getVeoProviderModelId(model)));
  return cleanString(match?.modelId ?? match?.id) || null;
}

export function normalizeVeoGenerationType(value: unknown): string {
  const generationType = cleanString(value);
  return [
    "TEXT_2_VIDEO",
    "FIRST_AND_LAST_FRAMES_2_VIDEO",
    "REFERENCE_2_VIDEO",
  ].includes(generationType)
    ? generationType
    : "";
}

export function normalizeVeoOutputQuality(value: unknown): string {
  const quality = cleanString(value);
  return ["720p", "1080p", "4K"].includes(quality) ? quality : "";
}

export function normalizeVeoAspectRatioValue(value: unknown): string {
  const ratio = cleanString(value);
  if (!ratio) return "";
  if (ratio.toLowerCase() === "auto") return "auto";
  if (ratio === "16:9" || ratio === "9:16") return ratio;
  return "";
}

export function normalizeVeoAspectRatioForGenerationType(
  generationType: unknown,
  aspectRatio: unknown,
): string {
  const type = normalizeVeoGenerationType(generationType);
  const ratio = normalizeVeoAspectRatioValue(aspectRatio) || "auto";
  if (type === "REFERENCE_2_VIDEO" && ratio.toLowerCase() === "auto") {
    return "16:9";
  }
  return ratio;
}

export function resolveVeoSyncedAspectRatio(params: {
  generationType?: unknown;
  studioAspectRatio?: unknown;
  modelInputValues?: Record<string, unknown>;
  skillAspectRatio?: unknown;
}): string {
  const studioAspectRatio = normalizeVeoAspectRatioValue(params.studioAspectRatio);
  const modelInputAspectRatio = normalizeVeoAspectRatioValue(
    params.modelInputValues?.aspect_ratio ?? params.modelInputValues?.aspectRatio,
  );
  const skillAspectRatio = normalizeVeoAspectRatioValue(params.skillAspectRatio);
  const sourceAspectRatio = studioAspectRatio || modelInputAspectRatio || skillAspectRatio || "auto";
  return normalizeVeoAspectRatioForGenerationType(params.generationType, sourceAspectRatio);
}

export function buildVeoSkillToMediaStudioSync(params: {
  skillValues: Record<string, unknown>;
  selectedModel: string;
  visibleModels: readonly MediaStudioVeoModelLike[];
  aspectRatio: string;
}): {
  selectedModelId?: string;
  modelInputPatch: Record<string, unknown>;
  aspectRatio?: string;
  resolvedProviderModel?: string;
} {
  const skillModel = cleanString(params.skillValues.veoModel);
  const selectedModelData = params.visibleModels.find((model) => cleanString(model.modelId ?? model.id) === params.selectedModel);
  const selectedProviderModel = getVeoProviderModelId(selectedModelData);
  if (!isVeoProviderModelId(selectedProviderModel)) {
    return { modelInputPatch: {} };
  }
  const generationType = normalizeVeoGenerationType(params.skillValues.generationType);
  const skillProviderModel = cleanString(params.skillValues.veoProviderModel);
  const isAutoSeededLiteAgainstFutureVeo = (
    skillModel === "veo3_lite"
    && !skillProviderModel
    && isVeoProviderModelId(selectedProviderModel)
    && !KNOWN_VEO_MODEL_VALUES.has(selectedProviderModel)
  );
  const effectiveSkillModel = isAutoSeededLiteAgainstFutureVeo
    ? SELECTED_MEDIA_STUDIO_VEO_MODEL
    : skillModel;
  const requestedModelId = findMediaModelIdForVeoSkillModel(params.visibleModels, effectiveSkillModel);
  const requestedModelData = requestedModelId
    ? params.visibleModels.find((model) => cleanString(model.modelId ?? model.id) === requestedModelId)
    : selectedModelData;
  const requestedProviderModel = effectiveSkillModel === SELECTED_MEDIA_STUDIO_VEO_MODEL
    ? selectedProviderModel
    : getVeoProviderModelId(requestedModelData) || skillProviderModel;
  const fastModelId = generationType === "REFERENCE_2_VIDEO" && !isFastVeoProviderModelId(requestedProviderModel)
    ? findFastVeoMediaModelId(params.visibleModels)
    : null;
  const targetModelId = fastModelId || requestedModelId;
  const targetModelData = targetModelId
    ? params.visibleModels.find((model) => cleanString(model.modelId ?? model.id) === targetModelId)
    : selectedModelData;
  const resolvedProviderModel = effectiveSkillModel === SELECTED_MEDIA_STUDIO_VEO_MODEL
    ? getVeoProviderModelId(targetModelData) || selectedProviderModel
    : getVeoProviderModelId(targetModelData) || skillProviderModel;

  if (!isVeoProviderModelId(resolvedProviderModel)) {
    return { modelInputPatch: {} };
  }

  const outputQuality = normalizeVeoOutputQuality(params.skillValues.outputQuality ?? params.skillValues.resolution);
  const modelInputPatch: Record<string, unknown> = {};
  if (generationType) modelInputPatch.generationType = generationType;
  if (outputQuality) modelInputPatch.resolution = outputQuality;
  if (Object.prototype.hasOwnProperty.call(params.skillValues, "enableTranslation")) {
    modelInputPatch.enableTranslation = Boolean(params.skillValues.enableTranslation);
  }
  if (Object.prototype.hasOwnProperty.call(params.skillValues, "enableFallback")) {
    modelInputPatch.enableFallback = Boolean(params.skillValues.enableFallback);
  }
  if (Object.prototype.hasOwnProperty.call(params.skillValues, "watermark")) {
    modelInputPatch.watermark = cleanString(params.skillValues.watermark);
  }

  const currentAspectRatio = normalizeVeoAspectRatioValue(params.aspectRatio) || "auto";
  const nextAspectRatio = normalizeVeoAspectRatioForGenerationType(
    generationType,
    currentAspectRatio,
  );
  modelInputPatch.aspect_ratio = nextAspectRatio;

  return {
    ...(targetModelId && targetModelId !== params.selectedModel ? { selectedModelId: targetModelId } : {}),
    modelInputPatch,
    ...(nextAspectRatio !== currentAspectRatio ? { aspectRatio: nextAspectRatio } : {}),
    resolvedProviderModel,
  };
}

export function buildMediaStudioToVeoSkillSync(params: {
  selectedModelData: MediaStudioVeoModelLike | null | undefined;
  modelInputValues: Record<string, unknown>;
  aspectRatio?: string;
}): Record<string, unknown> {
  const providerModel = getVeoProviderModelId(params.selectedModelData);
  if (!isVeoProviderModelId(providerModel)) return {};

  const generationType = normalizeVeoGenerationType(params.modelInputValues.generationType);
  const outputQuality = normalizeVeoOutputQuality(params.modelInputValues.resolution);
  const patch: Record<string, unknown> = {
    veoModel: skillModelValueForMediaModel(params.selectedModelData),
    veoProviderModel: providerModel,
  };
  if (generationType) patch.generationType = generationType;
  if (outputQuality) {
    patch.outputQuality = outputQuality;
    patch.resolution = outputQuality;
  }
  if (Object.prototype.hasOwnProperty.call(params.modelInputValues, "enableTranslation")) {
    patch.enableTranslation = Boolean(params.modelInputValues.enableTranslation);
  }
  if (Object.prototype.hasOwnProperty.call(params.modelInputValues, "enableFallback")) {
    patch.enableFallback = Boolean(params.modelInputValues.enableFallback);
  }
  if (Object.prototype.hasOwnProperty.call(params.modelInputValues, "watermark")) {
    patch.watermark = cleanString(params.modelInputValues.watermark);
  }
  patch.aspectRatio = resolveVeoSyncedAspectRatio({
    generationType,
    studioAspectRatio: params.aspectRatio,
    modelInputValues: params.modelInputValues,
  });
  return patch;
}
