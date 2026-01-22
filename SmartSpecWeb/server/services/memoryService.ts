/**
 * Memory Service - Three-tier memory system for chat context
 *
 * 1. Buffer Memory: Recent N messages (configurable)
 * 2. Summary Memory: LLM-generated summaries of old messages
 * 3. Entity Memory: Persistent facts about user/project
 */

import { eq, desc, asc, and, sql, lt, gte, inArray } from "drizzle-orm";
import { getDb } from "../db";
import {
  conversations,
  messages,
  conversationSummaries,
  entityMemories,
  Message,
  ConversationSummary,
  EntityMemory,
} from "../../drizzle/schema";
import { sanitizeEntityForStorage, filterEntityFacts } from "./piiFilter";

// Configuration
const BUFFER_SIZE = 20; // Number of recent messages to keep in buffer
const SUMMARIZE_THRESHOLD = 30; // Summarize when buffer exceeds this
const SUMMARIZE_BATCH_SIZE = 10; // Number of messages to summarize at once
const MAX_SUMMARIES_IN_CONTEXT = 5; // Maximum summaries to include in context
const MAX_ENTITIES_IN_CONTEXT = 10; // Maximum entity memories to include

// ==================== Buffer Memory ====================

/**
 * Get recent messages for a conversation (buffer memory)
 */
export async function getBufferMessages(
  conversationId: number,
  limit: number = BUFFER_SIZE
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Return in chronological order
  return result.reverse();
}

/**
 * Get message count for a conversation
 */
export async function getMessageCount(conversationId: number): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messages)
    .where(eq(messages.conversationId, conversationId));

  return Number(result?.count) || 0;
}

// ==================== Summary Memory ====================

/**
 * Check if conversation needs summarization
 */
export async function needsSummarization(conversationId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get the last summarized message ID
  const [latestSummary] = await db
    .select({ messageRangeEnd: conversationSummaries.messageRangeEnd })
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(desc(conversationSummaries.messageRangeEnd))
    .limit(1);

  const lastSummarizedId = latestSummary?.messageRangeEnd || 0;

  // Count unsummarized messages
  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.id} > ${lastSummarizedId}`
      )
    );

  return Number(result?.count) >= SUMMARIZE_THRESHOLD;
}

/**
 * Get messages that need to be summarized
 */
export async function getMessagesToSummarize(
  conversationId: number
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  // Get the last summarized message ID
  const [latestSummary] = await db
    .select({ messageRangeEnd: conversationSummaries.messageRangeEnd })
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(desc(conversationSummaries.messageRangeEnd))
    .limit(1);

  const lastSummarizedId = latestSummary?.messageRangeEnd || 0;

  // Get oldest unsummarized messages (excluding the most recent BUFFER_SIZE)
  const allUnsummarized = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        sql`${messages.id} > ${lastSummarizedId}`
      )
    )
    .orderBy(asc(messages.createdAt));

  // Keep the most recent BUFFER_SIZE messages, summarize the rest
  if (allUnsummarized.length <= BUFFER_SIZE) {
    return [];
  }

  return allUnsummarized.slice(0, allUnsummarized.length - BUFFER_SIZE);
}

/**
 * Generate summary prompt for messages
 */
export function generateSummaryPrompt(messagesToSummarize: Message[]): string {
  const formattedMessages = messagesToSummarize
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return `Summarize the following conversation in a concise paragraph. Focus on:
- Key topics discussed
- Important decisions or conclusions
- Any action items or requests
- Technical details mentioned

Conversation:
${formattedMessages}

Summary:`;
}

/**
 * Save a conversation summary
 */
export async function saveSummary(
  conversationId: number,
  summary: string,
  messageRangeStart: number,
  messageRangeEnd: number,
  messageCount: number,
  tokensUsed?: number
): Promise<ConversationSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [result] = await db
    .insert(conversationSummaries)
    .values({
      conversationId,
      summary,
      messageRangeStart,
      messageRangeEnd,
      messageCount,
      tokensUsed,
    })
    .returning();

  return result;
}

/**
 * Get all summaries for a conversation
 */
export async function getSummaries(
  conversationId: number,
  limit: number = MAX_SUMMARIES_IN_CONTEXT
): Promise<ConversationSummary[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(desc(conversationSummaries.messageRangeEnd))
    .limit(limit);
}

// ==================== Entity Memory ====================

/**
 * Extract entities from a message using simple pattern matching
 * In production, this would use an LLM for better extraction
 */
export function extractEntitiesFromMessage(
  content: string
): Array<{ type: "user" | "project" | "preference" | "technical"; name: string; fact: string }> {
  const entities: Array<{ type: "user" | "project" | "preference" | "technical"; name: string; fact: string }> = [];

  // Simple pattern matching for common entities
  // In production, use LLM for better extraction

  // Preference patterns
  const preferencePatterns = [
    /(?:I prefer|I like|I use|I always|I usually)\s+(.+?)(?:\.|$)/gi,
    /(?:my favorite|my preferred)\s+(\w+)\s+is\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of preferencePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      entities.push({
        type: "preference",
        name: "coding_style",
        fact: match[0].trim(),
      });
    }
  }

  // Technical patterns
  const techPatterns = [
    /(?:using|with|in)\s+(TypeScript|JavaScript|Python|React|Vue|Angular|Node\.js|PostgreSQL|MongoDB)/gi,
    /(?:the|our|my)\s+(?:project|app|application|system)\s+(?:is|uses)\s+(.+?)(?:\.|$)/gi,
  ];

  for (const pattern of techPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      entities.push({
        type: "technical",
        name: match[1]?.toLowerCase() || "technology",
        fact: match[0].trim(),
      });
    }
  }

  // Project name patterns
  const projectPattern = /(?:project|app|application)\s+(?:called|named)\s+["']?(\w+)["']?/gi;
  let projectMatch;
  while ((projectMatch = projectPattern.exec(content)) !== null) {
    entities.push({
      type: "project",
      name: projectMatch[1],
      fact: `Project name: ${projectMatch[1]}`,
    });
  }

  // Filter entities to remove PII before returning
  const filteredEntities: Array<{ type: "user" | "project" | "preference" | "technical"; name: string; fact: string }> = [];
  for (const entity of entities) {
    const sanitized = sanitizeEntityForStorage(entity);
    if (sanitized) {
      filteredEntities.push(sanitized as { type: "user" | "project" | "preference" | "technical"; name: string; fact: string });
    }
  }

  return filteredEntities;
}

/**
 * Generate entity extraction prompt for LLM
 */
export function generateEntityExtractionPrompt(
  messages: Message[]
): string {
  const formattedMessages = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  return `Analyze the following conversation and extract important facts about the user, their projects, preferences, and technical details. Format each fact as a JSON object.

Categories:
- "user": Facts about the user (name, role, expertise)
- "project": Facts about projects mentioned (name, purpose, tech stack)
- "preference": User preferences (coding style, tools, languages)
- "technical": Technical details (frameworks, databases, APIs)

Conversation:
${formattedMessages}

Return a JSON array of objects with format:
[{"type": "category", "name": "entity_name", "fact": "the fact"}]

Only include clear, specific facts. Return empty array if no facts found.

Facts:`;
}

/**
 * Save or update entity memory
 */
export async function upsertEntityMemory(
  userId: number,
  entityType: "user" | "project" | "preference" | "technical",
  entityName: string,
  facts: string[],
  sourceConversationId?: number
): Promise<EntityMemory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Filter facts to remove PII before storage
  const { filteredFacts, removedCount, redactedCount } = filterEntityFacts(facts);

  // Log if PII was detected (for monitoring)
  if (removedCount > 0 || redactedCount > 0) {
    console.log(
      `[PII Filter] Entity "${entityName}": removed ${removedCount} facts, redacted ${redactedCount} items`
    );
  }

  // If all facts were removed due to PII, don't create/update
  if (filteredFacts.length === 0) {
    throw new Error("All facts contained sensitive information and were filtered");
  }

  // Check if entity exists
  const [existing] = await db
    .select()
    .from(entityMemories)
    .where(
      and(
        eq(entityMemories.userId, userId),
        eq(entityMemories.entityType, entityType),
        eq(entityMemories.entityName, entityName)
      )
    )
    .limit(1);

  if (existing) {
    // Merge facts, avoiding duplicates
    const existingFacts = existing.facts || [];
    const newFacts = [...new Set([...existingFacts, ...filteredFacts])];

    await db
      .update(entityMemories)
      .set({
        facts: newFacts,
        reinforcementCount: sql`${entityMemories.reinforcementCount} + 1`,
        lastAccessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entityMemories.id, existing.id));

    return { ...existing, facts: newFacts };
  }

  // Create new entity memory
  const [result] = await db
    .insert(entityMemories)
    .values({
      userId,
      entityType,
      entityName,
      facts: filteredFacts,
      sourceConversationId,
    })
    .returning();

  return result;
}

/**
 * Get entity memories for context building
 */
export async function getEntityMemoriesForContext(
  userId: number,
  limit: number = MAX_ENTITIES_IN_CONTEXT
): Promise<EntityMemory[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(entityMemories)
    .where(eq(entityMemories.userId, userId))
    .orderBy(
      desc(entityMemories.reinforcementCount),
      desc(entityMemories.lastAccessedAt)
    )
    .limit(limit);
}

/**
 * Touch entity memory (update last accessed time)
 */
export async function touchEntityMemories(entityIds: number[]): Promise<void> {
  const db = await getDb();
  if (!db || entityIds.length === 0) return;

  await db
    .update(entityMemories)
    .set({ lastAccessedAt: new Date() })
    .where(inArray(entityMemories.id, entityIds));
}

// ==================== Context Building ====================

export interface ChatContext {
  systemPrompt?: string;
  entityContext: string | null;
  summaryContext: string | null;
  bufferMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  totalTokenEstimate: number;
}

/**
 * Build complete chat context with memory
 */
export async function buildChatContext(
  conversationId: number,
  userId: number,
  systemPrompt?: string
): Promise<ChatContext> {
  // 1. Get entity memories
  const entities = await getEntityMemoriesForContext(userId);
  let entityContext: string | null = null;

  if (entities.length > 0) {
    const entityLines = entities.map((e) => {
      const factsStr = e.facts.slice(0, 3).join("; ");
      return `[${e.entityType}:${e.entityName}] ${factsStr}`;
    });
    entityContext = `User Context:\n${entityLines.join("\n")}`;

    // Touch accessed entities
    await touchEntityMemories(entities.map((e) => e.id));
  }

  // 2. Get summaries
  const summaries = await getSummaries(conversationId);
  let summaryContext: string | null = null;

  if (summaries.length > 0) {
    const summaryTexts = summaries
      .reverse() // Oldest first
      .map((s) => s.summary);
    summaryContext = `Previous conversation context:\n${summaryTexts.join("\n\n")}`;
  }

  // 3. Get buffer messages
  const bufferMsgs = await getBufferMessages(conversationId);
  const bufferMessages = bufferMsgs
    .filter((m) => m.role !== "system")
    .map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

  // 4. Estimate tokens (rough: 1 token ≈ 4 characters)
  const estimateTokens = (text: string) => Math.ceil(text.length / 4);
  let totalTokenEstimate = 0;

  if (systemPrompt) totalTokenEstimate += estimateTokens(systemPrompt);
  if (entityContext) totalTokenEstimate += estimateTokens(entityContext);
  if (summaryContext) totalTokenEstimate += estimateTokens(summaryContext);
  for (const msg of bufferMessages) {
    totalTokenEstimate += estimateTokens(msg.content);
  }

  return {
    systemPrompt,
    entityContext,
    summaryContext,
    bufferMessages,
    totalTokenEstimate,
  };
}

/**
 * Convert ChatContext to messages array for LLM API
 */
export function contextToMessages(
  context: ChatContext
): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  const result: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // System prompt with context
  const systemParts: string[] = [];
  if (context.systemPrompt) {
    systemParts.push(context.systemPrompt);
  }
  if (context.entityContext) {
    systemParts.push(context.entityContext);
  }
  if (context.summaryContext) {
    systemParts.push(context.summaryContext);
  }

  if (systemParts.length > 0) {
    result.push({
      role: "system",
      content: systemParts.join("\n\n"),
    });
  }

  // Buffer messages
  result.push(...context.bufferMessages);

  return result;
}

// ==================== Auto-Processing ====================

/**
 * Process conversation for summarization and entity extraction
 * Call this after each message exchange
 */
export async function processConversationMemory(
  conversationId: number,
  userId: number
): Promise<{
  summarized: boolean;
  entitiesExtracted: number;
}> {
  let summarized = false;
  let entitiesExtracted = 0;

  // Check if summarization is needed
  const shouldSummarize = await needsSummarization(conversationId);

  if (shouldSummarize) {
    const messagesToSummarize = await getMessagesToSummarize(conversationId);

    if (messagesToSummarize.length > 0) {
      // Return the prompt - actual summarization should be done by caller
      // This keeps the service LLM-agnostic
      summarized = true;
    }
  }

  // Extract entities from recent messages (simple pattern matching)
  const recentMessages = await getBufferMessages(conversationId, 5);
  for (const msg of recentMessages) {
    if (msg.role === "user") {
      const extracted = extractEntitiesFromMessage(msg.content);
      for (const entity of extracted) {
        await upsertEntityMemory(
          userId,
          entity.type,
          entity.name,
          [entity.fact],
          conversationId
        );
        entitiesExtracted++;
      }
    }
  }

  return { summarized, entitiesExtracted };
}
