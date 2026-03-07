import { eq, or } from "drizzle-orm";
import { modelProviderMap } from "../../drizzle/schema";

export function buildModelLookupCandidates(modelId: string): string[] {
  const trimmed = modelId.trim();
  const candidates = new Set<string>();
  if (trimmed.length > 0) {
    candidates.add(trimmed);
  }

  const unprefixed = trimmed.includes("/")
    ? trimmed.slice(trimmed.lastIndexOf("/") + 1).trim()
    : "";
  if (unprefixed.length > 0) {
    candidates.add(unprefixed);
  }

  return Array.from(candidates);
}

export function buildModelProviderMapLookupCondition(modelId: string) {
  const lookupCandidates = buildModelLookupCandidates(modelId);
  if (lookupCandidates.length === 0) {
    return eq(modelProviderMap.modelId, "__missing_model__");
  }

  if (lookupCandidates.length === 1) {
    return or(
      eq(modelProviderMap.modelId, lookupCandidates[0]!),
      eq(modelProviderMap.providerModelId, lookupCandidates[0]!),
    )!;
  }

  return or(
    ...lookupCandidates.flatMap((candidate) => [
      eq(modelProviderMap.modelId, candidate),
      eq(modelProviderMap.providerModelId, candidate),
    ]),
  )!;
}
