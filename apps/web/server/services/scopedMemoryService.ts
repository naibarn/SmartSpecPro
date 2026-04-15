/**
 * Scoped Memory Service — CRUD + hybrid retrieval (keyword + vector).
 *
 * Memories are scoped to owners (user/agent/team/room/project/run) with
 * visibility rules and priority-based multi-scope retrieval.
 */

import { eq, and, inArray, sql, desc } from "drizzle-orm";
import { getDb } from "../db";
import {
  scopedMemories,
  memoryPromotions,
  type ScopedMemory,
  type InsertScopedMemory,
} from "../../drizzle/schema";

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

      const recency = computeRecencyFactor(row.memory.updatedAt ?? row.memory.createdAt);
      seen.set(key, {
        memory: row.memory,
        score: Number(row.combinedScore) * recency,
        matchType,
      });
    }
  }

  return [...seen.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
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
): Promise<MemorySearchResult[]> {
  const scopes: MemoryScope[] = [
    { type: "agent", id: assistantId },
  ];
  if (runId) scopes.push({ type: "run", id: runId });
  if (roomId) scopes.push({ type: "room", id: roomId });
  if (teamId) scopes.push({ type: "team", id: teamId });

  // Rough estimate: 1 memory ≈ 200 tokens
  const estimatedMemories = Math.floor(tokenBudget / 200);
  const topK = Math.max(5, Math.min(estimatedMemories, 50));

  return searchMemories({
    tenantId,
    scopes,
    query,
    topK,
    embedding,
  });
}
