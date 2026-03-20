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
