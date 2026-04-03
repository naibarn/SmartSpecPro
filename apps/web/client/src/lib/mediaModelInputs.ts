export type ModelInputSyncTarget =
  | "none"
  | "reference_images"
  | "reference_videos"
  | "prompt"
  | "aspect_ratio";

export interface MediaModelOption {
  id: string;
  name: string;
  provider?: string;
  configJson?: unknown;
}

export interface ModelInputFieldOption {
  value: string | number | boolean;
  label: string;
  previewUrl?: string;
}

export interface ModelInputField {
  key: string;
  label: string;
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "library_file";
  options?: ModelInputFieldOption[];
  default?: unknown;
  required?: boolean;
  syncWith: ModelInputSyncTarget;
  affectsPricing?: boolean;
  searchable?: boolean;
  maxItems?: number;
  optionsSource?: {
    type?: string;
  };
}

export interface ModelReferenceInputSupport {
  imageUrls: boolean;
  videoUrls: boolean;
  audioUrls: boolean;
}

export const LIBRARY_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
export const LIBRARY_VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
export const LIBRARY_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];

function parsePositiveInteger(value: unknown): number | undefined {
  if (typeof value !== "number" && typeof value !== "string") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return Math.floor(parsed);
}

function normalizeGenerateType(configJson: unknown): string | null {
  if (!configJson || typeof configJson !== "object") {
    return null;
  }
  const raw = (configJson as { generateType?: unknown }).generateType;
  if (typeof raw !== "string") {
    return null;
  }
  const normalized = raw.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function readBooleanFlag(source: Record<string, unknown> | null | undefined, keys: string[]): boolean | null {
  if (!source) {
    return null;
  }
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "boolean") {
      return value;
    }
  }
  return null;
}

function readReferenceInputOverrides(configJson: Record<string, unknown>): Partial<ModelReferenceInputSupport> {
  const overrides: Partial<ModelReferenceInputSupport> = {};
  const nested = configJson.referenceInputs;
  const nestedObject = nested && typeof nested === "object" ? nested as Record<string, unknown> : null;

  const imageOverride =
    readBooleanFlag(configJson, ["supportsReferenceImages", "supportsImageReferences", "supportsImageInput"]) ??
    readBooleanFlag(nestedObject, ["image", "images"]);
  const videoOverride =
    readBooleanFlag(configJson, ["supportsReferenceVideos", "supportsVideoReferences", "supportsVideoInput"]) ??
    readBooleanFlag(nestedObject, ["video", "videos"]);
  const audioOverride =
    readBooleanFlag(configJson, ["supportsReferenceAudio", "supportsAudioReferences", "supportsAudioInput"]) ??
    readBooleanFlag(nestedObject, ["audio", "audios"]);

  if (imageOverride !== null) overrides.imageUrls = imageOverride;
  if (videoOverride !== null) overrides.videoUrls = videoOverride;
  if (audioOverride !== null) overrides.audioUrls = audioOverride;

  return overrides;
}

export function getModelReferenceInputSupport(model: MediaModelOption | undefined): ModelReferenceInputSupport {
  const support: ModelReferenceInputSupport = {
    imageUrls: false,
    videoUrls: false,
    audioUrls: false,
  };

  if (!model?.configJson || typeof model.configJson !== "object") {
    return support;
  }

  const configJson = model.configJson as Record<string, unknown>;
  const rawFields = Array.isArray(configJson.inputFields) ? (configJson.inputFields as unknown[]) : [];
  const generateType = normalizeGenerateType(configJson);

  for (const field of rawFields) {
    if (!field || typeof field !== "object") continue;
    const record = field as Record<string, unknown>;
    const type = String(record.type ?? "").trim().toLowerCase();
    const syncWith = String(record.syncWith ?? "").trim().toLowerCase();
    if (syncWith === "reference_images") support.imageUrls = true;
    if (syncWith === "reference_videos") support.videoUrls = true;
    if (type === "image_urls") support.imageUrls = true;
    if (type === "video_urls") support.videoUrls = true;
    if (type === "audio_urls") support.audioUrls = true;
  }

  // Preserve legacy video-tab behavior for models that do not explicitly declare
  // attachment support yet still act like video generators.
  if (
    !support.imageUrls
    && !support.videoUrls
    && !support.audioUrls
    && generateType
    && /video|extend|upscale|edit|avatar|reframe|motion/.test(generateType)
  ) {
    support.imageUrls = true;
  }

  const overrides = readReferenceInputOverrides(configJson);
  return {
    imageUrls: overrides.imageUrls ?? support.imageUrls,
    videoUrls: overrides.videoUrls ?? support.videoUrls,
    audioUrls: overrides.audioUrls ?? support.audioUrls,
  };
}

export function isTextToImageModel(model: MediaModelOption): boolean {
  const generateType = normalizeGenerateType(model.configJson);
  if (!generateType) {
    return true;
  }
  return ["text-to-image", "text2image", "txt2img", "t2i"].includes(generateType);
}

export function isTextToVideoModel(model: MediaModelOption): boolean {
  const generateType = normalizeGenerateType(model.configJson);
  if (!generateType) {
    return true;
  }
  return ["text-to-video", "text2video", "txt2video", "txt2vid", "t2v"].includes(generateType);
}

type ModelGenerationModeSource = {
  configJson?: unknown;
} | undefined;

export function getModelGenerationModeLabel(model: ModelGenerationModeSource): string | null {
  if (!model?.configJson || typeof model.configJson !== "object") {
    return null;
  }

  const configJson = model.configJson as Record<string, unknown>;
  const generateType = normalizeGenerateType(configJson);
  const rawFields = Array.isArray(configJson.inputFields) ? (configJson.inputFields as unknown[]) : [];
  const hasImageInput = rawFields.some((field) => {
    if (!field || typeof field !== "object") return false;
    const record = field as Record<string, unknown>;
    const type = String(record.type ?? "").trim().toLowerCase();
    return type === "image_urls";
  });
  const hasVideoInput = rawFields.some((field) => {
    if (!field || typeof field !== "object") return false;
    const record = field as Record<string, unknown>;
    const type = String(record.type ?? "").trim().toLowerCase();
    const syncWith = String(record.syncWith ?? "").trim().toLowerCase();
    return type === "video_urls" || syncWith === "reference_videos";
  });

  if (!generateType) {
    if (hasVideoInput) {
      return "Video to Video";
    }
    if (hasImageInput) {
      return "Image to Video";
    }
    return null;
  }

  if (["text-to-video", "text2video", "txt2video", "txt2vid", "t2v"].includes(generateType)) {
    return "Text to Video";
  }
  if (["image-to-video", "image2video", "img2vid", "i2v"].includes(generateType)) {
    return "Image to Video";
  }
  if (["video-to-video", "video2video", "v2v"].includes(generateType) || generateType.includes("motion")) {
    return "Video to Video";
  }
  if (generateType.includes("extend")) {
    return "Video Extend";
  }
  if (generateType.includes("upscale")) {
    return "Video Upscale";
  }
  if (generateType.includes("avatar")) {
    return "Avatar Video";
  }

  if (hasVideoInput) {
    return "Video to Video";
  }
  if (hasImageInput) {
    return "Image to Video";
  }
  return null;
}

export function parseModelInputFields(model: MediaModelOption | undefined): ModelInputField[] {
  if (!model?.configJson || typeof model.configJson !== "object") {
    return [];
  }
  const rawFields = Array.isArray((model.configJson as { inputFields?: unknown }).inputFields)
    ? ((model.configJson as { inputFields?: unknown }).inputFields as unknown[])
    : [];
  const parsed: ModelInputField[] = [];
  const inferSyncTarget = (
    key: string,
    type: ModelInputField["type"],
    explicit: ModelInputSyncTarget | null,
  ): ModelInputSyncTarget => {
    if (explicit) {
      return explicit;
    }
    if (type === "image_urls" || type === "audio_urls") {
      return "reference_images";
    }
    if (type === "video_urls") {
      return "reference_videos";
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
  };

  for (const field of rawFields) {
    if (!field || typeof field !== "object") {
      continue;
    }
    const record = field as Record<string, unknown>;
    const rawKey = record.key;
    if (typeof rawKey !== "string" || rawKey.trim().length === 0) {
      continue;
    }
    const key = rawKey.trim();
    const rawType = typeof record.type === "string" ? record.type.trim() : "text";
    const type: ModelInputField["type"] = (
      rawType === "select"
      || rawType === "text"
      || rawType === "number"
      || rawType === "boolean"
      || rawType === "image_urls"
      || rawType === "video_urls"
      || rawType === "audio_urls"
      || rawType === "library_file"
    )
      ? rawType
      : "text";
    const rawSyncWith = typeof record.syncWith === "string" ? record.syncWith.trim() : "";
    const explicitSyncWith: ModelInputSyncTarget | null = (
      rawSyncWith === "none"
      || rawSyncWith === "reference_images"
      || rawSyncWith === "reference_videos"
      || rawSyncWith === "prompt"
      || rawSyncWith === "aspect_ratio"
    )
      ? rawSyncWith
      : null;
    const options = Array.isArray(record.options)
      ? (record.options as unknown[])
          .filter((entry): entry is ModelInputFieldOption => (
            Boolean(entry)
            && typeof entry === "object"
            && "value" in (entry as Record<string, unknown>)
            && "label" in (entry as Record<string, unknown>)
            && (typeof (entry as Record<string, unknown>).label === "string")
          ))
          .map((entry) => {
            const raw = entry as unknown as Record<string, unknown>;
            return {
              value: entry.value,
              label: entry.label,
              ...(typeof raw.previewUrl === "string" && raw.previewUrl.trim().length > 0
                ? { previewUrl: raw.previewUrl.trim() }
                : {}),
            } satisfies ModelInputFieldOption;
          })
      : undefined;
    parsed.push({
      key,
      label: (typeof record.label === "string" && record.label.trim().length > 0) ? record.label.trim() : key,
      type,
      options,
      default: record.default,
      required: Boolean(record.required),
      syncWith: inferSyncTarget(key, type, explicitSyncWith),
      affectsPricing: Boolean(record.affectsPricing),
      searchable: Boolean(record.searchable),
      maxItems: parsePositiveInteger(record.maxItems) ?? parsePositiveInteger(record.maxCount),
      optionsSource:
        record.optionsSource && typeof record.optionsSource === "object"
          ? { type: typeof (record.optionsSource as Record<string, unknown>).type === "string"
            ? String((record.optionsSource as Record<string, unknown>).type)
            : undefined }
          : undefined,
    });
  }
  return parsed;
}

export function getModelInputField(
  model: MediaModelOption | undefined,
  key: string,
): ModelInputField | undefined {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    return undefined;
  }

  return parseModelInputFields(model).find((field) => field.key === normalizedKey);
}

export function getModelReferenceImageLimit(model: MediaModelOption | undefined): number | null {
  const fieldLimit = parseModelInputFields(model).find((field) => (
    field.syncWith === "reference_images" || field.type === "image_urls"
  ))?.maxItems;
  if (fieldLimit) {
    return fieldLimit;
  }

  const configJson = model?.configJson;
  if (!configJson || typeof configJson !== "object") {
    return null;
  }

  return (
    parsePositiveInteger((configJson as Record<string, unknown>).maxReferenceImages)
    ?? parsePositiveInteger((configJson as Record<string, unknown>).max_reference_images)
    ?? null
  );
}

export function clampReferenceImagesToModelLimit<T>(
  model: MediaModelOption | undefined,
  referenceImages: readonly T[],
): { items: T[]; maxItems: number | null; droppedCount: number } {
  const maxItems = getModelReferenceImageLimit(model);
  if (maxItems === null || referenceImages.length <= maxItems) {
    return {
      items: [...referenceImages],
      maxItems,
      droppedCount: 0,
    };
  }

  return {
    items: referenceImages.slice(0, maxItems),
    maxItems,
    droppedCount: referenceImages.length - maxItems,
  };
}

export function mergeExtraParams(
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

export function buildDefaultExtraParamsForModel(
  model: MediaModelOption | undefined,
): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (!fields.length) {
    return undefined;
  }
  const defaults: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.default !== undefined) {
      defaults[field.key] = field.default;
      continue;
    }
    if (field.required && field.type === "select" && field.options && field.options.length > 0) {
      defaults[field.key] = field.options[0]?.value;
    }
  }
  return Object.keys(defaults).length > 0 ? defaults : undefined;
}

export function pickExtraParamsForModel(
  model: MediaModelOption | undefined,
  current: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!model || !current) {
    return undefined;
  }
  const fieldKeys = new Set(parseModelInputFields(model).map((field) => field.key));
  if (fieldKeys.size === 0) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (fieldKeys.has(key)) {
      next[key] = value;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function applyModelSyncTargets(
  model: MediaModelOption | undefined,
  baseExtraParams: Record<string, unknown> | undefined,
  syncValues: {
    prompt?: string;
    aspectRatio?: string;
    referenceImageUrls?: string[];
    referenceVideoUrls?: string[];
  },
): Record<string, unknown> | undefined {
  const fields = parseModelInputFields(model);
  if (!fields.length) {
    return baseExtraParams;
  }
  const next: Record<string, unknown> = { ...(baseExtraParams ?? {}) };
  for (const field of fields) {
    const syncWith = field.syncWith;
    if (syncWith === "prompt" && syncValues.prompt) {
      next[field.key] = syncValues.prompt;
      continue;
    }
    if (syncWith === "aspect_ratio" && syncValues.aspectRatio) {
      next[field.key] = syncValues.aspectRatio;
      continue;
    }
    if (
      syncWith === "reference_images"
      && syncValues.referenceImageUrls
      && syncValues.referenceImageUrls.length > 0
    ) {
      next[field.key] = field.maxItems
        ? syncValues.referenceImageUrls.slice(0, field.maxItems)
        : syncValues.referenceImageUrls;
      continue;
    }
    if (
      syncWith === "reference_videos"
      && syncValues.referenceVideoUrls
      && syncValues.referenceVideoUrls.length > 0
    ) {
      next[field.key] = field.maxItems
        ? syncValues.referenceVideoUrls.slice(0, field.maxItems)
        : syncValues.referenceVideoUrls;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function hasReferenceImageSyncField(model: MediaModelOption | undefined): boolean {
  return parseModelInputFields(model).some((field) => field.syncWith === "reference_images");
}

export function hasReferenceVideoSyncField(model: MediaModelOption | undefined): boolean {
  return parseModelInputFields(model).some((field) => field.syncWith === "reference_videos");
}

export function isMissingRequiredInputValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === "string") {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

export function getMissingRequiredModelFields(
  fields: ModelInputField[],
  values: {
    extraParams: Record<string, unknown> | undefined;
    prompt?: string;
    aspectRatio?: string;
    referenceImageUrls?: string[];
    referenceVideoUrls?: string[];
  },
  options?: {
    treatPromptSyncAsAuto?: boolean;
  },
): string[] {
  const missing: string[] = [];
  for (const field of fields) {
    if (!field.required) {
      continue;
    }
    const syncWith = field.syncWith;
    let value: unknown;
    if (syncWith === "prompt") {
      value = options?.treatPromptSyncAsAuto ? "__auto_prompt__" : values.prompt;
    } else if (syncWith === "aspect_ratio") {
      value = values.aspectRatio;
    } else if (syncWith === "reference_images") {
      value = values.referenceImageUrls;
    } else if (syncWith === "reference_videos") {
      value = values.referenceVideoUrls;
    } else {
      value = values.extraParams?.[field.key];
      if (value === undefined) {
        value = field.default;
      }
      if (value === undefined && field.type === "select" && field.options && field.options.length > 0) {
        value = field.options[0]?.value;
      }
    }
    if (isMissingRequiredInputValue(value)) {
      missing.push(field.label);
    }
  }
  return missing;
}

export function getAllowedLibraryExtensionsForField(field: ModelInputField): string[] | undefined {
  if (field.type === "image_urls") {
    return LIBRARY_IMAGE_EXTENSIONS;
  }
  if (field.type === "video_urls") {
    return LIBRARY_VIDEO_EXTENSIONS;
  }
  if (field.type === "audio_urls") {
    return LIBRARY_AUDIO_EXTENSIONS;
  }
  return undefined;
}
