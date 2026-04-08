export const AUTO_MODEL = "__auto__";
export const AUTO_PROVIDER_PREFIX = "__auto_provider__:";

export type ChatPickerSelection =
  | { mode: "explicit"; modelId: string; providerId?: number | null; providerName?: string | null }
  | { mode: "auto-global" }
  | { mode: "auto-provider"; providerId: number; providerName?: string | null };

export interface StoredChatModelSelectionState {
  mode: "explicit" | "auto-global" | "auto-provider";
  modelId?: string | null;
  providerId?: number | null;
  providerName?: string | null;
  lastResolvedModelId?: string | null;
  lastResolvedProviderId?: number | null;
  lastResolvedProviderName?: string | null;
  lastResolvedRouteFamily?: "chat-completions" | "messages" | "responses" | "unknown" | null;
  updatedAt?: string | null;
}

export interface ChatSelectionDisplaySummary {
  providerLabel: string | null;
  primaryLabel: string;
  secondaryLabel: string | null;
  tooltipLabel: string;
}

export function isAutoProviderValue(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(AUTO_PROVIDER_PREFIX);
}

export function buildAutoProviderValue(providerId: number): string {
  return `${AUTO_PROVIDER_PREFIX}${providerId}`;
}

export function parsePickerSelectionValue(input: {
  value: string | null | undefined;
  explicitProviderId?: number | null;
  explicitProviderName?: string | null;
}): ChatPickerSelection | null {
  const value = typeof input.value === "string" ? input.value.trim() : "";
  if (!value) {
    return null;
  }
  if (value === AUTO_MODEL) {
    return { mode: "auto-global" };
  }
  if (isAutoProviderValue(value)) {
    const providerId = Number(value.slice(AUTO_PROVIDER_PREFIX.length));
    if (Number.isInteger(providerId) && providerId > 0) {
      return {
        mode: "auto-provider",
        providerId,
        providerName: input.explicitProviderName ?? null,
      };
    }
  }
  return {
    mode: "explicit",
    modelId: value,
    providerId: input.explicitProviderId ?? null,
    providerName: input.explicitProviderName ?? null,
  };
}

export function selectionToPickerValue(
  selection: StoredChatModelSelectionState | ChatPickerSelection | null | undefined,
  fallbackModelId?: string | null,
): string {
  if (!selection) {
    return fallbackModelId?.trim() || AUTO_MODEL;
  }

  if (selection.mode === "auto-global") {
    return AUTO_MODEL;
  }
  if (selection.mode === "auto-provider" && selection.providerId) {
    return buildAutoProviderValue(selection.providerId);
  }
  if (selection.mode === "explicit" && selection.modelId) {
    return selection.modelId;
  }
  return fallbackModelId?.trim() || AUTO_MODEL;
}

export function formatSelectionLabel(input: {
  pickerValue: string;
  explicitLabel?: string | null;
  storedSelection?: StoredChatModelSelectionState | null;
}): string {
  if (input.pickerValue === AUTO_MODEL) {
    const resolved = input.storedSelection?.lastResolvedModelId;
    const provider = input.storedSelection?.lastResolvedProviderName;
    return resolved
      ? `Auto -> ${resolved}${provider ? ` (${provider})` : ""}`
      : "Auto (best overall)";
  }

  if (isAutoProviderValue(input.pickerValue)) {
    const preferredProvider = input.storedSelection?.providerName || "Provider";
    const resolved = input.storedSelection?.lastResolvedModelId;
    return resolved
      ? `${preferredProvider} Auto -> ${resolved}`
      : `${preferredProvider} - Auto Model`;
  }

  return input.explicitLabel?.trim() || input.pickerValue;
}

export function getSelectionDisplaySummary(input: {
  pickerValue: string;
  explicitLabel?: string | null;
  explicitProviderName?: string | null;
  storedSelection?: StoredChatModelSelectionState | null;
}): ChatSelectionDisplaySummary {
  const normalizedExplicitLabel = input.explicitLabel?.trim() || input.pickerValue;
  const normalizedExplicitProvider = input.explicitProviderName?.trim() || null;
  const resolvedModel = input.storedSelection?.lastResolvedModelId?.trim() || null;
  const resolvedProvider = input.storedSelection?.lastResolvedProviderName?.trim() || null;

  if (input.pickerValue === AUTO_MODEL) {
    const secondaryLabel = resolvedModel
      ? `Resolved to ${resolvedModel}${resolvedProvider ? ` via ${resolvedProvider}` : ""}`
      : null;

    return {
      providerLabel: resolvedProvider,
      primaryLabel: "Auto (best overall)",
      secondaryLabel,
      tooltipLabel: secondaryLabel ?? "Auto (best overall)",
    };
  }

  if (isAutoProviderValue(input.pickerValue)) {
    const preferredProvider =
      input.storedSelection?.providerName?.trim()
      || input.explicitProviderName?.trim()
      || "Provider";
    const secondaryLabel = resolvedModel ? `Resolved to ${resolvedModel}` : null;
    return {
      providerLabel: preferredProvider,
      primaryLabel: "Auto Model",
      secondaryLabel,
      tooltipLabel: secondaryLabel
        ? `${preferredProvider} auto model. ${secondaryLabel}.`
        : `${preferredProvider} auto model.`,
    };
  }

  return {
    providerLabel: normalizedExplicitProvider,
    primaryLabel: normalizedExplicitLabel,
    secondaryLabel: normalizedExplicitProvider ? `Provider: ${normalizedExplicitProvider}` : null,
    tooltipLabel: normalizedExplicitProvider
      ? `${normalizedExplicitProvider} · ${normalizedExplicitLabel}`
      : normalizedExplicitLabel,
  };
}
