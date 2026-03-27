/**
 * Message Chunk Search Service
 *
 * Hybrid search over conversation chunks using keyword ranking and embeddings.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { conversations, messageChunks, type MessageChunk } from "../../drizzle/schema";

export interface MessageChunkSearchOptions {
  tenantId: string;
  userId: number;
  query: string;
  topK?: number;
  projectId?: string | null;
  embedding?: number[] | null;
}

export interface MessageChunkSearchResult {
  chunk: MessageChunk;
  score: number;
  matchType: "keyword" | "vector" | "hybrid";
}

export async function searchMessageChunks(
  options: MessageChunkSearchOptions,
): Promise<MessageChunkSearchResult[]> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const topK = options.topK ?? 8;
  const embedding = options.embedding && options.embedding.length === 1536 ? options.embedding : null;

  const conditions = [
    eq(messageChunks.tenantId, options.tenantId),
    eq(conversations.userId, options.userId),
  ];

  if (options.projectId) {
    conditions.push(eq(messageChunks.projectId, options.projectId));
  }

  const keywordScore = sql<number>`
    ts_rank(
      to_tsvector('english', ${messageChunks.content}),
      plainto_tsquery('english', ${options.query})
    )
  `;

  const vectorScore = embedding
    ? sql<number>`
        CASE
          WHEN ${messageChunks.embedding} IS NOT NULL
            THEN 1.0 - (${messageChunks.embedding} <=> ${`[${embedding.join(",")}]`}::vector(1536))
          ELSE 0.0
        END
      `
    : sql<number>`0.0`;

  const combinedScore = embedding
    ? sql<number>`(0.4 * (${keywordScore}) + 0.6 * (${vectorScore}))`
    : keywordScore;

  const rows = await db
    .select({
      chunk: messageChunks,
      keywordScore,
      vectorScore,
      combinedScore,
    })
    .from(messageChunks)
    .innerJoin(conversations, eq(messageChunks.conversationId, conversations.id))
    .where(and(...conditions))
    .orderBy(desc(combinedScore))
    .limit(topK * 2);

  return rows
    .map((row) => {
      const hasKeyword = Number(row.keywordScore) > 0;
      const hasVector = Number(row.vectorScore) > 0;
      const matchType: MessageChunkSearchResult["matchType"] = embedding
        ? hasKeyword && hasVector
          ? "hybrid"
          : hasVector
            ? "vector"
            : "keyword"
        : "keyword";

      return {
        chunk: row.chunk,
        score: Number(row.combinedScore),
        matchType,
      };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
