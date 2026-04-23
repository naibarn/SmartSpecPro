import {
  filterAutoSelectableLlmModelRows,
  loadEnabledLlmModelRows,
  type EnabledLlmModelRow,
} from "./enabledLlmModels";
import type { CapabilityRequirements } from "./intelligentModelSelector";
import { debugLog } from "../_core/logger";
import { buildModelLookupCandidates } from "./modelLookup";

export type ChatSelectionMode = "explicit" | "auto-global" | "auto-provider";
export type ChatRouteFamily = "chat-completions" | "messages" | "responses" | "unknown";

export type ChatModelSelection =
  | { mode: "explicit"; modelId: string; providerId?: number | null; providerName?: string | null }
  | { mode: "auto-global" }
  | { mode: "auto-provider"; providerId: number; providerName?: string | null };

export type ChatFeatureMode =
  | "web_search"
  | "computer_use"
  | "photo_search"
  | "structured_output"
  | "tool_calling"
  | "background"
  | "responses";

export interface ChatSelectionContext {
  featureModes?: ChatFeatureMode[];
}

export interface StoredChatModelSelectionState {
  mode: ChatSelectionMode;
  modelId?: string | null;
  providerId?: number | null;
  providerName?: string | null;
  lastResolvedModelId?: string | null;
  lastResolvedProviderId?: number | null;
  lastResolvedProviderName?: string | null;
  lastResolvedRouteFamily?: ChatRouteFamily | null;
  updatedAt?: string | null;
}

export interface ResolveChatModelSelectionInput {
  bodyModel?: string | null;
  bodyPreferredProvider?: number | null;
  bodyModelSelection?: unknown;
  storedSelectionState?: StoredChatModelSelectionState | null;
  messages?: Array<{ role?: string; content?: unknown }> | null;
  selectionContext?: ChatSelectionContext | null;
  autoSelectionEnabled?: boolean | null;
}

export interface ResolvedChatModelSelection {
  selectionMode: ChatSelectionMode;
  selection: ChatModelSelection;
  requestedModelId?: string | null;
  resolvedModelId: string;
  resolvedProviderId?: number;
  resolvedProviderName?: string;
  preferredProviderId?: number;
  strictProviderPin: boolean;
  routeFamily: ChatRouteFamily;
  requirements: Partial<CapabilityRequirements>;
  continuityApplied: boolean;
  shouldPersistSelectionState: boolean;
}

export async function resolveStructuredAutoChatModelSelection(): Promise<ResolvedChatModelSelection> {
  return resolveChatModelSelection({
    bodyModelSelection: { mode: "auto-global" },
    selectionContext: { featureModes: ["structured_output"] },
  });
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function trimString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parsePositiveInt(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isAllowedFeatureMode(value: string): value is ChatFeatureMode {
  return [
    "web_search",
    "computer_use",
    "photo_search",
    "structured_output",
    "tool_calling",
    "background",
    "responses",
  ].includes(value);
}

export function mapApiStyleToRouteFamily(
  apiStyle: EnabledLlmModelRow["apiStyle"] | undefined | null,
): ChatRouteFamily {
  switch (apiStyle) {
    case "messages":
      return "messages";
    case "responses":
      return "responses";
    case "chat-completions":
    case "gemini":
      return "chat-completions";
    default:
      return "unknown";
  }
}

export function readStoredChatModelSelectionState(
  skillSettings: unknown,
): StoredChatModelSelectionState | null {
  const settings = asRecord(skillSettings);
  const raw = asRecord(settings?.llmSelection);
  if (!raw) {
    return null;
  }

  const mode = trimString(raw.mode);
  if (mode !== "explicit" && mode !== "auto-global" && mode !== "auto-provider") {
    return null;
  }

  return {
    mode,
    modelId: trimString(raw.modelId),
    providerId: parsePositiveInt(raw.providerId),
    providerName: trimString(raw.providerName),
    lastResolvedModelId: trimString(raw.lastResolvedModelId),
    lastResolvedProviderId: parsePositiveInt(raw.lastResolvedProviderId),
    lastResolvedProviderName: trimString(raw.lastResolvedProviderName),
    lastResolvedRouteFamily:
      trimString(raw.lastResolvedRouteFamily) as ChatRouteFamily | null,
    updatedAt: trimString(raw.updatedAt),
  };
}

export function writeStoredChatModelSelectionState(
  skillSettings: Record<string, unknown> | null | undefined,
  state: StoredChatModelSelectionState | null,
): Record<string, unknown> {
  const next = { ...(skillSettings ?? {}) } as Record<string, unknown>;
  if (!state) {
    delete next.llmSelection;
    return next;
  }

  next.llmSelection = {
    mode: state.mode,
    modelId: state.modelId ?? null,
    providerId: state.providerId ?? null,
    providerName: state.providerName ?? null,
    lastResolvedModelId: state.lastResolvedModelId ?? null,
    lastResolvedProviderId: state.lastResolvedProviderId ?? null,
    lastResolvedProviderName: state.lastResolvedProviderName ?? null,
    lastResolvedRouteFamily: state.lastResolvedRouteFamily ?? null,
    updatedAt: state.updatedAt ?? new Date().toISOString(),
  };
  return next;
}

export function storedSelectionStateFromResolved(input: {
  selection: ChatModelSelection;
  resolvedModelId?: string | null;
  resolvedProviderId?: number | null;
  resolvedProviderName?: string | null;
  routeFamily?: ChatRouteFamily | null;
}): StoredChatModelSelectionState {
  return {
    mode: input.selection.mode,
    modelId: input.selection.mode === "explicit" ? input.selection.modelId : null,
    providerId:
      input.selection.mode === "auto-provider"
        ? input.selection.providerId
        : input.selection.mode === "explicit"
          ? input.selection.providerId ?? null
          : null,
    providerName:
      input.selection.mode === "auto-provider"
        ? input.selection.providerName ?? null
        : input.selection.mode === "explicit"
          ? input.selection.providerName ?? null
          : null,
    lastResolvedModelId: input.resolvedModelId ?? null,
    lastResolvedProviderId: input.resolvedProviderId ?? null,
    lastResolvedProviderName: input.resolvedProviderName ?? null,
    lastResolvedRouteFamily: input.routeFamily ?? null,
    updatedAt: new Date().toISOString(),
  };
}

export function selectionFromStoredState(
  stored: StoredChatModelSelectionState | null | undefined,
): ChatModelSelection | null {
  if (!stored) {
    return null;
  }

  if (stored.mode === "auto-global") {
    return { mode: "auto-global" };
  }

  if (stored.mode === "auto-provider" && stored.providerId) {
    return {
      mode: "auto-provider",
      providerId: stored.providerId,
      providerName: stored.providerName ?? null,
    };
  }

  if (stored.mode === "explicit" && stored.modelId) {
    return {
      mode: "explicit",
      modelId: stored.modelId,
      providerId: stored.providerId ?? null,
      providerName: stored.providerName ?? null,
    };
  }

  return null;
}

export function parseChatModelSelection(value: unknown): ChatModelSelection | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const mode = trimString(record.mode);
  if (mode === "auto-global") {
    return { mode };
  }
  if (mode === "auto-provider") {
    const providerId = parsePositiveInt(record.providerId);
    if (!providerId) {
      throw new Error("modelSelection.providerId is required for auto-provider mode");
    }
    return {
      mode,
      providerId,
      providerName: trimString(record.providerName),
    };
  }
  if (mode === "explicit") {
    const modelId = trimString(record.modelId);
    if (!modelId) {
      throw new Error("modelSelection.modelId is required for explicit mode");
    }
    return {
      mode,
      modelId,
      providerId: parsePositiveInt(record.providerId),
      providerName: trimString(record.providerName),
    };
  }
  throw new Error("Unsupported modelSelection.mode");
}

export function normalizeChatModelSelection(input: {
  bodyModel?: string | null;
  bodyPreferredProvider?: number | null;
  bodyModelSelection?: unknown;
  storedSelectionState?: StoredChatModelSelectionState | null;
}): ChatModelSelection | null {
  const bodyModel = trimString(input.bodyModel);
  const bodyPreferredProvider = input.bodyPreferredProvider ?? null;
  const parsedBodySelection = input.bodyModelSelection
    ? parseChatModelSelection(input.bodyModelSelection)
    : null;

  if (parsedBodySelection) {
    if (parsedBodySelection.mode === "explicit" && bodyModel && bodyModel !== parsedBodySelection.modelId) {
      throw new Error("modelSelection.modelId must match model when both are sent");
    }
    if (
      parsedBodySelection.mode === "explicit"
      && parsedBodySelection.providerId
      && bodyPreferredProvider
      && parsedBodySelection.providerId !== bodyPreferredProvider
    ) {
      throw new Error("modelSelection.providerId must match preferredProvider when both are sent");
    }
    return parsedBodySelection;
  }

  const storedSelection = selectionFromStoredState(input.storedSelectionState);
  if (storedSelection) {
    return storedSelection;
  }

  if (bodyModel) {
    return {
      mode: "explicit",
      modelId: bodyModel,
      providerId: bodyPreferredProvider,
    };
  }

  return null;
}

export function deriveChatSelectionContext(value: unknown): ChatSelectionContext | null {
  const record = asRecord(value);
  if (!record) {
    return null;
  }

  const featureModes = Array.isArray(record.featureModes)
    ? record.featureModes
        .map((entry) => trimString(entry))
        .filter((entry): entry is string => Boolean(entry))
        .filter(isAllowedFeatureMode)
    : [];

  return featureModes.length > 0 ? { featureModes } : null;
}

export function deriveChatCapabilityRequirements(input: {
  messages?: Array<{ role?: string; content?: unknown }> | null;
  selectionContext?: ChatSelectionContext | null;
}): {
  requirements: Partial<CapabilityRequirements>;
  allowResponsesFamily: boolean;
} {
  const requirements: Partial<CapabilityRequirements> = {};
  const featureModes = new Set(input.selectionContext?.featureModes ?? []);

  if (featureModes.has("web_search")) {
    requirements.supportsWebSearch = true;
  }
  if (featureModes.has("computer_use")) {
    requirements.supportsComputerUse = true;
    requirements.supportsResponses = true;
  }
  if (featureModes.has("photo_search")) {
    requirements.supportsVision = true;
  }
  if (featureModes.has("structured_output")) {
    requirements.supportsStructuredOutputs = true;
  }
  if (featureModes.has("tool_calling")) {
    requirements.supportsFunctionTools = true;
  }
  if (featureModes.has("background")) {
    requirements.supportsBackground = true;
  }
  if (featureModes.has("responses")) {
    requirements.supportsResponses = true;
  }

  const hasImageInput = (input.messages ?? []).some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }
    return message.content.some((part) => {
      const record = asRecord(part);
      return record?.type === "image_url";
    });
  });
  if (hasImageInput) {
    requirements.supportsVision = true;
  }

  return {
    requirements,
    allowResponsesFamily:
      featureModes.has("computer_use")
      || featureModes.has("responses")
      || requirements.supportsResponses === true,
  };
}

function coerceAutoSelectionWhenDisabled(
  selection: ChatModelSelection,
  storedSelectionState?: StoredChatModelSelectionState | null,
): ChatModelSelection {
  if (selection.mode === "explicit") {
    return selection;
  }

  if (storedSelectionState?.lastResolvedModelId) {
    debugLog("ChatModelSelection", "Auto selection disabled; falling back to last resolved explicit model", {
      previousMode: selection.mode,
      lastResolvedModelId: storedSelectionState.lastResolvedModelId,
      lastResolvedProviderId: storedSelectionState.lastResolvedProviderId ?? null,
    });
    return {
      mode: "explicit",
      modelId: storedSelectionState.lastResolvedModelId,
      providerId: storedSelectionState.lastResolvedProviderId ?? null,
      providerName: storedSelectionState.lastResolvedProviderName ?? null,
    };
  }

  throw new Error("Chat auto model selection is not enabled for this tenant");
}

function rowMatchesRequestedModel(row: EnabledLlmModelRow, requestedModelId: string): boolean {
  const trimmedRequestedModelId = requestedModelId.trim();
  if (!trimmedRequestedModelId) {
    return false;
  }

  const requestedIds = new Set(buildModelLookupCandidates(trimmedRequestedModelId));
  requestedIds.add(trimmedRequestedModelId);

  const candidateIds = new Set<string>();
  for (const value of [row.modelId, row.providerModelId, ...(row.legacyModelAliases ?? [])]) {
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    candidateIds.add(trimmed);
    candidateIds.add(`${row.providerName}/${trimmed}`);
    for (const candidate of buildModelLookupCandidates(trimmed)) {
      candidateIds.add(candidate);
    }
  }

  for (const requestedId of requestedIds) {
    if (candidateIds.has(requestedId)) {
      return true;
    }
  }

  return false;
}

function filterRowsByRequirements(
  rows: EnabledLlmModelRow[],
  requirements: Partial<CapabilityRequirements>,
): EnabledLlmModelRow[] {
  return rows.filter((row) => {
    if (requirements.contextLength && (!row.contextLength || row.contextLength < requirements.contextLength)) {
      return false;
    }

    if (requirements.supportsVision && row.supportsVision !== true) return false;
    if (requirements.supportsThinking && row.supportsThinking !== true) return false;
    if (requirements.supportsFunctionTools && row.supportsFunctionTools !== true) return false;
    if (requirements.supportsStructuredOutputs && row.supportsStructuredOutputs !== true) return false;
    if (requirements.supportsJsonMode && row.supportsJsonMode !== true) return false;
    if (requirements.supportsStrictToolSchema && row.supportsStrictToolSchema !== true) return false;
    if (requirements.supportsWebSearch && row.supportsWebSearch !== true) return false;
    if (requirements.supportsCodeExecution && row.supportsCodeExecution !== true) return false;
    if (requirements.supportsComputerUse && row.supportsComputerUse !== true) return false;
    if (requirements.supportsBackground && row.supportsBackground !== true) return false;
    if (requirements.supportsResponses && row.supportsResponses !== true) return false;

    return true;
  });
}

function preferChatFamiliesWhenPossible(
  rows: EnabledLlmModelRow[],
  allowResponsesFamily: boolean,
): EnabledLlmModelRow[] {
  if (allowResponsesFamily) {
    return rows;
  }

  const nonResponsesRows = rows.filter(
    (row) => mapApiStyleToRouteFamily(row.apiStyle) !== "responses",
  );
  return nonResponsesRows.length > 0 ? nonResponsesRows : rows;
}

function preferResponsesFamiliesWhenRequired(
  rows: EnabledLlmModelRow[],
  requirements: Partial<CapabilityRequirements>,
): EnabledLlmModelRow[] {
  if (requirements.supportsResponses !== true) {
    return rows;
  }

  const responsesRows = rows.filter(
    (row) => mapApiStyleToRouteFamily(row.apiStyle) === "responses",
  );
  return responsesRows.length > 0 ? responsesRows : rows;
}

function sortRowsByPriority(rows: EnabledLlmModelRow[]): EnabledLlmModelRow[] {
  return [...rows].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    if (left.providerId !== right.providerId) {
      return left.providerId - right.providerId;
    }
    return left.modelId.localeCompare(right.modelId);
  });
}

function chooseDefaultRow(rows: EnabledLlmModelRow[]): EnabledLlmModelRow | null {
  const sortedRows = sortRowsByPriority(rows);
  const defaultRow = sortedRows.find((row) =>
    row.defaultModel ? rowMatchesRequestedModel(row, row.defaultModel) : false,
  );
  return defaultRow ?? sortedRows[0] ?? null;
}

export async function resolveChatModelSelection(
  input: ResolveChatModelSelectionInput,
): Promise<ResolvedChatModelSelection> {
  const rows = await loadEnabledLlmModelRows();
  if (rows.length === 0) {
    throw new Error("No enabled LLM model configured");
  }

  let selection = normalizeChatModelSelection({
    bodyModel: input.bodyModel,
    bodyPreferredProvider: input.bodyPreferredProvider,
    bodyModelSelection: input.bodyModelSelection,
    storedSelectionState: input.storedSelectionState,
  });

  if (selection && input.autoSelectionEnabled === false) {
    selection = coerceAutoSelectionWhenDisabled(selection, input.storedSelectionState);
  }

  const derived = deriveChatCapabilityRequirements({
    messages: input.messages,
    selectionContext: input.selectionContext,
  });

  if (!selection) {
    let candidates = rows;
    if (input.bodyPreferredProvider) {
      const preferredProviderCandidates = candidates.filter(
        (row) => row.providerId === input.bodyPreferredProvider,
      );
      if (preferredProviderCandidates.length > 0) {
        candidates = preferredProviderCandidates;
      }
    }

    const requirementCandidates = filterRowsByRequirements(candidates, derived.requirements);
    if (requirementCandidates.length > 0) {
      candidates = preferChatFamiliesWhenPossible(requirementCandidates, derived.allowResponsesFamily);
      candidates = preferResponsesFamiliesWhenRequired(candidates, derived.requirements);
    } else if (input.bodyPreferredProvider) {
      const globalRequirementCandidates = filterRowsByRequirements(
        rows,
        derived.requirements,
      );
      if (globalRequirementCandidates.length > 0) {
        candidates = preferChatFamiliesWhenPossible(globalRequirementCandidates, derived.allowResponsesFamily);
        candidates = preferResponsesFamiliesWhenRequired(candidates, derived.requirements);
      }
    }

    const chosenRow = chooseDefaultRow(candidates);
    if (!chosenRow) {
      throw new Error("No enabled LLM model configured");
    }

    return {
      selectionMode: "explicit",
      selection: {
        mode: "explicit",
        modelId: chosenRow.modelId,
        providerId: null,
      },
      requestedModelId: input.bodyModel ?? null,
      resolvedModelId: chosenRow.modelId,
      resolvedProviderId: chosenRow.providerId,
      resolvedProviderName: chosenRow.providerName,
      preferredProviderId: chosenRow.providerId,
      strictProviderPin: false,
      routeFamily: mapApiStyleToRouteFamily(chosenRow.apiStyle),
      requirements: derived.requirements,
      continuityApplied: false,
      shouldPersistSelectionState: false,
    };
  }

  if (selection.mode === "explicit") {
    const matchingRows = rows.filter((row) => rowMatchesRequestedModel(row, selection.modelId));
    if (matchingRows.length === 0) {
      throw new Error("Requested chat model is not enabled");
    }

    if (selection.providerId) {
      const exactProviderRow = matchingRows.find((row) => row.providerId === selection.providerId);
      if (!exactProviderRow) {
        throw new Error("Explicit modelSelection.providerId does not match an enabled mapping for the selected model");
      }
      const explicitRows = filterRowsByRequirements([exactProviderRow], derived.requirements);
      const preferredExplicitRows = preferResponsesFamiliesWhenRequired(explicitRows, derived.requirements);
      if (preferredExplicitRows.length === 0) {
        throw new Error("The selected explicit model does not satisfy this chat request's validated requirements");
      }
      const chosenRow = sortRowsByPriority(preferredExplicitRows)[0];
      if (!chosenRow) {
        throw new Error("The selected explicit model does not satisfy this chat request's validated requirements");
      }
      return {
        selectionMode: selection.mode,
        selection,
        requestedModelId: selection.modelId,
        resolvedModelId: chosenRow.modelId,
        resolvedProviderId: chosenRow.providerId,
        resolvedProviderName: chosenRow.providerName,
        preferredProviderId: chosenRow.providerId,
        strictProviderPin: true,
        routeFamily: mapApiStyleToRouteFamily(chosenRow.apiStyle),
        requirements: derived.requirements,
        continuityApplied: false,
        shouldPersistSelectionState: true,
      };
    }

    const eligibleRows = filterRowsByRequirements(matchingRows, derived.requirements);
    const preferredEligibleRows = preferResponsesFamiliesWhenRequired(eligibleRows, derived.requirements);
    const chosenRow = sortRowsByPriority(preferredEligibleRows)[0];
    if (!chosenRow) {
      throw new Error("The selected explicit model does not satisfy this chat request's validated requirements");
    }
    return {
      selectionMode: selection.mode,
      selection,
      requestedModelId: selection.modelId,
      resolvedModelId: chosenRow.modelId,
      resolvedProviderId: chosenRow.providerId,
      resolvedProviderName: chosenRow.providerName,
      preferredProviderId: chosenRow.providerId,
      strictProviderPin: false,
      routeFamily: mapApiStyleToRouteFamily(chosenRow.apiStyle),
      requirements: derived.requirements,
      continuityApplied: false,
      shouldPersistSelectionState: true,
    };
  }

  let candidates = rows;
  if (selection.mode === "auto-provider") {
    candidates = candidates.filter((row) => row.providerId === selection.providerId);
    if (candidates.length === 0) {
      throw new Error("Requested provider is not enabled for chat auto selection");
    }
  }

  candidates = filterAutoSelectableLlmModelRows(candidates);
  candidates = filterRowsByRequirements(candidates, derived.requirements);
  candidates = preferChatFamiliesWhenPossible(candidates, derived.allowResponsesFamily);
  candidates = preferResponsesFamiliesWhenRequired(candidates, derived.requirements);
  if (candidates.length === 0) {
    if (selection.mode === "auto-provider") {
      throw new Error("No enabled model in the selected provider satisfies this chat request");
    }
    throw new Error("No enabled model satisfies this chat request");
  }

  let continuityApplied = false;
  const preferredRouteFamily = input.storedSelectionState?.lastResolvedRouteFamily;
  if (preferredRouteFamily && preferredRouteFamily !== "unknown") {
    const continuityCandidates = candidates.filter(
      (row) => mapApiStyleToRouteFamily(row.apiStyle) === preferredRouteFamily,
    );
    if (continuityCandidates.length > 0) {
      candidates = continuityCandidates;
      continuityApplied = true;
    }
  }

  const chosenRow = sortRowsByPriority(candidates)[0];
  debugLog("ChatModelSelection", "Resolved auto chat model selection", {
    selectionMode: selection.mode,
    providerId: selection.mode === "auto-provider" ? selection.providerId : null,
    resolvedModelId: chosenRow.modelId,
    resolvedProviderId: chosenRow.providerId,
    routeFamily: mapApiStyleToRouteFamily(chosenRow.apiStyle),
    continuityApplied,
    requirementKeys: Object.keys(derived.requirements).filter((key) => (derived.requirements as Record<string, unknown>)[key] === true),
  });
  return {
    selectionMode: selection.mode,
    selection,
    requestedModelId: null,
    resolvedModelId: chosenRow.modelId,
    resolvedProviderId: chosenRow.providerId,
    resolvedProviderName: chosenRow.providerName,
    preferredProviderId:
      selection.mode === "auto-provider" ? selection.providerId : chosenRow.providerId,
    strictProviderPin: selection.mode === "auto-provider",
    routeFamily: mapApiStyleToRouteFamily(chosenRow.apiStyle),
    requirements: derived.requirements,
    continuityApplied,
    shouldPersistSelectionState: true,
  };
}
