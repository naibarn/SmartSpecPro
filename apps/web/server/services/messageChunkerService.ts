/**
 * Message Chunker Service
 *
 * Builds overlapping conversation chunks for vector + keyword retrieval.
 */

import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { enqueueEmbedding } from "./embeddingQueue";
import { messages, messageChunks, conversations, type Message } from "../../drizzle/schema";

export interface ChunkSourceMessage {
  id: number;
  role: Message["role"];
  content: string;
  createdAt: Date | string;
}

export interface ChunkResult {
  inserted: number;
  updated: number;
  chunkIds: string[];
}

const MAX_CHUNK_TOKENS = 500;
const OVERLAP_TOKENS = 50;

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function renderMessage(message: ChunkSourceMessage): string {
  return `${message.role.toUpperCase()}: ${message.content.trim()}`;
}

function buildChunkText(messages: ChunkSourceMessage[]): string {
  return messages.map(renderMessage).join("\n\n");
}

function selectOverlap(messages: ChunkSourceMessage[]): ChunkSourceMessage[] {
  const overlap: ChunkSourceMessage[] = [];
  let tokens = 0;

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const candidate = messages[i];
    const candidateTokens = estimateTokens(renderMessage(candidate));
    overlap.unshift(candidate);
    tokens += candidateTokens;
    if (tokens >= OVERLAP_TOKENS) break;
  }

  return overlap;
}

function splitIntoChunks(messages: ChunkSourceMessage[]): ChunkSourceMessage[][] {
  const chunks: ChunkSourceMessage[][] = [];
  let current: ChunkSourceMessage[] = [];
  let currentTokens = 0;

  for (const message of messages) {
    const rendered = renderMessage(message);
    const messageTokens = estimateTokens(rendered);

    if (current.length > 0 && currentTokens + messageTokens > MAX_CHUNK_TOKENS) {
      chunks.push(current);
      const overlap = selectOverlap(current);
      current = overlap.length > 0 ? [...overlap] : [];
      currentTokens = current.reduce((sum, item) => sum + estimateTokens(renderMessage(item)), 0);
    }

    current.push(message);
    currentTokens += messageTokens;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

export async function chunkConversationMessages(params: {
  tenantId: string;
  userId: number;
  conversationId: number;
  projectId?: string | null;
  personaId?: string | null;
  messages: ChunkSourceMessage[];
}): Promise<ChunkResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const sortedMessages = [...params.messages].sort((a, b) => a.id - b.id);
  if (sortedMessages.length === 0) {
    return { inserted: 0, updated: 0, chunkIds: [] };
  }

  const chunks = splitIntoChunks(sortedMessages);
  let inserted = 0;
  let updated = 0;
  const chunkIds: string[] = [];

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunkMessages = chunks[chunkIndex];
    const first = chunkMessages[0];
    const last = chunkMessages[chunkMessages.length - 1];
    const content = buildChunkText(chunkMessages);
    const tokenCount = chunkMessages.reduce((sum, item) => sum + estimateTokens(renderMessage(item)), 0);
    const recordId = `${params.conversationId}:${chunkIndex}`;

    const [result] = await db
      .insert(messageChunks)
      .values({
        id: recordId,
        tenantId: params.tenantId,
        userId: params.userId,
        conversationId: params.conversationId,
        messageRangeStart: first.id,
        messageRangeEnd: last.id,
        chunkIndex,
        content,
        tokenCount,
        projectId: params.projectId ?? null,
        personaId: params.personaId ?? null,
      })
      .onConflictDoUpdate({
        target: [messageChunks.conversationId, messageChunks.chunkIndex],
        set: {
          tenantId: params.tenantId,
          userId: params.userId,
          messageRangeStart: first.id,
          messageRangeEnd: last.id,
          content,
          tokenCount,
          projectId: params.projectId ?? null,
          personaId: params.personaId ?? null,
        },
      })
      .returning({ id: messageChunks.id });

    if (result) {
      chunkIds.push(result.id);
      if (chunkIndex === 0) inserted += 1;
      else updated += 1;
      await enqueueEmbedding({
        type: "message_chunk",
        recordId: result.id,
        text: content,
      }).catch(() => {});
    }
  }

  return { inserted, updated, chunkIds };
}

export async function chunkConversation(params: {
  conversationId: number;
  userId: number;
  tenantId: string;
}): Promise<ChunkResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const conversation = await db
    .select({
      projectId: conversations.projectId,
      personaId: conversations.personaId,
      id: conversations.id,
    })
    .from(conversations)
    .where(and(eq(conversations.id, params.conversationId), eq(conversations.userId, params.userId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!conversation) {
    throw new Error("Conversation not found");
  }

  const conversationMessages = await db
    .select({
      id: messages.id,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
    })
    .from(messages)
    .where(eq(messages.conversationId, params.conversationId))
    .orderBy(asc(messages.id));

  return chunkConversationMessages({
    tenantId: params.tenantId,
    userId: params.userId,
    conversationId: params.conversationId,
    projectId: conversation.projectId,
    personaId: conversation.personaId,
    messages: conversationMessages,
  });
}
