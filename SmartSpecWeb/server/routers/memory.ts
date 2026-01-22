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
} from "../services/memoryService";
import { getConversationById } from "../services/chatService";
import { TRPCError } from "@trpc/server";

const entityTypeSchema = z.enum(["user", "project", "preference", "technical"]);

export const memoryRouter = router({
  /**
   * Get user's entity memories
   */
  getEntityMemories: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema.optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ ctx, input }) => {
      const memories = await getEntityMemoriesForContext(ctx.user.id, input.limit);

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
      })
    )
    .mutation(async ({ ctx, input }) => {
      const memory = await upsertEntityMemory(
        ctx.user.id,
        input.entityType,
        input.entityName,
        input.facts,
        input.sourceConversationId
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

      const context = await buildChatContext(
        input.conversationId,
        ctx.user.id,
        conversation.systemPrompt || undefined
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
        summary: z.string().min(1),
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
});
