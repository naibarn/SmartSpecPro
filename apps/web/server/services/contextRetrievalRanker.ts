import type { MemorySearchResult } from "./scopedMemoryService";
import { SCOPE_PRIORITY } from "./scopedMemoryService";

const RETRIEVAL_CLASS_PRIORITY: Record<
  NonNullable<MemorySearchResult["retrievalClass"]> | "unknown",
  number
> = {
  graph: 5,
  hybrid: 4,
  structured: 3,
  semantic: 2,
  lexical: 1,
  unknown: 0,
};

function normalizeContentKey(result: MemorySearchResult): string {
  return `${result.memory.title}|${result.memory.content
    .slice(0, 180)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()}`;
}

export function dedupeContextRetrievalResults(
  results: MemorySearchResult[],
): MemorySearchResult[] {
  const byId = new Map<string, MemorySearchResult>();
  const byContent = new Map<string, string>();

  for (const result of results) {
    const id = result.memory.id;
    const contentKey = normalizeContentKey(result);
    const existing = byId.get(id);
    if (!existing || result.score > existing.score) {
      const existingId = byContent.get(contentKey);
      if (existingId && existingId !== id) {
        const existingByContent = byId.get(existingId);
        if (existingByContent && existingByContent.score >= result.score) {
          continue;
        }
        byId.delete(existingId);
      }
      byId.set(id, result);
      byContent.set(contentKey, id);
      continue;
    }
    if (
      existing &&
      existing.score === result.score &&
      (RETRIEVAL_CLASS_PRIORITY[result.retrievalClass ?? "unknown"] ?? 0) <
        (RETRIEVAL_CLASS_PRIORITY[existing.retrievalClass ?? "unknown"] ?? 0)
    ) {
      byId.set(id, result);
    }
  }

  return [...byId.values()];
}

export function rankContextRetrievalResults(
  results: MemorySearchResult[],
): MemorySearchResult[] {
  return dedupeContextRetrievalResults(results)
    .map((result) => ({
      ...result,
      score:
        result.score *
        (SCOPE_PRIORITY[result.memory.ownerType] ? 1 + SCOPE_PRIORITY[result.memory.ownerType] * 0.01 : 1),
    }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;
      const rightPriority = RETRIEVAL_CLASS_PRIORITY[right.retrievalClass ?? "unknown"] ?? 0;
      const leftPriority = RETRIEVAL_CLASS_PRIORITY[left.retrievalClass ?? "unknown"] ?? 0;
      if (rightPriority !== leftPriority) return rightPriority - leftPriority;
      return (
        right.memory.updatedAt.getTime() - left.memory.updatedAt.getTime() ||
        right.memory.createdAt.getTime() - left.memory.createdAt.getTime() ||
        left.memory.id.localeCompare(right.memory.id)
      );
    });
}

