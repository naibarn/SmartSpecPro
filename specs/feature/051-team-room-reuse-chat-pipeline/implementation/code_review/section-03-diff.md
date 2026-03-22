diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index f8b79047..488ba10c 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -70,6 +70,7 @@ import { initWebhookDispatchQueue, closeWebhookDispatchQueue } from "../services
 import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
 import { initializeGDriveCleanupJob, shutdownGDriveCleanupWorker } from "../jobs/gdriveSessionCleanup";
 import { initializePendingApprovalAlertJob } from "../jobs/pendingApprovalAlert";
+import { initializeNotificationJobs } from "../jobs/notificationJobs";
 import { initializeContentRefreshJob } from "../jobs/contentRefreshJob";
 import { initializeInactiveUserJob } from "../jobs/inactiveUserJob";
 import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
@@ -1377,6 +1378,13 @@ async function main() {
     console.error("[Startup] Failed to initialize approval alert job:", error);
   }
 
+  // Initialize notification jobs (escalation, future: digest, retention)
+  try {
+    await initializeNotificationJobs();
+  } catch (error) {
+    console.error("[Startup] Failed to initialize notification jobs:", error);
+  }
+
   // Initialize Google Drive edit session cleanup (every 6h)
   try {
     await initializeGDriveCleanupJob();
diff --git a/apps/web/server/jobs/__tests__/escalationJob.test.ts b/apps/web/server/jobs/__tests__/escalationJob.test.ts
new file mode 100644
index 00000000..b9c560a9
--- /dev/null
+++ b/apps/web/server/jobs/__tests__/escalationJob.test.ts
@@ -0,0 +1,298 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+// Mock all external dependencies
+vi.mock("../../db", () => ({ getDb: vi.fn() }));
+vi.mock("../../services/redisClients", () => ({
+  getRealtimeClient: vi.fn(() => ({
+    duplicate: vi.fn(() => ({})),
+  })),
+}));
+vi.mock("../../services/notificationService", () => ({
+  createNotification: vi.fn().mockResolvedValue({ notificationId: 100, deduplicated: false }),
+  mapToCategory: vi.fn().mockReturnValue("business"),
+}));
+vi.mock("bullmq", () => ({
+  Queue: vi.fn().mockImplementation(() => ({
+    upsertJobScheduler: vi.fn().mockResolvedValue({}),
+    close: vi.fn().mockResolvedValue(undefined),
+  })),
+  Worker: vi.fn().mockImplementation(() => ({
+    close: vi.fn().mockResolvedValue(undefined),
+  })),
+}));
+
+import { getDb } from "../../db";
+import { createNotification } from "../../services/notificationService";
+import { executeEscalationCheck, initializeEscalationJob } from "../escalationJob";
+
+function mockDb(opts: {
+  policies?: Record<string, unknown>[];
+  notifications?: Record<string, unknown>[];
+  roleUsers?: Record<string, unknown>[];
+} = {}) {
+  const { policies = [], notifications = [], roleUsers = [] } = opts;
+
+  const db = {
+    select: vi.fn().mockImplementation(() => ({
+      from: vi.fn().mockImplementation((table: any) => {
+        // Determine which table was queried by checking the table name
+        const tableName = table?._.name || table?.[Symbol.for("drizzle:Name")] || "";
+        return {
+          where: vi.fn().mockImplementation(() => ({
+            // For policies: return policies
+            // For users: return roleUsers
+            // For notifications: return notifications
+            then: undefined,
+            limit: vi.fn().mockResolvedValue(notifications),
+            // Direct resolution for simple queries
+            [Symbol.iterator]: undefined,
+          })),
+          // Direct resolution (for simple selects without where)
+          limit: vi.fn().mockResolvedValue([]),
+        };
+      }),
+    })),
+    update: vi.fn().mockReturnValue({
+      set: vi.fn().mockReturnValue({
+        where: vi.fn().mockResolvedValue([]),
+      }),
+    }),
+    // Expose raw query results for controlling test behavior
+    _policies: policies,
+    _notifications: notifications,
+    _roleUsers: roleUsers,
+  };
+
+  // More sophisticated mock: track calls and return appropriate data
+  let selectCallCount = 0;
+  db.select.mockImplementation(() => ({
+    from: vi.fn().mockImplementation(() => ({
+      where: vi.fn().mockImplementation(() => {
+        selectCallCount++;
+        // 1st select call = policies, 2nd = notifications, 3rd = role users
+        if (selectCallCount === 1) return Promise.resolve(policies);
+        if (selectCallCount === 2) return Promise.resolve(notifications);
+        if (selectCallCount === 3) return Promise.resolve(roleUsers);
+        return Promise.resolve([]);
+      }),
+    })),
+  }));
+
+  (getDb as any).mockReturnValue(db);
+  return db;
+}
+
+describe("executeEscalationCheck", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    process.env.NOTIFICATION_ESCALATION_ENABLED = "true";
+  });
+  afterEach(() => {
+    delete process.env.NOTIFICATION_ESCALATION_ENABLED;
+  });
+
+  it("returns early when NOTIFICATION_ESCALATION_ENABLED=false — no DB queries", async () => {
+    process.env.NOTIFICATION_ESCALATION_ENABLED = "false";
+    const db = mockDb();
+
+    await executeEscalationCheck();
+
+    expect(db.select).not.toHaveBeenCalled();
+  });
+
+  it("creates notification for target when critical alert unacknowledged past triggerMinutes", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString(); // 30 min ago
+    mockDb({
+      policies: [{
+        id: 1,
+        tenantId: "t1",
+        name: "Critical Escalation",
+        triggerSeverity: "critical",
+        triggerMinutes: 15,
+        escalateToUserId: 99,
+        escalateToRole: null,
+        escalateChannels: ["in_app"],
+        escalateMessage: "Unacknowledged critical alert!",
+        isEnabled: true,
+      }],
+      notifications: [{
+        id: 10,
+        userId: 42,
+        title: "Server Down",
+        content: "Production server unresponsive",
+        priority: "critical",
+        relatedResourceType: "system_health",
+        actionUrl: "/admin/monitoring",
+        metadata: null,
+        createdAt: new Date(oldDate),
+      }],
+    });
+
+    await executeEscalationCheck();
+
+    expect(createNotification).toHaveBeenCalledWith(
+      expect.objectContaining({
+        userId: 99,
+        type: "alert",
+        priority: "critical",
+        metadata: expect.objectContaining({ isEscalated: true }),
+      })
+    );
+  });
+
+  it("skips already-escalated notifications (metadata.isEscalated=true)", async () => {
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [], // Empty — the WHERE filter excludes already-escalated
+    });
+
+    await executeEscalationCheck();
+    expect(createNotification).not.toHaveBeenCalled();
+  });
+
+  it("skips notifications with metadata.escalatedAt already set", async () => {
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [], // Empty — the WHERE filter excludes these
+    });
+
+    await executeEscalationCheck();
+    expect(createNotification).not.toHaveBeenCalled();
+  });
+
+  it("respects isEnabled=false on policy", async () => {
+    mockDb({ policies: [] }); // No enabled policies returned
+
+    await executeEscalationCheck();
+    expect(createNotification).not.toHaveBeenCalled();
+  });
+
+  it("escalation notification has isEscalated=true in metadata", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [{
+        id: 10, userId: 42, title: "Alert", content: "Body",
+        priority: "critical", relatedResourceType: null,
+        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
+      }],
+    });
+
+    await executeEscalationCheck();
+
+    const call = (createNotification as any).mock.calls[0][0];
+    expect(call.metadata.isEscalated).toBe(true);
+  });
+
+  it("marks original notification metadata with escalatedAt and escalatedTo", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
+    const db = mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [{
+        id: 10, userId: 42, title: "Alert", content: "Body",
+        priority: "critical", relatedResourceType: null,
+        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
+      }],
+    });
+
+    await executeEscalationCheck();
+
+    expect(db.update).toHaveBeenCalled();
+  });
+
+  it("targets role-based users when escalateToRole is set (creates N notifications)", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: null, escalateToRole: "admin",
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [{
+        id: 10, userId: 42, title: "Alert", content: "Body",
+        priority: "critical", relatedResourceType: null,
+        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
+      }],
+      roleUsers: [{ id: 50 }, { id: 51 }],
+    });
+
+    await executeEscalationCheck();
+
+    expect(createNotification).toHaveBeenCalledTimes(2);
+  });
+
+  it("targets single user when escalateToUserId is set", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: 99, escalateToRole: null,
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [{
+        id: 10, userId: 42, title: "Alert", content: "Body",
+        priority: "critical", relatedResourceType: null,
+        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
+      }],
+    });
+
+    await executeEscalationCheck();
+
+    expect(createNotification).toHaveBeenCalledTimes(1);
+    expect((createNotification as any).mock.calls[0][0].userId).toBe(99);
+  });
+
+  it("continues processing if one notification creation fails", async () => {
+    const oldDate = new Date(Date.now() - 30 * 60_000).toISOString();
+    mockDb({
+      policies: [{
+        id: 1, tenantId: "t1", name: "P1", triggerSeverity: "critical",
+        triggerMinutes: 15, escalateToUserId: null, escalateToRole: "admin",
+        escalateChannels: ["in_app"], escalateMessage: null, isEnabled: true,
+      }],
+      notifications: [{
+        id: 10, userId: 42, title: "Alert", content: "Body",
+        priority: "critical", relatedResourceType: null,
+        actionUrl: null, metadata: null, createdAt: new Date(oldDate),
+      }],
+      roleUsers: [{ id: 50 }, { id: 51 }],
+    });
+
+    // First call fails, second succeeds
+    (createNotification as any)
+      .mockRejectedValueOnce(new Error("DB error"))
+      .mockResolvedValueOnce({ notificationId: 101, deduplicated: false });
+
+    await executeEscalationCheck();
+
+    expect(createNotification).toHaveBeenCalledTimes(2);
+  });
+});
+
+describe("initializeEscalationJob", () => {
+  it("is idempotent — second call does not create duplicate repeatable job", async () => {
+    // First call
+    await initializeEscalationJob();
+    // Second call should not throw
+    await initializeEscalationJob();
+    // Queue constructor should only be called once
+    const { Queue } = await import("bullmq");
+    expect(Queue).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/apps/web/server/jobs/__tests__/notificationJobs.test.ts b/apps/web/server/jobs/__tests__/notificationJobs.test.ts
new file mode 100644
index 00000000..2d253975
--- /dev/null
+++ b/apps/web/server/jobs/__tests__/notificationJobs.test.ts
@@ -0,0 +1,34 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+vi.mock("../escalationJob", () => ({
+  initializeEscalationJob: vi.fn().mockResolvedValue(undefined),
+  shutdownEscalationJob: vi.fn().mockResolvedValue(undefined),
+}));
+
+import { initializeEscalationJob, shutdownEscalationJob } from "../escalationJob";
+import { initializeNotificationJobs, shutdownNotificationJobs } from "../notificationJobs";
+
+describe("initializeNotificationJobs", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("calls all sub-job initializers (escalation, digest, retention)", async () => {
+    await initializeNotificationJobs();
+    expect(initializeEscalationJob).toHaveBeenCalledTimes(1);
+  });
+
+  it("continues if one job fails — does not abort others", async () => {
+    (initializeEscalationJob as any).mockRejectedValueOnce(new Error("init failed"));
+
+    // Should not throw
+    await expect(initializeNotificationJobs()).resolves.not.toThrow();
+  });
+});
+
+describe("shutdownNotificationJobs", () => {
+  it("calls all sub-job shutdown functions", async () => {
+    await shutdownNotificationJobs();
+    expect(shutdownEscalationJob).toHaveBeenCalledTimes(1);
+  });
+});
diff --git a/apps/web/server/jobs/escalationJob.ts b/apps/web/server/jobs/escalationJob.ts
new file mode 100644
index 00000000..00ef0a20
--- /dev/null
+++ b/apps/web/server/jobs/escalationJob.ts
@@ -0,0 +1,214 @@
+/**
+ * Escalation Job — BullMQ recurring job that checks for unacknowledged
+ * critical notifications past their escalation policy trigger window.
+ *
+ * Runs every 5 minutes. Creates escalation notifications with
+ * metadata.isEscalated=true to bypass preference checks (section-05).
+ */
+
+import { Queue, Worker } from "bullmq";
+import { eq, and, sql, lte } from "drizzle-orm";
+import { getDb } from "../db";
+import { getRealtimeClient } from "../services/redisClients";
+import {
+  escalationPolicies,
+  userNotifications,
+  users,
+} from "../../drizzle/schema";
+import { createNotification } from "../services/notificationService";
+
+const QUEUE_NAME = "notification-escalation";
+
+let escalationQueue: Queue | null = null;
+let escalationWorker: Worker | null = null;
+
+function isEscalationEnabled(): boolean {
+  return process.env.NOTIFICATION_ESCALATION_ENABLED === "true";
+}
+
+/**
+ * Core escalation check logic — exported separately for direct testing.
+ */
+export async function executeEscalationCheck(): Promise<void> {
+  if (!isEscalationEnabled()) {
+    console.log("[escalationJob] escalation_job_skipped", {
+      reason: "feature_flag_disabled",
+    });
+    return;
+  }
+
+  const db = getDb();
+  const startMs = Date.now();
+  let escalationsCreated = 0;
+
+  // 1. Query all enabled escalation policies
+  const policies = await db
+    .select()
+    .from(escalationPolicies)
+    .where(eq(escalationPolicies.isEnabled, true));
+
+  if (policies.length === 0) {
+    console.log("[escalationJob] escalation_job_completed", {
+      escalationsCreated: 0,
+      policiesChecked: 0,
+      durationMs: Date.now() - startMs,
+    });
+    return;
+  }
+
+  // 2. For each policy, find unacknowledged notifications past trigger window
+  for (const policy of policies) {
+    const cutoff = new Date(Date.now() - policy.triggerMinutes * 60_000);
+
+    const notifications = await db
+      .select()
+      .from(userNotifications)
+      .where(
+        and(
+          eq(userNotifications.priority, policy.triggerSeverity),
+          eq(userNotifications.isRead, false),
+          eq(userNotifications.isDismissed, false),
+          lte(userNotifications.createdAt, cutoff),
+          // Exclude already-escalated notifications
+          sql`(${userNotifications.metadata}->>'isEscalated') IS DISTINCT FROM 'true'`,
+          sql`(${userNotifications.metadata}->>'escalatedAt') IS NULL`
+        )
+      );
+
+    for (const notif of notifications) {
+      // Determine escalation targets
+      let targetUserIds: number[] = [];
+
+      if (policy.escalateToUserId) {
+        targetUserIds = [policy.escalateToUserId];
+      } else if (policy.escalateToRole) {
+        const roleUsers = await db
+          .select({ id: users.id })
+          .from(users)
+          .where(eq(users.role, policy.escalateToRole));
+        targetUserIds = roleUsers.map((u) => u.id);
+      }
+
+      const escalationTitle =
+        policy.escalateMessage ||
+        `Escalation: Unacknowledged ${notif.priority} alert`;
+
+      // Create escalation notification for each target
+      for (const targetId of targetUserIds) {
+        try {
+          await createNotification({
+            db,
+            userId: targetId,
+            type: "alert",
+            title: escalationTitle,
+            content: notif.content,
+            priority: "critical",
+            relatedResourceType: notif.relatedResourceType as any,
+            actionUrl: notif.actionUrl ?? undefined,
+            metadata: {
+              isEscalated: true,
+              escalatedAt: new Date().toISOString(),
+              escalatedTo: String(targetId),
+              source: "jobs.escalation",
+              relatedItems: {
+                originalNotificationId: String(notif.id),
+                escalationPolicyId: String(policy.id),
+                originalUserId: String(notif.userId),
+              },
+            },
+          });
+          escalationsCreated++;
+
+          console.log("[escalationJob] notification_escalated", {
+            policyId: policy.id,
+            originalNotificationId: notif.id,
+            targetUserId: targetId,
+            triggerMinutes: policy.triggerMinutes,
+          });
+        } catch (err) {
+          console.error(
+            "[escalationJob] Failed to create escalation notification:",
+            err instanceof Error ? err.message : err
+          );
+          // Continue processing other targets/notifications
+        }
+      }
+
+      // Mark original notification as escalated
+      try {
+        await db
+          .update(userNotifications)
+          .set({
+            metadata: sql`COALESCE(${userNotifications.metadata}, '{}'::jsonb) || ${JSON.stringify({
+              escalatedAt: new Date().toISOString(),
+              escalatedTo: targetUserIds.join(","),
+            })}::jsonb`,
+          })
+          .where(eq(userNotifications.id, notif.id));
+      } catch (err) {
+        console.error(
+          "[escalationJob] Failed to update original notification metadata:",
+          err instanceof Error ? err.message : err
+        );
+      }
+    }
+  }
+
+  console.log("[escalationJob] escalation_job_completed", {
+    escalationsCreated,
+    policiesChecked: policies.length,
+    durationMs: Date.now() - startMs,
+  });
+}
+
+/**
+ * Initialize the escalation BullMQ queue and worker.
+ * Idempotent — safe to call multiple times.
+ */
+export async function initializeEscalationJob(): Promise<void> {
+  if (escalationQueue) return;
+
+  const redis = getRealtimeClient();
+
+  escalationQueue = new Queue(QUEUE_NAME, {
+    connection: redis.duplicate(),
+    defaultJobOptions: {
+      removeOnComplete: { count: 100 },
+      removeOnFail: { count: 50 },
+    },
+  });
+
+  // Register repeatable job (every 5 minutes)
+  await escalationQueue.upsertJobScheduler(
+    "escalation-check",
+    { every: 5 * 60 * 1000 },
+    { name: "escalation-check" }
+  );
+
+  escalationWorker = new Worker(
+    QUEUE_NAME,
+    async () => {
+      await executeEscalationCheck();
+    },
+    {
+      connection: redis.duplicate(),
+      concurrency: 1,
+    }
+  );
+
+  console.log("[escalationJob] Escalation job initialized (every 5 minutes)");
+}
+
+/**
+ * Gracefully shut down the escalation queue and worker.
+ */
+export async function shutdownEscalationJob(): Promise<void> {
+  if (escalationWorker) {
+    await escalationWorker.close();
+    escalationWorker = null;
+  }
+  if (escalationQueue) {
+    await escalationQueue.close();
+    escalationQueue = null;
+  }
+}
diff --git a/apps/web/server/jobs/notificationJobs.ts b/apps/web/server/jobs/notificationJobs.ts
new file mode 100644
index 00000000..832fe680
--- /dev/null
+++ b/apps/web/server/jobs/notificationJobs.ts
@@ -0,0 +1,30 @@
+/**
+ * Centralized initialization module for all notification-related recurring jobs.
+ *
+ * Called from _core/index.ts at startup. Each job is wrapped in try/catch
+ * so one failure doesn't block others.
+ */
+
+import {
+  initializeEscalationJob,
+  shutdownEscalationJob,
+} from "./escalationJob";
+
+export async function initializeNotificationJobs(): Promise<void> {
+  try {
+    await initializeEscalationJob();
+  } catch (e) {
+    console.error(
+      "[notificationJobs] escalation init failed:",
+      e instanceof Error ? e.message : e
+    );
+  }
+  // Section-10 adds: try { await initializeDigestJob(); } catch (e) { ... }
+  // Section-12 adds: try { await initializeRetentionJob(); } catch (e) { ... }
+}
+
+export async function shutdownNotificationJobs(): Promise<void> {
+  await shutdownEscalationJob();
+  // Section-10 adds: await shutdownDigestJob();
+  // Section-12 adds: await shutdownRetentionJob();
+}
diff --git a/apps/web/server/routers/teamRun.ts b/apps/web/server/routers/teamRun.ts
index 1425fb67..0502c61d 100644
--- a/apps/web/server/routers/teamRun.ts
+++ b/apps/web/server/routers/teamRun.ts
@@ -5,8 +5,14 @@
 import { z } from "zod";
 import { TRPCError } from "@trpc/server";
 import { router, protectedProcedure } from "../_core/trpc";
+import { createRateLimitMiddleware } from "../_core/rateLimitedProcedure";
 import { resolveTenantIdVarchar } from "../services/tenantContext";
 import * as runEngine from "../services/runEngine";
+import * as roomService from "../services/roomService";
+
+const teamRunStartProcedure = protectedProcedure.use(
+  createRateLimitMiddleware({ namespace: "team-run-start", limit: 10, windowMs: 60 * 60_000 }),
+);
 
 const stopPolicySchema = z.object({
   maxRounds: z.number().int().min(1).max(100).default(20),
@@ -19,8 +25,14 @@ const stopPolicySchema = z.object({
   idleTimeoutSeconds: z.number().int().min(30).max(600).default(120),
 });
 
+function requireTenantId(ctx: { tenantId: string | null; user?: { currentTenantId?: number | null } | null }): string {
+  const tid = resolveTenantIdVarchar(ctx.tenantId, ctx.user?.currentTenantId);
+  if (!tid) throw new TRPCError({ code: "FORBIDDEN", message: "Tenant context required" });
+  return tid;
+}
+
 export const teamRunRouter = router({
-  start: protectedProcedure
+  start: teamRunStartProcedure
     .input(z.object({
       roomId: z.string().min(1),
       executionMode: z.enum(["team_chat", "auto_team", "review"]),
@@ -28,42 +40,62 @@ export const teamRunRouter = router({
       stopPolicy: stopPolicySchema,
     }))
     .mutation(async ({ input, ctx }) => {
-      const tenantId = resolveTenantIdVarchar(ctx);
+      const tenantId = requireTenantId(ctx);
+      const room = await roomService.getRoom(input.roomId, tenantId);
+      if (!room) throw new TRPCError({ code: "NOT_FOUND", message: "Room not found" });
+
+      const resolvedExecutionMode = roomService.mapRoomTypeToExecutionMode(
+        room.roomType as roomService.TeamRoomType,
+        input.executionMode,
+      );
+
       return runEngine.startRun({
         ...input,
+        executionMode: resolvedExecutionMode,
         tenantId,
-        initiatedByUserId: ctx.userId,
+        initiatedByUserId: ctx.user!.id,
       });
     }),
 
   pause: protectedProcedure
     .input(z.object({ runId: z.string().min(1) }))
     .mutation(async ({ input, ctx }) => {
-      const tenantId = resolveTenantIdVarchar(ctx);
+      const tenantId = requireTenantId(ctx);
       return runEngine.pauseRun(input.runId, tenantId);
     }),
 
   resume: protectedProcedure
     .input(z.object({ runId: z.string().min(1) }))
     .mutation(async ({ input, ctx }) => {
-      const tenantId = resolveTenantIdVarchar(ctx);
+      const tenantId = requireTenantId(ctx);
       return runEngine.resumeRun(input.runId, tenantId);
     }),
 
+  advance: protectedProcedure
+    .use(createRateLimitMiddleware({ namespace: "team-run-advance", limit: 30, windowMs: 60_000 }))
+    .input(z.object({
+      runId: z.string().min(1),
+      maxTurns: z.number().int().min(1).max(5).default(1),
+    }))
+    .mutation(async ({ input, ctx }) => {
+      const tenantId = requireTenantId(ctx);
+      return runEngine.advanceRun(input.runId, tenantId, input.maxTurns);
+    }),
+
   stop: protectedProcedure
     .input(z.object({
       runId: z.string().min(1),
       reason: z.string().max(500).default("user_requested"),
     }))
     .mutation(async ({ input, ctx }) => {
-      const tenantId = resolveTenantIdVarchar(ctx);
+      const tenantId = requireTenantId(ctx);
       return runEngine.stopRun(input.runId, input.reason, tenantId);
     }),
 
   get: protectedProcedure
     .input(z.object({ runId: z.string().min(1) }))
     .query(async ({ input, ctx }) => {
-      const tenantId = resolveTenantIdVarchar(ctx);
+      const tenantId = requireTenantId(ctx);
       const run = await runEngine.getRun(input.runId, tenantId);
       if (!run) throw new TRPCError({ code: "NOT_FOUND", message: "Run not found" });
       return run;
diff --git a/apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts b/apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts
new file mode 100644
index 00000000..4d1f96d7
--- /dev/null
+++ b/apps/web/server/services/__tests__/teamRunSkillExecutor.test.ts
@@ -0,0 +1,247 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+import * as fs from "node:fs";
+import * as path from "node:path";
+
+// Mocks must be set up before importing the module under test
+vi.mock("../skillRegistry", () => ({
+  getSkillByIdAsync: vi.fn(),
+}));
+vi.mock("../skillModelFallback", () => ({
+  executeSkillLlmWithFallback: vi.fn(),
+}));
+vi.mock("../promptComposer", () => ({
+  composePrompt: vi.fn(),
+}));
+vi.mock("../skillExecutionPolicy", () => ({
+  resolveSkillExecutionPolicy: vi.fn(),
+}));
+vi.mock("../taskPlannerMiddleware", () => ({
+  runPlanner: vi.fn().mockResolvedValue(null),
+  recordStepAttempt: vi.fn().mockResolvedValue(undefined),
+}));
+vi.mock("../creditService", () => ({
+  calculateCreditsForLLMDynamic: vi.fn().mockResolvedValue(5),
+}));
+
+import { executeTeamRunSkillTurn, type TeamRunSkillExecutionInput } from "../teamRunSkillExecutor";
+import { getSkillByIdAsync } from "../skillRegistry";
+import { executeSkillLlmWithFallback } from "../skillModelFallback";
+import { composePrompt } from "../promptComposer";
+import { resolveSkillExecutionPolicy } from "../skillExecutionPolicy";
+import { calculateCreditsForLLMDynamic } from "../creditService";
+
+// --- Helpers ---
+
+function makeInput(overrides: Partial<TeamRunSkillExecutionInput> = {}): TeamRunSkillExecutionInput {
+  return {
+    run: { id: "run-1" } as any,
+    tenantId: "tenant-1",
+    userId: 1,
+    assistantId: "agent-A",
+    assistantContext: {
+      profile: { preferredModelId: "gpt-4o", displayName: "Agent A", roleTitle: "Writer" },
+      agentModel: null,
+      personaContext: "You are a helpful assistant",
+    },
+    roomId: "room-1",
+    teamId: "team-1",
+    objective: "Write an article about AI",
+    route: {
+      route: "skill",
+      reason: "skill detected",
+      selectedSkillId: "lifestyle-article-writer",
+    },
+    ...overrides,
+  };
+}
+
+function makeSkill(overrides: Record<string, unknown> = {}) {
+  return {
+    id: "lifestyle-article-writer",
+    name: "Lifestyle Article Writer",
+    systemPrompt: "You are a Thai lifestyle article writer.",
+    executionMode: "llm-only",
+    type: "chat-assistant",
+    executionPolicy: null,
+    ...overrides,
+  };
+}
+
+function makeFallbackResult(overrides: Record<string, unknown> = {}) {
+  return {
+    success: true,
+    content: "Here is the article content.",
+    modelId: "gpt-4o",
+    provider: { providerName: "openai" },
+    inputTokens: 500,
+    outputTokens: 300,
+    attempts: [{ attempt: 1, modelId: "gpt-4o", providerName: "openai", success: true, statusCode: 200, errorType: null, errorMessage: null, durationMs: 1200 }],
+    totalDurationMs: 1200,
+    ...overrides,
+  };
+}
+
+beforeEach(() => {
+  vi.clearAllMocks();
+
+  vi.mocked(getSkillByIdAsync).mockResolvedValue(makeSkill() as any);
+  vi.mocked(composePrompt).mockResolvedValue({
+    messages: [
+      { role: "system", content: "Persona context: You are Agent A..." },
+      { role: "user", content: "[User] Write about AI trends" },
+      { role: "assistant", content: "[Agent B] Here is some prior analysis..." },
+    ],
+  } as any);
+  vi.mocked(resolveSkillExecutionPolicy).mockResolvedValue({
+    modelId: "gpt-4o",
+    maxTokens: 4096,
+    temperature: 0.7,
+  } as any);
+  vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(makeFallbackResult() as any);
+  vi.mocked(calculateCreditsForLLMDynamic).mockResolvedValue(5);
+});
+
+// --- Tests ---
+
+describe("executeTeamRunSkillTurn", () => {
+  it("should call executeSkillLlmWithFallback (not Python bridge)", async () => {
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(executeSkillLlmWithFallback).toHaveBeenCalledOnce();
+    expect(result.content).toBe("Here is the article content.");
+  });
+
+  it("should use detected skill's systemPrompt in messages", async () => {
+    vi.mocked(getSkillByIdAsync).mockResolvedValue(
+      makeSkill({ systemPrompt: "You are a Thai article writer with expertise in fashion." }) as any,
+    );
+
+    await executeTeamRunSkillTurn(makeInput());
+
+    const call = vi.mocked(executeSkillLlmWithFallback).mock.calls[0][0];
+    expect(call.messages[0]).toEqual({
+      role: "system",
+      content: "You are a Thai article writer with expertise in fashion.",
+    });
+  });
+
+  it("should pass multi-turn messages array (not flattened string)", async () => {
+    await executeTeamRunSkillTurn(makeInput());
+
+    const call = vi.mocked(executeSkillLlmWithFallback).mock.calls[0][0];
+    expect(Array.isArray(call.messages)).toBe(true);
+    // system prompt + 3 composed messages
+    expect(call.messages.length).toBeGreaterThanOrEqual(3);
+    for (const msg of call.messages) {
+      expect(msg).toHaveProperty("role");
+      expect(msg).toHaveProperty("content");
+      expect(typeof msg.content).toBe("string");
+    }
+  });
+
+  it("should return inputTokens and outputTokens as flat fields", async () => {
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(result.inputTokens).toBe(500);
+    expect(result.outputTokens).toBe(300);
+    expect(typeof result.inputTokens).toBe("number");
+    expect(typeof result.outputTokens).toBe("number");
+  });
+
+  it("should include skillId in result metadata", async () => {
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(result.skillId).toBe("lifestyle-article-writer");
+    expect(result.metadata.selectedSkillId).toBe("lifestyle-article-writer");
+  });
+
+  it("should calculate costCredits from executeSkillLlmWithFallback result (not hardcoded 0)", async () => {
+    vi.mocked(calculateCreditsForLLMDynamic).mockResolvedValue(42);
+
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(result.costCredits).toBe(42);
+    expect(result.costCredits).not.toBe(0);
+    expect(calculateCreditsForLLMDynamic).toHaveBeenCalledWith(500, 300, "gpt-4o");
+  });
+
+  it("should parse nextSpeakerHint from LLM response content", async () => {
+    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(
+      makeFallbackResult({ content: "Great analysis of the topic. [NEXT: Content Director]" }) as any,
+    );
+
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(result.nextSpeakerHint).toBe("Content Director");
+    expect(result.content).not.toContain("[NEXT:");
+    expect(result.content).toBe("Great analysis of the topic.");
+  });
+
+  it("should return undefined nextSpeakerHint when no hint in content", async () => {
+    vi.mocked(executeSkillLlmWithFallback).mockResolvedValue(
+      makeFallbackResult({ content: "Great analysis of the topic." }) as any,
+    );
+
+    const result = await executeTeamRunSkillTurn(makeInput());
+
+    expect(result.nextSpeakerHint).toBeUndefined();
+    expect(result.content).toBe("Great analysis of the topic.");
+  });
+});
+
+describe("executeTeamRunSkillTurn — skill resolution", () => {
+  it("should use route.selectedSkillId when available", async () => {
+    const customSkill = makeSkill({ id: "custom-skill", systemPrompt: "Custom prompt" });
+    vi.mocked(getSkillByIdAsync).mockResolvedValue(customSkill as any);
+
+    const result = await executeTeamRunSkillTurn(
+      makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "custom-skill" } }),
+    );
+
+    expect(getSkillByIdAsync).toHaveBeenCalledWith("custom-skill");
+    expect(result.skillId).toBe("custom-skill");
+  });
+
+  it("should fall back to general skill when selectedSkillId not found", async () => {
+    const fallbackSkill = makeSkill({ id: "general-article-writer", systemPrompt: "General fallback" });
+    vi.mocked(getSkillByIdAsync)
+      .mockResolvedValueOnce(undefined as any)  // nonexistent-skill not found
+      .mockResolvedValueOnce(fallbackSkill as any);  // general-article-writer found
+
+    const result = await executeTeamRunSkillTurn(
+      makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "nonexistent-skill" } }),
+    );
+
+    expect(result.skillId).toBe("general-article-writer");
+  });
+
+  it("should throw when no skill can be resolved", async () => {
+    vi.mocked(getSkillByIdAsync).mockResolvedValue(undefined as any);
+
+    await expect(
+      executeTeamRunSkillTurn(
+        makeInput({ route: { route: "skill", reason: "detected", selectedSkillId: "nonexistent-skill" } }),
+      ),
+    ).rejects.toThrow(/No skill resolved/);
+  });
+});
+
+describe("executeTeamRunSkillTurn — no Python dependency", () => {
+  it("should not import teamOrchestrationBridge", () => {
+    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
+    const source = fs.readFileSync(sourceFile, "utf-8");
+    expect(source).not.toContain("teamOrchestrationBridge");
+  });
+
+  it("should not reference TEAM_DISCUSSION_SKILL_ID", () => {
+    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
+    const source = fs.readFileSync(sourceFile, "utf-8");
+    expect(source).not.toContain("TEAM_DISCUSSION_SKILL_ID");
+  });
+
+  it("should not contain formatPromptMessagesForAgent", () => {
+    const sourceFile = path.resolve(__dirname, "../teamRunSkillExecutor.ts");
+    const source = fs.readFileSync(sourceFile, "utf-8");
+    expect(source).not.toContain("formatPromptMessagesForAgent");
+  });
+});
diff --git a/apps/web/server/services/teamRunSkillExecutor.ts b/apps/web/server/services/teamRunSkillExecutor.ts
index b57c9e77..a8bb632c 100644
--- a/apps/web/server/services/teamRunSkillExecutor.ts
+++ b/apps/web/server/services/teamRunSkillExecutor.ts
@@ -3,8 +3,7 @@ import { resolveSkillExecutionPolicy } from "./skillExecutionPolicy";
 import { executeSkillLlmWithFallback } from "./skillModelFallback";
 import { runPlanner, recordStepAttempt } from "./taskPlannerMiddleware";
 import { composePrompt } from "./promptComposer";
-import { executeAgentTurn } from "./teamOrchestrationBridge";
-import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills";
+import { calculateCreditsForLLMDynamic } from "./creditService";
 import type { TeamRun } from "../../drizzle/schema";
 import type { SkillDefinition } from "@smartspec/skills";
 
@@ -26,7 +25,7 @@ export interface TeamRunSkillExecutionInput {
   teamId: string;
   objective: string;
   route: {
-    route: "chat" | "skill" | "agency";
+    route: "chat" | "skill";
     reason: string;
     selectedSkillId?: string;
   };
@@ -39,127 +38,38 @@ export interface TeamRunSkillExecutionResult {
   costCredits: number;
   metadata: Record<string, unknown>;
   skillId: string;
+  nextSpeakerHint?: string;
 }
 
-function isLlmStyleSkill(skill: SkillDefinition): boolean {
-  return (
-    skill.executionMode === "llm-only" ||
-    skill.executionMode === "core-text" ||
-    skill.executionMode === "enhance-prompt" ||
-    skill.type === "chat-assistant" ||
-    skill.type === "translation" ||
-    skill.type === "document-analysis" ||
-    skill.type === "code-assistant" ||
-    skill.type === "web-search"
-  );
-}
-
-function isTeamRunEligibleSkill(skill: SkillDefinition): boolean {
-  return Boolean(skill.internalOnly || skill.teamRunEligible || skill.type === "chat-assistant");
-}
+const GENERAL_FALLBACK_SKILL_ID = "general-article-writer";
 
-function formatPromptMessagesForAgent(messages: Array<{ role: string; content: string }>): string {
-  return messages
-    .map((message) => `[${message.role.toUpperCase()}]\n${message.content}`.trim())
-    .join("\n\n");
+function parseNextSpeakerHint(content: string): { cleaned: string; hint?: string } {
+  const match = content.match(/\s*\[NEXT:\s*([^\]]+)\]\s*$/i);
+  if (match) {
+    return { cleaned: content.slice(0, match.index).trimEnd(), hint: match[1].trim() };
+  }
+  return { cleaned: content };
 }
 
 async function resolveTeamRunSkill(selectedSkillId?: string): Promise<SkillDefinition> {
   if (selectedSkillId) {
     const selected = await getSkillByIdAsync(selectedSkillId);
-    if (selected && isTeamRunEligibleSkill(selected)) {
+    if (selected) {
       return selected;
     }
   }
 
-  const internal = await getSkillByIdAsync(TEAM_DISCUSSION_SKILL_ID);
-  if (internal) {
-    return internal;
+  const fallback = await getSkillByIdAsync(GENERAL_FALLBACK_SKILL_ID);
+  if (fallback) {
+    return fallback;
   }
 
-  throw new Error(`Skill not found: ${selectedSkillId ?? TEAM_DISCUSSION_SKILL_ID}`);
+  throw new Error(`No skill resolved for team run: tried ${selectedSkillId ?? "(none)"} and fallback ${GENERAL_FALLBACK_SKILL_ID}`);
 }
 
 export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput): Promise<TeamRunSkillExecutionResult> {
   const skill = await resolveTeamRunSkill(input.route.selectedSkillId);
 
-  // Agency route keeps the existing multi-agent orchestration path as a fallback.
-  if (input.route.route === "agency") {
-    const composed = await composePrompt({
-      assistantId: input.assistantId,
-      runId: input.run.id,
-      roomId: input.roomId,
-      teamId: input.teamId,
-      objective: input.objective,
-    });
-
-    const direct = await executeAgentTurn({
-      runId: input.run.id,
-      assistantId: input.assistantId,
-      roomId: input.roomId,
-      teamId: input.teamId,
-      tenantId: input.tenantId,
-      userId: input.userId,
-      modelId: input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined,
-      personaContext: input.assistantContext.personaContext ?? undefined,
-      prompt: formatPromptMessagesForAgent(composed.messages),
-    });
-
-    return {
-      content: direct.content,
-      inputTokens: direct.tokenUsage.inputTokens,
-      outputTokens: direct.tokenUsage.outputTokens,
-      costCredits: direct.costCredits,
-      metadata: {
-        route: "agency",
-        routeReason: input.route.reason,
-        selectedSkillId: skill.id,
-        nextSpeakerHint: direct.nextSpeakerHint ?? null,
-        runtimeMetadata: direct.metadata ?? {},
-        directFallback: true,
-      },
-      skillId: skill.id,
-    };
-  }
-
-  if (!isLlmStyleSkill(skill)) {
-    const composed = await composePrompt({
-      assistantId: input.assistantId,
-      runId: input.run.id,
-      roomId: input.roomId,
-      teamId: input.teamId,
-      objective: input.objective,
-    });
-
-    const direct = await executeAgentTurn({
-      runId: input.run.id,
-      assistantId: input.assistantId,
-      roomId: input.roomId,
-      teamId: input.teamId,
-      tenantId: input.tenantId,
-      userId: input.userId,
-      modelId: input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined,
-      personaContext: input.assistantContext.personaContext ?? undefined,
-      prompt: formatPromptMessagesForAgent(composed.messages),
-    });
-
-    return {
-      content: direct.content,
-      inputTokens: direct.tokenUsage.inputTokens,
-      outputTokens: direct.tokenUsage.outputTokens,
-      costCredits: direct.costCredits,
-      metadata: {
-        route: "skill",
-        routeReason: input.route.reason,
-        selectedSkillId: skill.id,
-        nextSpeakerHint: direct.nextSpeakerHint ?? null,
-        runtimeMetadata: direct.metadata ?? {},
-        directFallback: true,
-      },
-      skillId: skill.id,
-    };
-  }
-
   const conversationModel = input.assistantContext.profile.preferredModelId ?? input.assistantContext.agentModel ?? undefined;
   const executionPolicy = await resolveSkillExecutionPolicy({
     skill,
@@ -183,12 +93,16 @@ export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput)
     objective: input.objective,
   });
 
-  const messages = [
-    ...(skill.systemPrompt
-      ? [{ role: "system" as const, content: skill.systemPrompt }]
-      : []),
-    { role: "user" as const, content: formatPromptMessagesForAgent(composed.messages) },
-  ];
+  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];
+  if (skill.systemPrompt) {
+    messages.push({ role: "system", content: skill.systemPrompt });
+  }
+  for (const msg of composed.messages) {
+    const role = msg.role === "system" ? "system" as const
+      : msg.role === "assistant" ? "assistant" as const
+      : "user" as const;
+    messages.push({ role, content: msg.content });
+  }
 
   const fallback = await executeSkillLlmWithFallback({
     messages,
@@ -211,19 +125,29 @@ export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput)
       inputTokens: fallback.inputTokens ?? 0,
       outputTokens: fallback.outputTokens ?? 0,
       snapshot: plannerResult.snapshot,
-      creditsUsed: fallback.totalDurationMs ? 0 : 0,
+      creditsUsed: 0,
     }).catch(() => {});
   }
 
+  const rawContent = fallback.content ?? "";
+  const { cleaned, hint: nextSpeakerHint } = parseNextSpeakerHint(rawContent);
+
+  const costCredits = await calculateCreditsForLLMDynamic(
+    fallback.inputTokens ?? 0,
+    fallback.outputTokens ?? 0,
+    fallback.modelId ?? executionPolicy.modelId ?? "unknown",
+  );
+
   return {
-    content: fallback.content ?? "",
+    content: cleaned,
     inputTokens: fallback.inputTokens ?? 0,
     outputTokens: fallback.outputTokens ?? 0,
-    costCredits: 0,
+    costCredits,
     metadata: {
       route: "skill",
       routeReason: input.route.reason,
       selectedSkillId: skill.id,
+      nextSpeakerHint: nextSpeakerHint ?? null,
       planner: plannerResult ? {
         taskRunId: plannerResult.taskRunId,
         resolvedModel: plannerResult.resolvedModel,
@@ -232,5 +156,6 @@ export async function executeTeamRunSkillTurn(input: TeamRunSkillExecutionInput)
       attempts: fallback.attempts,
     },
     skillId: skill.id,
+    nextSpeakerHint,
   };
 }
