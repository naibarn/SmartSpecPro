/**
 * Chat Service - Database operations for conversations, messages, and memory
 */
import { eq, desc, asc, and, sql, or, inArray, lt, gte, SQL, ilike, isNull, isNotNull } from "drizzle-orm";
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
  tenants,
} from "../../drizzle/schema";

// ==================== Google Drive Integration ====================

const PY_BACKEND =
  process.env.PYTHON_BACKEND_URL ||
  process.env.VITE_PYTHON_BACKEND_URL ||
  "http://localhost:8000";
const PY_PROXY_TOKEN = process.env.SMARTSPEC_PROXY_TOKEN || "";

async function checkUserHasDriveTools(userId: number): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const resp = await fetch(
      `${PY_BACKEND}/api/internal/mcp/tools?user_id=${userId}`,
      {
        headers: { "x-proxy-token": PY_PROXY_TOKEN },
        signal: controller.signal,
      },
    );
    clearTimeout(timeout);
    if (!resp.ok) return false;
    const data = (await resp.json()) as { tools: unknown[] };
    return (data.tools?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

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
  projectId?: string;
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
      projectId: data.projectId,
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

  // Exclude trashed conversations by default
  if ((filters as any).trashedOnly) {
    conditions.push(isNotNull(conversations.trashedAt));
  } else {
    conditions.push(isNull(conversations.trashedAt));
  }

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
/**
 * Soft-delete: move conversation to trash (sets trashedAt)
 */
export async function deleteConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conversations)
    .set({ trashedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Restore a trashed conversation
 */
export async function restoreConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .update(conversations)
    .set({ trashedAt: null })
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Permanently delete a conversation (from trash)
 */
export async function permanentlyDeleteConversation(id: number, userId: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  await db
    .delete(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, userId)));
}

/**
 * Empty trash — permanently delete all trashed conversations
 */
export async function emptyTrash(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .delete(conversations)
    .where(
      and(
        eq(conversations.userId, userId),
        isNotNull(conversations.trashedAt)
      )
    )
    .returning({ id: conversations.id });

  return result.length;
}

/**
 * Auto-purge conversations trashed more than 30 days ago
 */
export async function purgeOldTrash(): Promise<number> {
  const db = await getDb();
  if (!db) return 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await db
    .delete(conversations)
    .where(lt(conversations.trashedAt, thirtyDaysAgo))
    .returning({ id: conversations.id });

  return result.length;
}

/**
 * Soft-delete empty conversations (0 messages) for a user
 */
export async function deleteEmptyConversations(userId: number): Promise<number> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const result = await db
    .update(conversations)
    .set({ trashedAt: new Date() })
    .where(
      and(
        eq(conversations.userId, userId),
        eq(conversations.messageCount, 0),
        isNull(conversations.trashedAt)
      )
    )
    .returning({ id: conversations.id });

  return result.length;
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
  projectId?: string | null;
}): Promise<EntityMemory> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // If projectId not provided but sourceConversationId exists, look it up
  let projectId = data.projectId ?? null;
  if (!projectId && data.sourceConversationId) {
    try {
      const [conv] = await db
        .select({ projectId: conversations.projectId })
        .from(conversations)
        .where(eq(conversations.id, data.sourceConversationId))
        .limit(1);
      projectId = conv?.projectId ?? null;
    } catch {}
  }

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
        ...(projectId && !existing.projectId ? { projectId } : {}),
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
      projectId: projectId ?? undefined,
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
  systemPrompt?: string,
  tenantId?: string
): Promise<Array<{ role: "system" | "user" | "assistant"; content: string }>> {
  const context: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

  // 0. Resolve persona and prepend to system prompt
  let effectiveSystemPrompt = systemPrompt;
  try {
    const { resolvePersona, buildPersonaPromptSegments } = await import("./personaService");
    const db = await getDb();
    if (db) {
      // Load conversation to get personaId
      const convResult = await db
        .select({ personaId: conversations.personaId, tenantId: conversations.tenantId })
        .from(conversations)
        .where(eq(conversations.id, conversationId))
        .limit(1);

      const conv = convResult[0];
      const convTenantId = conv?.tenantId || tenantId || null;

      const persona = await resolvePersona(
        { personaId: conv?.personaId || null, tenantId: convTenantId },
        { id: userId, defaultPersonaId: null },
        { id: convTenantId || "", defaultPersonaId: null },
      );

      if (persona) {
        const segments = buildPersonaPromptSegments(persona);
        const parts: string[] = [segments.prefix];
        if (segments.styleInstructions) parts.push(segments.styleInstructions);
        if (segments.restrictionsBulletPoints) parts.push(segments.restrictionsBulletPoints);
        if (effectiveSystemPrompt) parts.push(effectiveSystemPrompt);
        effectiveSystemPrompt = parts.join("\n\n");
      }
    }
  } catch (err) {
    // Persona system disabled or unavailable — continue without persona
    if (err instanceof Error && !err.message.includes("not enabled")) {
      console.warn("[chatService] Persona resolution failed:", err.message);
    }
  }

  // 1. Add system prompt
  if (effectiveSystemPrompt) {
    context.push({ role: "system", content: effectiveSystemPrompt });
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

  // 2b. Add Google Drive tools context if user has connection
  const hasDriveTools = await checkUserHasDriveTools(userId);
  if (hasDriveTools) {
    context.push({
      role: "system",
      content: [
        "You have access to the user's Google Drive via the following tools:",
        "- search_drive_files: Search for files by name or content",
        "- read_drive_file: Read the text content of a Drive file",
        "- read_sheet_data: Read data from a Google Sheet",
        "- list_drive_folder: List files in a Drive folder",
        "- get_drive_file_info: Get metadata about a Drive file",
        "",
        "Use these tools when the user asks about their Google Drive files, wants to find documents, or needs content from their Drive.",
      ].join("\n"),
    });
  }

  // 2c. Add canvas artifact format instruction if feature flag enabled
  try {
    const convTenantId = tenantId;
    if (convTenantId) {
      const db = await getDb();
      if (db) {
        const [tenant] = await db
          .select({ settings: tenants.settings })
          .from(tenants)
          .where(eq(tenants.id, convTenantId))
          .limit(1);
        const featureFlags = (tenant?.settings as any)?.featureFlags;
        if (featureFlags?.canvas) {
          context.push({
            role: "system",
            content: `When generating charts, tables, code, or interactive content, use the artifact format:
\`\`\`artifact:TYPE title="Title" language="lang"
content
\`\`\`
Supported types: code, markdown, mermaid, svg, react, html, chart, table.
Use 'react' for interactive React components, 'chart' for data visualizations (JSON format), 'table' for structured data.`,
          });
        }
      }
    }
  } catch {
    // Canvas feature flag check failed — continue without canvas instruction
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
