/**
 * Memory tRPC Router
 * Handles entity memories, summaries, and context building
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getEntityMemoriesForContext,
  upsertEntityMemory,
  getSummaries,
  buildChatContext,
  contextToMessages,
  needsSummarization,
  getMessagesToSummarize,
  generateSummaryPrompt,
  saveSummary,
  processConversationMemory,
  cleanupExpiredMemories,
} from "../services/memoryService";
import { getConversationById } from "../services/chatService";
import { TRPCError } from "@trpc/server";

const entityTypeSchema = z.enum([
  "user", "project", "preference", "technical",
  "decision", "plan", "architecture", "component", "task", "code_knowledge",
  "rule",
]);

export const memoryRouter = router({
  /**
   * Get user's entity memories
   */
  getEntityMemories: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema.optional(),
        limit: z.number().min(1).max(50).default(20),
        projectId: z.string().nullish(),
      })
    )
    .query(async ({ ctx, input }) => {
      const memories = await getEntityMemoriesForContext(ctx.user.id, input.limit, input.projectId || null);

      // Filter by type if specified
      const filtered = input.entityType
        ? memories.filter((m) => m.entityType === input.entityType)
        : memories;

      return filtered.map((m) => ({
        id: m.id,
        entityType: m.entityType,
        entityName: m.entityName,
        facts: m.facts,
        confidence: m.confidence ? parseFloat(m.confidence) : 0.8,
        importance: m.importance ?? 5,
        source: m.source ?? "auto",
        reinforcementCount: m.reinforcementCount,
        lastAccessedAt: m.lastAccessedAt,
        createdAt: m.createdAt,
      }));
    }),

  /**
   * Add or update entity memory
   */
  upsertEntityMemory: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema,
        entityName: z.string().min(1).max(255),
        facts: z.array(z.string().min(1).max(1000)).min(1),
        sourceConversationId: z.number().optional(),
        importance: z.number().min(1).max(10).optional(),
        source: z.enum(["auto", "manual", "suggested"]).optional(),
        projectId: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const memory = await upsertEntityMemory(
        ctx.user.id,
        input.entityType,
        input.entityName,
        input.facts,
        input.sourceConversationId,
        input.importance,
        input.source,
        input.projectId
      );

      return {
        id: memory.id,
        entityType: memory.entityType,
        entityName: memory.entityName,
        facts: memory.facts,
      };
    }),

  /**
   * Delete entity memory
   */
  deleteEntityMemory: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { entityMemories } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      await db
        .delete(entityMemories)
        .where(
          and(
            eq(entityMemories.id, input.id),
            eq(entityMemories.userId, ctx.user.id)
          )
        );

      return { success: true };
    }),

  /**
   * Get conversation summaries
   */
  getSummaries: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const summaries = await getSummaries(input.conversationId);

      return summaries.map((s) => ({
        id: s.id,
        summary: s.summary,
        messageRangeStart: s.messageRangeStart,
        messageRangeEnd: s.messageRangeEnd,
        messageCount: s.messageCount,
        tokensUsed: s.tokensUsed,
        createdAt: s.createdAt,
      }));
    }),

  /**
   * Get full chat context with memory for LLM
   */
  getChatContext: protectedProcedure
    .input(z.object({
      conversationId: z.number(),
      modelContextLength: z.number().optional(),
      currentMessage: z.string().max(10000).optional(),
      memoryMode: z.enum(["full", "no_long", "off"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const contextBudget = input.modelContextLength
        ? Math.floor(input.modelContextLength * 0.7)
        : undefined;

      // Use memoryMode from input, fallback to conversation setting
      const memoryMode = input.memoryMode || (conversation as any).memoryMode || "full";

      const context = await buildChatContext(
        input.conversationId,
        ctx.user.id,
        conversation.systemPrompt || undefined,
        {
          contextBudget,
          currentUserMessage: input.currentMessage,
          memoryMode,
          projectId: (conversation as any).projectId || undefined,
        }
      );

      return {
        messages: contextToMessages(context),
        tokenEstimate: context.totalTokenEstimate,
        hasEntityMemory: !!context.entityContext,
        hasSummaries: !!context.summaryContext,
        bufferSize: context.bufferMessages.length,
      };
    }),

  /**
   * Check if conversation needs summarization
   */
  checkSummarization: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const needed = await needsSummarization(input.conversationId);
      let messagesToSummarize: number = 0;

      if (needed) {
        const messages = await getMessagesToSummarize(input.conversationId);
        messagesToSummarize = messages.length;
      }

      return {
        needed,
        messagesToSummarize,
      };
    }),

  /**
   * Get summary prompt for manual summarization
   */
  getSummaryPrompt: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const messages = await getMessagesToSummarize(input.conversationId);

      if (messages.length === 0) {
        return { prompt: null, messageCount: 0 };
      }

      const prompt = generateSummaryPrompt(messages);

      return {
        prompt,
        messageCount: messages.length,
        messageRangeStart: messages[0].id,
        messageRangeEnd: messages[messages.length - 1].id,
      };
    }),

  /**
   * Save summary after LLM generates it
   */
  saveSummary: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        summary: z.string().min(1).max(10000),
        messageRangeStart: z.number(),
        messageRangeEnd: z.number(),
        messageCount: z.number(),
        tokensUsed: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const result = await saveSummary(
        input.conversationId,
        input.summary,
        input.messageRangeStart,
        input.messageRangeEnd,
        input.messageCount,
        input.tokensUsed
      );

      return {
        id: result.id,
        summary: result.summary,
      };
    }),

  /**
   * Process conversation for memory updates
   * Call after each message exchange
   */
  processMemory: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const result = await processConversationMemory(input.conversationId, ctx.user.id);

      return result;
    }),

  /**
   * Compact conversation: generate summary for old messages
   */
  compactConversation: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      const { getDb: getDatabase } = await import("../db");
      const { messages: messagesTable, conversationSummaries: summariesTable } = await import("../../drizzle/schema");
      const { eq, and, asc, desc, sql: sqlOp } = await import("drizzle-orm");

      const db = await getDatabase();
      if (!db) throw new Error("Database not available");

      // Find last summarized message ID
      const [latestSummary] = await db
        .select({ messageRangeEnd: summariesTable.messageRangeEnd })
        .from(summariesTable)
        .where(eq(summariesTable.conversationId, input.conversationId))
        .orderBy(desc(summariesTable.messageRangeEnd))
        .limit(1);

      const lastSummarizedId = latestSummary?.messageRangeEnd || 0;

      // Get all unsummarized messages except most recent 5
      const allUnsummarized = await db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.conversationId, input.conversationId),
            sqlOp`${messagesTable.id} > ${lastSummarizedId}`
          )
        )
        .orderBy(asc(messagesTable.createdAt));

      const KEEP_RECENT = 5;
      if (allUnsummarized.length <= KEEP_RECENT) {
        return { compacted: false, messageCount: 0, summary: null };
      }

      const toCompact = allUnsummarized.slice(0, allUnsummarized.length - KEEP_RECENT);
      const summaryText = toCompact
        .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
        .join("\n\n");

      const summary = `Key points from ${toCompact.length} messages:\n${summaryText.slice(0, 3000)}`;

      // Save as conversation summary
      await saveSummary(
        input.conversationId,
        summary,
        toCompact[0].id,
        toCompact[toCompact.length - 1].id,
        toCompact.length
      );

      return {
        compacted: true,
        messageCount: toCompact.length,
        summary: summary.slice(0, 200),
      };
    }),

  /**
   * Get conversation summary text for transferring to a new chat
   */
  getConversationSummary: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Conversation not found" });
      }

      // Get existing summaries
      const summaries = await getSummaries(input.conversationId, 10);

      // Get recent messages
      const { getDb: getDatabase } = await import("../db");
      const { messages: messagesTable } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");

      const db = await getDatabase();
      if (!db) return { summary: "" };

      const recentMessages = await db
        .select({ role: messagesTable.role, content: messagesTable.content })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, input.conversationId))
        .orderBy(desc(messagesTable.createdAt))
        .limit(10);

      const parts: string[] = [];

      if (summaries.length > 0) {
        parts.push("Previous conversation summaries:");
        for (const s of summaries) {
          parts.push(`- ${s.summary}`);
        }
      }

      if (recentMessages.length > 0) {
        parts.push("\nRecent messages:");
        for (const m of recentMessages.reverse()) {
          parts.push(`${m.role.toUpperCase()}: ${m.content.slice(0, 500)}`);
        }
      }

      return { summary: parts.join("\n").slice(0, 4000) };
    }),

  /**
   * Clear old memories by age (excludes rules)
   */
  clearOldMemories: protectedProcedure
    .input(z.object({
      olderThanDays: z.number().min(7).max(365),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("../db");
      const { entityMemories } = await import("../../drizzle/schema");
      const { eq, and, lt, ne } = await import("drizzle-orm");

      const db = await getDb();
      if (!db) throw new Error("Database not available");

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.olderThanDays);

      const deleted = await db
        .delete(entityMemories)
        .where(
          and(
            eq(entityMemories.userId, ctx.user.id),
            ne(entityMemories.entityType, "rule"),
            lt(entityMemories.lastAccessedAt, cutoff)
          )
        )
        .returning({ id: entityMemories.id });

      return { deletedCount: deleted.length };
    }),
});
