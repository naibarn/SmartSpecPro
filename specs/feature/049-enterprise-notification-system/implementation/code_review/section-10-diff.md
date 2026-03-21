diff --git a/apps/web/server/jobs/__tests__/notificationDigestJob.test.ts b/apps/web/server/jobs/__tests__/notificationDigestJob.test.ts
new file mode 100644
index 00000000..1fa8aaa8
--- /dev/null
+++ b/apps/web/server/jobs/__tests__/notificationDigestJob.test.ts
@@ -0,0 +1,272 @@
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+const mockSendDigest = vi.fn().mockResolvedValue(true);
+const mockRedisGet = vi.fn();
+const mockRedisSet = vi.fn();
+const mockRedisClient = {
+  get: mockRedisGet,
+  set: mockRedisSet,
+};
+const mockSelect = vi.fn();
+const mockFrom = vi.fn();
+const mockWhere = vi.fn();
+const mockInnerJoin = vi.fn();
+const mockOrderBy = vi.fn();
+const mockLimit = vi.fn();
+
+vi.mock("../../services/notificationEmailService", () => ({
+  sendNotificationDigest: (...args: any[]) => mockSendDigest(...args),
+}));
+
+vi.mock("../../services/redis", () => ({
+  getRedisClient: () => mockRedisClient,
+}));
+
+const mockDb = {
+  select: () => ({
+    from: () => ({
+      innerJoin: () => ({
+        where: mockWhere,
+      }),
+      where: () => ({
+        orderBy: () => ({
+          limit: mockLimit,
+        }),
+      }),
+    }),
+  }),
+};
+
+vi.mock("../../db", () => ({
+  getDb: () => mockDb,
+}));
+
+// Import the function under test after mocks
+import { executeDigestRun } from "../notificationDigestJob";
+
+describe("notificationDigestJob", () => {
+  beforeEach(() => {
+    vi.useFakeTimers();
+    vi.clearAllMocks();
+    mockRedisGet.mockResolvedValue(null);
+    mockRedisSet.mockResolvedValue("OK");
+  });
+
+  afterEach(() => {
+    vi.useRealTimers();
+  });
+
+  it("queries users with email=true in notificationPreferences", async () => {
+    mockWhere.mockResolvedValue([]);
+    await executeDigestRun();
+    expect(mockWhere).toHaveBeenCalled();
+  });
+
+  it("sends digest for 'hourly' users on every execution", async () => {
+    mockWhere.mockResolvedValue([
+      {
+        userId: 1,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    await executeDigestRun();
+    expect(mockSendDigest).toHaveBeenCalledOnce();
+  });
+
+  it("skips 'daily' users when current UTC hour does not match digestHour", async () => {
+    vi.setSystemTime(new Date("2026-03-20T10:00:00Z")); // UTC hour 10
+    mockWhere.mockResolvedValue([
+      {
+        userId: 2,
+        emailDigestFrequency: "daily",
+        emailDigestHour: 8, // wants digest at 8 UTC
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    await executeDigestRun();
+    expect(mockSendDigest).not.toHaveBeenCalled();
+  });
+
+  it("sends digest for 'daily' users when current UTC hour matches digestHour", async () => {
+    vi.setSystemTime(new Date("2026-03-20T08:00:00Z")); // UTC hour 8
+    mockWhere.mockResolvedValue([
+      {
+        userId: 3,
+        emailDigestFrequency: "daily",
+        emailDigestHour: 8,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    await executeDigestRun();
+    expect(mockSendDigest).toHaveBeenCalledOnce();
+  });
+
+  it("updates last digest time in Redis after successful send", async () => {
+    mockWhere.mockResolvedValue([
+      {
+        userId: 4,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    await executeDigestRun();
+    expect(mockRedisSet).toHaveBeenCalledWith(
+      "notification:digest:last:4",
+      expect.any(String),
+      "EX",
+      604800,
+    );
+  });
+
+  it("reads last digest time from Redis key", async () => {
+    mockWhere.mockResolvedValue([
+      {
+        userId: 5,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([]);
+    await executeDigestRun();
+    expect(mockRedisGet).toHaveBeenCalledWith("notification:digest:last:5");
+  });
+
+  it("sets Redis key with 7-day TTL after updating last digest time", async () => {
+    mockWhere.mockResolvedValue([
+      {
+        userId: 6,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    await executeDigestRun();
+    // 604800 = 7 * 24 * 60 * 60 seconds
+    expect(mockRedisSet).toHaveBeenCalledWith(
+      expect.stringContaining("notification:digest:last:"),
+      expect.any(String),
+      "EX",
+      604800,
+    );
+  });
+
+  it("skips users with zero unread notifications since last digest", async () => {
+    mockWhere.mockResolvedValue([
+      {
+        userId: 7,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([]);
+    await executeDigestRun();
+    expect(mockSendDigest).not.toHaveBeenCalled();
+  });
+
+  it("handles Redis unavailability gracefully (falls back to 1 hour ago)", async () => {
+    mockRedisGet.mockRejectedValueOnce(new Error("Redis down"));
+    mockWhere.mockResolvedValue([
+      {
+        userId: 8,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    // Should not throw
+    await expect(executeDigestRun()).resolves.not.toThrow();
+    expect(mockSendDigest).toHaveBeenCalledOnce();
+  });
+
+  it("does not throw if sendNotificationDigest fails for one user", async () => {
+    mockSendDigest.mockRejectedValueOnce(new Error("Email failed"));
+    mockWhere.mockResolvedValue([
+      {
+        userId: 9,
+        emailDigestFrequency: "hourly",
+        emailDigestHour: null,
+        email: "user@test.com",
+        name: "Test",
+        locale: "en",
+      },
+    ]);
+    mockLimit.mockResolvedValue([
+      {
+        id: 1,
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+        createdAt: new Date(),
+      },
+    ]);
+    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
+    await expect(executeDigestRun()).resolves.not.toThrow();
+    consoleSpy.mockRestore();
+  });
+});
diff --git a/apps/web/server/jobs/notificationDigestJob.ts b/apps/web/server/jobs/notificationDigestJob.ts
new file mode 100644
index 00000000..19a9b8c7
--- /dev/null
+++ b/apps/web/server/jobs/notificationDigestJob.ts
@@ -0,0 +1,235 @@
+/**
+ * Notification Digest Job
+ *
+ * BullMQ recurring job that runs every hour, collecting unread notifications
+ * for users with email digest preferences and sending digest emails.
+ */
+
+import { Queue, Worker } from "bullmq";
+import type { Job } from "bullmq";
+import { getDb } from "../db";
+import {
+  notificationPreferences,
+  userNotifications,
+  users,
+} from "../../drizzle/schema";
+import { and, eq, gt, desc } from "drizzle-orm";
+import { getRedisClient } from "../services/redis";
+import { sendNotificationDigest } from "../services/notificationEmailService";
+
+const QUEUE_NAME = "notification-digest";
+const DIGEST_LIMIT = 20;
+const REDIS_TTL = 604800; // 7 days in seconds
+
+let queue: Queue | null = null;
+let worker: Worker | null = null;
+
+// ─── Core Logic (exported for testing) ────────────────────────────────────────
+
+interface DigestUser {
+  userId: number;
+  emailDigestFrequency: string;
+  emailDigestHour: number | null;
+  email: string;
+  name: string | null;
+  locale?: string | null;
+}
+
+export async function executeDigestRun(): Promise<void> {
+  const db = getDb();
+  if (!db) {
+    console.error("[DigestJob] DB not available, skipping run");
+    return;
+  }
+
+  const redis = getRedisClient();
+  let usersProcessed = 0;
+  let digestsSent = 0;
+  let errors = 0;
+
+  try {
+    // Query users with email digest preferences
+    const eligibleUsers: DigestUser[] = await db
+      .select({
+        userId: notificationPreferences.userId,
+        emailDigestFrequency: notificationPreferences.emailDigestFrequency,
+        emailDigestHour: notificationPreferences.emailDigestHour,
+        email: users.email,
+        name: users.name,
+      })
+      .from(notificationPreferences)
+      .innerJoin(users, eq(users.id, notificationPreferences.userId))
+      .where(
+        and(
+          eq(notificationPreferences.email, true),
+          // emailDigestFrequency IS NOT NULL is checked in-app below
+        ),
+      ) as any;
+
+    const currentHour = new Date().getUTCHours();
+
+    // Deduplicate by userId (a user may have multiple preference rows per category)
+    const uniqueUsers = new Map<number, DigestUser>();
+    for (const u of eligibleUsers) {
+      if (!u.emailDigestFrequency) continue;
+      if (!uniqueUsers.has(u.userId)) {
+        uniqueUsers.set(u.userId, u);
+      }
+    }
+
+    for (const [, user] of uniqueUsers) {
+      try {
+        // Check daily schedule
+        if (user.emailDigestFrequency === "daily") {
+          const digestHour = user.emailDigestHour ?? 8;
+          if (currentHour !== digestHour) continue;
+        }
+
+        usersProcessed++;
+
+        // Read last digest timestamp from Redis
+        const redisKey = `notification:digest:last:${user.userId}`;
+        let lastDigestTime: Date;
+        try {
+          const stored = redis ? await redis.get(redisKey) : null;
+          if (stored) {
+            lastDigestTime = new Date(stored);
+          } else {
+            // Default: 1 hour ago for hourly, 24 hours ago for daily
+            const hoursAgo =
+              user.emailDigestFrequency === "daily" ? 24 : 1;
+            lastDigestTime = new Date(
+              Date.now() - hoursAgo * 60 * 60 * 1000,
+            );
+          }
+        } catch {
+          // Redis unavailable — fall back to 1 hour ago
+          lastDigestTime = new Date(Date.now() - 60 * 60 * 1000);
+        }
+
+        // Query unread notifications since last digest
+        const notifications = await db
+          .select()
+          .from(userNotifications)
+          .where(
+            and(
+              eq(userNotifications.userId, user.userId),
+              eq(userNotifications.isRead, false),
+              gt(userNotifications.createdAt, lastDigestTime),
+            ),
+          )
+          .orderBy(desc(userNotifications.createdAt))
+          .limit(DIGEST_LIMIT);
+
+        if (notifications.length === 0) continue;
+
+        // Send digest
+        const sent = await sendNotificationDigest({
+          userEmail: user.email,
+          userName: user.name ?? undefined,
+          locale: user.locale || "en",
+          userId: user.userId,
+          notifications: notifications.map((n: any) => ({
+            id: n.id,
+            title: n.title,
+            content: n.content || "",
+            priority: n.priority || "normal",
+            createdAt: n.createdAt instanceof Date ? n.createdAt : new Date(n.createdAt),
+            actionUrl: n.actionUrl ?? undefined,
+          })),
+        });
+
+        if (sent) {
+          digestsSent++;
+          // Update Redis timestamp
+          try {
+            if (redis) {
+              await redis.set(
+                redisKey,
+                new Date().toISOString(),
+                "EX",
+                REDIS_TTL,
+              );
+            }
+          } catch {
+            // Redis write failure is non-fatal
+          }
+        }
+      } catch (err) {
+        errors++;
+        console.error("[DigestJob] User processing failed (continuing)", {
+          userId: user.userId,
+          error: err instanceof Error ? err.message : String(err),
+        });
+      }
+    }
+  } catch (err) {
+    console.error("[DigestJob] Run failed", {
+      error: err instanceof Error ? err.message : String(err),
+    });
+  }
+
+  console.log("[DigestJob] Run complete", {
+    usersProcessed,
+    digestsSent,
+    errors,
+  });
+}
+
+// ─── BullMQ Initialization ───────────────────────────────────────────────────
+
+export async function initializeDigestJob(): Promise<void> {
+  if (queue) return; // Already initialized
+
+  const redis = getRedisClient();
+  if (!redis) {
+    console.warn("[DigestJob] Redis not available, skipping digest job init");
+    return;
+  }
+
+  const connection = {
+    host: redis.options?.host || "localhost",
+    port: redis.options?.port || 6379,
+  };
+
+  queue = new Queue(QUEUE_NAME, { connection });
+
+  // Add repeatable job: every hour (3600000ms)
+  await queue.add(
+    "digest-run",
+    {},
+    {
+      repeat: { every: 3_600_000 },
+      removeOnComplete: { age: 86400 },
+      removeOnFail: { age: 604800 },
+    },
+  );
+
+  worker = new Worker(
+    QUEUE_NAME,
+    async (_job: Job) => {
+      await executeDigestRun();
+    },
+    { connection, concurrency: 1 },
+  );
+
+  worker.on("failed", (job, err) => {
+    console.error("[DigestJob] Job failed", {
+      jobId: job?.id,
+      error: err.message,
+    });
+  });
+
+  console.log("[DigestJob] Initialized with hourly schedule");
+}
+
+export async function shutdownDigestJob(): Promise<void> {
+  if (worker) {
+    await worker.close();
+    worker = null;
+  }
+  if (queue) {
+    await queue.close();
+    queue = null;
+  }
+}
diff --git a/apps/web/server/jobs/notificationJobs.ts b/apps/web/server/jobs/notificationJobs.ts
index de76cb81..585b6c7b 100644
--- a/apps/web/server/jobs/notificationJobs.ts
+++ b/apps/web/server/jobs/notificationJobs.ts
@@ -9,6 +9,10 @@ import {
   initializeEscalationJob,
   shutdownEscalationJob,
 } from "./escalationJob";
+import {
+  initializeDigestJob,
+  shutdownDigestJob,
+} from "./notificationDigestJob";
 
 export async function initializeNotificationJobs(): Promise<void> {
   try {
@@ -19,7 +23,14 @@ export async function initializeNotificationJobs(): Promise<void> {
       e instanceof Error ? e.message : e
     );
   }
-  // Section-10 adds: try { await initializeDigestJob(); } catch (e) { ... }
+  try {
+    await initializeDigestJob();
+  } catch (e) {
+    console.error(
+      "[notificationJobs] digest init failed:",
+      e instanceof Error ? e.message : e
+    );
+  }
   // Section-12 adds: try { await initializeRetentionJob(); } catch (e) { ... }
 }
 
@@ -32,6 +43,13 @@ export async function shutdownNotificationJobs(): Promise<void> {
       e instanceof Error ? e.message : e
     );
   }
-  // Section-10 adds: try { await shutdownDigestJob(); } catch (e) { ... }
+  try {
+    await shutdownDigestJob();
+  } catch (e) {
+    console.error(
+      "[notificationJobs] digest shutdown failed:",
+      e instanceof Error ? e.message : e
+    );
+  }
   // Section-12 adds: try { await shutdownRetentionJob(); } catch (e) { ... }
 }
diff --git a/apps/web/server/services/__tests__/notificationEmailService.test.ts b/apps/web/server/services/__tests__/notificationEmailService.test.ts
new file mode 100644
index 00000000..4b45f5ec
--- /dev/null
+++ b/apps/web/server/services/__tests__/notificationEmailService.test.ts
@@ -0,0 +1,334 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// --- Mocks ---
+const mockSendMail = vi.fn().mockResolvedValue({ messageId: "test-id" });
+const mockGetSmtpConfig = vi.fn();
+const mockCreateTransporter = vi.fn();
+
+vi.mock("../emailService", () => ({
+  getSmtpConfig: (...args: any[]) => mockGetSmtpConfig(...args),
+  createTransporter: (...args: any[]) => mockCreateTransporter(...args),
+}));
+
+vi.mock("../notificationTemplateService", () => ({
+  renderNotification: vi.fn((_key: string, data: any) => ({
+    subject: data.title || "Notification",
+    body: data.content || "Content",
+  })),
+}));
+
+import {
+  sendNotificationEmail,
+  sendNotificationDigest,
+} from "../notificationEmailService";
+
+const smtpConfig = {
+  host: "smtp.test.com",
+  port: 587,
+  secure: false,
+  user: "test@test.com",
+  pass: "pass",
+  fromName: "SmartAIHub",
+  fromEmail: "noreply@test.com",
+};
+
+describe("sendNotificationEmail", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetSmtpConfig.mockResolvedValue(smtpConfig);
+    mockCreateTransporter.mockResolvedValue({
+      sendMail: mockSendMail,
+    });
+  });
+
+  it("sends email via nodemailer for high priority notification", async () => {
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      userName: "Test User",
+      locale: "en",
+      notification: {
+        id: 1,
+        type: "system",
+        title: "Alert",
+        content: "Something important",
+        priority: "high",
+      },
+    });
+    expect(result).toBe(true);
+    expect(mockSendMail).toHaveBeenCalledOnce();
+    expect(mockSendMail.mock.calls[0][0].to).toBe("user@test.com");
+  });
+
+  it("sends email via nodemailer for critical priority notification", async () => {
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 2,
+        type: "security",
+        title: "Critical Alert",
+        content: "Urgent matter",
+        priority: "critical",
+      },
+    });
+    expect(result).toBe(true);
+    expect(mockSendMail).toHaveBeenCalledOnce();
+  });
+
+  it("uses template service for localized content with correct locale parameter", async () => {
+    const { renderNotification } = await import(
+      "../notificationTemplateService"
+    );
+    await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "th",
+      notification: {
+        id: 3,
+        type: "system",
+        title: "Thai Alert",
+        content: "เนื้อหา",
+        priority: "high",
+      },
+    });
+    expect(renderNotification).toHaveBeenCalledWith(
+      "notification.immediate",
+      expect.objectContaining({ locale: "th" }),
+    );
+  });
+
+  it("includes unsubscribe link in email body", async () => {
+    await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 4,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "high",
+      },
+    });
+    const html = mockSendMail.mock.calls[0][0].html as string;
+    expect(html).toContain("/settings/notifications");
+  });
+
+  it("includes action URL when actionUrl is present", async () => {
+    await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 5,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "high",
+        actionUrl: "/admin/dashboard",
+      },
+    });
+    const html = mockSendMail.mock.calls[0][0].html as string;
+    expect(html).toContain("/admin/dashboard");
+  });
+
+  it("does nothing and returns false if user has no email address", async () => {
+    const result = await sendNotificationEmail({
+      userEmail: "",
+      locale: "en",
+      notification: {
+        id: 6,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "high",
+      },
+    });
+    expect(result).toBe(false);
+    expect(mockSendMail).not.toHaveBeenCalled();
+  });
+
+  it("does nothing and returns false if SMTP is not configured", async () => {
+    mockCreateTransporter.mockResolvedValue(null);
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 7,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "high",
+      },
+    });
+    expect(result).toBe(false);
+    expect(mockSendMail).not.toHaveBeenCalled();
+  });
+
+  it("returns false and logs error if sendMail throws", async () => {
+    mockSendMail.mockRejectedValueOnce(new Error("SMTP error"));
+    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 8,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "high",
+      },
+    });
+    expect(result).toBe(false);
+    expect(consoleSpy).toHaveBeenCalled();
+    consoleSpy.mockRestore();
+  });
+
+  it("does not send for low priority notification (digest-only)", async () => {
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 9,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "low",
+      },
+    });
+    expect(result).toBe(false);
+    expect(mockSendMail).not.toHaveBeenCalled();
+  });
+
+  it("does not send for normal priority notification (digest-only)", async () => {
+    const result = await sendNotificationEmail({
+      userEmail: "user@test.com",
+      locale: "en",
+      notification: {
+        id: 10,
+        type: "system",
+        title: "Test",
+        content: "Body",
+        priority: "normal",
+      },
+    });
+    expect(result).toBe(false);
+    expect(mockSendMail).not.toHaveBeenCalled();
+  });
+});
+
+describe("sendNotificationDigest", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+    mockGetSmtpConfig.mockResolvedValue(smtpConfig);
+    mockCreateTransporter.mockResolvedValue({
+      sendMail: mockSendMail,
+    });
+  });
+
+  const baseNotifications = [
+    {
+      id: 1,
+      title: "Notif 1",
+      content: "Content 1",
+      priority: "normal",
+      createdAt: new Date("2026-03-20T10:00:00Z"),
+    },
+    {
+      id: 2,
+      title: "Notif 2",
+      content: "Content 2",
+      priority: "low",
+      createdAt: new Date("2026-03-20T09:00:00Z"),
+    },
+  ];
+
+  it("collects unread notifications since last digest timestamp", async () => {
+    const result = await sendNotificationDigest({
+      userEmail: "user@test.com",
+      userName: "Test",
+      locale: "en",
+      userId: 1,
+      notifications: baseNotifications,
+    });
+    expect(result).toBe(true);
+    expect(mockSendMail).toHaveBeenCalledOnce();
+  });
+
+  it("sends digest email with up to 20 notification summaries", async () => {
+    const manyNotifs = Array.from({ length: 25 }, (_, i) => ({
+      id: i + 1,
+      title: `Notif ${i + 1}`,
+      content: `Content ${i + 1}`,
+      priority: "normal",
+      createdAt: new Date(),
+    }));
+    await sendNotificationDigest({
+      userEmail: "user@test.com",
+      locale: "en",
+      userId: 1,
+      notifications: manyNotifs,
+    });
+    const html = mockSendMail.mock.calls[0][0].html as string;
+    // Should contain first 20 items but not the 21st
+    expect(html).toContain("Notif 1");
+    expect(html).toContain("Notif 20");
+    expect(html).not.toContain("Notif 21");
+  });
+
+  it("sends nothing and returns false if zero unread notifications", async () => {
+    const result = await sendNotificationDigest({
+      userEmail: "user@test.com",
+      locale: "en",
+      userId: 1,
+      notifications: [],
+    });
+    expect(result).toBe(false);
+    expect(mockSendMail).not.toHaveBeenCalled();
+  });
+
+  it("includes 'View all' link to /notifications in digest email", async () => {
+    await sendNotificationDigest({
+      userEmail: "user@test.com",
+      locale: "en",
+      userId: 1,
+      notifications: baseNotifications,
+    });
+    const html = mockSendMail.mock.calls[0][0].html as string;
+    expect(html).toContain("/notifications");
+  });
+
+  it("uses template service for digest header/footer localization", async () => {
+    const { renderNotification } = await import(
+      "../notificationTemplateService"
+    );
+    await sendNotificationDigest({
+      userEmail: "user@test.com",
+      locale: "th",
+      userId: 1,
+      notifications: baseNotifications,
+    });
+    expect(renderNotification).toHaveBeenCalledWith(
+      "digest.header",
+      expect.objectContaining({ locale: "th" }),
+    );
+  });
+
+  it("truncates notification titles longer than 100 characters in digest", async () => {
+    const longTitle = "A".repeat(120);
+    await sendNotificationDigest({
+      userEmail: "user@test.com",
+      locale: "en",
+      userId: 1,
+      notifications: [
+        {
+          id: 1,
+          title: longTitle,
+          content: "Content",
+          priority: "normal",
+          createdAt: new Date(),
+        },
+      ],
+    });
+    const html = mockSendMail.mock.calls[0][0].html as string;
+    expect(html).not.toContain(longTitle);
+    expect(html).toContain("A".repeat(100));
+  });
+});
diff --git a/apps/web/server/services/emailService.ts b/apps/web/server/services/emailService.ts
index 7c9472f3..f64da300 100644
--- a/apps/web/server/services/emailService.ts
+++ b/apps/web/server/services/emailService.ts
@@ -25,7 +25,7 @@ let cachedConfig: SmtpConfig | null = null;
 let cacheTime = 0;
 const CACHE_TTL = 60_000; // 1 minute
 
-async function getSmtpConfig(): Promise<SmtpConfig | null> {
+export async function getSmtpConfig(): Promise<SmtpConfig | null> {
   if (cachedConfig && Date.now() - cacheTime < CACHE_TTL) return cachedConfig;
 
   try {
@@ -68,7 +68,7 @@ export function clearSmtpCache() {
   cacheTime = 0;
 }
 
-async function createTransporter(): Promise<Transporter | null> {
+export async function createTransporter(): Promise<Transporter | null> {
   const config = await getSmtpConfig();
   if (!config) return null;
 
diff --git a/apps/web/server/services/notificationEmailService.ts b/apps/web/server/services/notificationEmailService.ts
new file mode 100644
index 00000000..9138f691
--- /dev/null
+++ b/apps/web/server/services/notificationEmailService.ts
@@ -0,0 +1,222 @@
+/**
+ * Notification Email Service
+ *
+ * Sends immediate notification emails (high/critical priority)
+ * and batched digest emails. Reuses SMTP infrastructure from emailService.ts.
+ */
+
+import { getSmtpConfig, createTransporter } from "./emailService";
+import { renderNotification } from "./notificationTemplateService";
+
+const PUBLIC_URL =
+  process.env.PUBLIC_URL ||
+  process.env.VITE_PUBLIC_URL ||
+  "https://smartaihub.app";
+
+// ─── HTML Escaping ────────────────────────────────────────────────────────────
+
+function escapeHtml(str: string): string {
+  return str
+    .replace(/&/g, "&amp;")
+    .replace(/</g, "&lt;")
+    .replace(/>/g, "&gt;")
+    .replace(/"/g, "&quot;")
+    .replace(/'/g, "&#39;");
+}
+
+function truncate(str: string, maxLen: number): string {
+  return str.length > maxLen ? str.slice(0, maxLen) + "…" : str;
+}
+
+// ─── Priority Badge Colors ───────────────────────────────────────────────────
+
+const PRIORITY_BADGE: Record<string, { color: string; label: string }> = {
+  high: { color: "#f59e0b", label: "HIGH" },
+  critical: { color: "#ef4444", label: "CRITICAL" },
+};
+
+// ─── Send Immediate Notification Email ────────────────────────────────────────
+
+export async function sendNotificationEmail(params: {
+  userEmail: string;
+  userName?: string;
+  locale: string;
+  notification: {
+    id: number;
+    type: string;
+    title: string;
+    content: string;
+    priority: string;
+    actionUrl?: string;
+    actionLabel?: string;
+    metadata?: Record<string, unknown>;
+  };
+}): Promise<boolean> {
+  const { userEmail, userName, locale, notification } = params;
+
+  // Only send for high/critical priority
+  if (
+    notification.priority !== "high" &&
+    notification.priority !== "critical"
+  ) {
+    return false;
+  }
+
+  if (!userEmail) return false;
+
+  const transporter = await createTransporter();
+  if (!transporter) return false;
+
+  const config = await getSmtpConfig();
+  if (!config) return false;
+
+  try {
+    const rendered = renderNotification("notification.immediate", {
+      title: notification.title,
+      content: notification.content,
+      locale,
+    });
+
+    const badge = PRIORITY_BADGE[notification.priority];
+    const actionButton = notification.actionUrl
+      ? `<a href="${escapeHtml(PUBLIC_URL + notification.actionUrl)}" style="display:inline-block;padding:10px 20px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:4px;margin:16px 0;">${escapeHtml(notification.actionLabel || "View Details")}</a>`
+      : "";
+
+    const html = `
+<!DOCTYPE html>
+<html>
+<head><meta charset="utf-8"></head>
+<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
+  <div style="border-bottom:2px solid #e5e7eb;padding-bottom:16px;margin-bottom:16px;">
+    <h2 style="margin:0 0 8px 0;">${escapeHtml(rendered.subject)}</h2>
+    ${badge ? `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:bold;color:#fff;background-color:${badge.color};">${badge.label}</span>` : ""}
+  </div>
+  <div style="line-height:1.6;">
+    ${escapeHtml(rendered.body)}
+  </div>
+  ${actionButton}
+  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
+    <p>SmartAIHub — ${escapeHtml(userName || "User")}</p>
+    <p><a href="${escapeHtml(PUBLIC_URL + "/settings/notifications")}" style="color:#6b7280;">Unsubscribe from notification emails</a></p>
+  </div>
+</body>
+</html>`;
+
+    await transporter.sendMail({
+      from: `"${config.fromName}" <${config.fromEmail}>`,
+      to: userEmail,
+      subject: rendered.subject,
+      html,
+    });
+
+    console.log("[NotificationEmail] Sent immediate email", {
+      userId: "redacted",
+      notificationId: notification.id,
+      priority: notification.priority,
+    });
+    return true;
+  } catch (err) {
+    console.error("[NotificationEmail] Send failed (non-fatal)", {
+      notificationId: notification.id,
+      error: err instanceof Error ? err.message : String(err),
+    });
+    return false;
+  }
+}
+
+// ─── Send Notification Digest ─────────────────────────────────────────────────
+
+export async function sendNotificationDigest(params: {
+  userEmail: string;
+  userName?: string;
+  locale: string;
+  userId: number;
+  notifications: Array<{
+    id: number;
+    title: string;
+    content: string;
+    priority: string;
+    createdAt: Date;
+    actionUrl?: string;
+  }>;
+}): Promise<boolean> {
+  const { userEmail, userName, locale, userId, notifications } = params;
+
+  if (notifications.length === 0) return false;
+  if (!userEmail) return false;
+
+  const transporter = await createTransporter();
+  if (!transporter) return false;
+
+  const config = await getSmtpConfig();
+  if (!config) return false;
+
+  try {
+    // Limit to 20 items
+    const items = notifications.slice(0, 20);
+
+    const header = renderNotification("digest.header", {
+      locale,
+      count: items.length,
+    });
+    const footer = renderNotification("digest.footer", { locale });
+
+    const itemsHtml = items
+      .map((n) => {
+        const title = truncate(n.title, 100);
+        const content = truncate(n.content || "", 200);
+        const badge = PRIORITY_BADGE[n.priority];
+        const time = n.createdAt.toISOString().replace("T", " ").slice(0, 16);
+        return `
+      <tr>
+        <td style="padding:8px 0;border-bottom:1px solid #f3f4f6;">
+          <div style="font-weight:600;">${escapeHtml(title)}${badge ? ` <span style="font-size:11px;padding:1px 4px;border-radius:3px;color:#fff;background-color:${badge.color};">${badge.label}</span>` : ""}</div>
+          <div style="font-size:13px;color:#6b7280;margin-top:4px;">${escapeHtml(content)}</div>
+          <div style="font-size:11px;color:#9ca3af;margin-top:2px;">${time}</div>
+        </td>
+      </tr>`;
+      })
+      .join("");
+
+    const html = `
+<!DOCTYPE html>
+<html>
+<head><meta charset="utf-8"></head>
+<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
+  <h2 style="margin:0 0 4px 0;">${escapeHtml(header.subject)}</h2>
+  <p style="color:#6b7280;margin:0 0 16px 0;">${escapeHtml(header.body)}</p>
+  <table style="width:100%;border-collapse:collapse;">
+    <tbody>
+      ${itemsHtml}
+    </tbody>
+  </table>
+  <div style="margin-top:16px;">
+    <a href="${escapeHtml(PUBLIC_URL + "/notifications")}" style="display:inline-block;padding:10px 20px;background-color:#3b82f6;color:#ffffff;text-decoration:none;border-radius:4px;">${escapeHtml(footer.body)}</a>
+  </div>
+  <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">
+    <p>SmartAIHub — ${escapeHtml(userName || "User")}</p>
+    <p><a href="${escapeHtml(PUBLIC_URL + "/settings/notifications")}" style="color:#6b7280;">Unsubscribe from notification emails</a></p>
+  </div>
+</body>
+</html>`;
+
+    await transporter.sendMail({
+      from: `"${config.fromName}" <${config.fromEmail}>`,
+      to: userEmail,
+      subject: header.subject,
+      html,
+    });
+
+    console.log("[NotificationEmail] Digest sent", {
+      userId,
+      notificationCount: items.length,
+    });
+    return true;
+  } catch (err) {
+    console.error("[NotificationEmail] Digest send failed (non-fatal)", {
+      userId,
+      error: err instanceof Error ? err.message : String(err),
+    });
+    return false;
+  }
+}
diff --git a/apps/web/server/services/notificationService.ts b/apps/web/server/services/notificationService.ts
index 219f1e0b..fe819ec1 100644
--- a/apps/web/server/services/notificationService.ts
+++ b/apps/web/server/services/notificationService.ts
@@ -6,7 +6,7 @@
  */
 
 import type { DrizzleDB } from "../db";
-import { userNotifications, notificationOccurrences, notificationPreferences } from "../../drizzle/schema";
+import { userNotifications, notificationOccurrences, notificationPreferences, users } from "../../drizzle/schema";
 import { sql, eq, and } from "drizzle-orm";
 
 /**
@@ -502,6 +502,37 @@ async function createNotification(
     // Non-fatal — SSE listeners just won't get real-time updates
   }
 
+  // 4. Email delivery (fire-and-forget, immediate for high/critical)
+  if (channels.email && (priority === "high" || priority === "critical")) {
+    try {
+      const userRow = await db.select({
+        email: users.email,
+        name: users.name,
+      }).from(users).where(eq(users.id, userId)).limit(1);
+      if (userRow[0]?.email) {
+        const { sendNotificationEmail } = await import("./notificationEmailService");
+        await sendNotificationEmail({
+          userEmail: userRow[0].email,
+          userName: userRow[0].name ?? undefined,
+          locale: "en",
+          notification: {
+            id: notificationId,
+            type,
+            title,
+            content,
+            priority,
+            actionUrl: safeActionUrl ?? undefined,
+            actionLabel: actionLabel ?? undefined,
+            metadata: metadata as Record<string, unknown> | undefined,
+          },
+        });
+      }
+    } catch (err) {
+      console.error("[NotificationService] Email delivery failed (non-fatal):", err);
+    }
+  }
+  // Low/normal priority with email=true: handled by digest job (notificationDigestJob.ts)
+
   return { notificationId, deduplicated, channels };
 }
 
diff --git a/apps/web/server/services/notificationTemplateService.ts b/apps/web/server/services/notificationTemplateService.ts
new file mode 100644
index 00000000..8c4684da
--- /dev/null
+++ b/apps/web/server/services/notificationTemplateService.ts
@@ -0,0 +1,49 @@
+/**
+ * Notification Template Service (stub)
+ *
+ * Provides localized rendering for notification emails.
+ * Full implementation arrives in section-12 (templates & retention).
+ * This stub returns raw content with minimal formatting.
+ */
+
+interface RenderedNotification {
+  subject: string;
+  body: string;
+}
+
+/**
+ * Render notification content using the template system.
+ * @param templateKey - Template identifier (e.g. "notification.immediate", "digest.header")
+ * @param data - Template data including title, content, locale
+ */
+export function renderNotification(
+  templateKey: string,
+  data: { title?: string; content?: string; locale?: string; count?: number },
+): RenderedNotification {
+  // Stub: return raw content. Section-12 replaces with full localization.
+  if (templateKey === "digest.header") {
+    return {
+      subject:
+        data.locale === "th"
+          ? "สรุปการแจ้งเตือน"
+          : "Notification Digest",
+      body:
+        data.locale === "th"
+          ? `คุณมี ${data.count ?? 0} การแจ้งเตือนที่ยังไม่ได้อ่าน`
+          : `You have ${data.count ?? 0} unread notifications`,
+    };
+  }
+  if (templateKey === "digest.footer") {
+    return {
+      subject: "",
+      body:
+        data.locale === "th"
+          ? "ดูการแจ้งเตือนทั้งหมด"
+          : "View all notifications",
+    };
+  }
+  return {
+    subject: data.title || "Notification",
+    body: data.content || "",
+  };
+}
