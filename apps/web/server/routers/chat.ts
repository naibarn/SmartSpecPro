/**
 * Chat tRPC Router
 * Handles conversations, messages, memory, and skill preferences
 */

import crypto from "crypto";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  createConversation,
  getConversations,
  getConversationById,
  updateConversation,
  deleteConversation,
  restoreConversation,
  permanentlyDeleteConversation,
  emptyTrash,
  deleteEmptyConversations,
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
import { hasEnoughCredits, calculateCreditsForLLM } from "../services/creditService";
import { TRPCError } from "@trpc/server";
import { getAvailableSkills, getSkillById, getSkillByIdOrType, getDefaultEnabledSkills, syncSingleSkillIfChanged } from "../services/skillRegistry";
import { detectSkill, extractSkillParams, getSkillDetectionSummary } from "../services/skillDetector";
import { getSlashCommands as _getSlashCommands } from "../services/userSkillService";
import { executeSkill, startPythonSkillTask, estimateSkillCost, canAutoExecute, type SkillCreateAction, type SkillExecutionResult } from "../services/skillExecutor";
import { signBearerToken } from "../_core/tokens";
import { skillDetectionLimiter, skillExecutionLimiter } from "../services/rateLimiter";
import { debugLog, debugError } from "../_core/logger";
import { ENABLE_FUNNEL_TRACKING, trackFirstConversation } from "../services/funnelMilestones";
import { getDb } from "../db";
import { skills as skillsTable, userSkillVisibility } from "../../drizzle/schema";
import { eq, and, like } from "drizzle-orm";
import { checkRateLimit } from "../middleware/distributedRateLimit";
import { auditLogger } from "../services/auditLogger";

// ── Security: forbidden patterns in LLM-generated skillContent ───────────────
const ISC_FORBIDDEN_PATTERNS = [
  /\bSELECT\b.*\bFROM\b/i,           // SQL queries
  /\bINSERT INTO\b|\bDROP TABLE\b/i,  // destructive SQL
  /open\s*\(|readFile|writeFile/,     // file access
  /process\.env|os\.environ/,         // env access
  /eval\s*\(|exec\s*\(/,              // code execution
  /import\s+os|import\s+subprocess/,  // dangerous Python imports
  /require\s*\(['"](fs|child_process|path)['"]\)/, // dangerous Node imports
];

function _validateSkillContent(content: string): string | null {
  if (content.length > 50_000) return "skillContent too long (max 50 000 chars)";
  for (const pat of ISC_FORBIDDEN_PATTERNS) {
    if (pat.test(content)) {
      return `skillContent contains forbidden pattern: ${pat.source}`;
    }
  }
  return null; // ok
}

/**
 * Handle the `create_skill` action returned by the ISC Python skill.
 * - Rate limit: 3/hour, 10/day, 5/10 min burst
 * - Dedup: no duplicate slug per user
 * - Security: validate skillContent against forbidden patterns
 * - Storage: insert into skills + userSkillVisibility (private to creator)
 */
async function handleIscCreateSkill(
  action: SkillCreateAction,
  userId: number,
): Promise<{ ok: true; skillId: number } | { ok: false; reason: string }> {
  // 1. Rate limiting (hourly / daily / burst)
  const [hourly, daily, burst] = await Promise.all([
    checkRateLimit(`isc_create:${userId}`,       3,   3_600),
    checkRateLimit(`isc_create_daily:${userId}`, 10,  86_400),
    checkRateLimit(`isc_create_burst:${userId}`, 5,   600),
  ]);
  if (!hourly.allowed) return { ok: false, reason: "Rate limit: max 3 skills per hour" };
  if (!daily.allowed)  return { ok: false, reason: "Rate limit: max 10 skills per day" };
  if (!burst.allowed)  return { ok: false, reason: "Rate limit: too many skills created in 10 minutes" };

  // 2. Security validation
  const secErr = _validateSkillContent(action.skillContent);
  if (secErr) return { ok: false, reason: `Security check failed: ${secErr}` };

  // Force safe values regardless of what ISC generated
  const safeSlug = action.slug.replace(/[^a-z0-9-]/g, "-").slice(0, 80);

  const db = await getDb();
  if (!db) {
    return { ok: false, reason: "Database not available" };
  }

  // 3. Deduplication with auto-rename: find all existing slugs that start with
  //    this base slug so we can pick the next available suffix (-2, -3, …).
  const existingRows = await db
    .select({ slug: skillsTable.slug })
    .from(skillsTable)
    .where(and(like(skillsTable.slug, `${safeSlug}%`), eq(skillsTable.createdBy, userId)));

  const slugSet = new Set(existingRows.map((r) => r.slug));

  let finalSlug = safeSlug;
  let finalName = action.name.slice(0, 255);

  if (slugSet.has(safeSlug)) {
    let counter = 2;
    let found = false;
    while (counter <= 99) {
      const candidate = `${safeSlug.slice(0, 77)}-${counter}`;
      if (!slugSet.has(candidate)) {
        finalSlug = candidate;
        finalName = `${action.name.slice(0, 250)} (${counter})`;
        found = true;
        break;
      }
      counter++;
    }
    if (!found) {
      return { ok: false, reason: `Too many skills with the name '${safeSlug}' — please delete some before creating more.` };
    }
    console.log(`[ISC] Slug '${safeSlug}' already exists for user ${userId} — using '${finalSlug}' instead`);
  }

  // 4. Insert skill (user-private: visibleByDefault=false, enabledByDefault=false)
  const [newSkill] = await db
    .insert(skillsTable)
    .values({
      slug:               finalSlug,
      name:               finalName,
      description:        action.description.slice(0, 1000),
      skillContent:       action.skillContent,
      systemPrompt:       action.skillContent,
      executionMode:      "llm-only",   // ALWAYS — no code execution
      importSource:       "isc-user",
      createdBy:          userId,
      isEnabled:          true,
      enabledByDefault:   false,        // not in global defaults
      visibleByDefault:   false,        // not in lazy-init for other users
      isAutoTrigger:      false,
      triggerPatterns:    action.triggerPatterns ?? [],
      category:           "other" as any,
      priority:           30,
    })
    .returning({ id: skillsTable.id });

  // 5. Grant visibility to the creating user only
  await db
    .insert(userSkillVisibility)
    .values({
      userId,
      skillId:            newSkill.id,
      visible:            true,
      autoTriggerEnabled: false,  // user must invoke explicitly
    })
    .onConflictDoNothing();

  console.log(`[ISC] Created private skill '${finalSlug}' (id=${newSkill.id}) for user ${userId}`);
  return { ok: true, skillId: newSkill.id };
}

// Helper to create secure token for skill execution
function createSkillToken(userId: number): string {
  return signBearerToken({
    sub: String(userId),
    type: "access", // Required by Python backend for token validation
    scopes: ["skill:execute"],
    jti: `skill_${Date.now()}_${crypto.randomBytes(12).toString("hex")}`,
  }, "15m");
}

// ==================== Zod Schemas ====================

const messageRoleSchema = z.enum(["user", "assistant", "system"]);

const attachmentSchema = z.object({
  type: z.enum(["image", "file", "audio", "video"]),
  // Allow both full URLs (http/https) and relative paths (/uploads/...)
  url: z.string().refine(
    (val) => val.startsWith("http://") || val.startsWith("https://") || val.startsWith("/uploads/"),
    { message: "URL must be a valid http/https URL or a relative /uploads/ path" }
  ),
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
const skillStyleSchema = z.string().max(50); // Accept any style value (cinematic, realistic, artistic, etc.)

const skillSettingsSchema = z.object({
  autoDetect: z.boolean().default(true),
  enabledSkills: z.array(z.string()).default([]),
  detectionMode: z.enum(["ask", "auto", "explicit"]).default("auto"),
});

const entityTypeSchema = z.enum(["user", "project", "preference", "technical"]);
type MessageAttachment = z.infer<typeof attachmentSchema>;

// ==================== Validation Helpers ====================

/**
 * Validate dynamic parameters from skill forms
 * - Type checking for known field types
 * - XSS prevention for string fields
 * - URL validation for image uploads
 */
function validateDynamicParams(
  params: Record<string, any>,
  skill: { configJson?: Record<string, any> | null }
): string[] {
  const errors: string[] = [];

  // Get expected params from skill config
  const configJson = skill.configJson || {};
  const expectedParams = configJson.inputFields || [];

  // Validate each parameter
  for (const [key, value] of Object.entries(params)) {
    const fieldDef = expectedParams.find((f: any) => f.id === key);

    if (!fieldDef) {
      // Unknown parameter - log but don't block (for backward compatibility)
      console.warn(`[executeSkill] Unknown parameter: ${key} for skill`);
      continue;
    }

    // Type validation
    switch (fieldDef.type) {
      case 'number':
        if (typeof value !== 'number') {
          errors.push(`${key} must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          errors.push(`${key} must be a boolean`);
        }
        break;
      case 'text':
      case 'textarea':
        if (typeof value !== 'string') {
          errors.push(`${key} must be a string`);
        } else {
          // XSS prevention
          if (/<script|javascript:|on\w+\s*=/i.test(value)) {
            errors.push(`${key} contains invalid characters`);
          }
          // Max length check
          if (fieldDef.maxLength && value.length > fieldDef.maxLength) {
            errors.push(`${key} exceeds maximum length of ${fieldDef.maxLength}`);
          }
        }
        break;
      case 'select':
        // Validate option exists
        const validOptions = (fieldDef.options || []).map((o: any) => o.value);
        if (validOptions.length > 0 && !validOptions.includes(value)) {
          errors.push(`${key} has invalid value`);
        }
        break;
      case 'imageUpload':
      case 'images':
        // Validate URLs
        if (Array.isArray(value)) {
          for (const url of value) {
            if (!isValidUploadUrl(url)) {
              errors.push(`${key} contains invalid URL: ${url}`);
            }
          }
        } else if (typeof value === 'string' && !isValidUploadUrl(value)) {
          errors.push(`${key} has invalid URL`);
        }
        break;
    }
  }

  return errors;
}

/**
 * Validate upload URLs
 * - Allow relative URLs (/uploads/...)
 * - Allow configured domains
 * - Reject javascript: and data: URLs
 */
function isValidUploadUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;

  // Reject dangerous protocols
  if (/^(javascript|data|vbscript):/i.test(url)) {
    return false;
  }

  // Allow relative URLs
  if (url.startsWith('/uploads/')) return true;
  if (url.startsWith('/')) return true; // Other relative paths

  // Allow http/https from any domain (images are served from CDN)
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

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
        projectId: z.string().max(100).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const conversation = await createConversation({
        userId: ctx.user.id,
        title: input.title,
        model: input.model,
        systemPrompt: input.systemPrompt,
        projectId: input.projectId,
      });

      // Track first conversation milestone (non-blocking, behind feature flag)
      if (ENABLE_FUNNEL_TRACKING) {
        trackFirstConversation({
          tenantId: ctx.user.registeredDomain || "default",
          domain: ctx.user.registeredDomain || undefined,
          userId: ctx.user.id,
          source: "chat.createConversation",
          channel: "web",
        }).catch((err) => {
          console.warn("[Funnel] trackFirstConversation failed:", err);
        });
      }

      return {
        id: conversation.id,
        title: conversation.title,
        model: conversation.model,
        projectId: (conversation as any).projectId,
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
        search: z.string().nullable().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const conversations = await getConversations({
        userId: ctx.user.id,
        isArchived: input.isArchived ?? false,
        search: input.search ?? undefined,
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
          projectId: (c as any).projectId || null,
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
        projectId: (conversation as any).projectId || null,
        memoryMode: (conversation as any).memoryMode || "full",
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
        projectId: z.string().max(100).nullable().optional(),
        memoryMode: z.enum(["full", "no_long", "off"]).optional(),
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

  /**
   * Delete all empty conversations (0 messages)
   */
  deleteEmptyConversations: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await deleteEmptyConversations(ctx.user.id);
      return { deletedCount: count };
    }),

  /**
   * Delete multiple conversations by IDs
   */
  deleteMultipleConversations: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      let deleted = 0;
      for (const id of input.ids) {
        await deleteConversation(id, ctx.user.id);
        deleted++;
      }
      return { deletedCount: deleted };
    }),

  // ==================== Trash ====================

  /**
   * List trashed conversations
   */
  listTrashedConversations: protectedProcedure
    .query(async ({ ctx }) => {
      const trashedConversations = await getConversations({
        userId: ctx.user.id,
        trashedOnly: true,
        limit: 100,
      } as any);
      return { conversations: trashedConversations };
    }),

  /**
   * Restore a trashed conversation
   */
  restoreConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await restoreConversation(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Restore multiple trashed conversations
   */
  restoreMultipleConversations: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      for (const id of input.ids) {
        await restoreConversation(id, ctx.user.id);
      }
      return { restoredCount: input.ids.length };
    }),

  /**
   * Permanently delete a trashed conversation
   */
  permanentlyDeleteConversation: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await permanentlyDeleteConversation(input.id, ctx.user.id);
      return { success: true };
    }),

  /**
   * Empty trash — permanently delete all trashed conversations
   */
  emptyTrash: protectedProcedure
    .mutation(async ({ ctx }) => {
      const count = await emptyTrash(ctx.user.id);
      return { deletedCount: count };
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
      debugLog("Chat", "saveAssistantMessage called", {
        conversationId: input.conversationId,
        contentLength: input.content?.length,
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens,
        userId: ctx.user.id,
      });

      // Verify conversation ownership
      const conversation = await getConversationById(input.conversationId, ctx.user.id);
      if (!conversation) {
        debugLog("Chat", "Conversation not found for user", ctx.user.id);
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Conversation not found",
        });
      }
      debugLog("Chat", "Found conversation", { id: conversation.id, title: conversation.title });

      // Calculate credits for tracking purposes only
      // NOTE: Credits are already deducted by the streaming endpoint (/api/llm/stream)
      // This is just for recording the credit usage on the message
      const creditsUsed = calculateCreditsForLLM(input.inputTokens, input.outputTokens);
      debugLog("Chat", "Calculated credits for tracking", creditsUsed);

      // Update conversation total credits (tracking only, not deducting)
      if (creditsUsed > 0) {
        await updateConversationCredits(input.conversationId, creditsUsed);
      }

      // Create assistant message
      debugLog("Chat", "Creating assistant message...");
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

      // Verify conversation ownership (prevents IDOR — user must own the conversation)
      const conversation = await getConversationById(message.conversationId, ctx.user.id);
      if (!conversation || conversation.userId !== ctx.user.id) {
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
   * Get slash commands for current user (lightweight list of visible skills)
   */
  getSlashCommands: protectedProcedure.query(async ({ ctx }) => {
    return _getSlashCommands(ctx.user.id);
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
          patternChainTo: null,
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
          executionMode: result.skill.executionMode || "llm-only",
          chainTo: result.skill.chainTo || null,
        },
        confidence: result.confidence,
        matchedTrigger: result.matchedTrigger,
        suggestedPrompt: result.suggestedPrompt,
        // Per-pattern chainTo from matched trigger pattern (takes precedence)
        patternChainTo: result.patternChainTo || null,
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
        prompt: z.string().max(5000).optional(),
        model: z.string().max(50).optional(),
        aspectRatio: skillAspectRatioSchema.optional(),
        numImages: z.number().min(1).max(4).optional(),
        duration: z.number().min(1).max(60).optional(),
        voice: skillVoiceSchema.optional(),
        quality: skillQualitySchema.optional(),
        style: skillStyleSchema.optional(),
        conversationId: z.number().optional(),
        // Reference images support (1-5 images) - accept relative URLs like /uploads/...
        referenceImageUrls: z.array(z.string().min(1)).max(5).optional(),
        referenceStyleUrl: z.string().min(1).optional(),
        // Dynamic fields from configJson.inputFields
        resolution: z.string().max(10).optional(),
        apiConfig: z.record(z.string()).optional(),
        extraParams: z.record(z.any()).optional(),
        // Alias for extraParams - used by dynamic skill forms
        dynamicParams: z.record(z.any()).optional(),
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

      // Use getSkillByIdOrType to support both skill IDs and skill types
      const skill = getSkillByIdOrType(input.skillId);

      if (!skill) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Skill '${input.skillId}' not found. Available skills can be viewed in Media Studio.`,
        });
      }

      // Authorization: verify user has access to restricted skills (visibleByDefault=false)
      {
        const db = await getDb();
        if (!db) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }
        const [accessCheck] = await db
          .select({
            visibleByDefault: skillsTable.visibleByDefault,
            hasAccess: userSkillVisibility.id,
          })
          .from(skillsTable)
          .leftJoin(
            userSkillVisibility,
            and(
              eq(userSkillVisibility.skillId, skillsTable.id),
              eq(userSkillVisibility.userId, ctx.user.id),
              eq(userSkillVisibility.visible, true)
            )
          )
          .where(eq(skillsTable.slug, input.skillId))
          .limit(1);

        if (accessCheck && !accessCheck.visibleByDefault && !accessCheck.hasAccess) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `Skill '${input.skillId}' is not available in your account.`,
          });
        }
      }

      // Merge dynamicParams with extraParams (dynamicParams takes precedence)
      const mergedExtraParams = {
        ...input.extraParams,
        ...input.dynamicParams,
      };

      // Validate dynamicParams if provided
      if (Object.keys(mergedExtraParams).length > 0) {
        const validationErrors = validateDynamicParams(mergedExtraParams, skill as any);
        if (validationErrors.length > 0) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Validation failed: ${validationErrors.join(', ')}`,
          });
        }
      }

      // Sync skill if SKILL.md has changed since last load (updates systemPrompt in DB)
      await syncSingleSkillIfChanged(input.skillId);

      // Check execution mode for LLM-based skills (enhance-prompt, llm-only)
      const executionMode = (skill as any).executionMode as string | undefined;
      const isLLMSkill = executionMode === "enhance-prompt" || executionMode === "llm-only";

      // Check if skill can be auto-executed
      // Python-mode skills are always executable (they handle their own subprocess)
      // LLM-based skills are handled below via executeWithFallback
      const isPythonMode = executionMode === "python";
      if (!isPythonMode && !isLLMSkill && !canAutoExecute(skill)) {
        return {
          success: false,
          skillId: input.skillId,
          type: "text" as const,
          error: `Skill '${skill.name}' cannot be automatically executed`,
          message: undefined as string | undefined,
          resultUrl: undefined as string | undefined,
          resultUrls: undefined as string[] | undefined,
        };
      }

      // ── LLM-based skills: call LLM with skill system prompt + user form data ──
      if (isLLMSkill) {
        const { getProviderForModel } = await import("../services/llmRouter");
        const { deductCreditsForModel } = await import("../services/creditService");

        // Load skill's systemPrompt and knowledgebase from DB
        const skillDb = await getDb();
        if (!skillDb) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Database not available",
          });
        }
        const [skillRow] = await skillDb
          .select({ systemPrompt: skillsTable.systemPrompt, knowledgebase: skillsTable.knowledgebase })
          .from(skillsTable)
          .where(eq(skillsTable.slug, input.skillId))
          .limit(1);

        // Build LLM messages
        const llmMessages: Array<{ role: string; content: string }> = [];
        let userPrompt = input.prompt || "";

        // For image_prompt_engineer, use the specialized prompt builder
        if (input.skillId === "image_prompt_engineer" || input.skillId === "create-image-prompt") {
          try {
            const { buildSystemPrompt, buildUserPrompt } = await import("../services/promptEnhancementService");
            const request = {
              userInput: mergedExtraParams.request || input.prompt || "",
              ...mergedExtraParams,
            };
            llmMessages.push({ role: "system", content: buildSystemPrompt(request) });
            userPrompt = buildUserPrompt(request);
          } catch (err) {
            console.error("[executeSkill] Failed to build prompt enhancement prompts:", err);
            // Fallback to generic skill system prompt
            if (skillRow?.systemPrompt) {
              llmMessages.push({ role: "system", content: skillRow.systemPrompt });
            }
          }
        } else {
          // Generic LLM skill: use DB systemPrompt + knowledgebase
          if (skillRow?.systemPrompt) {
            let sysPrompt = skillRow.systemPrompt.substring(0, 12000);
            if (skillRow.knowledgebase) {
              sysPrompt += `\n\n[DOMAIN KNOWLEDGE]\n${skillRow.knowledgebase.substring(0, 8000)}`;
            }
            llmMessages.push({ role: "system", content: sysPrompt });
          }

          // Format dynamicParams as additional context in the user prompt
          if (Object.keys(mergedExtraParams).length > 0) {
            const paramSummary = Object.entries(mergedExtraParams)
              .filter(([, v]) => v !== undefined && v !== null && v !== "")
              .map(([k, v]) => `- ${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
              .join("\n");
            if (paramSummary) {
              userPrompt += `\n\nForm inputs:\n${paramSummary}`;
            }
          }
        }

        llmMessages.push({ role: "user", content: userPrompt || `Use ${skill.name}` });

        // Determine model: use conversation model or a default
        let llmModel = "gpt-4o-mini";
        if (input.conversationId) {
          const conversation = await getConversationById(input.conversationId, ctx.user.id);
          if (conversation?.model) {
            llmModel = conversation.model;
          }
        }

        // Resolve provider using the same path as normal chat (with legacy fallback)
        const provider = await getProviderForModel(llmModel);
        if (!provider) {
          return {
            success: false,
            skillId: input.skillId,
            type: "text" as const,
            error: "No LLM provider available. Please check provider settings.",
            message: undefined as string | undefined,
            resultUrl: undefined as string | undefined,
            resultUrls: undefined as string[] | undefined,
          };
        }

        debugLog("Chat", `[executeSkill] LLM skill '${input.skillId}' mode='${executionMode}', model=${llmModel}, providerModel=${provider.providerModelId}, provider=${provider.providerName}`);

        try {
          // Call provider API directly (same approach as proxyChatWithCredits)
          const baseUrl = provider.baseUrl.replace(/\/+$/, "");
          const apiUrl = baseUrl.includes("/v1") ? `${baseUrl}/chat/completions` : `${baseUrl}/v1/chat/completions`;

          // Audit: log LLM skill request (scrub message content for PII)
          const skillStartTime = Date.now();
          auditLogger.log({
            eventType: "llm_request",
            userId: ctx.user.id,
            providerId: provider.providerId,
            providerName: provider.providerName,
            model: provider.providerModelId,
            requestType: "skill",
            requestPayload: {
              skillSlug: input.skillId,
              messageCount: llmMessages.length,
              messages: llmMessages.map((m) => ({
                role: m.role,
                contentLength: m.content.length,
              })),
            },
          });

          const llmResponse = await fetch(apiUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${provider.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: provider.providerModelId,
              messages: llmMessages,
              stream: false,
            }),
          });

          if (!llmResponse.ok) {
            const errorText = await llmResponse.text().catch(() => "Unknown error");
            console.error(`[executeSkill] LLM API error ${llmResponse.status}:`, errorText);
            auditLogger.log({
              eventType: "llm_response",
              userId: ctx.user.id,
              providerId: provider.providerId,
              providerName: provider.providerName,
              model: provider.providerModelId,
              requestType: "skill",
              statusCode: llmResponse.status,
              errorType: `http_${llmResponse.status}`,
              errorMessage: errorText.slice(0, 500),
              timing: { totalMs: Date.now() - skillStartTime },
            });
            return {
              success: false,
              skillId: input.skillId,
              type: "text" as const,
              error: `LLM API error (${llmResponse.status}): ${errorText.substring(0, 200)}`,
              message: undefined as string | undefined,
              resultUrl: undefined as string | undefined,
              resultUrls: undefined as string[] | undefined,
            };
          }

          const llmData = await llmResponse.json();
          const content = llmData?.choices?.[0]?.message?.content || "No response generated";
          const inputTokens = llmData?.usage?.prompt_tokens ?? 0;
          const outputTokens = llmData?.usage?.completion_tokens ?? 0;

          // Audit: log LLM skill response
          auditLogger.log({
            eventType: "llm_response",
            userId: ctx.user.id,
            providerId: provider.providerId,
            providerName: provider.providerName,
            model: provider.providerModelId,
            requestType: "skill",
            inputTokens,
            outputTokens,
            statusCode: 200,
            timing: { totalMs: Date.now() - skillStartTime },
            responsePayload: {
              usage: {
                prompt_tokens: inputTokens,
                completion_tokens: outputTokens,
              },
              contentLength: content.length,
              skillSlug: input.skillId,
            },
          });

          // Deduct credits
          const { creditsUsed } = await deductCreditsForModel({
            userId: ctx.user.id,
            model: llmModel,
            provider: provider.providerName,
            inputTokens,
            outputTokens,
            costUsd: llmData?.usage?.cost,
            conversationId: input.conversationId,
            skillSlug: input.skillId,
            sourceType: "skill",
          });

          // Save as assistant message in conversation
          if (input.conversationId) {
            try {
              await createMessage({
                conversationId: input.conversationId,
                role: "assistant",
                content,
                inputTokens,
                outputTokens,
                creditsUsed: creditsUsed.toString(),
                modelUsed: llmModel,
                skillUsed: input.skillId,
              });
            } catch (err) {
              console.error("[executeSkill] Failed to save LLM skill message:", err);
            }
          }

          return {
            success: true,
            skillId: input.skillId,
            type: "text" as const,
            message: content,
            creditsUsed,
            resultUrl: undefined as string | undefined,
            resultUrls: undefined as string[] | undefined,
            error: undefined as string | undefined,
          };
        } catch (err) {
          console.error("[executeSkill] LLM skill execution failed:", err);
          return {
            success: false,
            skillId: input.skillId,
            type: "text" as const,
            error: err instanceof Error ? err.message : "LLM skill execution failed",
            message: undefined as string | undefined,
            resultUrl: undefined as string | undefined,
            resultUrls: undefined as string[] | undefined,
          };
        }
      }

      // Use the user's session token for media generation (from context)
      // This ensures the Python backend receives a valid token signed with the same secret
      const userToken = ctx.userToken || createSkillToken(ctx.user.id);

      // Python skills: run asynchronously to prevent HTTP timeout (Cloudflare 100s limit).
      // We return a taskId immediately; the client polls chat.getSkillTaskResult until done.
      if (isPythonMode) {
        const skillParams = {
          prompt: input.prompt || "",
          model: input.model,
          aspectRatio: input.aspectRatio ?? (mergedExtraParams.aspectRatio as string | undefined),
          numImages: input.numImages ?? (mergedExtraParams.numImages !== undefined ? Number(mergedExtraParams.numImages) : undefined),
          duration: input.duration ?? (mergedExtraParams.duration !== undefined ? Number(mergedExtraParams.duration) : undefined),
          voice: input.voice,
          quality: (input.quality ?? mergedExtraParams.quality) as string | undefined,
          style: (input.style ?? mergedExtraParams.style) as string | undefined,
          referenceImageUrls: input.referenceImageUrls,
          referenceStyleUrl: input.referenceStyleUrl,
          resolution: input.resolution,
          apiConfig: input.apiConfig,
          extraParams: mergedExtraParams,
          publicUrl: ctx.publicUrl ?? undefined,
        };

        const userId = ctx.user.id;
        const { taskId } = await startPythonSkillTask(
          skill,
          skillParams,
          userId,
          userToken,
          async (result) => {
            // Post-process ISC create_skill actions
            if (result.success && result._action?.type === "create_skill") {
              const createResult = await handleIscCreateSkill(result._action, userId);
              return {
                ...result,
                message:
                  (result.message ?? "") +
                  (createResult.ok
                    ? `\n\n✅ **Skill saved** (id: ${createResult.skillId}) — visible in your Skills panel.`
                    : `\n\n⚠️ **Could not save skill**: ${createResult.reason}`),
              };
            }
            return result;
          },
        );

        return {
          success: true,
          skillId: input.skillId,
          type: "text" as const,
          isAsync: true,
          taskId,
          message: "⏳ กำลังประมวลผล — Python skill กำลังทำงานในพื้นหลัง กรุณารอสักครู่...",
          resultUrl: undefined as string | undefined,
          resultUrls: undefined as string[] | undefined,
        };
      }

      // Execute the skill (media generation and python skills)
      // When params come from a dynamic form (dynamicParams), they arrive in mergedExtraParams
      // rather than as top-level inputs. Fall back to mergedExtraParams values so form-submitted
      // aspectRatio, numImages, duration, quality, style are honoured.
      let result = await executeSkill(
        skill,
        {
          prompt: input.prompt || '',
          model: input.model,
          aspectRatio: input.aspectRatio ?? (mergedExtraParams.aspectRatio as string | undefined),
          numImages: input.numImages ?? (mergedExtraParams.numImages !== undefined ? Number(mergedExtraParams.numImages) : undefined),
          duration: input.duration ?? (mergedExtraParams.duration !== undefined ? Number(mergedExtraParams.duration) : undefined),
          voice: input.voice,
          quality: (input.quality ?? mergedExtraParams.quality) as string | undefined,
          style: (input.style ?? mergedExtraParams.style) as string | undefined,
          referenceImageUrls: input.referenceImageUrls,
          referenceStyleUrl: input.referenceStyleUrl,
          resolution: input.resolution,
          apiConfig: input.apiConfig,
          extraParams: mergedExtraParams,
          publicUrl: ctx.publicUrl ?? undefined,
        },
        ctx.user.id,
        userToken
      );

      // Handle sandbox job result -- return job ID for client polling
      if (result.type === "sandbox-job" && result.jobId) {
        if (input.conversationId) {
          try {
            await createMessage({
              conversationId: input.conversationId,
              role: "assistant",
              content: `Executing "${skill.name}" in a secure sandbox environment. Job ID: ${result.jobId}`,
              skillUsed: input.skillId,
            });
          } catch (err) {
            console.error("[executeSkill] Failed to save sandbox job message:", err);
          }
        }

        return {
          success: true,
          skillId: input.skillId,
          type: "sandbox-job" as const,
          jobId: result.jobId,
          message: result.message || "Job dispatched to secure sandbox",
          isAsync: true,
        };
      }

      // Handle structured actions from Python skills (e.g. ISC create_skill)
      if (result.success && result._action?.type === "create_skill") {
        const createResult = await handleIscCreateSkill(result._action, ctx.user.id);
        if (createResult.ok) {
          result = {
            ...result,
            message: (result.message ?? "") +
              `\n\n✅ **Skill saved** (id: ${createResult.skillId}) — visible in your Skills panel.`,
          };
        } else {
          result = {
            ...result,
            message: (result.message ?? "") +
              `\n\n⚠️ **Could not save skill**: ${createResult.reason}`,
          };
        }
      }

      // Persist the media result as an assistant message in the conversation
      if (input.conversationId && result.success) {
        try {
          let content = "";
          let attachments: MessageAttachment[] = [];

          if (result.type === "image" && result.resultUrls && result.resultUrls.length > 0) {
            content = `Generated image${result.resultUrls.length > 1 ? "s" : ""}:\n\n${result.resultUrls.map((url: string) => `![Generated Image](${url})`).join("\n\n")}`;
            attachments = result.resultUrls.map((url: string, i: number) => ({
              type: "image" as const,
              url,
              name: `generated-image-${i + 1}.png`,
            }));
          } else if (result.type === "video" && result.isAsync) {
            content = `Video generation started. ${result.message || ""}\n\nYou can check the progress in the Media History page.`;
          } else if (result.resultUrl) {
            content = result.type === "image"
              ? `Generated image:\n\n![Generated Image](${result.resultUrl})`
              : `Generated ${result.type}:\n\n[View ${result.type}](${result.resultUrl})`;
            if (result.type === "image") {
              attachments = [{ type: "image", url: result.resultUrl, name: "generated-image.png" }];
            }
          } else {
            content = result.message || "Media generated successfully!";
          }

          if (result.creditsUsed) {
            content += `\n\n*Credits used: ${result.creditsUsed}*`;
          }

          await createMessage({
            conversationId: input.conversationId,
            role: "assistant",
            content,
            attachments: attachments.length > 0 ? attachments : undefined,
            skillUsed: input.skillId,
            creditsUsed: result.creditsUsed ? String(result.creditsUsed) : undefined,
          });
        } catch (err) {
          console.error("[executeSkill] Failed to save media message:", err);
        }
      }

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
      // Use getSkillByIdOrType to support both skill IDs and skill types
      const skill = getSkillByIdOrType(input.skillId);

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

  /**
   * Add skill/media credits to conversation total
   * Called after skill execution (image/video/audio generation) to track usage
   */
  addSkillCreditsToConversation: protectedProcedure
    .input(
      z.object({
        conversationId: z.number(),
        creditsUsed: z.number().min(0),
        skillUsed: z.string().optional(),
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

      // Update conversation total credits
      if (input.creditsUsed > 0) {
        await updateConversationCredits(input.conversationId, input.creditsUsed);
        debugLog("Chat", "Added skill credits to conversation", {
          conversationId: input.conversationId,
          creditsUsed: input.creditsUsed,
          skillUsed: input.skillUsed,
        });
      }

      return { success: true, creditsAdded: input.creditsUsed };
    }),

  /**
   * Poll the result of an async Python skill task.
   * The task is stored in Redis by startPythonSkillTask().
   */
  getSkillTaskResult: protectedProcedure
    .input(z.object({ taskId: z.string().max(200) }))
    .query(async ({ ctx, input }) => {
      const { getRedisClient } = await import("../services/redis");
      const redis = getRedisClient();
      const raw = await redis.get(`skill:task:${input.taskId}`);
      if (!raw) {
        return { status: "not_found" as const, skillId: "", result: null };
      }
      const task = JSON.parse(raw) as {
        status: "running" | "done";
        skillId: string;
        userId: number;
        result?: SkillExecutionResult;
      };
      if (task.userId !== ctx.user.id) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Access denied" });
      }
      return {
        status: task.status,
        skillId: task.skillId,
        result: task.result ?? null,
      };
    }),
});
