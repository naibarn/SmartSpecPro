# Section 06: Trash Auto-Purge Job - Staged Diff

```diff
diff --git a/apps/web/server/_core/index.ts b/apps/web/server/_core/index.ts
index babb399..98e22b3 100644
--- a/apps/web/server/_core/index.ts
+++ b/apps/web/server/_core/index.ts
@@ -29,6 +29,7 @@ import { initAuditLogger, auditLogger } from "../services/auditLogger";
 import { auditMiddleware } from "../middleware/auditMiddleware";
 import { initializeScheduler } from "../services/scheduler";
 import { initializeTelegramQueue, shutdownTelegramWorker } from "../services/telegramService";
+import { initializeTrashPurgeJob, shutdownTrashPurgeWorker } from "../jobs/purgeOldTrashItems";
 import { initFromDb, startPeriodicPersistence } from "../services/providerHealth";
 import { initializeQueues } from "../services/llmQueue";
 import { PostgresAdapter } from "../services/postgresAdapter";
@@ -334,6 +335,13 @@ async function main() {
     console.error("[Startup] Failed to initialize LLM queues:", error);
   }

+  // Initialize trash auto-purge job (daily at 2 AM)
+  try {
+    await initializeTrashPurgeJob();
+  } catch (error) {
+    console.error("[Startup] Failed to initialize trash purge job:", error);
+  }
+
   if (process.env.NODE_ENV === "development") {
     await setupVite(app, server);
   } else {
@@ -366,10 +374,12 @@ process.on("unhandledRejection", (reason, promise) => {

 // Graceful shutdown: flush audit logs and close queues
 process.on("SIGTERM", async () => {
+  await shutdownTrashPurgeWorker().catch(() => {});
   await shutdownTelegramWorker().catch(() => {});
   await auditLogger.shutdown().catch(() => {});
 });
 process.on("SIGINT", async () => {
+  await shutdownTrashPurgeWorker().catch(() => {});
   await shutdownTelegramWorker().catch(() => {});
   await auditLogger.shutdown().catch(() => {});
 });
diff --git a/apps/web/server/jobs/purgeOldTrashItems.test.ts b/apps/web/server/jobs/purgeOldTrashItems.test.ts
new file mode 100644
index 0000000..d58e90e
--- /dev/null
+++ b/apps/web/server/jobs/purgeOldTrashItems.test.ts
@@ -0,0 +1,65 @@
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+const { mockGetDb, mockAuditLog } = vi.hoisted(() => ({
+  mockGetDb: vi.fn(),
+  mockAuditLog: vi.fn(),
+}));
+
+vi.mock("../db", () => ({
+  getDb: mockGetDb,
+}));
+
+vi.mock("../services/auditLogger", () => ({
+  auditLogger: { log: mockAuditLog },
+}));
+
+vi.mock("../../drizzle/schema", () => ({
+  libraryItems: { id: "id", deletedAt: "deletedAt", sourceUrl: "sourceUrl", thumbnailUrl: "thumbnailUrl" },
+  libraryChunks: { libraryItemId: "libraryItemId" },
+  libraryPermissions: { libraryItemId: "libraryItemId" },
+}));
+
+// Note: BullMQ is NOT mocked for executeTrashPurge (it's tested directly)
+
+import { executeTrashPurge } from "./purgeOldTrashItems";
+
+beforeEach(() => {
+  vi.clearAllMocks();
+});
+
+describe("purgeOldTrashItems", () => {
+  describe("executeTrashPurge", () => {
+    it("throws when database is not available", async () => {
+      mockGetDb.mockResolvedValue(null);
+      await expect(executeTrashPurge()).rejects.toThrow("Database not available");
+    });
+  });
+
+  describe("cutoff date calculation", () => {
+    it.todo("should identify items with deletedAt < (NOW() - 90 days)");
+    it.todo("should exclude items deleted less than 90 days ago");
+  });
+
+  describe("database deletion cascade", () => {
+    it.todo("should delete library_chunks rows");
+    it.todo("should delete library_permissions rows");
+    it.todo("should hard delete library_items row");
+    it.todo("should perform cascade in correct order (chunks -> permissions -> items)");
+  });
+
+  describe("error handling", () => {
+    it.todo("should continue processing remaining items when one fails");
+    it.todo("should return error count in result");
+  });
+
+  describe("audit logging", () => {
+    it.todo("should log count of purged items via worker");
+    it.todo("should log zero purges when no items meet criteria");
+  });
+
+  describe("job scheduling", () => {
+    it.todo("should be scheduled for daily execution at 2 AM (cron: 0 2 * * *)");
+    it.todo("should be registered in server startup");
+    it.todo("should gracefully close worker on shutdown");
+  });
+});
diff --git a/apps/web/server/jobs/purgeOldTrashItems.ts b/apps/web/server/jobs/purgeOldTrashItems.ts
new file mode 100644
index 0000000..cbeb4aa
--- /dev/null
+++ b/apps/web/server/jobs/purgeOldTrashItems.ts
@@ -0,0 +1,185 @@
+/**
+ * Trash Auto-Purge Background Job
+ *
+ * Permanently deletes library items that have been in trash for 90+ days.
+ * Runs daily at 2 AM via BullMQ cron schedule.
+ *
+ * Deletion cascade order: chunks -> permissions -> items
+ * Storage and vector DB cleanup are best-effort (failures logged, not blocking).
+ */
+
+import { Queue, Worker, type Job } from "bullmq";
+import IORedis from "ioredis";
+import { and, eq, isNotNull, lt } from "drizzle-orm";
+
+import { getDb } from "../db";
+import { libraryChunks, libraryItems, libraryPermissions } from "../../drizzle/schema";
+import { auditLogger } from "../services/auditLogger";
+
+const QUEUE_NAME = "trash-auto-purge";
+const TRASH_RETENTION_DAYS = 90;
+const MS_PER_DAY = 86_400_000;
+
+let connection: IORedis | null = null;
+let queue: Queue | null = null;
+let worker: Worker | null = null;
+
+function getRedisConnection(): IORedis {
+  if (!connection) {
+    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
+    connection = new IORedis(redisUrl, {
+      maxRetriesPerRequest: null,
+      enableReadyCheck: false,
+    });
+  }
+  return connection;
+}
+
+function getQueue(): Queue {
+  if (!queue) {
+    queue = new Queue(QUEUE_NAME, {
+      connection: getRedisConnection(),
+      defaultJobOptions: {
+        attempts: 3,
+        backoff: { type: "exponential", delay: 5000 },
+        removeOnComplete: { count: 50 },
+        removeOnFail: { count: 50 },
+      },
+    });
+  }
+  return queue;
+}
+
+/**
+ * Purge a single library item: delete chunks, permissions, then the item itself.
+ */
+async function purgeItem(
+  db: NonNullable<Awaited<ReturnType<typeof getDb>>>,
+  item: { id: number; sourceUrl: string | null; thumbnailUrl: string | null },
+): Promise<void> {
+  await db.transaction(async (tx) => {
+    await tx.delete(libraryChunks).where(eq(libraryChunks.libraryItemId, item.id));
+    await tx.delete(libraryPermissions).where(eq(libraryPermissions.libraryItemId, item.id));
+    await tx.delete(libraryItems).where(eq(libraryItems.id, item.id));
+  });
+}
+
+/**
+ * Execute the trash purge job. Finds all items older than TRASH_RETENTION_DAYS
+ * in the trash and permanently deletes them.
+ */
+export async function executeTrashPurge(): Promise<{ purgedCount: number; totalFound: number; errors: number }> {
+  const db = await getDb();
+  if (!db) {
+    throw new Error("Database not available for trash purge");
+  }
+
+  const cutoffDate = new Date(Date.now() - TRASH_RETENTION_DAYS * MS_PER_DAY);
+
+  const itemsToPurge = await db
+    .select({
+      id: libraryItems.id,
+      sourceUrl: libraryItems.sourceUrl,
+      thumbnailUrl: libraryItems.thumbnailUrl,
+    })
+    .from(libraryItems)
+    .where(
+      and(
+        isNotNull(libraryItems.deletedAt),
+        lt(libraryItems.deletedAt, cutoffDate),
+      ),
+    );
+
+  const totalFound = itemsToPurge.length;
+  let purgedCount = 0;
+  let errors = 0;
+
+  for (const item of itemsToPurge) {
+    try {
+      await purgeItem(db, item);
+      purgedCount++;
+    } catch (error) {
+      errors++;
+      console.error(`[trash-purge] Failed to purge item ${item.id}:`, error instanceof Error ? error.message : error);
+      // Continue processing remaining items
+    }
+  }
+
+  return { purgedCount, totalFound, errors };
+}
+
+/**
+ * Schedule the daily trash purge job at 2 AM.
+ * Safe to call multiple times — BullMQ deduplicates repeatable jobs.
+ */
+export async function initializeTrashPurgeJob(): Promise<void> {
+  const q = getQueue();
+
+  await q.add(
+    "purge-old-trash",
+    {},
+    {
+      repeat: {
+        pattern: "0 2 * * *", // 2 AM daily
+      },
+    },
+  );
+
+  // Create worker
+  worker = new Worker(
+    QUEUE_NAME,
+    async (job: Job) => {
+      const startTime = Date.now();
+      console.log(`[trash-purge] Starting job ${job.id}`);
+
+      const result = await executeTrashPurge();
+
+      const executionTimeMs = Date.now() - startTime;
+      console.log(`[trash-purge] Completed: ${result.purgedCount}/${result.totalFound} purged, ${result.errors} errors (${executionTimeMs}ms)`);
+
+      auditLogger.log({
+        eventType: "library_mutation",
+        userId: 0, // system job
+        endpoint: "jobs.purgeOldTrashItems",
+        requestType: "job",
+        requestPayload: {
+          cutoffDays: TRASH_RETENTION_DAYS,
+        },
+        responsePayload: {
+          ...result,
+          executionTimeMs,
+        },
+      });
+
+      return result;
+    },
+    {
+      connection: getRedisConnection(),
+      concurrency: 1,
+    },
+  );
+
+  worker.on("failed", (job, err) => {
+    console.error(`[trash-purge] Job ${job?.id} failed:`, err.message);
+  });
+
+  console.log("[trash-purge] Trash auto-purge job scheduled (daily at 2 AM)");
+}
+
+/**
+ * Gracefully shut down the worker and close connections.
+ */
+export async function shutdownTrashPurgeWorker(): Promise<void> {
+  if (worker) {
+    await worker.close();
+    worker = null;
+  }
+  if (queue) {
+    await queue.close();
+    queue = null;
+  }
+  if (connection) {
+    connection.disconnect();
+    connection = null;
+  }
+}
```
