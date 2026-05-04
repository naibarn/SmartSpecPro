export const DEFAULT_STORYBOARD_CLIP_DURATION_SECONDS = 8;

type StoryboardTimingMediaModel = {
  configJson?: unknown;
  durations?: unknown;
};

function parseMediaModelConfig(configJson: unknown): Record<string, unknown> | null {
  if (!configJson) return null;
  if (typeof configJson === "string") {
    try {
      const parsed = JSON.parse(configJson);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return typeof configJson === "object" && !Array.isArray(configJson)
    ? configJson as Record<string, unknown>
    : null;
}

function readPositiveSeconds(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function readConfiguredStoryboardClipDuration(config: Record<string, unknown> | null): number | undefined {
  if (!config) return undefined;
  const keys = [
    "storyboardClipDurationSeconds",
    "storyboard_clip_duration_seconds",
    "defaultStoryboardClipDurationSeconds",
    "default_storyboard_clip_duration_seconds",
    "clipDurationSeconds",
    "clip_duration_seconds",
  ];
  for (const key of keys) {
    const value = readPositiveSeconds(config[key]);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readLegacyMaxDuration(config: Record<string, unknown> | null): number | undefined {
  return readPositiveSeconds(config?.maxDuration) ?? readPositiveSeconds(config?.max_duration);
}

function readFirstConfiguredSupportedDuration(config: Record<string, unknown> | null): number | undefined {
  const values = Array.isArray(config?.supportedDurations)
    ? config.supportedDurations
    : Array.isArray(config?.supported_durations)
      ? config.supported_durations
      : null;
  if (!values) return undefined;
  for (const duration of values) {
    const value = readPositiveSeconds(duration);
    if (value !== undefined) return value;
  }
  return undefined;
}

function readFirstSupportedDuration(model: StoryboardTimingMediaModel | null | undefined): number | undefined {
  if (!Array.isArray(model?.durations)) return undefined;
  for (const duration of model.durations) {
    const value = readPositiveSeconds(duration);
    if (value !== undefined) return value;
  }
  return undefined;
}

export function resolveStoryboardClipDurationSeconds(params: {
  model?: StoryboardTimingMediaModel | null;
  selectedDurationSeconds?: unknown;
  fallbackSeconds?: unknown;
}): number {
  return Math.max(
    0.25,
    (() => {
      const config = parseMediaModelConfig(params.model?.configJson);
      return readConfiguredStoryboardClipDuration(config)
        ?? readPositiveSeconds(params.selectedDurationSeconds)
        ?? readFirstSupportedDuration(params.model)
        ?? readFirstConfiguredSupportedDuration(config)
        ?? readLegacyMaxDuration(config);
    })()
      ?? readPositiveSeconds(params.fallbackSeconds)
      ?? DEFAULT_STORYBOARD_CLIP_DURATION_SECONDS,
  );
}
