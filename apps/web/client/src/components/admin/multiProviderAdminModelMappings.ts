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
  apiStyle: "chat-completions" | "responses" | "messages" | "gemini";
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

function matchesModelMappingFilters(
  row: AdminModelMappingRow,
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
