import type { RunnerModelCatalog } from "./runnerContracts";

export type Spec224ModelSelectionRequest = {
  policy: "auto" | "explicit";
  modelId?: string;
  reasoningEffort?: string;
};

export type Spec224ResolvedModelSelection = {
  adapterId: string;
  policy: "auto" | "explicit";
  selectedModelId: string | null;
  resolvedModelId: string;
  reasoningEffort: string;
  catalogRevision: string;
  accountProviderFingerprint: string | null;
  capabilitySnapshotRevision: string;
  capabilityProfile: string[];
  cliVersion: string | null;
};

export function validateSpec224ResolvedModelSelection(value: unknown): Spec224ResolvedModelSelection {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("SPEC224_MODEL_SELECTION_INVALID");
  const raw = value as Record<string, unknown>;
  const text = (field: unknown, max: number, allowNull = false): field is string | null =>
    (allowNull && field === null) || (typeof field === "string" && field.trim().length > 0 && field.length <= max);
  if (
    !text(raw.adapterId, 128) ||
    (raw.policy !== "auto" && raw.policy !== "explicit") ||
    !(raw.selectedModelId === null || text(raw.selectedModelId, 160)) ||
    !text(raw.resolvedModelId, 160) || !text(raw.reasoningEffort, 32) ||
    !text(raw.catalogRevision, 160) || !text(raw.accountProviderFingerprint, 128, true) ||
    !text(raw.capabilitySnapshotRevision, 160) || !Array.isArray(raw.capabilityProfile) ||
    raw.capabilityProfile.length > 32 || raw.capabilityProfile.some(item => !text(item, 80)) ||
    !text(raw.cliVersion, 80, true) ||
    (raw.policy === "explicit" && raw.selectedModelId !== raw.resolvedModelId) ||
    (raw.policy === "auto" && raw.selectedModelId !== null)
  ) throw new Error("SPEC224_MODEL_SELECTION_INVALID");
  return raw as unknown as Spec224ResolvedModelSelection;
}

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/;
const EFFORT = /^[A-Za-z][A-Za-z0-9_-]{0,31}$/;

/** Resolve only from the selected authorized Runner's current capability read model. */
export function resolveSpec224ModelSelection(input: {
  request?: Spec224ModelSelectionRequest;
  adapterId: string;
  catalog: RunnerModelCatalog | null | undefined;
  capabilitySnapshotRevision: string;
  now?: Date;
}): Spec224ResolvedModelSelection {
  const request = input.request ?? { policy: "auto" as const };
  const catalog = input.catalog;
  const now = input.now ?? new Date();
  if (
    !catalog || catalog.state !== "discovered" ||
    catalog.adapterId !== input.adapterId ||
    !catalog.models?.length || !catalog.revision ||
    Date.parse(catalog.expiresAt) <= now.getTime() ||
    Date.parse(catalog.observedAt) > now.getTime()
  ) throw new Error("SPEC224_MODEL_CATALOG_NOT_READY");
  if (request.policy !== "auto" && request.policy !== "explicit")
    throw new Error("SPEC224_MODEL_SELECTION_POLICY_INVALID");
  if (request.policy === "auto" && request.modelId !== undefined)
    throw new Error("SPEC224_AUTO_MODEL_ID_NOT_ALLOWED");
  if (request.policy === "explicit" && (!request.modelId || !MODEL_ID.test(request.modelId)))
    throw new Error("SPEC224_MODEL_SELECTION_ID_REQUIRED");
  if (request.modelId !== undefined && !MODEL_ID.test(request.modelId))
    throw new Error("SPEC224_MODEL_SELECTION_ID_INVALID");
  if (request.reasoningEffort !== undefined && !EFFORT.test(request.reasoningEffort))
    throw new Error("SPEC224_MODEL_REASONING_EFFORT_INVALID");

  const selectedModel = request.policy === "auto"
    ? catalog.models.find(model => model.isDefault)
    : catalog.models.find(model => model.id === request.modelId);
  if (!selectedModel)
    throw new Error(request.policy === "auto"
      ? "SPEC224_MODEL_DEFAULT_UNAVAILABLE"
      : "SPEC224_SELECTED_MODEL_UNAVAILABLE");
  if (!catalog.accountProviderFingerprint)
    throw new Error("SPEC224_MODEL_ACCOUNT_SCOPE_UNKNOWN");
  const reasoningEffort = request.reasoningEffort ?? selectedModel.defaultReasoningEffort ??
    (selectedModel.reasoningEfforts.includes("medium") ? "medium" : selectedModel.reasoningEfforts[0]);
  if (!reasoningEffort || !selectedModel.reasoningEfforts.includes(reasoningEffort))
    throw new Error("SPEC224_MODEL_REASONING_EFFORT_UNSUPPORTED");

  return {
    adapterId: input.adapterId,
    policy: request.policy,
    selectedModelId: request.policy === "explicit" ? selectedModel.id : null,
    resolvedModelId: selectedModel.id,
    reasoningEffort,
    catalogRevision: catalog.revision,
    accountProviderFingerprint: catalog.accountProviderFingerprint ?? null,
    capabilitySnapshotRevision: input.capabilitySnapshotRevision,
    capabilityProfile: [...selectedModel.capabilities],
    cliVersion: catalog.cliVersion,
  };
}
