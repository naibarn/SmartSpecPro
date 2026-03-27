/**
 * Memory Merger
 *
 * Orders and deduplicates mixed memory sources before they are injected into
 * the chat context.
 */

export type MemorySourceKind = "rule" | "fact" | "chunk" | "legacy";

export interface MemoryMergerItem {
  id: string;
  source: MemorySourceKind;
  content: string;
  tokenCount?: number;
}

export interface MemoryMergerResult {
  merged: MemoryMergerItem[];
  skipped: MemoryMergerItem[];
  tokenCount: number;
}

export interface MergedMemoryItem {
  id: string;
  source: "rule" | "l1_fact" | "l2_chunk" | "legacy_entity";
  content: string;
  tokenEstimate: number;
  score: number;
}

export interface MergeOptions {
  totalBudget: number;
  maxMemoryTokens?: number;
  l1Cap?: number;
  l2Cap?: number;
}

export interface MergeResult {
  contextText: string;
  items: MergedMemoryItem[];
  tokenEstimate: number;
  l1Count: number;
  l2Count: number;
  l2Triggered: boolean;
  rulesCount: number;
  legacyCount: number;
}

const SOURCE_ORDER: MemorySourceKind[] = ["rule", "fact", "chunk", "legacy"];

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function mergeMemories(
  items: MemoryMergerItem[],
  tokenBudget: number,
): MemoryMergerResult {
  const seen = new Set<string>();
  const merged: MemoryMergerItem[] = [];
  const skipped: MemoryMergerItem[] = [];
  let tokenCount = 0;

  for (const source of SOURCE_ORDER) {
    for (const item of items.filter((candidate) => candidate.source === source)) {
      const dedupeKey = `${item.source}:${item.id}:${item.content.slice(0, 120)}`;
      if (seen.has(dedupeKey)) {
        skipped.push(item);
        continue;
      }

      const cost = item.tokenCount ?? estimateTokens(item.content);
      if (tokenCount + cost > tokenBudget) {
        skipped.push(item);
        continue;
      }

      seen.add(dedupeKey);
      merged.push(item);
      tokenCount += cost;
    }
  }

  return { merged, skipped, tokenCount };
}

function normalizeSource(source: MemorySourceKind): MergedMemoryItem["source"] {
  switch (source) {
    case "rule":
      return "rule";
    case "fact":
      return "l1_fact";
    case "chunk":
      return "l2_chunk";
    case "legacy":
    default:
      return "legacy_entity";
  }
}

/**
 * Merge rule, fact, chunk, and legacy memory items into a budgeted prompt block.
 * Rules are kept first and are not trimmed unless the budget is truly exhausted.
 */
export function mergeAndDedup(
  rules: MemoryMergerItem[],
  l1Results: MemoryMergerItem[],
  l2Results: MemoryMergerItem[],
  legacyEntities: MemoryMergerItem[],
  options: MergeOptions,
): MergeResult {
  const maxMemoryTokens = options.maxMemoryTokens ?? 4000;
  const l1Cap = options.l1Cap ?? 0.2;
  const l2Cap = options.l2Cap ?? 0.1;
  const budget = Math.min(options.totalBudget, maxMemoryTokens);

  const seen = new Set<string>();
  const items: MergedMemoryItem[] = [];
  let tokenEstimate = 0;

  const push = (item: MemoryMergerItem, score: number) => {
    const dedupeKey = `${item.source}:${item.id}`;
    if (seen.has(dedupeKey)) return false;

    const cost = item.tokenCount ?? estimateTokens(item.content);
    if (tokenEstimate + cost > budget) return false;

    seen.add(dedupeKey);
    items.push({
      id: item.id,
      source: normalizeSource(item.source),
      content: item.content,
      tokenEstimate: cost,
      score,
    });
    tokenEstimate += cost;
    return true;
  };

  let rulesCount = 0;
  for (const rule of rules) {
    if (push(rule, 1.0)) rulesCount += 1;
  }

  const l1Budget = Math.floor(budget * l1Cap);
  let l1Count = 0;
  let l1Spent = 0;
  for (const fact of l1Results) {
    const cost = fact.tokenCount ?? estimateTokens(fact.content);
    if (l1Spent + cost > l1Budget) continue;
    if (push(fact, 0.8 - l1Count * 0.01)) {
      l1Spent += cost;
      l1Count += 1;
    }
  }

  const l2Triggered = l1Count < 3;
  const l2Budget = Math.floor(budget * l2Cap);
  let l2Count = 0;
  let l2Spent = 0;
  if (l2Triggered) {
    for (const chunk of l2Results) {
      const cost = chunk.tokenCount ?? estimateTokens(chunk.content);
      if (l2Spent + cost > l2Budget) continue;
      if (push(chunk, 0.4 - l2Count * 0.01)) {
        l2Spent += cost;
        l2Count += 1;
      }
    }
  }

  let legacyCount = 0;
  for (const entity of legacyEntities) {
    if (push(entity, 0.1 - legacyCount * 0.01)) {
      legacyCount += 1;
    }
  }

  const contextLines = items.map((item) => {
    if (item.source === "rule") return `[RULE] ${item.content}`;
    if (item.source === "l1_fact") return `[FACT] ${item.content}`;
    if (item.source === "l2_chunk") return `[CHUNK] ${item.content}`;
    return `[LEGACY] ${item.content}`;
  });

  return {
    contextText:
      contextLines.length > 0
        ? `[MEMORY_START]\n${contextLines.join("\n\n")}\n[MEMORY_END]`
        : "",
    items,
    tokenEstimate,
    l1Count,
    l2Count,
    l2Triggered,
    rulesCount,
    legacyCount,
  };
}
