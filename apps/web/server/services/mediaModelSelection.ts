import {
  getDefaultModel,
  getModelIdsByType,
  type MediaType,
} from "./modelRegistry";

type MediaModelSelection = {
  availableModels?: string[] | null;
  defaultModel?: string | null;
};

type SanitizeMediaModelSelectionOptions = {
  fallbackToTypeDefault?: boolean;
};

export function resolveMediaTypeFromSkillCategory(category: string | null | undefined): MediaType | null {
  const normalized = String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-");

  if (normalized === "image-generation") return "image";
  if (normalized === "video-generation") return "video";
  if (normalized === "audio-generation") return "audio";
  return null;
}

function normalizeModelId(modelId: string | null | undefined): string | null {
  if (typeof modelId !== "string") return null;
  const trimmed = modelId.trim();
  if (!trimmed) return null;

  const legacyMappings: Record<string, string> = {
    google_nano_banana_pro: "google-nano-banana-pro",
    google_banana_2: "google-banana-2",
    flux_2_0: "flux-2.0",
    z_image: "z-image",
    grok_imagine: "grok-imagine",
    veo_3_1: "veo-3-1",
    sora_2: "sora-2",
    kling_2_6: "kling-2.6",
    elevenlabs_tts: "elevenlabs-tts",
    elevenlabs_sfx: "elevenlabs-sfx",
  };

  return legacyMappings[trimmed] || trimmed;
}

export function sanitizeMediaModelSelectionWithEnabledIds(
  enabledModelIds: readonly string[],
  selection: MediaModelSelection,
  options: SanitizeMediaModelSelectionOptions = {},
  fallbackDefaultModelId?: string | null,
): {
  availableModels: string[] | null;
  defaultModel: string | null;
} {
  const enabledSet = new Set(
    enabledModelIds
      .map((modelId) => normalizeModelId(modelId))
      .filter((modelId): modelId is string => !!modelId),
  );

  const explicitAvailableModels = Array.isArray(selection.availableModels);
  const filteredAvailableModels = explicitAvailableModels
    ? Array.from(new Set(
      (selection.availableModels ?? [])
        .map((modelId) => normalizeModelId(modelId))
        .filter((modelId): modelId is string => !!modelId && enabledSet.has(modelId)),
    ))
    : null;

  const normalizedDefaultModel = normalizeModelId(selection.defaultModel);
  let defaultModel = normalizedDefaultModel && enabledSet.has(normalizedDefaultModel)
    ? normalizedDefaultModel
    : null;

  if (!defaultModel && filteredAvailableModels && filteredAvailableModels.length > 0) {
    defaultModel = filteredAvailableModels[0];
  }

  if (
    !defaultModel
    && !explicitAvailableModels
    && options.fallbackToTypeDefault !== false
  ) {
    const normalizedFallbackDefaultModel = normalizeModelId(fallbackDefaultModelId);
    if (normalizedFallbackDefaultModel && enabledSet.has(normalizedFallbackDefaultModel)) {
      defaultModel = normalizedFallbackDefaultModel;
    }
  }

  return {
    availableModels: filteredAvailableModels,
    defaultModel,
  };
}

export function sanitizeMediaModelSelection(
  type: MediaType,
  selection: MediaModelSelection,
  options: SanitizeMediaModelSelectionOptions = {},
): {
  availableModels: string[] | null;
  defaultModel: string | null;
} {
  const enabledModelIds = getModelIdsByType(type);
  return sanitizeMediaModelSelectionWithEnabledIds(
    enabledModelIds,
    selection,
    options,
    getDefaultModel(type)?.id ?? null,
  );
}
