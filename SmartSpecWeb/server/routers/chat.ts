/**
 * Chat tRPC Router
 * Handles conversations, messages, memory, and skill preferences
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  getConversationCount,
  createMessage,
  getMessages,
  getRecentMessages,
  getMessageById,
  updateMessage,
  deleteMessage,
  updateConversationCredits,
  getSummaries,
  getEntityMemories,
  upsertEntityMemory,
  deleteEntityMemory,
  getSkillPreferences,
  updateSkillPreference,
  buildChatContext,
} from "../services/chatService";
import { deductCredits, hasEnoughCredits, calculateCreditsForLLM } from "../services/creditService";
import { TRPCError } from "@trpc/server";
import { getAvailableSkills, getSkillById, getDefaultEnabledSkills } from "../services/skillRegistry";
import { detectSkill, extractSkillParams, getSkillDetectionSummary } from "../services/skillDetector";
import { executeSkill, estimateSkillCost, canAutoExecute } from "../services/skillExecutor";
import { signBearerToken } from "../_core/tokens";
import { skillDetectionLimiter, skillExecutionLimiter } from "../services/rateLimiter";

// Helper to create secure token for skill execution
function createSkillToken(userId: number): string {
  return signBearerToken({
    sub: String(userId),
    scopes: ["skill:execute"],
    jti: `skill_${Date.now()}_${Math.random().toString(36).slice(2)}`,
  }, "15m");
}

// ==================== Zod Schemas ====================

const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const attachmentSchema = z.object({
  type: z.enum(["image", "file", "audio", "video"]),
  url: z.string().url(),
  key: z.string().optional(),
  name: z.string().optional(),
  size: z.number().optional(),
  mimeType: z.string().optional(),
  thumbnail: z.string().optional(),
});

const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(["code", "markdown", "image", "video", "pdf", "file", "slideshow", "chart", "table"]),
  title: z.string().optional(),
  content: z.union([z.string(), z.array(z.string())]),
  language: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Skill execution parameter validation
const skillAspectRatioSchema = z.enum(["1:1", "16:9", "9:16", "4:3", "3:4"]);
const skillVoiceSchema = z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]);
const skillQualitySchema = z.enum(["low", "medium", "high"]);
const skillStyleSchema = z.enum(["realistic", "artistic", "cartoon", "3d"]);

const skillSettingsSchema = z.object({
  autoDetect: z.boolean().default(true),
  enabledSkills: z.array(z.string()).default([]),
  detectionMode: z.enum(["ask", "auto", "explicit"]).default("auto"),
});

const entityTypeSchema = z.enum(["user", "project", "preference", "technical"]);

// ==================== Chat Router ====================

export const chatRouter = router({
  // ==================== Conversations ====================

  /**
   * Create a new conversation
   */
  createConversation: protectedProcedure
    .input(
      z.object({
        title: z.string().max(255).optional(),
        model: z.string().max(100).optional(),
        systemPrompt: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await createConversation({
        userId: ctx.user.id,
        title: input.title,
        model: input.model,
        systemPrompt: input.systemPrompt,
      });

      return {
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        createdAt: conversation.createdAt,
      };
    }),

  /**
   * List user's conversations
   */
  listConversations: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
        isArchived: z.boolean().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conversations = await getConversations({
        userId: ctx.user.id,
        isArchived: input.isArchived ?? false,
        search: input.search,
        limit: input.limit,
        offset: input.offset,
      });

      const total = await getConversationCount(ctx.user.id, input.isArchived ?? false);

      return {
        conversations: conversations.map((c) => ({
          id: c.id,
          title: c.title,
          model: c.model,
          messageCount: c.messageCount,
          isPinned: c.isPinned,
          isArchived: c.isArchived,
          totalCreditsUsed: c.totalCreditsUsed,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })),
        total,
        hasMore: input.offset + conversations.length < total,
      };
    }),

  /**
   * Get a single conversation with settings
   */
  getConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.id, ctx.user.id);

      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return {
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        temperature: conversation.temperature ? parseFloat(conversation.temperature) : 0.7,
        systemPrompt: conversation.systemPrompt,
        skillSettings: conversation.skillSettings,
        messageCount: conversation.messageCount,
        isPinned: conversation.isPinned,
        isArchived: conversation.isArchived,
        totalCreditsUsed: conversation.totalCreditsUsed,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      };
    }),

  /**
   * Update conversation settings
   */
  updateConversation: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().max(255).optional(),
        model: z.string().max(100).optional(),
        temperature: z.number().min(0).max(2).optional(),
        systemPrompt: z.string().nullable().optional(),
        skillSettings: skillSettingsSchema.optional(),
        isPinned: z.boolean().optional(),
        isArchived: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      // Convert temperature to string for numeric column
      const updateData: any = { ...data };
      if (data.temperature !== undefined) {
        updateData.temperature = data.temperature.toString();
      }

      await updateConversation(id, ctx.user.id, updateData);

      return { success: true };
    }),

  /**
   * Delete a conversation
   */
  deleteConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await deleteConversation(input.id, ctx.user.id);
      return { success: true };
    }),

  // ==================== Messages ====================

  /**
   * Get messages for a conversation
   */
  getMessages: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        beforeId: z.number().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      // Verify conversation ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const messages = await getMessages(input.conversationId, {
        limit: input.limit,
        offset: input.offset,
        beforeId: input.beforeId,
      });

      return messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        attachments: m.attachments || [],
        artifacts: m.artifacts || [],
        skillUsed: m.skillUsed,
        skillArgs: m.skillArgs,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        creditsUsed: m.creditsUsed,
        modelUsed: m.modelUsed,
        error: m.error,
        isRegenerated: m.isRegenerated,
        createdAt: m.createdAt,
      }));
    }),

  /**
   * Send a message (non-streaming, returns full response)
   * For streaming, use the SSE endpoint at /api/chat/stream
   */
  sendMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string().min(1).max(100000),
        attachments: z.array(attachmentSchema).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify conversation ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Check credits (estimate based on input)
      const estimatedInputTokens = Math.ceil(input.content.length / 4);
      const estimatedCredits = calculateCreditsForLLM(estimatedInputTokens, 0);

      const hasCredits = await hasEnoughCredits(ctx.user.id, estimatedCredits);
      if (!hasCredits) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Insufficient credits",
        });
      }

      // Create user message
      const userMessage = await createMessage({
        conversationId: input.conversationId,
        role: "user",
        content: input.content,
        attachments: input.attachments || [],
      });

      // Return the user message immediately
      // The actual LLM response should be handled via streaming endpoint
      return {
        id: userMessage.id,
        role: userMessage.role,
        content: userMessage.content,
        attachments: userMessage.attachments,
        createdAt: userMessage.createdAt,
      };
    }),

  /**
   * Save assistant message (called after streaming completes)
   */
  saveAssistantMessage: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        content: z.string(),
        inputTokens: z.number().default(0),
        outputTokens: z.number().default(0),
        modelUsed: z.string().optional(),
        artifacts: z.array(artifactSchema).optional(),
        skillUsed: z.string().optional(),
        skillArgs: z.record(z.any()).optional(),
        error: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify conversation ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Calculate and deduct credits
      const creditsUsed = calculateCreditsForLLM(input.inputTokens, input.outputTokens);

      if (creditsUsed > 0) {
        await deductCredits({
          userId: ctx.user.id,
          amount: creditsUsed,
          description: `Chat: ${conversation.title?.substring(0, 50) || "Conversation"}`,
          metadata: {
            conversationId: input.conversationId,
            model: input.modelUsed || conversation.model,
            inputTokens: input.inputTokens,
            outputTokens: input.outputTokens,
          },
        });

        // Update conversation total credits
        await updateConversationCredits(input.conversationId, creditsUsed);
      }

      // Create assistant message
      const message = await createMessage({
        conversationId: input.conversationId,
        role: "assistant",
        content: input.content,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        creditsUsed: creditsUsed.toString(),
        modelUsed: input.modelUsed || conversation.model || undefined,
        artifacts: input.artifacts || [],
        skillUsed: input.skillUsed,
        skillArgs: input.skillArgs,
        error: input.error,
      });

      return {
        id: message.id,
        creditsUsed,
      };
    }),

  /**
   * Delete a message
   */
  deleteMessage: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const message = await getMessageById(input.id);
      if (!message) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Message not found",
        });
      }

      // Verify conversation ownership
      const conversation = await getConversationById(message.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Not authorized",
        });
      }

      await deleteMessage(input.id);
      return { success: true };
    }),

  // ==================== Memory ====================

  /**
   * Get chat context for LLM (includes memory)
   */
  getChatContext: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
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

      return context;
    }),

  /**
   * Get user's entity memories
   */
  getEntityMemories: protectedProcedure
    .input(
      z.object({
        entityType: entityTypeSchema.optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const memories = await getEntityMemories(ctx.user.id, input.entityType);

      return memories.map((m) => ({
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
        facts: z.array(z.string().min(1).max(1000)),
        sourceConversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const memory = await upsertEntityMemory({
        userId: ctx.user.id,
        entityType: input.entityType,
        entityName: input.entityName,
        facts: input.facts,
        sourceConversationId: input.sourceConversationId,
      });

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
      await deleteEntityMemory(input.id, ctx.user.id);
      return { success: true };
    }),

  // ==================== Skill Preferences ====================

  /**
   * Get skill preferences for a conversation
   */
  getSkillPreferences: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      return getSkillPreferences(input.conversationId);
    }),

  /**
   * Update skill preference for a conversation
   */
  updateSkillPreference: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        skillId: z.string().min(1).max(100),
        enabled: z.boolean().optional(),
        priority: z.number().min(0).max(100).optional(),
        customSettings: z.record(z.any()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const { conversationId, skillId, ...data } = input;
      await updateSkillPreference(conversationId, skillId, data);

      return { success: true };
    }),

  // ==================== Summaries ====================

  /**
   * Get conversation summaries
   */
  getSummaries: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
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
        createdAt: s.createdAt,
      }));
    }),

  // ==================== Skills ====================

  /**
   * Get all available skills
   */
  getAvailableSkills: protectedProcedure.query(async () => {
    const skills = getAvailableSkills();

    return skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      icon: s.icon,
      type: s.type,
      models: s.models || [],
      defaultModel: s.defaultModel,
      enabledByDefault: s.enabledByDefault,
      creditMultiplier: s.creditMultiplier,
      priority: s.priority,
    }));
  }),

  /**
   * Get a single skill by ID
   */
  getSkill: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const skill = getSkillById(input.id);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Skill not found",
        });
      }

      return {
        id: skill.id,
        name: skill.name,
        description: skill.description,
        icon: skill.icon,
        type: skill.type,
        models: skill.models || [],
        defaultModel: skill.defaultModel,
        enabledByDefault: skill.enabledByDefault,
        creditMultiplier: skill.creditMultiplier,
        priority: skill.priority,
      };
    }),

  /**
   * Get default enabled skill IDs
   */
  getDefaultSkills: protectedProcedure.query(async () => {
    return getDefaultEnabledSkills();
  }),

  /**
   * Detect skill from a message
   */
  detectSkill: protectedProcedure
    .input(
      z.object({
        message: z.string().max(5000), // Limit message length
        conversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!skillDetectionLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded. Try again in ${Math.ceil(skillDetectionLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      // Get conversation skill settings if conversationId provided
      let skillSettings = null;
      if (input.conversationId) {
        const conversation = await getConversationById(input.conversationId, ctx.user.id);
        if (conversation) {
          skillSettings = conversation.skillSettings;
        }
      }

      const result = await detectSkill(
        input.message,
        input.conversationId,
        skillSettings as any
      );

      if (!result.detected || !result.skill) {
        return {
          detected: false,
          skill: null,
          confidence: 0,
          matchedTrigger: null,
          suggestedPrompt: null,
          params: null,
        };
      }

      // Extract skill parameters
      const params = extractSkillParams(input.message, result.skill);

      return {
        detected: true,
        skill: {
          id: result.skill.id,
          name: result.skill.name,
          type: result.skill.type,
          models: result.skill.models || [],
          defaultModel: result.skill.defaultModel,
          creditMultiplier: result.skill.creditMultiplier,
        },
        confidence: result.confidence,
        matchedTrigger: result.matchedTrigger,
        suggestedPrompt: result.suggestedPrompt,
        params,
      };
    }),

  /**
   * Get skill detection summary for a conversation
   */
  getSkillSummary: protectedProcedure
    .input(z.object({ conversationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      const summary = await getSkillDetectionSummary(input.conversationId);

      return {
        enabledSkills: summary.enabledSkills.map((s) => ({
          id: s.id,
          name: s.name,
          icon: s.icon,
          type: s.type,
        })),
        disabledSkills: summary.disabledSkills.map((s) => ({
          id: s.id,
          name: s.name,
          icon: s.icon,
          type: s.type,
        })),
        skillSettings: conversation.skillSettings,
      };
    }),

  /**
   * Batch update skill preferences for a conversation
   */
  batchUpdateSkillPreferences: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        preferences: z.array(
          z.object({
            skillId: z.string(),
            enabled: z.boolean(),
            priority: z.number().min(0).max(100).optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }

      // Update each skill preference
      for (const pref of input.preferences) {
        await updateSkillPreference(input.conversationId, pref.skillId, {
          enabled: pref.enabled,
          priority: pref.priority,
        });
      }

      return { success: true, updated: input.preferences.length };
    }),

  /**
   * Execute a detected skill
   */
  executeSkill: protectedProcedure
    .input(
      z.object({
        skillId: z.string().min(1).max(50),
        prompt: z.string().min(1).max(5000),
        model: z.string().max(50).optional(),
        aspectRatio: skillAspectRatioSchema.optional(),
        numImages: z.number().min(1).max(4).optional(),
        duration: z.number().min(1).max(60).optional(),
        voice: skillVoiceSchema.optional(),
        quality: skillQualitySchema.optional(),
        style: skillStyleSchema.optional(),
        conversationId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Rate limiting for skill execution
      const rateLimitKey = `user:${ctx.user.id}`;
      if (!skillExecutionLimiter.isAllowed(rateLimitKey)) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Rate limit exceeded for skill execution. Try again in ${Math.ceil(skillExecutionLimiter.getResetTime(rateLimitKey) / 1000)} seconds.`,
        });
      }

      const skill = getSkillById(input.skillId);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      // Check if skill can be auto-executed
      if (!canAutoExecute(skill)) {
        return {
          success: false,
          skillId: input.skillId,
          type: "text" as const,
          error: `Skill '${skill.name}' cannot be automatically executed`,
        };
      }

      // Get secure token for media generation
      const userToken = createSkillToken(ctx.user.id);

      // Execute the skill
      const result = await executeSkill(
        skill,
        {
          prompt: input.prompt,
          model: input.model,
          aspectRatio: input.aspectRatio,
          numImages: input.numImages,
          duration: input.duration,
          voice: input.voice,
          quality: input.quality,
          style: input.style,
        },
        ctx.user.id,
        userToken
      );

      return result;
    }),

  /**
   * Estimate credit cost for skill execution
   */
  estimateSkillCost: protectedProcedure
    .input(
      z.object({
        skillId: z.string(),
        model: z.string().optional(),
        numImages: z.number().optional(),
        duration: z.number().optional(),
      })
    )
    .query(async ({ input }) => {
      const skill = getSkillById(input.skillId);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found`,
        });
      }

      const cost = estimateSkillCost(skill, {
        prompt: "",
        model: input.model,
        numImages: input.numImages,
        duration: input.duration,
      });

      return {
        skillId: input.skillId,
        skillName: skill.name,
        estimatedCredits: cost,
        model: input.model || skill.defaultModel,
      };
    }),
});
