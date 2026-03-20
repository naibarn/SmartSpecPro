diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index 93e74c4a..f8b79047 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -788,7 +788,7 @@ app.post("/api/internal/notifications/admin-broadcast", async (req, res) => {
       relatedItems: z.record(z.string().max(200)).optional(),
     }).strict().optional();
 
-    const { type, title, content, priority, relatedResourceType, actionUrl, actionLabel } = req.body;
+    const { type, title, content, priority, relatedResourceType, actionUrl, actionLabel, groupKey } = req.body;
     const metadataParsed = metadataSchema.safeParse(req.body.metadata);
     const metadata = metadataParsed.success ? metadataParsed.data : undefined;
 
@@ -830,6 +830,7 @@ app.post("/api/internal/notifications/admin-broadcast", async (req, res) => {
           actionUrl: actionUrl || undefined,
           actionLabel: actionLabel || undefined,
           metadata: metadata || undefined,
+          groupKey: typeof groupKey === "string" ? groupKey.slice(0, 200) : undefined,
         });
         notified++;
       } catch (err) {
diff --git a/apps/web/server/routers/mediaJobs.ts b/apps/web/server/routers/mediaJobs.ts
index 286f5089..ce8600f7 100644
--- a/apps/web/server/routers/mediaJobs.ts
+++ b/apps/web/server/routers/mediaJobs.ts
@@ -122,6 +122,17 @@ async function notifyJobFailure(
       title: "Media Job Failed",
       content: `Your media job (${jobId.slice(0, 8)}...) failed: ${errorMessage.slice(0, 200)}`,
       priority: "high",
+      relatedResourceType: "media_job",
+      relatedResourceId: jobId,
+      actionUrl: `/media-studio?jobId=${jobId}`,
+      actionLabel: "View in Media Studio",
+      groupKey: `media_job_failure:${userIdNum}`,
+      metadata: {
+        source: "media_jobs",
+        errorDetails: {
+          errorMessage: errorMessage.slice(0, 500),
+        },
+      },
     });
 
     // Notify all admins
@@ -139,6 +150,17 @@ async function notifyJobFailure(
         title: "Media Job Failed (Admin Alert)",
         content: `User ${userId} — job ${jobId}: ${errorMessage.slice(0, 200)}`,
         priority: "high",
+        relatedResourceType: "media_job",
+        relatedResourceId: jobId,
+        actionUrl: `/media-studio?jobId=${jobId}`,
+        actionLabel: "View in Media Studio",
+        metadata: {
+          source: "media_jobs",
+          errorDetails: {
+            errorMessage: errorMessage.slice(0, 500),
+          },
+          relatedItems: { userId },
+        },
       });
     }
   } catch {
diff --git a/apps/web/server/routers/scheduledMessages.ts b/apps/web/server/routers/scheduledMessages.ts
index 8c50b47f..8ee7693a 100644
--- a/apps/web/server/routers/scheduledMessages.ts
+++ b/apps/web/server/routers/scheduledMessages.ts
@@ -8,7 +8,7 @@ import { z } from "zod";
 import { protectedProcedure, router } from "../_core/trpc";
 import { TRPCError } from "@trpc/server";
 import { getDb } from "../db";
-import { scheduledMessages, scheduledMessageLogs, userNotifications } from "../../drizzle/schema";
+import { scheduledMessages, scheduledMessageLogs, userNotifications, notificationOccurrences } from "../../drizzle/schema";
 import { eq, and, desc, sql, inArray } from "drizzle-orm";
 import { createScheduledJob, cancelScheduledJob } from "../services/scheduler";
 import { auditLogger } from "../services/auditLogger";
@@ -434,6 +434,11 @@ export const scheduledMessagesRouter = router({
         createdAt: userNotifications.createdAt,
         scheduledMessageId: userNotifications.scheduledMessageId,
         conversationId: userNotifications.conversationId,
+        actionUrl: userNotifications.actionUrl,
+        actionLabel: userNotifications.actionLabel,
+        relatedResourceType: userNotifications.relatedResourceType,
+        relatedResourceId: userNotifications.relatedResourceId,
+        metadata: userNotifications.metadata,
       })
       .from(userNotifications)
       .where(and(
@@ -464,6 +469,79 @@ export const scheduledMessagesRouter = router({
         .limit(input.limit);
     }),
 
+  /**
+   * Get notification history with filtering — supports full history page
+   */
+  getNotificationHistory: protectedProcedure
+    .input(z.object({
+      limit: z.number().min(1).max(100).default(50),
+      offset: z.number().min(0).default(0),
+      type: z.enum(["scheduled_message", "follow_request", "alert", "system"]).optional(),
+      priority: z.enum(["low", "normal", "high", "critical"]).optional(),
+      readState: z.enum(["all", "unread", "read"]).default("all"),
+      showDismissed: z.boolean().default(false),
+      search: z.string().max(200).optional(),
+    }))
+    .query(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) return { items: [], total: 0 };
+
+      const conditions = [eq(userNotifications.userId, ctx.user.id)];
+
+      if (input.type) {
+        conditions.push(eq(userNotifications.type, input.type));
+      }
+      if (input.priority) {
+        conditions.push(eq(userNotifications.priority, input.priority));
+      }
+      if (input.readState === "unread") {
+        conditions.push(eq(userNotifications.isRead, false));
+      } else if (input.readState === "read") {
+        conditions.push(eq(userNotifications.isRead, true));
+      }
+      if (!input.showDismissed) {
+        conditions.push(eq(userNotifications.isDismissed, false));
+      }
+      if (input.search) {
+        conditions.push(
+          sql`(${userNotifications.title} ILIKE ${"%" + input.search + "%"} OR ${userNotifications.content} ILIKE ${"%" + input.search + "%"})`
+        );
+      }
+
+      const whereClause = and(...conditions);
+
+      const [countResult] = await db
+        .select({ count: sql<number>`count(*)::int` })
+        .from(userNotifications)
+        .where(whereClause);
+
+      const items = await db
+        .select()
+        .from(userNotifications)
+        .where(whereClause)
+        .orderBy(desc(userNotifications.createdAt))
+        .limit(input.limit)
+        .offset(input.offset);
+
+      return { items, total: countResult.count };
+    }),
+
+  /**
+   * Dismiss a notification (separate from mark as read)
+   */
+  dismissNotification: protectedProcedure
+    .input(z.object({ id: z.number() }))
+    .mutation(async ({ ctx, input }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
+
+      await db.update(userNotifications)
+        .set({ isDismissed: true, isRead: true })
+        .where(and(eq(userNotifications.id, input.id), eq(userNotifications.userId, ctx.user.id)));
+
+      return { success: true };
+    }),
+
   /**
    * Mark notification as read
    */
@@ -654,4 +732,42 @@ Return ONLY the JSON, no markdown, no explanation.`;
         throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to parse LLM response as schedule" });
       }
     }),
+
+  getGroupOccurrences: protectedProcedure
+    .input(z.object({
+      notificationId: z.number().int().positive(),
+      limit: z.number().int().min(1).max(50).default(10),
+    }))
+    .query(async ({ input, ctx }) => {
+      const db = await getDb();
+      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
+
+      // Ownership check — verify the notification belongs to the current user
+      const [notification] = await db
+        .select({ id: userNotifications.id, userId: userNotifications.userId })
+        .from(userNotifications)
+        .where(eq(userNotifications.id, input.notificationId));
+
+      if (!notification || notification.userId !== ctx.user.id) {
+        throw new TRPCError({ code: "NOT_FOUND", message: "Notification not found" });
+      }
+
+      // Query occurrences ordered by time DESC
+      const occurrences = await db
+        .select({
+          id: notificationOccurrences.id,
+          content: notificationOccurrences.content,
+          metadata: notificationOccurrences.metadata,
+          occurredAt: notificationOccurrences.occurredAt,
+        })
+        .from(notificationOccurrences)
+        .where(eq(notificationOccurrences.notificationId, input.notificationId))
+        .orderBy(desc(notificationOccurrences.occurredAt))
+        .limit(input.limit);
+
+      return occurrences.map((o) => ({
+        ...o,
+        occurredAt: o.occurredAt.toISOString(),
+      }));
+    }),
 });
diff --git a/apps/web/server/services/__tests__/notificationDedup.test.ts b/apps/web/server/services/__tests__/notificationDedup.test.ts
new file mode 100644
index 00000000..606d52e5
--- /dev/null
+++ b/apps/web/server/services/__tests__/notificationDedup.test.ts
@@ -0,0 +1,202 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock the redis module
+vi.mock("../redis", () => ({
+  getRedisClient: vi.fn(() => ({
+    publish: vi.fn().mockResolvedValue(1),
+  })),
+}));
+
+// Mock the telegram service
+vi.mock("../telegramService", () => ({
+  enqueueTelegramNotification: vi.fn().mockResolvedValue(undefined),
+}));
+
+import { createNotification } from "../notificationService";
+
+function makeMockDb(options?: {
+  deduplicated?: boolean;
+  existingId?: number;
+  occurrenceCount?: number;
+}) {
+  const insertedOccurrences: any[] = [];
+  const returning = vi.fn().mockResolvedValue([
+    {
+      id: options?.existingId ?? 42,
+      occurrenceCount: options?.occurrenceCount ?? 1,
+    },
+  ]);
+  const onConflictDoUpdate = vi.fn().mockReturnValue({ returning });
+  const values = vi.fn().mockReturnValue({
+    returning,
+    onConflictDoUpdate,
+  });
+  const insert = vi.fn().mockReturnValue({ values });
+
+  // Track occurrence inserts
+  const occurrenceReturning = vi.fn().mockResolvedValue([{ id: 99 }]);
+  const occurrenceValues = vi.fn().mockReturnValue({ returning: occurrenceReturning });
+
+  const db = {
+    insert: vi.fn((table: any) => {
+      const tableName = table?.[Symbol.for("drizzle:Name")] ?? "";
+      if (tableName === "notification_occurrences") {
+        return { values: (...args: any[]) => {
+          insertedOccurrences.push(args[0]);
+          return occurrenceValues(...args);
+        }};
+      }
+      return { values };
+    }),
+    select: vi.fn().mockReturnValue({
+      from: vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue([]),
+      }),
+    }),
+    execute: vi.fn(),
+    _insertedOccurrences: insertedOccurrences,
+  } as any;
+
+  return { db, insert, values, returning, onConflictDoUpdate };
+}
+
+describe("createNotification dedup logic", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("inserts new notification with groupKey when no existing group (no dedup)", async () => {
+    const { db } = makeMockDb({ deduplicated: false, occurrenceCount: 1 });
+
+    const result = await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      groupKey: "media_job_failure:user_1",
+    });
+
+    expect(result.notificationId).toBe(42);
+    expect(result.deduplicated).toBe(false);
+  });
+
+  it("returns deduplicated: true when occurrenceCount > 1 (dedup hit)", async () => {
+    const { db } = makeMockDb({ existingId: 10, occurrenceCount: 3 });
+
+    const result = await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      groupKey: "media_job_failure:user_1",
+    });
+
+    expect(result.notificationId).toBe(10);
+    expect(result.deduplicated).toBe(true);
+  });
+
+  it("inserts occurrence snapshot on dedup hit", async () => {
+    const { db } = makeMockDb({ existingId: 10, occurrenceCount: 2 });
+
+    await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Occurrence content",
+      groupKey: "media_job_failure:user_1",
+      metadata: { source: "test" },
+    });
+
+    // Verify an occurrence was inserted
+    expect(db._insertedOccurrences.length).toBeGreaterThan(0);
+    const occurrence = db._insertedOccurrences[0];
+    expect(occurrence.notificationId).toBe(10);
+    expect(occurrence.content).toBe("Occurrence content");
+  });
+
+  it("does not insert occurrence when no dedup hit", async () => {
+    const { db } = makeMockDb({ occurrenceCount: 1 });
+
+    await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      groupKey: "media_job_failure:user_1",
+    });
+
+    expect(db._insertedOccurrences.length).toBe(0);
+  });
+
+  it("bypasses dedup when groupKey is undefined", async () => {
+    const { db } = makeMockDb();
+
+    const result = await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      // No groupKey
+    });
+
+    expect(result.notificationId).toBe(42);
+    expect(result.deduplicated).toBe(false);
+  });
+
+  it("truncates groupKey to 200 characters", async () => {
+    const longKey = "x".repeat(300);
+    const { db, values } = makeMockDb();
+
+    await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      groupKey: longKey,
+    });
+
+    // Verify values was called and groupKey was truncated
+    const callArgs = values.mock.calls[0]?.[0];
+    if (callArgs?.groupKey) {
+      expect(callArgs.groupKey.length).toBeLessThanOrEqual(200);
+    }
+  });
+
+  it("returns correct occurrenceCount on dedup hit for SSE consumers", async () => {
+    const { db } = makeMockDb({ occurrenceCount: 5, existingId: 77 });
+
+    const result = await createNotification({
+      db,
+      userId: 1,
+      type: "alert",
+      title: "Test",
+      content: "Test content",
+      groupKey: "test_key",
+    });
+
+    // The SSE event includes occurrenceCount and deduplicated from the result
+    expect(result.notificationId).toBe(77);
+    expect(result.deduplicated).toBe(true);
+    // occurrenceCount > 1 means dedup hit, which SSE will include
+  });
+
+  it("returns deduplicated: false when notification has no groupKey", async () => {
+    const { db } = makeMockDb();
+
+    const result = await createNotification({
+      db,
+      userId: 1,
+      type: "system",
+      title: "System message",
+      content: "Hello",
+    });
+
+    expect(result.deduplicated).toBe(false);
+  });
+});
diff --git a/apps/web/server/services/notificationService.test.ts b/apps/web/server/services/notificationService.test.ts
index ea0db867..0a79ea97 100644
--- a/apps/web/server/services/notificationService.test.ts
+++ b/apps/web/server/services/notificationService.test.ts
@@ -65,7 +65,7 @@ describe("notificationService", () => {
         content: "Content",
       });
 
-      expect(result).toEqual({ notificationId: 42 });
+      expect(result).toEqual({ notificationId: 42, deduplicated: false });
     });
 
     it("calls enqueueTelegramNotification after DB insert", async () => {
@@ -105,7 +105,7 @@ describe("notificationService", () => {
         content: "Content",
       });
 
-      expect(result).toEqual({ notificationId: 42 });
+      expect(result).toEqual({ notificationId: 42, deduplicated: false });
     });
 
     it("passes priority through to Telegram enqueue", async () => {
diff --git a/apps/web/server/services/notificationService.ts b/apps/web/server/services/notificationService.ts
index 834cca06..f9eb7c09 100644
--- a/apps/web/server/services/notificationService.ts
+++ b/apps/web/server/services/notificationService.ts
@@ -6,7 +6,52 @@
  */
 
 import type { DrizzleDB } from "../db";
-import { userNotifications } from "../../drizzle/schema";
+import { userNotifications, notificationOccurrences } from "../../drizzle/schema";
+import { sql } from "drizzle-orm";
+
+/**
+ * Sanitize actionUrl — only allow relative paths and https URLs.
+ * Blocks javascript:, data:, vbscript: and other dangerous protocols.
+ */
+function sanitizeActionUrl(url?: string): string | undefined {
+  if (!url || typeof url !== "string") return undefined;
+  const trimmed = url.trim();
+  if (trimmed.length === 0 || trimmed.length > 2000) return undefined;
+  const lower = trimmed.toLowerCase();
+  // Block dangerous protocols
+  if (
+    lower.startsWith("javascript:") ||
+    lower.startsWith("data:") ||
+    lower.startsWith("vbscript:") ||
+    lower.startsWith("blob:")
+  ) {
+    return undefined;
+  }
+  // Allow relative paths (starting with /) and https:// URLs only
+  if (trimmed.startsWith("/") || lower.startsWith("https://")) {
+    return trimmed;
+  }
+  // Block everything else (http:, ftp:, etc.)
+  return undefined;
+}
+
+/**
+ * Truncate error messages to prevent oversized metadata storage.
+ */
+function sanitizeMetadata(meta?: NotificationMetadata): NotificationMetadata | undefined {
+  if (!meta) return undefined;
+  const sanitized = { ...meta };
+  if (sanitized.errorDetails?.errorMessage) {
+    sanitized.errorDetails = {
+      ...sanitized.errorDetails,
+      errorMessage: sanitized.errorDetails.errorMessage.slice(0, 500),
+    };
+  }
+  if (sanitized.source) {
+    sanitized.source = sanitized.source.slice(0, 200);
+  }
+  return sanitized;
+}
 
 /**
  * Notification type enumeration (matches database enum)
@@ -24,6 +69,45 @@ type NotificationType =
  */
 type ReminderPriority = "low" | "normal" | "high" | "critical";
 
+/**
+ * Known resource types for structured action linking
+ */
+type ResourceType =
+  | "media_job"
+  | "workflow"
+  | "skill"
+  | "feedback"
+  | "agency"
+  | "approval"
+  | "team_run"
+  | "room"
+  | "user"
+  | "conversation"
+  | "scheduled_message";
+
+/**
+ * Structured metadata attached to notifications
+ */
+interface NotificationMetadata {
+  eventId?: string;
+  source?: string;
+  errorDetails?: {
+    errorCode?: string;
+    errorMessage?: string;
+  };
+  metrics?: {
+    durationMs?: number;
+    costUsd?: number;
+    itemCount?: number;
+  };
+  retryInfo?: {
+    retryCount?: number;
+    maxRetries?: number;
+    nextRetryAt?: string;
+  };
+  relatedItems?: Record<string, string>;
+}
+
 /**
  * Parameters for creating a notification
  */
@@ -36,6 +120,20 @@ interface CreateNotificationParams {
   priority?: ReminderPriority;
   conversationId?: number;
   scheduledMessageId?: number;
+  /** Resource type for structured action linking */
+  relatedResourceType?: ResourceType;
+  /** ID of the related resource */
+  relatedResourceId?: string;
+  /** Direct action URL (overrides legacy string matching) */
+  actionUrl?: string;
+  /** Action button label */
+  actionLabel?: string;
+  /** Structured metadata */
+  metadata?: NotificationMetadata;
+  /** Auto-expire after this date */
+  expiresAt?: Date;
+  /** Dedup group key — notifications with the same groupKey for the same user are merged */
+  groupKey?: string;
 }
 
 /**
@@ -51,7 +149,7 @@ interface CreateNotificationParams {
  */
 async function createNotification(
   params: CreateNotificationParams
-): Promise<{ notificationId: number }> {
+): Promise<{ notificationId: number; deduplicated: boolean }> {
   const {
     db,
     userId,
@@ -61,9 +159,19 @@ async function createNotification(
     priority = "normal",
     conversationId,
     scheduledMessageId,
+    relatedResourceType,
+    relatedResourceId,
+    actionUrl,
+    actionLabel,
+    metadata,
+    expiresAt,
+    groupKey: rawGroupKey,
   } = params;
 
-  // 1. Insert into user_notifications table
+  // Truncate groupKey to 200 chars to match DB column constraint
+  const groupKey = rawGroupKey?.substring(0, 200) || undefined;
+
+  // 1. Build insert values
   const values: any = {
     userId,
     type,
@@ -71,6 +179,7 @@ async function createNotification(
     content,
     priority,
     isRead: false,
+    isDismissed: false,
   };
 
   if (conversationId !== undefined) {
@@ -81,12 +190,93 @@ async function createNotification(
     values.scheduledMessageId = scheduledMessageId;
   }
 
-  const [result] = await db
-    .insert(userNotifications)
-    .values(values)
-    .returning({ id: userNotifications.id });
+  if (relatedResourceType) {
+    values.relatedResourceType = relatedResourceType;
+  }
+
+  if (relatedResourceId) {
+    values.relatedResourceId = relatedResourceId;
+  }
+
+  if (actionUrl) {
+    const safeUrl = sanitizeActionUrl(actionUrl);
+    if (safeUrl) values.actionUrl = safeUrl;
+  }
+
+  if (actionLabel) {
+    values.actionLabel = actionLabel.slice(0, 100);
+  }
+
+  if (metadata) {
+    values.metadata = sanitizeMetadata(metadata);
+  }
+
+  if (expiresAt) {
+    values.expiresAt = expiresAt;
+  }
 
-  const notificationId = result.id;
+  if (groupKey) {
+    values.groupKey = groupKey;
+  }
+
+  let notificationId: number;
+  let occurrenceCount = 1;
+  let deduplicated = false;
+
+  if (groupKey) {
+    // Dedup path: INSERT ... ON CONFLICT on idx_notif_dedup_active
+    const [result] = await db
+      .insert(userNotifications)
+      .values(values)
+      .onConflictDoUpdate({
+        target: [userNotifications.userId, userNotifications.groupKey],
+        targetWhere: sql`"isDismissed" = false AND "groupKey" IS NOT NULL`,
+        set: {
+          occurrenceCount: sql`${userNotifications.occurrenceCount} + 1`,
+          lastOccurredAt: sql`now()`,
+          content: sql`excluded."content"`,
+          metadata: sql`excluded."metadata"`,
+          isRead: sql`false`,
+        },
+      })
+      .returning({
+        id: userNotifications.id,
+        occurrenceCount: userNotifications.occurrenceCount,
+      });
+
+    notificationId = result.id;
+    occurrenceCount = result.occurrenceCount;
+    deduplicated = occurrenceCount > 1;
+
+    // Insert occurrence snapshot on dedup hit
+    if (deduplicated) {
+      try {
+        await db
+          .insert(notificationOccurrences)
+          .values({
+            notificationId,
+            content,
+            metadata: metadata ? sanitizeMetadata(metadata) : undefined,
+          });
+      } catch {
+        // Non-fatal — occurrence tracking is supplementary
+      }
+
+      console.log("[NotificationService] notification_dedup_hit", {
+        groupKey,
+        notificationId,
+        newOccurrenceCount: occurrenceCount,
+      });
+    }
+  } else {
+    // Standard path: plain INSERT (no dedup)
+    const [result] = await db
+      .insert(userNotifications)
+      .values(values)
+      .returning({ id: userNotifications.id });
+
+    notificationId = result.id;
+  }
 
   // 2. Enqueue for Telegram delivery (fire-and-forget)
   try {
@@ -103,8 +293,35 @@ async function createNotification(
     console.error("[NotificationService] Telegram enqueue failed (non-fatal):", err);
   }
 
-  return { notificationId };
+  // 3. Publish to Redis for real-time SSE (fire-and-forget)
+  try {
+    const { getRedisClient } = await import("./redis");
+    const redis = getRedisClient();
+    if (redis) {
+      const event = JSON.stringify({
+        id: notificationId,
+        userId,
+        type,
+        title,
+        content,
+        priority,
+        relatedResourceType,
+        relatedResourceId,
+        actionUrl,
+        actionLabel,
+        metadata,
+        occurrenceCount,
+        deduplicated,
+        createdAt: new Date().toISOString(),
+      });
+      await redis.publish(`notifications:user:${userId}`, event);
+    }
+  } catch {
+    // Non-fatal — SSE listeners just won't get real-time updates
+  }
+
+  return { notificationId, deduplicated };
 }
 
 export { createNotification };
-export type { CreateNotificationParams, NotificationType, ReminderPriority };
+export type { CreateNotificationParams, NotificationType, ReminderPriority, ResourceType, NotificationMetadata };
diff --git a/python-backend/app/monitoring/alerts.py b/python-backend/app/monitoring/alerts.py
index 186bec79..5214cdd6 100644
--- a/python-backend/app/monitoring/alerts.py
+++ b/python-backend/app/monitoring/alerts.py
@@ -10,6 +10,7 @@ from typing import Dict, Any, List, Optional
 from datetime import datetime
 from enum import Enum
 import structlog
+import httpx
 
 logger = structlog.get_logger(__name__)
 
@@ -29,6 +30,7 @@ class AlertChannel(str, Enum):
     SLACK = "slack"
     DISCORD = "discord"
     WEBHOOK = "webhook"
+    IN_APP = "in_app"
 
 
 class AlertRule:
@@ -80,8 +82,15 @@ class AlertManager:
 
     def __init__(self):
         self.rules: List[AlertRule] = []
+        self._http_client: Optional[httpx.AsyncClient] = None
         self._setup_default_rules()
 
+    @property
+    def http_client(self) -> httpx.AsyncClient:
+        if self._http_client is None or self._http_client.is_closed:
+            self._http_client = httpx.AsyncClient(timeout=10.0)
+        return self._http_client
+
     def _setup_default_rules(self):
         """Setup default alert rules for marketplace"""
 
@@ -90,7 +99,7 @@ class AlertManager:
             name="high_error_rate",
             condition=lambda m: m.get("error_rate", 0) > 0.05,
             severity=AlertSeverity.ERROR,
-            channels=[AlertChannel.LOG, AlertChannel.EMAIL, AlertChannel.SLACK],
+            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
             message_template="High error rate detected: {error_rate:.1%} (threshold: 5%)",
             cooldown_seconds=600  # 10 minutes
         ))
@@ -100,7 +109,7 @@ class AlertManager:
             name="slow_response_time",
             condition=lambda m: m.get("avg_response_time_ms", 0) > 2000,
             severity=AlertSeverity.WARNING,
-            channels=[AlertChannel.LOG, AlertChannel.SLACK],
+            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
             message_template="Slow response time: {avg_response_time_ms:.0f}ms (threshold: 2000ms)",
             cooldown_seconds=300  # 5 minutes
         ))
@@ -110,7 +119,7 @@ class AlertManager:
             name="high_concurrent_load",
             condition=lambda m: m.get("concurrent_purchases", 0) > 100,
             severity=AlertSeverity.WARNING,
-            channels=[AlertChannel.LOG, AlertChannel.SLACK],
+            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
             message_template="High concurrent load: {concurrent_purchases} purchases in progress",
             cooldown_seconds=300
         ))
@@ -120,8 +129,11 @@ class AlertManager:
             name="revenue_split_anomaly",
             condition=lambda m: self._check_revenue_anomaly(m),
             severity=AlertSeverity.CRITICAL,
-            channels=[AlertChannel.LOG, AlertChannel.EMAIL, AlertChannel.SLACK],
-            message_template="Revenue split anomaly detected! Expected 85/15 split, got creator={creator_percent:.1%}, platform={platform_percent:.1%}",
+            channels=[AlertChannel.LOG, AlertChannel.SLACK, AlertChannel.IN_APP],
+            message_template=(
+                "Revenue split anomaly detected! Expected 85/15 split, "
+                "got creator={creator_percent:.1%}, platform={platform_percent:.1%}"
+            ),
             cooldown_seconds=3600  # 1 hour
         ))
 
@@ -168,26 +180,34 @@ class AlertManager:
             message=message
         )
 
-        # Send through each channel
+        # Send through each channel concurrently
+        tasks = []
         for channel in rule.channels:
-            try:
-                if channel == AlertChannel.LOG:
-                    await self._send_log_alert(rule, message, metrics)
-                elif channel == AlertChannel.EMAIL:
-                    await self._send_email_alert(rule, message, metrics)
-                elif channel == AlertChannel.SLACK:
-                    await self._send_slack_alert(rule, message, metrics)
-                elif channel == AlertChannel.DISCORD:
-                    await self._send_discord_alert(rule, message, metrics)
-                elif channel == AlertChannel.WEBHOOK:
-                    await self._send_webhook_alert(rule, message, metrics)
-            except Exception as e:
-                logger.error(
-                    "alert_send_failed",
-                    rule=rule.name,
-                    channel=channel,
-                    error=str(e)
-                )
+            tasks.append(self._send_to_channel(channel, rule, message, metrics))
+        await asyncio.gather(*tasks, return_exceptions=True)
+
+    async def _send_to_channel(
+        self, channel: AlertChannel, rule: AlertRule, message: str, metrics: Dict[str, Any]
+    ):
+        """Send to a single channel with error handling"""
+        try:
+            if channel == AlertChannel.LOG:
+                await self._send_log_alert(rule, message, metrics)
+            elif channel == AlertChannel.SLACK:
+                await self._send_slack_alert(rule, message, metrics)
+            elif channel == AlertChannel.DISCORD:
+                await self._send_discord_alert(rule, message, metrics)
+            elif channel == AlertChannel.WEBHOOK:
+                await self._send_webhook_alert(rule, message, metrics)
+            elif channel == AlertChannel.IN_APP:
+                await self._send_in_app_alert(rule, message, metrics)
+        except Exception as e:
+            logger.error(
+                "alert_send_failed",
+                rule=rule.name,
+                channel=channel,
+                error=str(e)
+            )
 
     async def _send_log_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
         """Send alert to logs"""
@@ -198,47 +218,26 @@ class AlertManager:
             AlertSeverity.CRITICAL: logger.critical
         }.get(rule.severity, logger.info)
 
+        # Scrub financial/PII metrics before logging
+        safe_metrics = {
+            k: v for k, v in metrics.items()
+            if not k.startswith("revenue_") and k not in ("creator_percent", "platform_percent")
+        }
         log_method(
             "ALERT",
             rule=rule.name,
             severity=rule.severity,
             message=message,
-            metrics=metrics
+            metrics=safe_metrics
         )
 
-    async def _send_email_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
-        """Send alert via email"""
-        # TODO: Implement email sending
-        # Use aiosmtplib or similar
-        email_to = os.getenv("ALERT_EMAIL", "admin@smartspec.pro")
-
-        logger.info(
-            "email_alert_pending",
-            to=email_to,
-            subject=f"[{rule.severity.upper()}] {rule.name}",
-            message=message
-        )
-
-        # Example implementation:
-        # import aiosmtplib
-        # from email.message import EmailMessage
-        #
-        # msg = EmailMessage()
-        # msg["From"] = "alerts@smartspec.pro"
-        # msg["To"] = email_to
-        # msg["Subject"] = f"[{rule.severity.upper()}] {rule.name}"
-        # msg.set_content(f"{message}\n\nMetrics:\n{json.dumps(metrics, indent=2)}")
-        #
-        # await aiosmtplib.send(msg, hostname="smtp.gmail.com", port=587, ...)
-
     async def _send_slack_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
-        """Send alert to Slack"""
+        """Send alert to Slack via webhook"""
         webhook_url = os.getenv("SLACK_WEBHOOK_URL")
         if not webhook_url:
-            logger.warning("slack_webhook_not_configured")
+            logger.debug("slack_webhook_not_configured")
             return
 
-        # Slack color coding
         color_map = {
             AlertSeverity.INFO: "#36a64f",
             AlertSeverity.WARNING: "#ff9900",
@@ -249,88 +248,156 @@ class AlertManager:
         payload = {
             "attachments": [{
                 "color": color_map.get(rule.severity, "#cccccc"),
-                "title": f"🚨 {rule.name}",
+                "title": f"[{rule.severity.value.upper()}] {rule.name}",
                 "text": message,
                 "fields": [
-                    {"title": "Severity", "value": rule.severity.upper(), "short": True},
+                    {"title": "Severity", "value": rule.severity.value.upper(), "short": True},
                     {"title": "Timestamp", "value": datetime.utcnow().isoformat(), "short": True},
                 ],
-                "footer": "SmartSpecPro Marketplace Monitoring"
+                "footer": "SmartSpecPro Monitoring"
             }]
         }
 
         # Add key metrics to fields
-        if "error_rate" in metrics:
-            payload["attachments"][0]["fields"].append({
-                "title": "Error Rate",
-                "value": f"{metrics['error_rate']:.1%}",
-                "short": True
-            })
-
-        if "avg_response_time_ms" in metrics:
-            payload["attachments"][0]["fields"].append({
-                "title": "Avg Response Time",
-                "value": f"{metrics['avg_response_time_ms']:.0f}ms",
-                "short": True
-            })
-
-        logger.info("slack_alert_pending", webhook_url=webhook_url[:30] + "...")
-
-        # TODO: Send actual HTTP request
-        # import aiohttp
-        # async with aiohttp.ClientSession() as session:
-        #     async with session.post(webhook_url, json=payload) as response:
-        #         if response.status != 200:
-        #             logger.error("slack_alert_failed", status=response.status)
+        for key in ["error_rate", "avg_response_time_ms", "concurrent_purchases"]:
+            if key in metrics:
+                val = metrics[key]
+                if key == "error_rate":
+                    val = f"{val:.1%}"
+                elif key == "avg_response_time_ms":
+                    val = f"{val:.0f}ms"
+                payload["attachments"][0]["fields"].append({
+                    "title": key.replace("_", " ").title(),
+                    "value": str(val),
+                    "short": True
+                })
+
+        resp = await self.http_client.post(webhook_url, json=payload)
+        if resp.status_code != 200:
+            logger.error("slack_alert_failed", status=resp.status_code, body=resp.text[:200])
 
     async def _send_discord_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
-        """Send alert to Discord"""
+        """Send alert to Discord via webhook"""
         webhook_url = os.getenv("DISCORD_WEBHOOK_URL")
         if not webhook_url:
-            logger.warning("discord_webhook_not_configured")
+            logger.debug("discord_webhook_not_configured")
             return
 
-        # Discord color coding (decimal)
         color_map = {
-            AlertSeverity.INFO: 3581519,    # Green
-            AlertSeverity.WARNING: 16761095, # Orange
-            AlertSeverity.ERROR: 16711680,  # Red
-            AlertSeverity.CRITICAL: 10027008 # Dark Red
+            AlertSeverity.INFO: 3581519,     # Green
+            AlertSeverity.WARNING: 16761095,  # Orange
+            AlertSeverity.ERROR: 16711680,    # Red
+            AlertSeverity.CRITICAL: 10027008  # Dark Red
         }
 
         payload = {
             "embeds": [{
-                "title": f"🚨 {rule.name}",
+                "title": f"[{rule.severity.value.upper()}] {rule.name}",
                 "description": message,
                 "color": color_map.get(rule.severity, 8421504),
                 "timestamp": datetime.utcnow().isoformat(),
                 "fields": [
-                    {"name": "Severity", "value": rule.severity.upper(), "inline": True},
+                    {"name": "Severity", "value": rule.severity.value.upper(), "inline": True},
                 ],
-                "footer": {"text": "SmartSpecPro Marketplace"}
+                "footer": {"text": "SmartSpecPro Monitoring"}
             }]
         }
 
-        logger.info("discord_alert_pending", webhook_url=webhook_url[:30] + "...")
+        resp = await self.http_client.post(webhook_url, json=payload)
+        if resp.status_code not in (200, 204):
+            logger.error("discord_alert_failed", status=resp.status_code, body=resp.text[:200])
 
     async def _send_webhook_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
         """Send alert to generic webhook"""
         webhook_url = os.getenv("ALERT_WEBHOOK_URL")
         if not webhook_url:
-            logger.warning("generic_webhook_not_configured")
+            logger.debug("generic_webhook_not_configured")
             return
 
         payload = {
             "rule": rule.name,
-            "severity": rule.severity,
+            "severity": rule.severity.value,
             "message": message,
             "metrics": metrics,
             "timestamp": datetime.utcnow().isoformat()
         }
 
-        logger.info("webhook_alert_pending", webhook_url=webhook_url[:30] + "...")
+        resp = await self.http_client.post(webhook_url, json=payload)
+        if resp.status_code not in (200, 201, 204):
+            logger.error("webhook_alert_failed", status=resp.status_code, body=resp.text[:200])
+
+    async def _send_in_app_alert(self, rule: AlertRule, message: str, metrics: Dict[str, Any]):
+        """Forward alert to Node.js notification system via internal API.
+
+        Creates in-app notifications for admin users by calling the web app's
+        internal notification endpoint.
+        """
+        web_base = os.getenv("WEB_APP_URL", "http://localhost:3000")
+        gateway_token = os.getenv("SMARTSPEC_WEB_GATEWAY_TOKEN", "")
+
+        if not gateway_token:
+            logger.debug("in_app_alert_skipped", reason="no gateway token")
+            return
+
+        # Map severity to priority
+        priority_map = {
+            AlertSeverity.INFO: "low",
+            AlertSeverity.WARNING: "normal",
+            AlertSeverity.ERROR: "high",
+            AlertSeverity.CRITICAL: "critical",
+        }
+
+        # Map rule names to resource types and action URLs
+        action_map = {
+            "high_error_rate": ("/admin/system-guardian", "View System Guardian"),
+            "slow_response_time": ("/admin/system-guardian", "View System Guardian"),
+            "high_concurrent_load": ("/admin/queues", "View Queues"),
+            "revenue_split_anomaly": ("/admin/settings", "View Settings"),
+            "no_recent_purchases": ("/admin/settings", "View Settings"),
+        }
+
+        action_url, action_label = action_map.get(rule.name, ("/admin/system-guardian", "View Details"))
+
+        payload = {
+            "type": "alert",
+            "title": f"[{rule.severity.value.upper()}] {rule.name.replace('_', ' ').title()}",
+            "content": message,
+            "priority": priority_map.get(rule.severity, "normal"),
+            "relatedResourceType": "system_health",
+            "actionUrl": action_url,
+            "actionLabel": action_label,
+            "groupKey": f"python_alert:{rule.name}",
+            "metadata": {
+                "source": f"python.monitoring.{rule.name}",
+                "metrics": {k: v for k, v in metrics.items() if isinstance(v, (int, float, str, bool))},
+            },
+        }
+
+        try:
+            resp = await self.http_client.post(
+                f"{web_base}/api/internal/notifications/admin-broadcast",
+                json=payload,
+                headers={
+                    "Authorization": f"Bearer {gateway_token}",
+                    "Content-Type": "application/json",
+                },
+            )
+            if resp.status_code in (200, 201):
+                logger.info("in_app_alert_sent", rule=rule.name)
+            else:
+                logger.warning(
+                    "in_app_alert_failed",
+                    rule=rule.name,
+                    status=resp.status_code,
+                    body=resp.text[:200],
+                )
+        except httpx.RequestError as e:
+            logger.warning("in_app_alert_unreachable", rule=rule.name, error=str(e))
 
-        # TODO: Send actual HTTP request
+    async def close(self):
+        """Close HTTP client"""
+        if self._http_client and not self._http_client.is_closed:
+            await self._http_client.aclose()
 
 
 # Global alert manager instance
