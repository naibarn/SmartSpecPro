export type ModelInputSyncTarget = "none" | "reference_images" | "prompt" | "aspect_ratio";

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
  optionsSource?: {
    type?: string;
  };
}

export const LIBRARY_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg"];
export const LIBRARY_VIDEO_EXTENSIONS = ["mp4", "webm", "mov", "m4v", "avi", "mkv"];
export const LIBRARY_AUDIO_EXTENSIONS = ["mp3", "wav", "m4a", "aac", "flac", "ogg"];

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
      next[field.key] = syncValues.referenceImageUrls;
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function hasReferenceImageSyncField(model: MediaModelOption | undefined): boolean {
  return parseModelInputFields(model).some((field) => field.syncWith === "reference_images");
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
