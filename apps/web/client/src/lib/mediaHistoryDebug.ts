export type MediaHistoryTaskLike = {
  parameters?: Record<string, unknown> | null;
  resultData?: Record<string, unknown> | null;
};

export type MediaHistoryApiDebugInfoLike = {
  requestPayload?: unknown;
};

export type MediaHistoryReferenceImageConfig = {
  key: string;
  label?: string;
  type: "array" | "url";
  source: "request_payload" | "task_parameters";
};

export type MediaHistoryReferenceMediaAsset = {
  url: string;
  kind: "image" | "video";
};

function toRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function getStringValue(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeReferenceImageInputType(rawType: unknown): "array" | "url" | undefined {
  const type = getStringValue(rawType)?.toLowerCase();
  if (!type) return undefined;
  if (type === "array" || type === "image_urls" || type === "video_urls" || type === "audio_urls") {
    return "array";
  }
  if (type === "url" || type === "text" || type === "string") {
    return "url";
  }
  return undefined;
}

function inferReferenceImageLabel(rawKey: string): string {
  const normalizedKey = rawKey.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (normalizedKey.includes("video")) {
    return "Reference Videos";
  }
  if (normalizedKey.includes("audio")) {
    return "Reference Audio";
  }
  return "Reference Images";
}

function extractStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .flatMap((item) => (typeof item === "string" ? [item] : []))
      .map((item) => item.trim())
      .filter(Boolean);
  }
  const single = getStringValue(value);
  return single ? [single] : [];
}

function extractReferenceImageConfigFromSource(
  source: unknown,
  sourceName: MediaHistoryReferenceImageConfig["source"],
): MediaHistoryReferenceImageConfig | null {
  const record = toRecord(source);
  if (!record) return null;

  const rawKey = getStringValue(
    record.reference_image_input_key
    ?? record.referenceImageInputKey
    ?? record.reference_image_key
    ?? record.referenceImageKey
  );
  if (!rawKey) return null;

  const label = getStringValue(
    record.reference_image_input_label
    ?? record.referenceImageInputLabel
    ?? record.reference_image_label
    ?? record.referenceImageLabel
  );

  const type = normalizeReferenceImageInputType(
    record.reference_image_input_type
    ?? record.referenceImageInputType
    ?? record.reference_image_type
    ?? record.referenceImageType
  );
  if (!type) return null;

  return { key: rawKey, label: label || inferReferenceImageLabel(rawKey), type, source: sourceName };
}

export function extractReferenceImageConfig(
  task: MediaHistoryTaskLike | null,
  apiDebugInfo?: MediaHistoryApiDebugInfoLike | null,
): MediaHistoryReferenceImageConfig | null {
  const requestPayload = toRecord(apiDebugInfo?.requestPayload);
  const taskParameters = toRecord(task?.parameters);

  const requestPayloadApiConfig = extractReferenceImageConfigFromSource(
    requestPayload?.api_config ?? requestPayload?.apiConfig,
    "request_payload",
  );
  if (requestPayloadApiConfig) return requestPayloadApiConfig;

  const directRequestPayloadConfig = extractReferenceImageConfigFromSource(
    requestPayload,
    "request_payload",
  );
  if (directRequestPayloadConfig) return directRequestPayloadConfig;

  const taskParametersApiConfig = extractReferenceImageConfigFromSource(
    taskParameters?.api_config ?? taskParameters?.apiConfig,
    "task_parameters",
  );
  if (taskParametersApiConfig) return taskParametersApiConfig;

  return extractReferenceImageConfigFromSource(taskParameters, "task_parameters");
}

function collectReferenceMediaAssets(
  target: Map<string, MediaHistoryReferenceMediaAsset>,
  value: unknown,
  kind: MediaHistoryReferenceMediaAsset["kind"],
): void {
  for (const url of extractStringList(value)) {
    const existing = target.get(url);
    if (!existing || existing.kind === "image") {
      target.set(url, { url, kind });
    }
  }
}

export function extractReferenceMediaAssets(
  task: MediaHistoryTaskLike | null,
  apiDebugInfo?: MediaHistoryApiDebugInfoLike | null,
): MediaHistoryReferenceMediaAsset[] {
  const requestPayload = toRecord(apiDebugInfo?.requestPayload);
  const taskParameters = toRecord(task?.parameters);
  const assets = new Map<string, MediaHistoryReferenceMediaAsset>();

  const addFromSource = (source: Record<string, unknown> | null | undefined): void => {
    if (!source) return;

    collectReferenceMediaAssets(
      assets,
      source.reference_image_urls ?? source.referenceImageUrls ?? source.image_input ?? source.image_urls,
      "image",
    );
    collectReferenceMediaAssets(
      assets,
      source.reference_video_url ?? source.referenceVideoUrl ?? source.video_input ?? source.video_url ?? source.video_urls,
      "video",
    );
  };

  addFromSource(toRecord(requestPayload?.api_config ?? requestPayload?.apiConfig));
  addFromSource(requestPayload);
  addFromSource(toRecord(taskParameters?.api_config ?? taskParameters?.apiConfig));
  addFromSource(taskParameters);

  return Array.from(assets.values());
}
