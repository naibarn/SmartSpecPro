export function createEnabledModelIdSet(modelIds: Iterable<string | null | undefined>) {
  return new Set(
    Array.from(modelIds)
      .map((modelId) => (typeof modelId === "string" ? modelId.trim() : ""))
      .filter((modelId): modelId is string => modelId.length > 0),
  );
}

export function pickEnabledModelId(input: {
  preferredId?: string | null;
  allowedIds: Iterable<string | null | undefined>;
  fallbackIds?: Array<string | null | undefined>;
}): string {
  const enabledIds = createEnabledModelIdSet(input.allowedIds);

  const candidates = [input.preferredId, ...(input.fallbackIds ?? [])];
  for (const candidate of candidates) {
    const normalized = typeof candidate === "string" ? candidate.trim() : "";
    if (normalized && enabledIds.has(normalized)) {
      return normalized;
    }
  }

  return "";
}
