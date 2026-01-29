/**
 * Relevance Scorer
 * Lightweight keyword overlap scoring for memory retrieval
 * No external embedding API dependency
 */

const STOPWORDS = new Set([
  // English
  "the", "is", "at", "which", "on", "a", "an", "and", "or", "but", "in", "to",
  "for", "of", "with", "it", "this", "that", "i", "you", "we", "my", "your",
  "how", "what", "do", "can", "will", "be", "are", "was", "were", "been", "have",
  "has", "had", "not", "no", "so", "if", "from", "by", "as", "all", "would",
  "there", "their", "about", "up", "out", "just", "than", "them", "some", "its",
  // Thai common particles
  "ที่", "ของ", "และ", "ใน", "มี", "ไม่", "ได้", "เป็น", "จะ", "กับ", "ว่า",
  "ให้", "แล้ว", "ก็", "ไป", "มา", "อยู่", "คือ", "นี้", "นั้น",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u0E00-\u0E7F\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
  const len = tokens.length || 1;
  for (const [k, v] of tf) tf.set(k, v / len);
  return tf;
}

export function scoreRelevance(query: string, memoryText: string): number {
  const queryTokens = tokenize(query);
  const memTokens = tokenize(memoryText);
  if (queryTokens.length === 0 || memTokens.length === 0) return 0;

  const queryTf = termFrequency(queryTokens);
  const memSet = new Set(memTokens);

  let score = 0;
  for (const [term, freq] of queryTf) {
    if (memSet.has(term)) score += freq;
  }
  return score;
}

export interface ScoredMemory<T> {
  memory: T;
  relevanceScore: number;
  combinedScore: number;
}

export function rankMemories<
  T extends { facts: string[]; importance: number | null; entityType: string; entityName: string },
>(
  query: string,
  memories: T[],
  opts: { importanceWeight?: number; relevanceWeight?: number } = {},
): ScoredMemory<T>[] {
  const iw = opts.importanceWeight ?? 0.3;
  const rw = opts.relevanceWeight ?? 0.7;

  return memories
    .map((m) => {
      const factsText = m.facts.join(" ");
      const relevanceScore = scoreRelevance(query, factsText + " " + m.entityName);
      const normalizedImportance = (m.importance ?? 5) / 10;
      const combinedScore = rw * relevanceScore + iw * normalizedImportance;
      return { memory: m, relevanceScore, combinedScore };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}
