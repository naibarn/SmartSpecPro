/**
 * Scheduled Messages Router
 *
 * CRUD operations for chat alerts / scheduled messages.
 */

import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "../db";
import { scheduledMessages, scheduledMessageLogs, userNotifications, notificationOccurrences } from "../../drizzle/schema";
import { eq, and, desc, sql, inArray, gte } from "drizzle-orm";
import { createScheduledJob, cancelScheduledJob, deliverScheduledMessage } from "../services/scheduler";
import { auditLogger } from "../services/auditLogger";
import { deductCreditsForModel } from "../services/creditService";
import { resolveEnabledLlmModelId } from "../services/enabledLlmModels";
import { getProviderForModel } from "../services/llmRouter";
import { runPlanner, recordStepAttempt } from "../services/taskPlannerMiddleware";

/**
 * Validates cron expression for security and rate limiting
 * Enforces minimum 15-minute interval to prevent resource exhaustion
 */
function validateCronExpression(cron: string): { valid: boolean; error?: string } {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return { valid: false, error: "Cron must have exactly 5 fields (min hour dom mon dow)" };

  const [min, hour] = parts;

  // Block every-minute patterns
  if (min === "*" && hour === "*") return { valid: false, error: "Cron runs too frequently (every minute). Minimum interval is 15 minutes." };

  // Block sub-15-minute intervals
  if (min.startsWith("*/")) {
    const interval = parseInt(min.slice(2), 10);
    if (!isNaN(interval) && interval < 15 && hour === "*") {
      return { valid: false, error: `Cron runs every ${interval} minutes. Minimum interval is 15 minutes.` };
    }
  }

  // Validate field ranges
  const ranges = [
    { name: "minute", min: 0, max: 59 },
    { name: "hour", min: 0, max: 23 },
    { name: "day of month", min: 1, max: 31 },
    { name: "month", min: 1, max: 12 },
    { name: "day of week", min: 0, max: 7 },
  ];

  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === "*") continue;
    if (field.startsWith("*/")) {
      const step = parseInt(field.slice(2), 10);
      if (isNaN(step) || step < 1) return { valid: false, error: `Invalid step in ${ranges[i].name}: ${field}` };
      continue;
    }
    // Allow ranges like "1-5", lists like "1,3,5", and single numbers
    const segments = field.split(",");
    for (const seg of segments) {
      const rangeParts = seg.split("-");
      for (const p of rangeParts) {
        const n = parseInt(p, 10);
        if (isNaN(n) || n < ranges[i].min || n > ranges[i].max) {
          return { valid: false, error: `Invalid value in ${ranges[i].name}: ${p} (must be ${ranges[i].min}-${ranges[i].max})` };
        }
      }
    }
  }

  return { valid: true };
}

function buildScheduleParseFallback(message: string) {
  const trimmed = message.trim();
  const description = trimmed.length > 120 ? `${trimmed.slice(0, 117)}...` : trimmed;
  return {
    prompt: trimmed,
    cronExpression: null,
    scheduledAt: null,
    isRecurring: false,
    emailNotify: true,
    description,
    timezone: "Asia/Bangkok",
  };
}

export const scheduledMessagesRouter = router({
  /**
   * Create a new scheduled message
   */
  create: protectedProcedure
    .input(z.object({
      prompt: z.string().min(1).max(5000),
      cronExpression: z.string().max(100).optional().nullable(),
      timezone: z.string().max(64).default("Asia/Bangkok"),
      scheduledAt: z.string().optional().nullable(), // ISO 8601
      isRecurring: z.boolean().default(false),
      modelId: z.string().max(128).optional().nullable(),
      skillId: z.string().max(100).optional().nullable(),
      dynamicParams: z.record(z.any()).optional().nullable(),
      emailNotify: z.boolean().default(true),
      description: z.string().max(500).optional().nullable(),
      conversationId: z.number().optional().nullable(),
      targetUserId: z.number().optional().nullable(),
      isSimpleReminder: z.boolean().default(false),
      priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });
      const resolvedModelId = input.isSimpleReminder
        ? undefined
        : (await resolveEnabledLlmModelId([input.modelId])) || undefined;

      // SECURITY: Authorization check for targetUserId
      if (input.targetUserId && input.targetUserId !== ctx.user.id) {
        if (ctx.user.role !== "admin" && ctx.user.role !== "domain_admin") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only admins can create schedules for other users" });
        }
      }

      // SECURITY: Validate cron expression to prevent DoS
      if (input.cronExpression) {
        const cronValidation = validateCronExpression(input.cronExpression);
        if (!cronValidation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: cronValidation.error || "Invalid cron expression" });
        }
      }

      // SECURITY: Enforce per-user schedule limit to prevent resource exhaustion
      const [{ count: existingCount }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scheduledMessages)
        .where(eq(scheduledMessages.userId, ctx.user.id));

      if (existingCount >= 50) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Maximum 50 schedules per user" });
      }

      const scheduledAtDate = input.scheduledAt ? new Date(input.scheduledAt) : null;

      // SECURITY: Validate scheduledAt date format and range
      if (scheduledAtDate) {
        if (isNaN(scheduledAtDate.getTime())) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid date format for scheduledAt" });
        }
        if (scheduledAtDate.getTime() < Date.now()) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledAt must be in the future" });
        }
        const oneYearFromNow = Date.now() + 365 * 24 * 60 * 60 * 1000;
        if (scheduledAtDate.getTime() > oneYearFromNow) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "scheduledAt cannot be more than 1 year in the future" });
        }
      }

      if (!input.cronExpression && !scheduledAtDate) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Either cronExpression or scheduledAt is required" });
      }

      // SECURITY: Credit check for LLM-powered schedules
      if (!input.isSimpleReminder) {
        const { hasEnoughCredits } = await import("../services/creditService");
        const enough = await hasEnoughCredits(ctx.user.id, 10);
        if (!enough) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Insufficient credits (minimum 10 required for LLM-powered schedule)" });
        }
      }

      // Insert into DB
      const [schedule] = await db.insert(scheduledMessages).values({
        userId: ctx.user.id,
        prompt: input.prompt,
        cronExpression: input.cronExpression || undefined,
        timezone: input.timezone,
        scheduledAt: scheduledAtDate,
        isRecurring: input.isRecurring,
        isSimpleReminder: input.isSimpleReminder,
        priority: input.priority,
        modelId: resolvedModelId,
        skillId: input.skillId || "chat-alert",
        dynamicParams: input.dynamicParams || undefined,
        emailNotify: input.emailNotify,
        description: input.description || undefined,
        conversationId: input.conversationId || undefined,
        targetUserId: input.targetUserId || undefined,
        status: "active",
      }).returning();

      // Create Cloud Tasks job
      try {
        const jobId = await createScheduledJob(
          schedule.id,
          input.cronExpression,
          scheduledAtDate
        );

        // Store Cloud Tasks task name (reuses bullmqJobId column)
        await db.update(scheduledMessages)
          .set({ bullmqJobId: jobId })
          .where(eq(scheduledMessages.id, schedule.id));
      } catch (err: any) {
        // Clean up DB record if job creation fails
        await db.delete(scheduledMessages).where(eq(scheduledMessages.id, schedule.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Failed to create schedule: ${err.message}` });
      }

      return {
        id: schedule.id,
        status: schedule.status,
        cronExpression: schedule.cronExpression,
        scheduledAt: schedule.scheduledAt?.toISOString(),
        description: schedule.description,
      };
    }),

  /**
   * List user's scheduled messages
   */
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
      offset: z.number().min(0).default(0),
      status: z.enum(["active", "paused", "completed", "failed"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database not available" });

      const conditions = [eq(scheduledMessages.userId, ctx.user.id)];
      if (input.status) {
        conditions.push(eq(scheduledMessages.status, input.status));
      }

      const items = await db
        .select()
        .from(scheduledMessages)
        .where(and(...conditions))
        .orderBy(desc(scheduledMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scheduledMessages)
        .where(and(...conditions));

      return { items, total: count };
    }),

  /**
   * Get single schedule detail
   */
  get: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [schedule] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });
      return schedule;
    }),

  /**
   * Update schedule
   */
  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      prompt: z.string().min(1).max(5000).optional(),
      cronExpression: z.string().max(100).optional().nullable(),
      scheduledAt: z.string().optional().nullable(),
      description: z.string().max(500).optional().nullable(),
      emailNotify: z.boolean().optional(),
      modelId: z.string().max(128).optional().nullable(),
      skillId: z.string().max(100).optional().nullable(),
      dynamicParams: z.record(z.any()).optional().nullable(),
      priority: z.enum(["low", "normal", "high", "critical"]).optional(),
      isSimpleReminder: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      // SECURITY: Validate cron expression to prevent DoS
      if (input.cronExpression !== undefined && input.cronExpression !== null) {
        const cronValidation = validateCronExpression(input.cronExpression);
        if (!cronValidation.valid) {
          throw new TRPCError({ code: "BAD_REQUEST", message: cronValidation.error || "Invalid cron expression" });
        }
      }

      const { id, ...updates } = input;
      const updateData: any = { ...updates, updatedAt: new Date() };
      if (updates.scheduledAt) updateData.scheduledAt = new Date(updates.scheduledAt);
      if (updates.modelId !== undefined) {
        updateData.modelId = updates.isSimpleReminder
          ? undefined
          : (await resolveEnabledLlmModelId([updates.modelId])) || undefined;
      }

      await db.update(scheduledMessages).set(updateData).where(eq(scheduledMessages.id, id));

      // Reschedule if cron or time changed
      if (updates.cronExpression !== undefined || updates.scheduledAt !== undefined) {
        await cancelScheduledJob(id, existing.bullmqJobId);
        const newCron = updates.cronExpression ?? existing.cronExpression;
        const newAt = updates.scheduledAt ? new Date(updates.scheduledAt) : existing.scheduledAt;
        const jobId = await createScheduledJob(id, newCron, newAt);
        await db.update(scheduledMessages).set({ bullmqJobId: jobId }).where(eq(scheduledMessages.id, id));
      }

      return { success: true };
    }),

  /**
   * Delete schedule
   */
  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await cancelScheduledJob(input.id, existing.bullmqJobId);
      await db.delete(scheduledMessages).where(eq(scheduledMessages.id, input.id));

      return { success: true };
    }),

  /**
   * Pause / Resume schedule
   */
  togglePause: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const newStatus = existing.status === "active" ? "paused" : "active";

      if (newStatus === "paused") {
        await cancelScheduledJob(input.id, existing.bullmqJobId);
      } else {
        const jobId = await createScheduledJob(input.id, existing.cronExpression, existing.scheduledAt);
        await db.update(scheduledMessages).set({ bullmqJobId: jobId }).where(eq(scheduledMessages.id, input.id));
      }

      await db.update(scheduledMessages)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(scheduledMessages.id, input.id));

      return { status: newStatus };
    }),

  /**
   * Skip the next run of a recurring schedule.
   */
  skipNextRun: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      const dynamicParams = { ...(existing.dynamicParams || {}) } as Record<string, unknown>;
      dynamicParams._skipUntil = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      await db.update(scheduledMessages)
        .set({ dynamicParams, updatedAt: new Date() })
        .where(eq(scheduledMessages.id, input.id));

      return { success: true };
    }),

  /**
   * Execute a schedule immediately.
   */
  triggerNow: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      const [existing] = await db
        .select()
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.id), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });

      await deliverScheduledMessage(input.id);
      return { success: true };
    }),

  /**
   * Bulk pause/resume/delete actions.
   */
  bulkAction: protectedProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(100),
      action: z.enum(["pause", "resume", "delete"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      let affected = 0;
      for (const id of input.ids) {
        const [existing] = await db
          .select()
          .from(scheduledMessages)
          .where(and(eq(scheduledMessages.id, id), eq(scheduledMessages.userId, ctx.user.id)))
          .limit(1);

        if (!existing) {
          continue;
        }

        if (input.action === "delete") {
          await cancelScheduledJob(id, existing.bullmqJobId);
          await db.delete(scheduledMessages).where(eq(scheduledMessages.id, id));
          affected += 1;
          continue;
        }

        if (input.action === "pause" && existing.status === "active") {
          await cancelScheduledJob(id, existing.bullmqJobId);
          await db.update(scheduledMessages)
            .set({ status: "paused", updatedAt: new Date() })
            .where(eq(scheduledMessages.id, id));
          affected += 1;
          continue;
        }

        if (input.action === "resume" && existing.status === "paused") {
          const jobId = await createScheduledJob(id, existing.cronExpression, existing.scheduledAt);
          await db.update(scheduledMessages)
            .set({ status: "active", bullmqJobId: jobId, updatedAt: new Date() })
            .where(eq(scheduledMessages.id, id));
          affected += 1;
        }
      }

      return { affected };
    }),

  /**
   * Aggregate execution analytics for a date range.
   */
  getAnalytics: protectedProcedure
    .input(z.object({ days: z.number().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) {
        return {
          totalRuns: 0,
          successRate: 0,
          totalCredits: 0,
          failureCount: 0,
          dailyStats: [],
        };
      }

      const scheduleIds = await db
        .select({ id: scheduledMessages.id })
        .from(scheduledMessages)
        .where(eq(scheduledMessages.userId, ctx.user.id));

      if (scheduleIds.length === 0) {
        return {
          totalRuns: 0,
          successRate: 0,
          totalCredits: 0,
          failureCount: 0,
          dailyStats: [],
        };
      }

      const since = new Date(Date.now() - (input.days * 24 * 60 * 60 * 1000));
      const logs = await db
        .select()
        .from(scheduledMessageLogs)
        .where(and(
          inArray(scheduledMessageLogs.scheduledMessageId, scheduleIds.map((row) => row.id)),
          gte(scheduledMessageLogs.executedAt, since),
        ))
        .orderBy(desc(scheduledMessageLogs.executedAt));

      const dailyMap = new Map<string, { date: string; runs: number; successes: number; failures: number }>();
      let totalRuns = 0;
      let successCount = 0;
      let failureCount = 0;
      let totalCredits = 0;

      for (const log of logs) {
        totalRuns += 1;
        const status = String(log.status ?? "").toLowerCase();
        const isSuccess = status === "success";
        if (isSuccess) {
          successCount += 1;
        } else {
          failureCount += 1;
        }
        totalCredits += Number(log.creditsUsed ?? 0);

        const date = log.executedAt.toISOString().slice(0, 10);
        const bucket = dailyMap.get(date) ?? { date, runs: 0, successes: 0, failures: 0 };
        bucket.runs += 1;
        if (isSuccess) {
          bucket.successes += 1;
        } else {
          bucket.failures += 1;
        }
        dailyMap.set(date, bucket);
      }

      return {
        totalRuns,
        successRate: totalRuns > 0 ? Math.round((successCount / totalRuns) * 100) : 0,
        totalCredits,
        failureCount,
        dailyStats: [...dailyMap.values()].sort((left, right) => left.date.localeCompare(right.date)),
      };
    }),

  /**
   * Get execution logs for a schedule
   */
  getLogs: protectedProcedure
    .input(z.object({
      scheduledMessageId: z.number(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      // Verify ownership
      const [schedule] = await db
        .select({ id: scheduledMessages.id })
        .from(scheduledMessages)
        .where(and(eq(scheduledMessages.id, input.scheduledMessageId), eq(scheduledMessages.userId, ctx.user.id)))
        .limit(1);

      if (!schedule) throw new TRPCError({ code: "NOT_FOUND" });

      const logs = await db
        .select()
        .from(scheduledMessageLogs)
        .where(eq(scheduledMessageLogs.scheduledMessageId, input.scheduledMessageId))
        .orderBy(desc(scheduledMessageLogs.executedAt))
        .limit(input.limit);

      return logs;
    }),

  /**
   * Get unread notifications count
   */
  getNotificationCount: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return { count: 0 };

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, ctx.user.id),
        eq(userNotifications.isRead, false)
      ));

    return { count };
  }),

  /**
   * Get unread high/critical priority notifications (for full-screen modal)
   */
  getUrgentReminders: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];

    return db
      .select({
        id: userNotifications.id,
        title: userNotifications.title,
        content: userNotifications.content,
        priority: userNotifications.priority,
        createdAt: userNotifications.createdAt,
        scheduledMessageId: userNotifications.scheduledMessageId,
        conversationId: userNotifications.conversationId,
        actionUrl: userNotifications.actionUrl,
        actionLabel: userNotifications.actionLabel,
        groupKey: userNotifications.groupKey,
        relatedResourceType: userNotifications.relatedResourceType,
        relatedResourceId: userNotifications.relatedResourceId,
        metadata: userNotifications.metadata,
      })
      .from(userNotifications)
      .where(and(
        eq(userNotifications.userId, ctx.user.id),
        eq(userNotifications.isRead, false),
        inArray(userNotifications.priority, ["high", "critical"])
      ))
      .orderBy(desc(userNotifications.createdAt))
      .limit(5);
  }),

  /**
   * Get recent notifications
   */
  getNotifications: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];

      return db
        .select()
        .from(userNotifications)
        .where(eq(userNotifications.userId, ctx.user.id))
        .orderBy(desc(userNotifications.createdAt))
        .limit(input.limit);
    }),

  /**
   * Get notification history with filtering — supports full history page
   */
  getNotificationHistory: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
      type: z.enum(["scheduled_message", "follow_request", "alert", "system"]).optional(),
      priority: z.enum(["low", "normal", "high", "critical"]).optional(),
      readState: z.enum(["all", "unread", "read"]).default("all"),
      showDismissed: z.boolean().default(false),
      search: z.string().max(200).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { items: [], total: 0 };

      const conditions = [eq(userNotifications.userId, ctx.user.id)];

      if (input.type) {
        conditions.push(eq(userNotifications.type, input.type));
      }
      if (input.priority) {
        conditions.push(eq(userNotifications.priority, input.priority));
      }
      if (input.readState === "unread") {
        conditions.push(eq(userNotifications.isRead, false));
      } else if (input.readState === "read") {
        conditions.push(eq(userNotifications.isRead, true));
      }
      if (!input.showDismissed) {
        conditions.push(eq(userNotifications.isDismissed, false));
      }
      if (input.search) {
        conditions.push(
          sql`(${userNotifications.title} ILIKE ${"%" + input.search + "%"} OR ${userNotifications.content} ILIKE ${"%" + input.search + "%"})`
        );
      }

      const whereClause = and(...conditions);

      const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userNotifications)
        .where(whereClause);

      const items = await db
        .select()
        .from(userNotifications)
        .where(whereClause)
        .orderBy(desc(userNotifications.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { items, total: countResult.count };
    }),

  /**
   * Dismiss a notification (separate from mark as read)
   */
  dismissNotification: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(userNotifications)
        .set({ isDismissed: true, isRead: true })
        .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Mark notification as read
   */
  markRead: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

      await db.update(userNotifications)
        .set({ isRead: true })
        .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, ctx.user.id)));

      return { success: true };
    }),

  /**
   * Mark all notifications as read
   */
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });

    await db.update(userNotifications)
      .set({ isRead: true })
      .where(and(eq(userNotifications.userId, ctx.user.id), eq(userNotifications.isRead, false)));

    return { success: true };
  }),

  /**
   * Parse schedule intent from natural language using LLM
   */
  parseIntent: protectedProcedure
    .input(z.object({
      message: z.string().min(1).max(5000),
      model: z.string().max(128).optional(),
      sourceType: z.enum(["chat", "scheduler"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Use the LLM to parse scheduling intent
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const fallback = buildScheduleParseFallback(input.message);
      const billingSourceType = input.sourceType === "chat" ? "chat" : "scheduler";
      const auditRequestType = input.sourceType === "chat" ? "chat" : "scheduler";

      // Run planner (returns null if disabled — zero overhead)
      const plannerResult = await runPlanner({
        sourceType: "scheduled",
        userId: ctx.user.id,
        tenantId: ctx.tenantId || "default",
        conversationModel: input.model,
      });

      let model: string | null;
      if (plannerResult?.resolvedModel) {
        model = plannerResult.resolvedModel;
      } else {
        model = await resolveEnabledLlmModelId([input.model]);
      }
      if (!model) {
        return fallback;
      }
      const provider = await getProviderForModel(model);
      if (!provider) {
        return fallback;
      }
      const apiKey = provider.apiKey;

      const systemPrompt = `You are a scheduling assistant. Parse the user's scheduling intent and return ONLY a valid JSON object:
{
  "prompt": "The actual question/task to execute at the scheduled time",
  "cronExpression": "cron expression (5 fields: min hour dom mon dow) or null",
  "scheduledAt": "ISO 8601 datetime for one-time or null",
  "isRecurring": true/false,
  "emailNotify": true,
  "description": "Short human-readable description",
  "timezone": "Asia/Bangkok"
}

Cron: 0 8 * * * = daily 8AM, 0 8 * * 1-5 = weekdays 8AM, 0 */2 * * * = every 2h
For reminders, set scheduledAt 30 min before the event.
Return ONLY the JSON, no markdown, no explanation.`;

      // Audit: log scheduled message LLM request
      const schedStartTime = Date.now();
      auditLogger.log({
        eventType: "llm_request",
        userId: ctx.user.id,
        providerName: provider.providerName,
        model,
        requestType: auditRequestType,
        requestPayload: {
          messageCount: 2,
          messages: [
            { role: "system", contentLength: systemPrompt.length },
            { role: "user", contentLength: input.message.length },
          ],
        },
      });

      let response: Response;
      try {
        response = await fetch(`${provider.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: input.message },
            ],
            temperature: 0.1,
          }),
        });
      } catch (error) {
        auditLogger.log({
          eventType: "llm_response",
          userId: ctx.user.id,
          providerName: provider.providerName,
          model,
          requestType: auditRequestType,
          errorType: "network_error",
          errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Unknown scheduler parse fetch error",
          timing: { totalMs: Date.now() - schedStartTime },
        });
        return fallback;
      }

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        auditLogger.log({
          eventType: "llm_response",
          userId: ctx.user.id,
          providerName: provider.providerName,
          model,
          requestType: auditRequestType,
          statusCode: response.status,
          errorType: `http_${response.status}`,
          errorMessage: errText.slice(0, 500),
          timing: { totalMs: Date.now() - schedStartTime },
        });
        return fallback;
      }

      const data = await response.json().catch(() => null) as any;
      const content = data?.choices?.[0]?.message?.content || "";
      const inputTokens = data?.usage?.prompt_tokens ?? 0;
      const outputTokens = data?.usage?.completion_tokens ?? 0;

      // Audit: log scheduled message LLM response
      auditLogger.log({
        eventType: "llm_response",
        userId: ctx.user.id,
        providerName: provider.providerName,
        model,
        requestType: auditRequestType,
        inputTokens,
        outputTokens,
        statusCode: 200,
        timing: { totalMs: Date.now() - schedStartTime },
        responsePayload: {
          usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens },
          contentLength: content.length,
        },
      });

      // Deduct credits for the LLM call (was missing — free usage gap)
      try {
        await deductCreditsForModel({
          userId: ctx.user.id,
          model,
          provider: provider.providerName,
          inputTokens,
          outputTokens,
          sourceType: billingSourceType,
          metadata: {
            operation: "schedule_intent_parse",
            initiatedFrom: input.sourceType ?? "scheduler",
          },
        });
      } catch (err) {
        // Non-blocking — don't fail the schedule parse if credit deduction fails
        console.error("[parseIntent] Credit deduction failed:", err);
      }

      // Record step attempt for planner telemetry
      if (plannerResult) {
        recordStepAttempt({
          taskRunId: plannerResult.taskRunId,
          plan: plannerResult.plan,
          model,
          provider: provider.providerName,
          inputTokens,
          outputTokens,
          snapshot: plannerResult.snapshot,
        }).catch(() => {}); // fire-and-forget
      }

      try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) throw new Error("No JSON found");
        const parsed = JSON.parse(jsonMatch[0]);
        return parsed;
      } catch {
        return fallback;
      }
    }),

  getGroupOccurrences: protectedProcedure
    .input(z.object({
      notificationId: z.number().int().positive(),
      limit: z.number().int().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      // Ownership check — verify the notification belongs to the current user
      const [notification] = await db
        .select({ id: userNotifications.id, userId: userNotifications.userId })
        .from(userNotifications)
        .where(eq(userNotifications.id, input.notificationId));

      if (!notification || notification.userId !== ctx.user.id) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
      }

      // Query occurrences ordered by time DESC
      const occurrences = await db
        .select({
          id: notificationOccurrences.id,
          content: notificationOccurrences.content,
          metadata: notificationOccurrences.metadata,
          occurredAt: notificationOccurrences.occurredAt,
        })
        .from(notificationOccurrences)
        .where(eq(notificationOccurrences.notificationId, input.notificationId))
        .orderBy(desc(notificationOccurrences.occurredAt))
        .limit(input.limit);

      return occurrences.map((o) => ({
        ...o,
        occurredAt: o.occurredAt.toISOString(),
      }));
    }),
});
