import {
  normalizeVerticalDramaEpisodeGenerationSettings,
  type VerticalDramaEpisodeGenerationSettings,
  VERTICAL_DRAMA_REASONING_EFFORTS,
} from "@shared/verticalDramaSeries/generationSettings";
import { loadEnabledLlmModelRows } from "./enabledLlmModels";
import { getModelsByTypeAsync } from "./modelRegistry";

export { normalizeVerticalDramaEpisodeGenerationSettings };
export type { VerticalDramaEpisodeGenerationSettings };

function readQualityOptions(model: {
  configJson?: unknown;
  thinkingModes?: string[];
}): string[] {
  const config = model.configJson;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return model.thinkingModes ?? [];
  }
  const fields = (config as { inputFields?: unknown }).inputFields;
  if (Array.isArray(fields)) {
    const qualityField = fields.find(
      field =>
        field &&
        typeof field === "object" &&
        String((field as Record<string, unknown>).key ?? "").toLowerCase() ===
          "quality"
    ) as Record<string, unknown> | undefined;
    if (Array.isArray(qualityField?.options)) {
      return qualityField.options
        .map(option =>
          option && typeof option === "object"
            ? String((option as Record<string, unknown>).value ?? "")
            : ""
        )
        .filter(Boolean);
    }
  }
  return model.thinkingModes ?? [];
}

export function getVerticalDramaImageQualityOptions(model: {
  configJson?: unknown;
  thinkingModes?: string[];
}): string[] {
  return [...new Set(readQualityOptions(model))];
}

export function resolveVerticalDramaImageQualityExtraParams(input: {
  settings: unknown;
  modelId: string | null | undefined;
  model: {
    modelId?: string;
    configJson?: unknown;
    thinkingModes?: string[];
  } | null;
}): Record<string, unknown> {
  const settings = normalizeVerticalDramaEpisodeGenerationSettings(
    input.settings
  );
  const image = settings.image;
  if (!image?.quality || !input.model || image.modelId !== input.modelId) {
    return {};
  }
  const options = getVerticalDramaImageQualityOptions(input.model);
  return options.includes(image.quality) ? { quality: image.quality } : {};
}

export async function resolveVerticalDramaEpisodeImageQualityExtraParams(input: {
  settings: unknown;
  modelId: string | null | undefined;
}): Promise<Record<string, unknown>> {
  const model = input.modelId
    ? ((await getModelsByTypeAsync("image")).find(
        candidate => candidate.id === input.modelId
      ) ?? null)
    : null;
  return resolveVerticalDramaImageQualityExtraParams({
    settings: input.settings,
    modelId: input.modelId,
    model,
  });
}

export async function resolveVerticalDramaLlmReasoningExtraBodyParams(input: {
  settings: unknown;
  modelId: string;
}): Promise<Record<string, unknown>> {
  const settings = normalizeVerticalDramaEpisodeGenerationSettings(
    input.settings
  );
  const reasoning = settings.llm?.reasoning;
  if (
    !reasoning ||
    reasoning.mode !== "effort" ||
    !reasoning.effort ||
    (reasoning.modelId && reasoning.modelId !== input.modelId)
  ) {
    return {};
  }

  const rows = await loadEnabledLlmModelRows();
  const row = rows.find(candidate => candidate.modelId === input.modelId);
  if (
    !row ||
    row.supportsThinking !== true ||
    row.providerName.toLowerCase() !== "openrouter"
  ) {
    return {};
  }
  return {
    reasoning: {
      effort: reasoning.effort,
      exclude: true,
    },
  };
}

export function getVerticalDramaLlmReasoningEfforts(input: {
  providerName: string;
  supportsThinking: boolean | null;
}): string[] {
  if (
    input.providerName.toLowerCase() !== "openrouter" ||
    input.supportsThinking !== true
  ) {
    return [];
  }
  return [...VERTICAL_DRAMA_REASONING_EFFORTS];
}
