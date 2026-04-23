/**
 * Scoped Memory Service — CRUD + hybrid retrieval (keyword + vector).
 *
 * Memories are scoped to owners (user/agent/team/room/project/run) with
 * visibility rules and priority-based multi-scope retrieval.
 */

import { eq, and, inArray, sql, desc, or, ilike, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import {
  scopedMemories,
  memoryPromotions,
  type ScopedMemory,
  type InsertScopedMemory,
} from "../../drizzle/schema";
import { generateQueryEmbedding } from "./queryEmbeddingService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface MemoryScope {
  type: "user" | "agent" | "team" | "room" | "project" | "run";
  id: string;
}

export interface SearchOptions {
  tenantId: string;
  scopes: MemoryScope[];
  query: string;
  topK?: number;
  keywordWeight?: number;
  vectorWeight?: number;
  embedding?: number[];
}

export interface MemorySearchResult {
  memory: ScopedMemory;
  score: number;
  matchType: "keyword" | "vector" | "hybrid";
  retrievalClass?: "lexical" | "structured" | "graph" | "semantic" | "hybrid";
}

export interface PromptScopeOptions {
  initiatedByUserId?: number;
  projectId?: string | null;
  additionalScopes?: MemoryScope[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Scope priority: higher = more specific = preferred in dedup */
export const SCOPE_PRIORITY: Record<string, number> = {
  agent: 6,
  run: 5,
  room: 4,
  team: 3,
  project: 2,
  user: 1,
};

export function buildPromptScopeList(params: {
  assistantId: string;
  runId?: string | null;
  roomId?: string | null;
  teamId?: string | null;
  initiatedByUserId?: number;
  projectId?: string | null;
  additionalScopes?: MemoryScope[];
}): MemoryScope[] {
  const scopes: MemoryScope[] = [{ type: "agent", id: params.assistantId }];
  if (params.runId) scopes.push({ type: "run", id: params.runId });
  if (params.roomId) scopes.push({ type: "room", id: params.roomId });
  if (params.teamId) scopes.push({ type: "team", id: params.teamId });
  if (params.projectId) scopes.push({ type: "project", id: params.projectId });
  if (params.initiatedByUserId) {
    scopes.push({ type: "user", id: String(params.initiatedByUserId) });
  }
  if (params.additionalScopes?.length) {
    scopes.push(...params.additionalScopes);
  }

  const seen = new Set<string>();
  return scopes.filter(scope => {
    const key = `${scope.type}:${scope.id}`;
    if (!scope.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isMissingScopedMemoriesTable(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string; message?: string };
  if (err.code === "42P01") return true; // relation does not exist
  if (typeof err.message === "string" && err.message.includes("scoped_memories")) {
    return true;
  }
  return false;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Default visibility based on owner type */
export function getDefaultVisibility(
  ownerType: string,
): "private" | "shared_team" | "shared_room" | "shared_project" {
  switch (ownerType) {
    case "team":
      return "shared_team";
    case "room":
      return "shared_room";
    case "project":
      return "shared_project";
    default:
      return "private";
  }
}

/** Recency decay factor: 1.0 / (1.0 + days_since_update × 0.1) */
export function computeRecencyFactor(updatedAt: Date): number {
  const daysSince = (Date.now() - updatedAt.getTime()) / 86_400_000;
  return 1.0 / (1.0 + daysSince * 0.1);
}

function uniqueScopes(scopes: MemoryScope[]): MemoryScope[] {
  const seen = new Set<string>();
  return scopes.filter((scope) => {
    const key = `${scope.type}:${scope.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getMemoryMetadata(memory: ScopedMemory): Record<string, unknown> {
  return (memory.metadataJson ?? {}) as Record<string, unknown>;
}

function isWorkingSummaryMemory(memory: ScopedMemory): boolean {
  const metadata = getMemoryMetadata(memory);
  const contextRole = typeof metadata.contextRole === "string" ? metadata.contextRole : "";
  const summaryKind = typeof metadata.summaryKind === "string" ? metadata.summaryKind : "";
  const title = memory.title.trim().toLowerCase();
  return (
    contextRole === "working_summary" ||
    summaryKind === "working_summary" ||
    title.startsWith("working summary") ||
    title.startsWith("room summary") ||
    title.startsWith("team summary")
  );
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createMemory(
  input: Omit<InsertScopedMemory, "id" | "createdAt" | "updatedAt">,
): Promise<ScopedMemory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const visibility = input.visibility ?? getDefaultVisibility(input.ownerType);

  const [result] = await db
    .insert(scopedMemories)
    .values({ ...input, visibility })
    .returning();

  return result;
}

export async function getMemory(memoryId: string, tenantId: string): Promise<ScopedMemory | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const [result] = await db
      .select()
      .from(scopedMemories)
      .where(and(eq(scopedMemories.id, memoryId), eq(scopedMemories.tenantId, tenantId)))
      .limit(1);

    return result ?? null;
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function updateMemory(
  memoryId: string,
  tenantId: string,
  updates: Partial<Pick<InsertScopedMemory, "title" | "content" | "summary" | "tags" | "metadataJson" | "embedding" | "confidence" | "importance" | "reinforcementCount" | "visibility" | "expiresAt">>,
): Promise<ScopedMemory | null> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const [result] = await db
      .update(scopedMemories)
      .set({ ...updates, updatedAt: new Date() })
      .where(and(eq(scopedMemories.id, memoryId), eq(scopedMemories.tenantId, tenantId)))
      .returning();

    return result ?? null;
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return null;
    }
    throw error;
  }
}

export async function deleteMemory(memoryId: string, tenantId: string): Promise<boolean> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    const result = await db
      .delete(scopedMemories)
      .where(and(eq(scopedMemories.id, memoryId), eq(scopedMemories.tenantId, tenantId)))
      .returning({ id: scopedMemories.id });

    return result.length > 0;
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return false;
    }
    throw error;
  }
}

/**
 * Delete multiple memories for the same tenant in one operation.
 * Used by the chat memory panel for bulk cleanup of scoped memories.
 */
export async function deleteMemories(memoryIds: string[], tenantId: string): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (memoryIds.length === 0) return 0;

  try {
    const result = await db
      .delete(scopedMemories)
      .where(
        and(
          eq(scopedMemories.tenantId, tenantId),
          inArray(scopedMemories.id, memoryIds),
        ),
      )
      .returning({ id: scopedMemories.id });

    return result.length;
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return 0;
    }
    throw error;
  }
}

/**
 * List memories for a specific owner scope.
 * Used by the chat memory panel to render the current user's scoped memories.
 */
export async function listMemories(
  tenantId: string,
  ownerType: MemoryScope["type"],
  ownerId: string,
  limit = 50,
): Promise<ScopedMemory[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  try {
    return await db
      .select()
      .from(scopedMemories)
      .where(
        and(
          eq(scopedMemories.tenantId, tenantId),
          eq(scopedMemories.ownerType, ownerType),
          eq(scopedMemories.ownerId, ownerId),
        ),
      )
      .orderBy(desc(scopedMemories.updatedAt), desc(scopedMemories.createdAt))
      .limit(limit);
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return [];
    }
    throw error;
  }
}

// ─── Promotion ──────────────────────────────────────────────────────────────

export async function promoteMemory(
  memoryId: string,
  tenantId: string,
  toOwnerType: string,
  toOwnerId: string,
  reason?: string,
  promotedBy?: { userId?: number; assistantId?: string },
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const memory = await getMemory(memoryId, tenantId);
  if (!memory) throw new Error(`Memory ${memoryId} not found`);

  await db.transaction(async (tx) => {
    await tx.insert(memoryPromotions).values({
      memoryId,
      fromOwnerType: memory.ownerType,
      fromOwnerId: memory.ownerId,
      toOwnerType: toOwnerType as any,
      toOwnerId,
      promotedByUserId: promotedBy?.userId ?? null,
      promotedByAssistantId: promotedBy?.assistantId ?? null,
      reason: reason ?? null,
    });

    await tx
      .update(scopedMemories)
      .set({
        ownerType: toOwnerType as any,
        ownerId: toOwnerId,
        sourceType: "promoted",
        updatedAt: new Date(),
      })
      .where(eq(scopedMemories.id, memoryId));
  });
}

// ─── Hybrid Search ──────────────────────────────────────────────────────────

export async function searchMemories(
  options: SearchOptions,
): Promise<MemorySearchResult[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const {
    tenantId,
    scopes,
    query,
    topK = 20,
    keywordWeight = 0.4,
    vectorWeight = 0.6,
    embedding,
  } = options;

  if (scopes.length === 0) return [];

  // Build scope filter: tenantId AND ((ownerType = X AND ownerId = Y) OR ...)
  const scopeConditions = scopes.map(
    (s) => sql`(${scopedMemories.ownerType} = ${s.type} AND ${scopedMemories.ownerId} = ${s.id})`,
  );
  const scopeFilter = and(
    eq(scopedMemories.tenantId, tenantId),
    sql`(${sql.join(scopeConditions, sql` OR `)})`,
  )!;

  // Keyword score using ts_rank
  const keywordScore = sql<number>`
    ts_rank(
      to_tsvector('english', ${scopedMemories.content} || ' ' || ${scopedMemories.title}),
      plainto_tsquery('english', ${query})
    ) * COALESCE(${scopedMemories.importance}, 5) * 0.2
  `;

  // Vector score (cosine similarity) — only if embedding provided
  const hasVector = embedding && embedding.length === 1536;
  const vectorScore = hasVector
    ? sql<number>`
        CASE WHEN ${scopedMemories.embedding} IS NOT NULL
          THEN 1.0 - (${scopedMemories.embedding} <=> ${`[${embedding.join(",")}]`}::vector(1536))
          ELSE 0.0
        END
      `
    : sql<number>`0.0`;

  // Combined score
  const combinedScore = hasVector
    ? sql<number>`(${keywordWeight} * (${keywordScore}) + ${vectorWeight} * (${vectorScore}))`
    : keywordScore;

  let rows: Array<{ memory: ScopedMemory; keywordScore: number; vectorScore: number; combinedScore: number }> = [];
  try {
    rows = await db
      .select({
        memory: scopedMemories,
        keywordScore,
        vectorScore,
        combinedScore,
      })
      .from(scopedMemories)
      .where(scopeFilter)
      .orderBy(desc(combinedScore))
      .limit(topK * 2); // Over-fetch for dedup
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return [];
    }
    throw error;
  }

  // Deduplicate by content hash — prefer higher-priority scope
  const seen = new Map<string, MemorySearchResult>();
  for (const row of rows) {
    const key = row.memory.title + "|" + row.memory.content.slice(0, 100);
    const existing = seen.get(key);
    const scopePriority = SCOPE_PRIORITY[row.memory.ownerType] ?? 0;
    const existingPriority = existing
      ? SCOPE_PRIORITY[existing.memory.ownerType] ?? 0
      : -1;

    if (!existing || scopePriority > existingPriority) {
      const matchType: "keyword" | "vector" | "hybrid" = hasVector
        ? (Number(row.vectorScore) > 0 && Number(row.keywordScore) > 0
          ? "hybrid"
          : Number(row.vectorScore) > 0
            ? "vector"
            : "keyword")
        : "keyword";
      const retrievalClass: MemorySearchResult["retrievalClass"] = hasVector
        ? (Number(row.vectorScore) > 0 && Number(row.keywordScore) > 0
          ? "hybrid"
          : Number(row.vectorScore) > 0
            ? "semantic"
            : "lexical")
        : "lexical";

      const recency = computeRecencyFactor(row.memory.updatedAt ?? row.memory.createdAt);
      seen.set(key, {
        memory: row.memory,
        score: Number(row.combinedScore) * recency,
        matchType,
        retrievalClass,
      });
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

function buildScopeFilter(tenantId: string, scopes: MemoryScope[]) {
  const scopeConditions = scopes.map(
    (s) => sql`(${scopedMemories.ownerType} = ${s.type} AND ${scopedMemories.ownerId} = ${s.id})`,
  );
  return and(
    eq(scopedMemories.tenantId, tenantId),
    sql`(${sql.join(scopeConditions, sql` OR `)})`,
  )!;
}

function normalizeScoreResult(
  memory: ScopedMemory,
  score: number,
  matchType: MemorySearchResult["matchType"],
  retrievalClass?: MemorySearchResult["retrievalClass"],
): MemorySearchResult {
  return {
    memory,
    score,
    matchType,
    retrievalClass,
  };
}

async function searchStructuredMemories(
  options: SearchOptions & { projectId?: string | null },
): Promise<MemorySearchResult[]> {
  const db = await getDb();
  if (!db) return [];

  const query = options.query.trim();
  if (!query) return [];

  const scopeFilter = buildScopeFilter(options.tenantId, options.scopes);
  const queryLike = `%${query}%`;
  const projectBoost = options.projectId
    ? sql<number>`CASE WHEN ${scopedMemories.projectId} = ${options.projectId} THEN 1.0 ELSE 0.0 END`
    : sql<number>`0.0`;
  const metadataBoost = sql<number>`
    CASE
      WHEN COALESCE(${scopedMemories.metadataJson}::text, '') ILIKE ${queryLike} THEN 0.75
      ELSE 0.0
    END
  `;
  const titleBoost = sql<number>`
    CASE
      WHEN ${scopedMemories.title} ILIKE ${queryLike} THEN 0.8
      ELSE 0.0
    END
  `;
  const summaryBoost = sql<number>`
    CASE
      WHEN ${scopedMemories.summary} IS NOT NULL AND ${scopedMemories.summary} ILIKE ${queryLike} THEN 0.55
      ELSE 0.0
    END
  `;
  const tagText = sql<string>`COALESCE(array_to_string(${scopedMemories.tags}, ' '), '')`;
  const metadataText = sql<string>`COALESCE(${scopedMemories.metadataJson}::text, '')`;
  const tagBoost = sql<number>`
    CASE
      WHEN ${tagText} ILIKE ${queryLike}
        THEN 0.45
      ELSE 0.0
    END
  `;
  const keywordScore = sql<number>`
    ts_rank(
      to_tsvector('english', ${scopedMemories.content} || ' ' || ${scopedMemories.title} || ' ' || COALESCE(${scopedMemories.summary}, '')),
      plainto_tsquery('english', ${query})
    ) * COALESCE(${scopedMemories.importance}, 5) * 0.25
  `;
  const structuredScore = sql<number>`
    (${projectBoost} + ${metadataBoost} + ${titleBoost} + ${summaryBoost} + ${tagBoost} + (${keywordScore}))
  `;

  let rows: Array<{ memory: ScopedMemory; score: number }> = [];
  try {
    rows = await db
      .select({
        memory: scopedMemories,
        score: structuredScore,
      })
      .from(scopedMemories)
      .where(and(
        scopeFilter,
        or(
          ilike(scopedMemories.title, queryLike),
          ilike(scopedMemories.content, queryLike),
          ilike(scopedMemories.summary, queryLike),
          ilike(tagText, queryLike),
          ilike(metadataText, queryLike),
        ),
      ))
      .orderBy(desc(structuredScore))
      .limit(Math.max(5, options.topK ?? 20) * 2);
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return [];
    }
    throw error;
  }

  return rows
    .map((row) => normalizeScoreResult(
      row.memory,
      Number(row.score) * computeRecencyFactor(row.memory.updatedAt ?? row.memory.createdAt),
      "keyword",
      "structured",
    ))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function searchGraphMemories(
  options: SearchOptions & {
    assistantId?: string;
    runId?: string | null;
    roomId?: string | null;
    teamId?: string | null;
    projectId?: string | null;
  },
): Promise<MemorySearchResult[]> {
  const db = await getDb();
  if (!db) return [];

  const query = options.query.trim();
  const relatedConditions: SQL[] = [];

  const scopeFilter = buildScopeFilter(options.tenantId, options.scopes);
  relatedConditions.push(scopeFilter);
  if (options.projectId) {
    relatedConditions.push(eq(scopedMemories.projectId, options.projectId));
  }
  if (options.roomId) {
    relatedConditions.push(eq(scopedMemories.sourceRoomId, options.roomId));
  }
  if (options.assistantId) {
    relatedConditions.push(eq(scopedMemories.sourceAssistantId, options.assistantId));
  }
  if (options.runId) {
    relatedConditions.push(sql`${scopedMemories.metadataJson}::text ILIKE ${`%${options.runId}%`}`);
  }
  if (options.teamId) {
    relatedConditions.push(sql`${scopedMemories.metadataJson}::text ILIKE ${`%${options.teamId}%`}`);
  }

  const graphFilter = and(
    eq(scopedMemories.tenantId, options.tenantId),
    or(...relatedConditions),
  );
  if (!graphFilter) return [];
  const queryMatchScore = query
    ? sql<number>`CASE WHEN to_tsvector('english', ${scopedMemories.title} || ' ' || ${scopedMemories.content}) @@ plainto_tsquery('english', ${query}) THEN 0.35 ELSE 0.0 END`
    : sql<number>`0.0`;

  const graphScore = sql<number>`
    (
      COALESCE(${scopedMemories.importance}, 5) * 0.15 +
      CASE WHEN ${scopedMemories.sourceRoomId} IS NOT NULL THEN 0.15 ELSE 0.0 END +
      CASE WHEN ${scopedMemories.sourceAssistantId} IS NOT NULL THEN 0.12 ELSE 0.0 END +
      CASE WHEN ${scopedMemories.projectId} IS NOT NULL THEN 0.12 ELSE 0.0 END +
      ${queryMatchScore}
    )
  `;

  let rows: Array<{ memory: ScopedMemory; score: number }> = [];
  try {
    rows = await db
      .select({
        memory: scopedMemories,
        score: graphScore,
      })
      .from(scopedMemories)
      .where(graphFilter)
      .orderBy(desc(graphScore))
      .limit(Math.max(5, options.topK ?? 20) * 2);
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return [];
    }
    throw error;
  }

  return rows
    .map((row) => normalizeScoreResult(
      row.memory,
      Number(row.score) * computeRecencyFactor(row.memory.updatedAt ?? row.memory.createdAt),
      "keyword",
      "graph",
    ))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function getWorkingSummaryMemories(
  tenantId: string,
  scopes: MemoryScope[],
): Promise<MemorySearchResult[]> {
  const relevantScopes = uniqueScopes(
    scopes.filter((scope) => scope.type === "room" || scope.type === "team" || scope.type === "project"),
  );
  if (relevantScopes.length === 0) return [];

  const resultGroups = await Promise.all(
    relevantScopes.map(async (scope) => {
      try {
        return await listMemories(tenantId, scope.type, scope.id, 16);
      } catch {
        return [];
      }
    }),
  );

  const results: MemorySearchResult[] = [];
  for (const memories of resultGroups) {
    for (const memory of memories) {
      if (!isWorkingSummaryMemory(memory)) continue;
      const recency = computeRecencyFactor(memory.updatedAt ?? memory.createdAt);
      const importance = Number(memory.importance ?? 5) / 10;
      results.push(
        normalizeScoreResult(
          memory,
          Math.min(1, 0.72 + (recency * 0.18) + (importance * 0.06)),
          "hybrid",
          "hybrid",
        ),
      );
    }
  }

  return results;
}

/**
 * Retrieve rule memories for prompt injection and context assembly.
 * Rules are always user-scoped and kept separate from ranked facts.
 */
export async function getRuleMemories(
  tenantId: string,
  userId: number,
  _personaId?: string | null,
): Promise<ScopedMemory[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions = [
    eq(scopedMemories.tenantId, tenantId),
    eq(scopedMemories.ownerType, "user"),
    eq(scopedMemories.ownerId, String(userId)),
    eq(scopedMemories.memoryKind, "rule"),
  ];

  try {
    return await db
      .select()
      .from(scopedMemories)
      .where(and(...conditions))
      .orderBy(desc(scopedMemories.importance), desc(scopedMemories.reinforcementCount), desc(scopedMemories.lastAccessedAt))
      .limit(20);
  } catch (error) {
    if (isMissingScopedMemoriesTable(error)) {
      return [];
    }
    throw error;
  }
}

// ─── Prompt Retrieval Convenience ───────────────────────────────────────────

/**
 * Retrieve memories for prompt injection, ordered by scope priority.
 * Used by prompt composer (Section 06).
 */
export async function retrieveForPrompt(
  tenantId: string,
  assistantId: string,
  runId: string | null,
  roomId: string | null,
  teamId: string | null,
  query: string,
  tokenBudget: number,
  embedding?: number[],
  options?: PromptScopeOptions,
): Promise<MemorySearchResult[]> {
  const scopes = buildPromptScopeList({
    assistantId,
    runId,
    roomId,
    teamId,
    initiatedByUserId: options?.initiatedByUserId,
    projectId: options?.projectId ?? null,
    additionalScopes: options?.additionalScopes,
  });

  // Rough estimate: 1 memory ≈ 200 tokens
  const estimatedMemories = Math.floor(tokenBudget / 200);
  const topK = Math.max(5, Math.min(estimatedMemories, 50));
  const effectiveEmbedding =
    embedding && embedding.length === 1536
      ? embedding
      : await generateQueryEmbedding(query).catch(() => null);

  const baseResults = await searchMemories({
    tenantId,
    scopes,
    query,
    topK,
    embedding: effectiveEmbedding ?? undefined,
    keywordWeight: effectiveEmbedding ? 0.45 : 0.65,
    vectorWeight: effectiveEmbedding ? 0.55 : 0.35,
  });
  const workingSummaryResults = await getWorkingSummaryMemories(tenantId, scopes);

  const structuredResults = await searchStructuredMemories({
    tenantId,
    scopes,
    query,
    topK: Math.max(3, Math.floor(topK / 2)),
    embedding: effectiveEmbedding ?? undefined,
    projectId: options?.projectId ?? null,
  });

  const graphResults = await searchGraphMemories({
    tenantId,
    scopes,
    query,
    topK: Math.max(3, Math.floor(topK / 2)),
    embedding: effectiveEmbedding ?? undefined,
    assistantId,
    runId,
    roomId,
    teamId,
    projectId: options?.projectId ?? null,
  });

  const merged = new Map<string, MemorySearchResult>();
  const contentKeyToId = new Map<string, string>();
  const pushResult = (result: MemorySearchResult) => {
    const key = result.memory.id;
    const contentKey = `${result.memory.title}|${result.memory.content
      .slice(0, 180)
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()}`;
    const existing = merged.get(key);
    if (!existing || result.score > existing.score) {
      const existingKey = contentKeyToId.get(contentKey);
      if (existingKey && existingKey !== key) {
        const existingByContent = merged.get(existingKey);
        if (existingByContent && existingByContent.score >= result.score) {
          return;
        }
        merged.delete(existingKey);
      }
      merged.set(key, result);
      contentKeyToId.set(contentKey, key);
      return;
    }
    if (
      existing &&
      existing.score === result.score &&
      result.retrievalClass &&
      existing.retrievalClass !== "graph" &&
      result.retrievalClass === "graph"
    ) {
      merged.set(key, result);
    }
  };

  baseResults.forEach((result) => pushResult({ ...result, retrievalClass: result.retrievalClass ?? "hybrid" }));
  workingSummaryResults.forEach(pushResult);
  structuredResults.forEach(pushResult);
  graphResults.forEach(pushResult);

  return [...merged.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
