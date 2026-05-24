import { AUTO_MODEL, buildAutoProviderValue, isAutoProviderValue, parsePickerSelectionValue } from "./chatModelSelection";
import { pickEnabledModelId } from "./enabledModelSelection";

export interface MediaStudioVisionModelOption {
  id: string;
  name: string;
  provider?: string | null;
  providerDisplayName?: string | null;
  providerId?: number | null;
  isDefault?: boolean;
  supportsVision?: boolean;
  supportsThinking?: boolean;
  contextLength?: number | null;
}

export interface MediaStudioProviderAutoOption {
  value: string;
  providerId: number;
  providerName: string;
  providerDisplayName: string;
}

export interface MediaStudioAutoPromptSelection {
  mode: "auto-global" | "auto-provider" | "explicit";
  value: string;
  displayLabel: string;
  resolvedModelId: string;
  providerId: number | null;
  providerName: string | null;
  providerDisplayName: string | null;
}

function getProviderDisplayName(model: MediaStudioVisionModelOption): string {
  return model.providerDisplayName?.trim() || model.provider?.trim() || "Provider";
}

function getProviderName(model: MediaStudioVisionModelOption): string {
  return model.provider?.trim() || getProviderDisplayName(model);
}

function getSupportedVisionModels(
  models: Iterable<MediaStudioVisionModelOption>,
): MediaStudioVisionModelOption[] {
  return Array.from(models).filter((model) => model.supportsVision !== false);
}

export function formatMediaStudioModelLabel(model: MediaStudioVisionModelOption): string {
  return `${model.name} (${getProviderDisplayName(model)})`;
}

export function buildMediaStudioProviderAutoOptions(
  models: Iterable<MediaStudioVisionModelOption>,
): MediaStudioProviderAutoOption[] {
  const optionsByProviderId = new Map<number, MediaStudioProviderAutoOption>();

  for (const model of getSupportedVisionModels(models)) {
    if (typeof model.providerId !== "number" || model.providerId <= 0) {
      continue;
    }

    if (optionsByProviderId.has(model.providerId)) {
      continue;
    }

    optionsByProviderId.set(model.providerId, {
      value: buildAutoProviderValue(model.providerId),
      providerId: model.providerId,
      providerName: getProviderName(model),
      providerDisplayName: getProviderDisplayName(model),
    });
  }

  return Array.from(optionsByProviderId.values());
}

export function groupMediaStudioModelsByProvider(
  models: Iterable<MediaStudioVisionModelOption>,
): Array<{ providerName: string; models: MediaStudioVisionModelOption[] }> {
  const grouped = new Map<string, MediaStudioVisionModelOption[]>();

  for (const model of getSupportedVisionModels(models)) {
    const providerName = getProviderDisplayName(model);
    if (!grouped.has(providerName)) {
      grouped.set(providerName, []);
    }
    grouped.get(providerName)?.push(model);
  }

  return Array.from(grouped.entries()).map(([providerName, providerModels]) => ({
    providerName,
    models: providerModels,
  }));
}

export function resolveMediaStudioAutoPromptSelection(input: {
  selectedValue: string | null | undefined;
  models: Iterable<MediaStudioVisionModelOption>;
  autoLabel: string;
  autoProviderLabelFormatter?: (providerDisplayName: string) => string;
  preferredModelId?: string | null;
}): MediaStudioAutoPromptSelection {
  const supportedModels = getSupportedVisionModels(input.models);
  const normalizedValue = typeof input.selectedValue === "string" ? input.selectedValue.trim() : "";
  const value = normalizedValue || AUTO_MODEL;

  if (value === AUTO_MODEL) {
    return {
      mode: "auto-global",
      value: AUTO_MODEL,
      displayLabel: input.autoLabel,
      resolvedModelId: "",
      providerId: null,
      providerName: null,
      providerDisplayName: null,
    };
  }

  if (isAutoProviderValue(value)) {
    const parsed = parsePickerSelectionValue({ value });
    if (parsed?.mode === "auto-provider") {
      const providerModels = supportedModels.filter((model) => model.providerId === parsed.providerId);
      const providerModel = providerModels[0] ?? null;
      const providerDisplayName = providerModel ? getProviderDisplayName(providerModel) : "Provider";
      const resolvedModelId = pickEnabledModelId({
        preferredId: input.preferredModelId,
        allowedIds: providerModels.map((model) => model.id),
        fallbackIds: [
          providerModels.find((model) => model.isDefault)?.id,
          providerModels[0]?.id,
        ],
      });

      return {
        mode: "auto-provider",
        value,
        displayLabel:
          input.autoProviderLabelFormatter?.(providerDisplayName)
          || `Auto (${providerDisplayName})`,
        resolvedModelId,
        providerId: parsed.providerId,
        providerName: providerModel ? getProviderName(providerModel) : null,
        providerDisplayName,
      };
    }
  }

  const explicitModel = supportedModels.find((model) => model.id === value) ?? null;
  if (explicitModel) {
    return {
      mode: "explicit",
      value,
      displayLabel: formatMediaStudioModelLabel(explicitModel),
      resolvedModelId: explicitModel.id,
      providerId: explicitModel.providerId ?? null,
      providerName: getProviderName(explicitModel),
      providerDisplayName: getProviderDisplayName(explicitModel),
    };
  }

  return {
    mode: "explicit",
    value,
    displayLabel: value,
    resolvedModelId: "",
    providerId: null,
    providerName: null,
    providerDisplayName: null,
  };
}
