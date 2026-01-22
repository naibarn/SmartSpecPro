/**
 * Chat Service - Database operations for conversations, messages, and memory
 */
import { eq, desc, asc, and, sql, or, inArray, lt, gte, SQL, ilike } from "drizzle-orm";
import { getDb } from "../db";
import {
  conversations,
  messages,
  conversationSummaries,
  entityMemories,
  skillPreferences,
  Conversation,
  InsertConversation,
  Message,
  InsertMessage,
  ConversationSummary,
  InsertConversationSummary,
  EntityMemory,
  InsertEntityMemory,
} from "../../drizzle/schema";

// ==================== Conversation Operations ====================

export interface ConversationFilters {
  userId: number;
  isArchived?: boolean;
  isPinned?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

/**
 * Create a new conversation
 */
export async function createConversation(data: {
  userId: number;
  title?: string;
  model?: string;
  systemPrompt?: string;
}): Promise<Conversation> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [conversation] = await db
    .insert(conversations)
    .values({
      userId: data.userId,
      title: data.title || "New Chat",
      model: data.model || "gpt-4o-mini",
      systemPrompt: data.systemPrompt,
    })
    .returning();

  return conversation;
}

/**
 * Get conversations for a user with filters
 */
export async function getConversations(filters: ConversationFilters): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL<unknown>[] = [eq(conversations.userId, filters.userId)];

  if (filters.isArchived !== undefined) {
    conditions.push(eq(conversations.isArchived, filters.isArchived));
  }

  if (filters.isPinned !== undefined) {
    conditions.push(eq(conversations.isPinned, filters.isPinned));
  }

  if (filters.search) {
    // Use parameterized ilike to prevent SQL injection
    conditions.push(ilike(conversations.title, `%${filters.search}%`));
  }

  let query = db
    .select()
    .from(conversations)
    .where(and(...conditions))
    .orderBy(desc(conversations.isPinned), desc(conversations.updatedAt));

  if (filters.limit) {
    query = query.limit(filters.limit) as typeof query;
  }

  if (filters.offset) {
    query = query.offset(filters.offset) as typeof query;
  }

  return await query;
}

/**
 * Get a single conversation by ID
 */
export async function getConversationById(id: number, userId: number): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [conversation] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)))
    .limit(1);

  return conversation;
}

/**
 * Update conversation
 */
export async function updateConversation(
  id: number,
  userId: number,
  data: Partial<InsertConversation>
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conversations)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Delete conversation
 */
export async function deleteConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Get conversation count for user
 */
export async function getConversationCount(userId: number, isArchived?: boolean): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const conditions: SQL<unknown>[] = [eq(conversations.userId, userId)];
  if (isArchived !== undefined) {
    conditions.push(eq(conversations.isArchived, isArchived));
  }

  const [result] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(conversations)
    .where(and(...conditions));

  return Number(result?.count) || 0;
}

// ==================== Message Operations ====================

/**
 * Create a new message
 */
export async function createMessage(data: InsertMessage): Promise<Message> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [message] = await db.insert(messages).values(data).returning();

  // Update conversation message count and updatedAt
  await db
    .update(conversations)
    .set({
      messageCount: sql`${conversations.messageCount} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, data.conversationId));

  return message;
}

/**
 * Get messages for a conversation
 */
export async function getMessages(
  conversationId: number,
  options: {
    limit?: number;
    offset?: number;
    beforeId?: number;
    afterId?: number;
  } = {}
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL<unknown>[] = [eq(messages.conversationId, conversationId)];

  if (options.beforeId) {
    conditions.push(lt(messages.id, options.beforeId));
  }

  if (options.afterId) {
    conditions.push(sql`${messages.id} > ${options.afterId}`);
  }

  let query = db
    .select()
    .from(messages)
    .where(and(...conditions))
    .orderBy(asc(messages.createdAt));

  if (options.limit) {
    query = query.limit(options.limit) as typeof query;
  }

  if (options.offset) {
    query = query.offset(options.offset) as typeof query;
  }

  return await query;
}

/**
 * Get recent messages for context building
 */
export async function getRecentMessages(
  conversationId: number,
  limit: number = 20
): Promise<Message[]> {
  const db = await getDb();
  if (!db) return [];

  // Get last N messages ordered by creation date
  const result = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  // Reverse to get chronological order
  return result.reverse();
}

/**
 * Get message by ID
 */
export async function getMessageById(id: number): Promise<Message | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const [message] = await db.select().from(messages).where(eq(messages.id, id)).limit(1);

  return message;
}

/**
 * Update message
 */
export async function updateMessage(id: number, data: Partial<InsertMessage>): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db.update(messages).set(data).where(eq(messages.id, id));
}

/**
 * Delete message
 */
export async function deleteMessage(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Get the message to find its conversation
  const message = await getMessageById(id);
  if (!message) return;

  await db.delete(messages).where(eq(messages.id, id));

  // Update conversation message count
  await db
    .update(conversations)
    .set({
      messageCount: sql`GREATEST(${conversations.messageCount} - 1, 0)`,
    })
    .where(eq(conversations.id, message.conversationId));
}

/**
 * Update conversation credits after message
 */
export async function updateConversationCredits(
  conversationId: number,
  creditsUsed: number
): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(conversations)
    .set({
      totalCreditsUsed: sql`${conversations.totalCreditsUsed} + ${creditsUsed}`,
    })
    .where(eq(conversations.id, conversationId));
}

// ==================== Summary Operations ====================

/**
 * Create a conversation summary
 */
export async function createSummary(data: InsertConversationSummary): Promise<ConversationSummary> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [summary] = await db.insert(conversationSummaries).values(data).returning();

  return summary;
}

/**
 * Get summaries for a conversation
 */
export async function getSummaries(conversationId: number): Promise<ConversationSummary[]> {
  const db = await getDb();
  if (!db) return [];

  return await db
    .select()
    .from(conversationSummaries)
    .where(eq(conversationSummaries.conversationId, conversationId))
    .orderBy(asc(conversationSummaries.messageRangeStart));
}

// ==================== Entity Memory Operations ====================

/**
 * Get or create entity memory
 */
export async function upsertEntityMemory(data: {
  userId: number;
  entityType: "user" | "project" | "preference" | "technical";
  entityName: string;
  facts: string[];
  sourceConversationId?: number;
}): Promise<EntityMemory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Try to find existing memory
  const [existing] = await db
    .select()
    .from(entityMemories)
    .where(
      and(
        eq(entityMemories.userId, data.userId),
        eq(entityMemories.entityType, data.entityType),
        eq(entityMemories.entityName, data.entityName)
      )
    )
    .limit(1);

  if (existing) {
    // Merge facts (avoid duplicates)
    const mergedFacts = [...new Set([...(existing.facts || []), ...data.facts])];

    await db
      .update(entityMemories)
      .set({
        facts: mergedFacts,
        reinforcementCount: sql`${entityMemories.reinforcementCount} + 1`,
        lastAccessedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entityMemories.id, existing.id));

    return { ...existing, facts: mergedFacts };
  }

  // Create new memory
  const [memory] = await db
    .insert(entityMemories)
    .values({
      userId: data.userId,
      entityType: data.entityType,
      entityName: data.entityName,
      facts: data.facts,
      sourceConversationId: data.sourceConversationId,
    })
    .returning();

  return memory;
}

/**
 * Get entity memories for a user
 */
export async function getEntityMemories(
  userId: number,
  entityType?: "user" | "project" | "preference" | "technical"
): Promise<EntityMemory[]> {
  const db = await getDb();
  if (!db) return [];

  const conditions: SQL<unknown>[] = [eq(entityMemories.userId, userId)];

  if (entityType) {
    conditions.push(eq(entityMemories.entityType, entityType));
  }

  return await db
    .select()
    .from(entityMemories)
    .where(and(...conditions))
    .orderBy(desc(entityMemories.reinforcementCount), desc(entityMemories.lastAccessedAt));
}

/**
 * Update entity memory access time
 */
export async function touchEntityMemory(id: number): Promise<void> {
  const db = await getDb();
  if (!db) return;

  await db
    .update(entityMemories)
    .set({ lastAccessedAt: new Date() })
    .where(eq(entityMemories.id, id));
}

/**
 * Delete entity memory
 */
export async function deleteEntityMemory(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(entityMemories)
    .where(and(eq(entityMemories.id, id), eq(entityMemories.userId, userId)));
}

// ==================== Skill Preferences Operations ====================

/**
 * Get skill preferences for a conversation
 */
export async function getSkillPreferences(conversationId: number): Promise<Array<{
  skillId: string;
  enabled: boolean;
  priority: number;
  customSettings?: Record<string, any>;
}>> {
  const db = await getDb();
  if (!db) return [];

  const prefs = await db
    .select()
    .from(skillPreferences)
    .where(eq(skillPreferences.conversationId, conversationId))
    .orderBy(desc(skillPreferences.priority));

  return prefs.map((p) => ({
    skillId: p.skillId,
    enabled: p.enabled,
    priority: p.priority,
    customSettings: p.customSettings || undefined,
  }));
}

/**
 * Update skill preference
 */
export async function updateSkillPreference(
  conversationId: number,
  skillId: string,
  data: { enabled?: boolean; priority?: number; customSettings?: Record<string, any> }
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Upsert skill preference
  await db
    .insert(skillPreferences)
    .values({
      conversationId,
      skillId,
      enabled: data.enabled ?? true,
      priority: data.priority ?? 0,
      customSettings: data.customSettings,
    })
    .onConflictDoUpdate({
      target: [skillPreferences.conversationId, skillPreferences.skillId],
      set: data,
    });
}

// ==================== Utility Functions ====================

/**
 * Build context for LLM request including memory
 */
export async function buildChatContext(
  conversationId: number,
  userId: number,
  systemPrompt?: string
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  const context: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // 1. Add system prompt
  if (systemPrompt) {
    context.push({ role: "system", content: systemPrompt });
  }

  // 2. Add entity memories
  const memories = await getEntityMemories(userId);
  if (memories.length > 0) {
    const memoryContext = memories
      .slice(0, 10) // Limit to top 10 most relevant
      .map((m) => `[${m.entityType}:${m.entityName}] ${m.facts.join("; ")}`)
      .join("\n");

    context.push({
      role: "system",
      content: `User Context:\n${memoryContext}`,
    });
  }

  // 3. Add summaries
  const summaries = await getSummaries(conversationId);
  if (summaries.length > 0) {
    const summaryContext = summaries.map((s) => s.summary).join("\n\n");
    context.push({
      role: "system",
      content: `Previous conversation summary:\n${summaryContext}`,
    });
  }

  // 4. Add recent messages
  const recentMessages = await getRecentMessages(conversationId, 20);
  for (const msg of recentMessages) {
    if (msg.role === "system") continue; // Skip system messages in buffer
    context.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  return context;
}

/**
 * Check if conversation needs summarization
 */
export async function needsSummarization(conversationId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  // Get latest summary
  const [latestSummary] = await db
    .select()
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

  // Summarize when we have more than 30 unsummarized messages
  return Number(result?.count) > 30;
}
