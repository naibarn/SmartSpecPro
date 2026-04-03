export interface AdminModelMappingRow {
  id: number;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName?: string | null;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  // Model capabilities
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
}

export interface AdminModelCatalogRow {
  mappingId: number | null;
  isMapped: boolean;
  modelId: string;
  providerId: number;
  providerName: string;
  providerDisplayName?: string | null;
  modelName: string;
  providerModelId: string;
  pricingInput: string;
  pricingOutput: string;
  isFree: boolean;
  contextLength: number | null;
  isEnabled: boolean;
  priority: number;
  priorityLocked: boolean;
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
  // Model capabilities
  supportsVision?: boolean;
  supportsThinking?: boolean;
  supportsWebSearch?: boolean;
  supportsFunctionTools?: boolean;
  supportsStructuredOutputs?: boolean;
  supportsCodeExecution?: boolean;
  supportsComputerUse?: boolean;
  supportsBackground?: boolean;
  supportsResponses?: boolean;
  config?: {
    requestBodyFormat: "responses" | "anthropic-messages" | "openai-chat-completions";
    apiEndpoint?: string;
    apiEndpointTemplate?: string;
    authStrategy?: "provider-default";
    supportsStreaming?: boolean;
    inputFields?: Array<{
      key: string;
      label: string;
      type: "boolean" | "number" | "text" | "select" | "json" | "messages" | "input" | "tools";
      required?: boolean;
      documented?: boolean;
      default?: string | number | boolean;
      options?: Array<{ value: string; label: string }>;
      description?: string;
    }>;
    passthroughFields?: string[];
    conflicts?: Array<{ type: "xor"; fields: string[] }>;
  };
}

export type AdminModelMappingsGrouped = Record<string, AdminModelMappingRow[]>;

export interface FilterModelMappingGroupsInput {
  groupedMappings: AdminModelMappingsGrouped | undefined;
  searchQuery: string;
  providerFilter: string;
}

export interface FilteredModelMappingGroup {
  modelId: string;
  models: AdminModelMappingRow[];
  enabledCount: number;
}

type FilterableModelRow = Pick<
  AdminModelCatalogRow,
  "modelId" | "modelName" | "providerId" | "providerName" | "providerDisplayName" | "providerModelId"
>;

function matchesModelMappingFilters(
  row: FilterableModelRow,
  searchQuery: string,
  providerFilter: string,
) {
  const search = searchQuery.trim().toLowerCase();
  const providerMatches = providerFilter === "all" || String(row.providerId) === providerFilter;

  if (!providerMatches) {
    return false;
  }

  if (search.length === 0) {
    return true;
  }

  return [
    row.modelId,
    row.modelName,
    row.providerName,
    row.providerDisplayName ?? "",
    row.providerModelId,
  ].some((value) => value.toLowerCase().includes(search));
}

export function getAdminModelSelectionKey(row: Pick<AdminModelCatalogRow, "mappingId" | "providerId" | "providerModelId">) {
  if (row.mappingId != null) {
    return `mapped:${row.mappingId}`;
  }
  return `catalog:${row.providerId}:${row.providerModelId}`;
}

export type EnabledFilter = "all" | "enabled" | "disabled";

export function filterAdminModelCatalogRows(
  rows: AdminModelCatalogRow[] | undefined,
  searchQuery: string,
  providerFilter: string,
  enabledFilter: EnabledFilter = "all",
): AdminModelCatalogRow[] {
  return (rows ?? [])
    .filter((row) => matchesModelMappingFilters(row, searchQuery, providerFilter))
    .filter((row) => enabledFilter === "all" || (enabledFilter === "enabled" ? row.isEnabled : !row.isEnabled))
    .sort((left, right) => {
      const nameCompare = left.modelName.localeCompare(right.modelName);
      if (nameCompare !== 0) {
        return nameCompare;
      }

      const priorityCompare = left.priority - right.priority;
      if (priorityCompare !== 0) {
        return priorityCompare;
      }

      const providerCompare = (left.providerDisplayName ?? left.providerName).localeCompare(
        right.providerDisplayName ?? right.providerName,
      );
      if (providerCompare !== 0) {
        return providerCompare;
      }

      return left.providerModelId.localeCompare(right.providerModelId);
    });
}

export function filterFlatModelMappings(input: FilterModelMappingGroupsInput): AdminModelMappingRow[] {
  return Object.values(input.groupedMappings ?? {})
    .flat()
    .filter((row) => matchesModelMappingFilters(row, input.searchQuery, input.providerFilter))
    .sort((left, right) => {
      const modelCompare = left.modelId.localeCompare(right.modelId);
      if (modelCompare !== 0) {
        return modelCompare;
      }

      const providerCompare = (left.providerDisplayName ?? left.providerName).localeCompare(
        right.providerDisplayName ?? right.providerName,
      );
      if (providerCompare !== 0) {
        return providerCompare;
      }

      return left.priority - right.priority;
    });
}

export function filterModelMappingGroups(input: FilterModelMappingGroupsInput): FilteredModelMappingGroup[] {
  const groups = new Map<string, AdminModelMappingRow[]>();

  filterFlatModelMappings(input).forEach((row) => {
    const existing = groups.get(row.modelId);
    if (existing) {
      existing.push(row);
      return;
    }
    groups.set(row.modelId, [row]);
  });

  return Array.from(groups.entries()).map(([modelId, models]) => ({
    modelId,
    models,
    enabledCount: models.filter((row) => row.isEnabled).length,
  }));
}

export function collectVisibleMappingIds(groups: FilteredModelMappingGroup[]) {
  return groups.flatMap((group) => group.models.map((row) => row.id));
}
