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
  supportsAspectRatios?: unknown;
  supportsSizes?: unknown;
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
  type: "select" | "text" | "number" | "boolean" | "image_urls" | "video_urls" | "audio_urls" | "library_file" | "array" | "provider_asset_picker";
  options?: ModelInputFieldOption[];
  default?: unknown;
  required?: boolean;
  syncWith: ModelInputSyncTarget;
  affectsPricing?: boolean;
  includeInPayload?: boolean;
  searchable?: boolean;
  hidden?: boolean;
  advancedOnly?: boolean;
  managedBySuite?: boolean;
  assetType?: string;
  assetCapability?: string;
  referenceUnitWeight?: number;
  providerPayloadKey?: string;
  placeholder?: string;
  description?: string;
  maxLength?: number;
  min?: number;
  max?: number;
  step?: number;
  maxItems?: number;
  allowedExtensions?: string[];
  itemLabel?: string;
  itemTemplate?: unknown;
  promptSync?: {
    strategy?: string;
    textKey?: string;
    speakerPattern?: string;
    speakerVoiceFields?: Record<string, string>;
    defaultVoiceField?: string;
  };
  itemFields?: ModelInputField[];
  optionsSource?: {
    type?: string;
    endpoint?: string;
    method?: string;
    itemsPath?: string;
    valueField?: string;
    labelField?: string;
    previewField?: string;
    queryParam?: string;
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

function cloneModelInputValue<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof structuredClone === "function") {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to the JSON clone below.
    }
  }

  if (typeof value === "object") {
    try {
      return JSON.parse(JSON.stringify(value)) as T;
    } catch {
      return value;
    }
  }

  return value;
}

function parseModelInputFieldRecords(rawFields: unknown[]): ModelInputField[] {
  const parsed: ModelInputField[] = [];

  const inferSyncTarget = (
    key: string,
    type: ModelInputField["type"],
    explicit: ModelInputSyncTarget | null,
    record?: Record<string, unknown>,
  ): ModelInputSyncTarget => {
    if (explicit) {
      return explicit;
    }
    const promptSync = record?.promptSync && typeof record.promptSync === "object" && !Array.isArray(record.promptSync)
      ? record.promptSync as Record<string, unknown>
      : null;
    if (type === "array" && String(promptSync?.strategy ?? "").trim() === "speaker_lines") {
      return "prompt";
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
    if (
      normalizedKey.includes("videourls")
      || normalizedKey.includes("videourl")
      || normalizedKey.includes("referencevideos")
      || normalizedKey.includes("referencevideo")
    ) {
      return "reference_videos";
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
      || rawType === "array"
      || rawType === "provider_asset_picker"
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
    const itemFields = Array.isArray(record.itemFields)
      ? parseModelInputFieldRecords(record.itemFields as unknown[])
      : undefined;

    parsed.push({
      key,
      label: (typeof record.label === "string" && record.label.trim().length > 0) ? record.label.trim() : key,
      type,
      options,
      default: record.default,
      required: Boolean(record.required),
      syncWith: inferSyncTarget(key, type, explicitSyncWith, record),
      affectsPricing: Boolean(record.affectsPricing),
      includeInPayload: record.includeInPayload === false ? false : undefined,
      searchable: Boolean(record.searchable),
      hidden: Boolean(record.hidden),
      advancedOnly: Boolean(record.advancedOnly),
      managedBySuite: Boolean(record.managedBySuite),
      assetType: typeof record.assetType === "string" ? record.assetType.trim() : undefined,
      assetCapability: typeof record.assetCapability === "string" ? record.assetCapability.trim() : undefined,
      referenceUnitWeight: parsePositiveInteger(record.referenceUnitWeight),
      providerPayloadKey: typeof record.providerPayloadKey === "string" ? record.providerPayloadKey.trim() : undefined,
      placeholder: typeof record.placeholder === "string" ? record.placeholder.trim() : undefined,
      description: typeof record.description === "string" ? record.description.trim() : undefined,
      maxLength: parsePositiveInteger(record.maxLength) ?? undefined,
      min: typeof record.min === "number" && Number.isFinite(record.min) ? record.min : undefined,
      max: typeof record.max === "number" && Number.isFinite(record.max) ? record.max : undefined,
      step: typeof record.step === "number" && Number.isFinite(record.step) && record.step > 0 ? record.step : undefined,
      maxItems: parsePositiveInteger(record.maxItems) ?? parsePositiveInteger(record.maxCount),
      allowedExtensions: parseAllowedExtensions(record.allowedExtensions),
      itemLabel: typeof record.itemLabel === "string" ? record.itemLabel.trim() : undefined,
      itemTemplate: record.itemTemplate,
      promptSync: parsePromptSyncConfig(record.promptSync),
      itemFields,
      optionsSource:
        record.optionsSource && typeof record.optionsSource === "object"
          ? parseModelInputOptionsSource(record.optionsSource)
          : undefined,
    });
  }

  return parsed;
}

function parseModelInputOptionsSource(value: unknown): ModelInputField["optionsSource"] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const readString = (key: string) => {
    const fieldValue = record[key];
    return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue.trim() : undefined;
  };

  return {
    type: readString("type"),
    endpoint: readString("endpoint"),
    method: readString("method"),
    itemsPath: readString("itemsPath"),
    valueField: readString("valueField"),
    labelField: readString("labelField"),
    previewField: readString("previewField"),
    queryParam: readString("queryParam"),
  };
}

function parsePromptSyncConfig(value: unknown): ModelInputField["promptSync"] | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const speakerVoiceFields = record.speakerVoiceFields && typeof record.speakerVoiceFields === "object" && !Array.isArray(record.speakerVoiceFields)
    ? Object.fromEntries(
        Object.entries(record.speakerVoiceFields as Record<string, unknown>)
          .filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)
          .map(([key, fieldKey]) => [key, fieldKey.trim()]),
      )
    : undefined;

  return {
    strategy: typeof record.strategy === "string" ? record.strategy.trim() : undefined,
    textKey: typeof record.textKey === "string" ? record.textKey.trim() : undefined,
    speakerPattern: typeof record.speakerPattern === "string" ? record.speakerPattern : undefined,
    speakerVoiceFields,
    defaultVoiceField: typeof record.defaultVoiceField === "string" ? record.defaultVoiceField.trim() : undefined,
  };
}

export function buildDefaultModelInputValue(
  field: ModelInputField,
  itemIndex = 0,
): unknown {
  if (field.default !== undefined) {
    return cloneModelInputValue(field.default);
  }

  if (field.type === "array") {
    return [];
  }

  if (field.key.replace(/[^a-z0-9]/gi, "").toLowerCase() === "speakerid") {
    return `Speaker${itemIndex + 1}`;
  }

  if (field.type === "select" && field.options && field.options.length > 0) {
    return cloneModelInputValue(field.options[0]?.value);
  }

  if (field.type === "boolean") {
    return false;
  }

  if (field.type === "number") {
    return "";
  }

  return "";
}

export function buildDefaultModelInputArrayItem(
  itemFields: ModelInputField[] | undefined,
  itemIndex = 0,
): Record<string, unknown> {
  const item: Record<string, unknown> = {};
  for (const field of itemFields ?? []) {
    item[field.key] = buildDefaultModelInputValue(field, itemIndex);
  }
  return item;
}

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

function parseAllowedExtensions(value: unknown): string[] | undefined {
  const rawItems = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  const normalized = rawItems
    .map((entry) => String(entry ?? "").trim().replace(/^\./, "").toLowerCase())
    .filter((entry) => /^[a-z0-9]+$/.test(entry));
  return normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
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

  if (generateType.includes("text-to-speech") || generateType.includes("tts")) {
    return "Text to Speech";
  }
  if (["text-to-video", "text2video", "txt2video", "txt2vid", "t2v"].includes(generateType)) {
    return "Text to Video";
  }
  if (["image-to-video", "image2video", "img2vid", "i2v"].includes(generateType)) {
    return "Image to Video";
  }
  if (["image-to-image", "image2image", "img2img", "i2i"].includes(generateType)) {
    return "Image to Image";
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
    return "Image to Image";
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
  return parseModelInputFieldRecords(rawFields);
}

export function getModelInputField(
  model: MediaModelOption | undefined,
  key: string,
): ModelInputField | undefined {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    return undefined;
  }

  const findByKey = (fields: ModelInputField[]): ModelInputField | undefined => {
    for (const field of fields) {
      if (field.key === normalizedKey) {
        return field;
      }
      if (field.itemFields?.length) {
        const nested = findByKey(field.itemFields);
        if (nested) {
          return nested;
        }
      }
    }
    return undefined;
  };

  return findByKey(parseModelInputFields(model));
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

type PreferredResolution = "4K" | "2K" | "1K";

const PREFERRED_IMAGE_RESOLUTION_ORDER: PreferredResolution[] = ["4K", "2K", "1K"];

function normalizeResolutionCandidate(value: unknown): PreferredResolution | null {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
  if (["4k", "4096", "3840", "uhd", "2160p"].includes(normalized)) return "4K";
  if (["2k", "2048", "1440p"].includes(normalized)) return "2K";
  if (["1k", "1024", "720p"].includes(normalized)) return "1K";
  if (normalized.includes("4k") || normalized.includes("4096") || normalized.includes("3840") || normalized.includes("2160p")) return "4K";
  if (normalized.includes("2k") || normalized.includes("2048") || normalized.includes("1440p")) return "2K";
  if (normalized.includes("1k") || normalized.includes("1024") || normalized.includes("720p")) return "1K";
  return null;
}

function preferredResolutionRank(value: PreferredResolution): number {
  const index = PREFERRED_IMAGE_RESOLUTION_ORDER.indexOf(value);
  return index >= 0 ? index : PREFERRED_IMAGE_RESOLUTION_ORDER.length;
}

export function selectHighestImageResolutionInput(
  model: MediaModelOption | undefined,
): { key: string; value: string | number | boolean; resolution: PreferredResolution; label: string } | null {
  const fields = parseModelInputFields(model);
  const candidateFields = fields.filter((field) => {
    const normalizedKey = field.key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    return normalizedKey.includes("resolution") || normalizedKey.includes("outputquality");
  });

  let best: { key: string; value: string | number | boolean; resolution: PreferredResolution; label: string } | null = null;
  const consider = (candidate: { key: string; value: string | number | boolean; resolution: PreferredResolution; label: string }) => {
    if (!best || preferredResolutionRank(candidate.resolution) < preferredResolutionRank(best.resolution)) {
      best = candidate;
    }
  };

  for (const field of candidateFields) {
    for (const option of field.options ?? []) {
      const resolution = normalizeResolutionCandidate(option.value) ?? normalizeResolutionCandidate(option.label);
      if (!resolution) continue;
      consider({
        key: field.key,
        value: option.value,
        resolution,
        label: option.label,
      });
    }
  }

  const configJson = model?.configJson;
  if (configJson && typeof configJson === "object" && !Array.isArray(configJson)) {
    const rawResolutions = (configJson as Record<string, unknown>).resolutions;
    const resolutions = Array.isArray(rawResolutions) ? rawResolutions : [];
    for (const value of resolutions) {
      const resolution = normalizeResolutionCandidate(value);
      if (!resolution) continue;
      consider({
        key: "resolution",
        value: String(value),
        resolution,
        label: String(value),
      });
    }
  }

  return best;
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
      defaults[field.key] = cloneModelInputValue(field.default);
      continue;
    }
    if (field.required && field.type === "select" && field.options && field.options.length > 0) {
      defaults[field.key] = cloneModelInputValue(field.options[0]?.value);
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
  const fields = parseModelInputFields(model);
  const fieldKeys = new Set(fields.map((field) => field.key));
  if (fieldKeys.size === 0) {
    return undefined;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(current)) {
    if (fieldKeys.has(key)) {
      next[key] = value;
    }
  }
  for (const field of fields) {
    if (field.includeInPayload === false) {
      delete next[field.key];
    }
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

function getTemplatePathValue(context: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (!segment) {
      return current;
    }
    if (current && typeof current === "object" && !Array.isArray(current)) {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, context);
}

function interpolateModelInputTemplate(template: unknown, context: Record<string, unknown>): unknown {
  if (typeof template === "string") {
    const tokenPattern = /^\{\{\s*([^}]+)\s*\}\}$/;
    const fullToken = template.match(tokenPattern);
    if (fullToken) {
      const path = fullToken[1]?.trim() ?? "";
      return path ? getTemplatePathValue(context, path) ?? "" : "";
    }
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, rawPath: string) => {
      const path = rawPath.trim();
      const value = path ? getTemplatePathValue(context, path) : undefined;
      return value === null || value === undefined ? "" : String(value);
    });
  }

  if (Array.isArray(template)) {
    return template.map((item) => interpolateModelInputTemplate(item, context));
  }

  if (template && typeof template === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(template as Record<string, unknown>)) {
      output[key] = interpolateModelInputTemplate(value, context);
    }
    return output;
  }

  return template;
}

function buildSpeakerLinePromptSyncedArrayValue(
  field: ModelInputField,
  prompt: string,
  fields: Record<string, unknown>,
): unknown[] | null {
  if (field.promptSync?.strategy !== "speaker_lines") {
    return null;
  }

  const textKey = field.promptSync.textKey || "text";
  const defaultVoiceField = field.promptSync.defaultVoiceField || "voice_id";
  const speakerVoiceFields = field.promptSync.speakerVoiceFields || {};
  const speakerPattern = field.promptSync.speakerPattern || "^\\s*Speaker\\s*(\\d+)\\s*[:：-]\\s*(.*)$";
  let speakerRegex: RegExp;

  try {
    speakerRegex = new RegExp(speakerPattern, "i");
  } catch {
    speakerRegex = /^\s*Speaker\s*(\d+)\s*[:：-]\s*(.*)$/i;
  }

  const segments: Array<{ speaker: string; text: string }> = [];
  let currentSpeaker: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (currentSpeaker && text) {
      segments.push({ speaker: currentSpeaker, text });
    }
    currentLines = [];
  };

  for (const rawLine of prompt.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const match = line.match(speakerRegex);
    if (match) {
      flush();
      currentSpeaker = String(match[1] || "1");
      const firstLine = String(match[2] || "").trim();
      currentLines = firstLine ? [firstLine] : [];
      continue;
    }

    if (currentSpeaker) {
      currentLines.push(line);
    }
  }
  flush();

  if (segments.length === 0) {
    return null;
  }

  return segments.map((segment) => {
    const voiceField = speakerVoiceFields[segment.speaker] || defaultVoiceField;
    return {
      [textKey]: segment.text,
      voice_id: fields[voiceField] ?? fields[defaultVoiceField],
    };
  });
}

function buildPromptSyncedArrayValue(field: ModelInputField, prompt: string, fields: Record<string, unknown>): unknown[] {
  const speakerLineItems = buildSpeakerLinePromptSyncedArrayValue(field, prompt, fields);
  if (speakerLineItems) {
    return speakerLineItems;
  }

  if (!field.itemTemplate) {
    return [prompt];
  }
  return [
    interpolateModelInputTemplate(field.itemTemplate, {
      value: prompt,
      item: prompt,
      index: 0,
      fields,
    }),
  ];
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
      next[field.key] = field.type === "array"
        ? buildPromptSyncedArrayValue(field, syncValues.prompt, next)
        : syncValues.prompt;
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
  for (const field of fields) {
    if (field.includeInPayload === false) {
      delete next[field.key];
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
  const walk = (
    currentFields: ModelInputField[],
    currentValues: {
      extraParams: Record<string, unknown> | undefined;
      prompt?: string;
      aspectRatio?: string;
      referenceImageUrls?: string[];
      referenceVideoUrls?: string[];
    },
    prefix: string[] = [],
  ): string[] => {
    const missing: string[] = [];
    for (const field of currentFields) {
      const fieldLabel = [...prefix, field.label].join(" ").trim();

      if (field.type === "array" && field.itemFields?.length) {
        let value: unknown = currentValues.extraParams?.[field.key];
        if (value === undefined) {
          value = field.default;
        }
        if (field.required && isMissingRequiredInputValue(value)) {
          missing.push(fieldLabel);
          continue;
        }
        const items = Array.isArray(value) ? value : [];
        for (const [index, item] of items.entries()) {
          const nextValues = {
            extraParams: (item && typeof item === "object" && !Array.isArray(item))
              ? item as Record<string, unknown>
              : {},
            prompt: currentValues.prompt,
            aspectRatio: currentValues.aspectRatio,
            referenceImageUrls: currentValues.referenceImageUrls,
            referenceVideoUrls: currentValues.referenceVideoUrls,
          };
          missing.push(
            ...walk(field.itemFields, nextValues, [...prefix, `${field.label} ${index + 1}`]),
          );
        }
        continue;
      }

      if (!field.required) {
        continue;
      }

      const syncWith = field.syncWith;
      let value: unknown;
      if (syncWith === "prompt") {
        value = options?.treatPromptSyncAsAuto ? "__auto_prompt__" : currentValues.prompt;
      } else if (syncWith === "aspect_ratio") {
        value = currentValues.aspectRatio;
      } else if (syncWith === "reference_images") {
        value = currentValues.referenceImageUrls;
      } else if (syncWith === "reference_videos") {
        value = currentValues.referenceVideoUrls;
      } else {
        value = currentValues.extraParams?.[field.key];
        if (value === undefined) {
          value = field.default;
        }
        if (value === undefined && field.type === "select" && field.options && field.options.length > 0) {
          value = field.options[0]?.value;
        }
      }

      if (isMissingRequiredInputValue(value)) {
        missing.push(fieldLabel);
      }
    }
    return missing;
  };

  return walk(fields, values);
}

export function getAllowedLibraryExtensionsForField(field: ModelInputField): string[] | undefined {
  if (field.allowedExtensions?.length) {
    return field.allowedExtensions;
  }
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
