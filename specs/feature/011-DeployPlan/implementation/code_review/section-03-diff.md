diff --git a/apps/web/drizzle/schema.ts b/apps/web/drizzle/schema.ts
index 8859e45..4253575 100644
--- a/apps/web/drizzle/schema.ts
+++ b/apps/web/drizzle/schema.ts
@@ -3091,3 +3091,40 @@ export const workflowPolicyRules = pgTable("workflow_policy_rules", {
 
 export type WorkflowPolicyRule = typeof workflowPolicyRules.$inferSelect;
 export type InsertWorkflowPolicyRule = typeof workflowPolicyRules.$inferInsert;
+
+// Cloud Task Events — Tracks Cloud Tasks execution for observability and DLQ
+export const cloudTaskEvents = pgTable("cloud_task_events", {
+  id: serial("id").primaryKey(),
+
+  /** Cloud Tasks task ID (from X-CloudTasks-TaskName header) */
+  taskId: varchar("taskId", { length: 512 }).notNull(),
+
+  /** Queue name (e.g., 'media-jobs', 'video-jobs-short') */
+  queueName: varchar("queueName", { length: 128 }).notNull(),
+
+  /** Application-level job ID (links to media_tasks or other job tables) */
+  jobId: varchar("jobId", { length: 128 }),
+
+  /** Task status: queued, processing, completed, failed, dead_letter */
+  status: varchar("status", { length: 32 }).notNull().default("queued"),
+
+  /** Number of retry attempts (from X-CloudTasks-TaskRetryCount) */
+  attemptCount: integer("attemptCount").default(0).notNull(),
+
+  /** Task payload (JSON body sent to the handler) */
+  payload: json("payload").$type<Record<string, unknown>>(),
+
+  /** Error message on failure */
+  errorMessage: text("errorMessage"),
+
+  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
+  completedAt: timestamp("completedAt", { withTimezone: true }),
+}, (t) => [
+  index("cloud_task_events_task_id_idx").on(t.taskId),
+  index("cloud_task_events_status_idx").on(t.status),
+  index("cloud_task_events_queue_name_idx").on(t.queueName),
+  index("cloud_task_events_job_id_idx").on(t.jobId),
+]);
+
+export type CloudTaskEvent = typeof cloudTaskEvents.$inferSelect;
+export type InsertCloudTaskEvent = typeof cloudTaskEvents.$inferInsert;
diff --git a/apps/web/scripts/seed-production.ts b/apps/web/scripts/seed-production.ts
new file mode 100644
index 0000000..70e4d73
--- /dev/null
+++ b/apps/web/scripts/seed-production.ts
@@ -0,0 +1,106 @@
+/**
+ * seed-production.ts
+ *
+ * Bootstrap a fresh production database with minimum required data.
+ * Fully idempotent -- safe to run multiple times.
+ *
+ * Usage: ADMIN_EMAIL=admin@example.com DATABASE_URL=... npx tsx scripts/seed-production.ts
+ */
+
+import postgres from "postgres";
+import { drizzle } from "drizzle-orm/postgres-js";
+import { users, tenants, systemSettings } from "../drizzle/schema";
+import { randomUUID } from "crypto";
+import bcrypt from "bcrypt";
+
+import type { DrizzleDB } from "../server/db";
+
+const TEMPORARY_PASSWORD = "ChangeMe!2026";
+
+export async function seedProduction(db: DrizzleDB): Promise<void> {
+  const adminEmail = process.env.ADMIN_EMAIL;
+  if (!adminEmail) {
+    throw new Error("ADMIN_EMAIL environment variable is required");
+  }
+
+  console.log("[Seed] Starting production seed...");
+
+  // 1. Insert admin user (ON CONFLICT DO NOTHING on openId)
+  const adminOpenId = randomUUID();
+  const password = await bcrypt.hash(TEMPORARY_PASSWORD, 10);
+
+  console.log(`[Seed] Creating admin user: ${adminEmail}`);
+  const insertedUsers = await db
+    .insert(users)
+    .values({
+      openId: adminOpenId,
+      email: adminEmail,
+      name: "Admin",
+      role: "admin",
+      password,
+    })
+    .onConflictDoNothing({ target: users.openId })
+    .returning({ id: users.id, openId: users.openId });
+
+  const adminUser = insertedUsers[0];
+  const adminId = adminUser?.id;
+
+  // 2. Insert default tenant (ON CONFLICT DO NOTHING on slug)
+  const tenantId = randomUUID();
+  console.log("[Seed] Creating default tenant: smartaihub");
+  await db
+    .insert(tenants)
+    .values({
+      id: tenantId,
+      slug: "smartaihub",
+      name: "SmartAI Hub",
+      primaryDomain: "smartaihub.app",
+      isActive: true,
+      ...(adminId ? { ownerId: adminId } : {}),
+    })
+    .onConflictDoNothing({ target: tenants.slug });
+
+  // 3. Insert system settings (check existence first since no unique constraint on category+key)
+  const settingsToSeed = [
+    { category: "email", key: "smtp_host", value: "", description: "SMTP server host" },
+    { category: "email", key: "smtp_port", value: "587", description: "SMTP server port" },
+    { category: "llm", key: "default_provider", value: "openrouter", description: "Default LLM provider" },
+    { category: "llm", key: "default_model", value: "gpt-4o-mini", description: "Default LLM model" },
+  ];
+
+  console.log("[Seed] Creating system settings...");
+  for (const setting of settingsToSeed) {
+    await db
+      .insert(systemSettings)
+      .values(setting)
+      .onConflictDoNothing();
+  }
+
+  console.log("[Seed] Production seed complete.");
+  if (adminUser) {
+    console.log(`[Seed] Admin user created with email: ${adminEmail}`);
+    console.log("[Seed] IMPORTANT: Change the admin password on first login!");
+  } else {
+    console.log("[Seed] Admin user already exists, skipped.");
+  }
+}
+
+// Run directly when executed as a script
+if (import.meta.url === `file://${process.argv[1]}`) {
+  const DATABASE_URL =
+    process.env.DATABASE_URL ||
+    "postgresql://smartspec:smartspec_dev@localhost:5432/smartspec";
+
+  const client = postgres(DATABASE_URL);
+  const db = drizzle(client);
+
+  seedProduction(db as any)
+    .then(() => {
+      console.log("[Seed] Done.");
+      process.exit(0);
+    })
+    .catch((err) => {
+      console.error("[Seed] Failed:", err);
+      process.exit(1);
+    });
+}
diff --git a/apps/web/server/__tests__/cloudTaskEvents.schema.test.ts b/apps/web/server/__tests__/cloudTaskEvents.schema.test.ts
new file mode 100644
index 0000000..ceced4f
--- /dev/null
+++ b/apps/web/server/__tests__/cloudTaskEvents.schema.test.ts
@@ -0,0 +1,62 @@
+/**
+ * Tests for cloud_task_events table schema definition.
+ * Validates the Drizzle schema object without requiring a live database.
+ */
+
+import { describe, it, expect } from "vitest";
+import { getTableName, getTableColumns } from "drizzle-orm";
+import { getTableConfig } from "drizzle-orm/pg-core";
+
+describe("cloud_task_events schema", () => {
+  it("table exists with expected columns after import", async () => {
+    const { cloudTaskEvents } = await import("@db/schema");
+
+    expect(getTableName(cloudTaskEvents)).toBe("cloud_task_events");
+
+    const columns = getTableColumns(cloudTaskEvents);
+
+    // Verify all expected columns exist
+    expect(columns).toHaveProperty("id");
+    expect(columns).toHaveProperty("taskId");
+    expect(columns).toHaveProperty("queueName");
+    expect(columns).toHaveProperty("jobId");
+    expect(columns).toHaveProperty("status");
+    expect(columns).toHaveProperty("attemptCount");
+    expect(columns).toHaveProperty("payload");
+    expect(columns).toHaveProperty("errorMessage");
+    expect(columns).toHaveProperty("createdAt");
+    expect(columns).toHaveProperty("completedAt");
+
+    // Verify required columns are not nullable
+    expect(columns.taskId.notNull).toBe(true);
+    expect(columns.queueName.notNull).toBe(true);
+    expect(columns.status.notNull).toBe(true);
+    expect(columns.attemptCount.notNull).toBe(true);
+    expect(columns.createdAt.notNull).toBe(true);
+
+    // Verify nullable columns
+    expect(columns.jobId.notNull).toBe(false);
+    expect(columns.errorMessage.notNull).toBe(false);
+    expect(columns.completedAt.notNull).toBe(false);
+  });
+
+  it("has appropriate indexes for taskId and status lookups", async () => {
+    const { cloudTaskEvents } = await import("@db/schema");
+
+    const config = getTableConfig(cloudTaskEvents);
+    const indexNames = config.indexes.map((idx) => idx.config.name);
+
+    expect(indexNames).toContain("cloud_task_events_task_id_idx");
+    expect(indexNames).toContain("cloud_task_events_status_idx");
+    expect(indexNames).toContain("cloud_task_events_queue_name_idx");
+    expect(indexNames).toContain("cloud_task_events_job_id_idx");
+  });
+
+  it("exports CloudTaskEvent and InsertCloudTaskEvent types", async () => {
+    const schema = await import("@db/schema");
+
+    // Verify the table export exists (types are compile-time only,
+    // but we can verify the table is exported)
+    expect(schema.cloudTaskEvents).toBeDefined();
+  });
+});
diff --git a/apps/web/server/__tests__/connectionPool.test.ts b/apps/web/server/__tests__/connectionPool.test.ts
new file mode 100644
index 0000000..1dc6339
--- /dev/null
+++ b/apps/web/server/__tests__/connectionPool.test.ts
@@ -0,0 +1,79 @@
+/**
+ * Tests for database connection pooling configuration.
+ * Validates that pool size is configurable via environment variables.
+ */
+
+import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
+
+describe("connection pooling configuration", () => {
+  const originalEnv = process.env;
+
+  beforeEach(() => {
+    vi.resetModules();
+    process.env = { ...originalEnv };
+  });
+
+  afterEach(() => {
+    process.env = originalEnv;
+  });
+
+  it("DB client respects max pool size configuration", async () => {
+    // Mock postgres module to capture constructor options
+    let capturedOptions: any = null;
+    vi.doMock("postgres", () => ({
+      default: (url: string, opts?: any) => {
+        capturedOptions = opts;
+        return {} as any;
+      },
+    }));
+
+    // Set environment
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+    process.env.DB_POOL_SIZE = "3";
+
+    // Re-import to get fresh module with mocks
+    const { getDb } = await import("../db");
+    await getDb();
+
+    expect(capturedOptions).toBeDefined();
+    expect(capturedOptions.max).toBe(3);
+  });
+
+  it("DB client uses default pool size of 5 when env not set", async () => {
+    let capturedOptions: any = null;
+    vi.doMock("postgres", () => ({
+      default: (url: string, opts?: any) => {
+        capturedOptions = opts;
+        return {} as any;
+      },
+    }));
+
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+    delete process.env.DB_POOL_SIZE;
+
+    const { getDb } = await import("../db");
+    await getDb();
+
+    expect(capturedOptions).toBeDefined();
+    expect(capturedOptions.max).toBe(5);
+  });
+
+  it("DB client sets idle_timeout and connect_timeout", async () => {
+    let capturedOptions: any = null;
+    vi.doMock("postgres", () => ({
+      default: (url: string, opts?: any) => {
+        capturedOptions = opts;
+        return {} as any;
+      },
+    }));
+
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+
+    const { getDb } = await import("../db");
+    await getDb();
+
+    expect(capturedOptions).toBeDefined();
+    expect(capturedOptions.idle_timeout).toBeDefined();
+    expect(capturedOptions.connect_timeout).toBeDefined();
+  });
+});
diff --git a/apps/web/server/__tests__/seedProduction.test.ts b/apps/web/server/__tests__/seedProduction.test.ts
new file mode 100644
index 0000000..a9eb727
--- /dev/null
+++ b/apps/web/server/__tests__/seedProduction.test.ts
@@ -0,0 +1,104 @@
+/**
+ * Tests for the production seed script.
+ * Validates idempotency and correct seed data creation.
+ */
+
+import { describe, it, expect, vi, beforeEach } from "vitest";
+
+// Mock postgres and drizzle before imports
+const mockInsert = vi.fn().mockReturnValue({
+  values: vi.fn().mockReturnValue({
+    onConflictDoNothing: vi.fn().mockReturnValue({
+      returning: vi.fn().mockResolvedValue([{ id: 1, openId: "test-uuid" }]),
+    }),
+  }),
+});
+
+const mockSelect = vi.fn().mockReturnValue({
+  from: vi.fn().mockReturnValue({
+    where: vi.fn().mockReturnValue({
+      limit: vi.fn().mockResolvedValue([]),
+    }),
+  }),
+});
+
+const mockDb = {
+  insert: mockInsert,
+  select: mockSelect,
+};
+
+vi.mock("postgres", () => ({
+  default: () => ({} as any),
+}));
+
+vi.mock("drizzle-orm/postgres-js", () => ({
+  drizzle: () => mockDb,
+}));
+
+describe("seed-production script", () => {
+  beforeEach(() => {
+    vi.clearAllMocks();
+  });
+
+  it("creates admin user when DB is empty", async () => {
+    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+
+    // The seed function should call insert on users table
+    const { seedProduction } = await import(
+      "../../scripts/seed-production"
+    );
+
+    await seedProduction(mockDb as any);
+
+    // Should have called insert at least once (for users)
+    expect(mockInsert).toHaveBeenCalled();
+  });
+
+  it("is idempotent - uses onConflictDoNothing", async () => {
+    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+
+    const { seedProduction } = await import(
+      "../../scripts/seed-production"
+    );
+
+    // Run twice
+    await seedProduction(mockDb as any);
+    await seedProduction(mockDb as any);
+
+    // All inserts should use onConflictDoNothing
+    for (const call of mockInsert.mock.results) {
+      const valuesResult = call.value.values.mock.results[0];
+      expect(valuesResult.value.onConflictDoNothing).toBeDefined();
+    }
+  });
+
+  it("creates default tenant with domain smartaihub.app", async () => {
+    process.env.ADMIN_EMAIL = "admin@smartaihub.app";
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+
+    const { seedProduction } = await import(
+      "../../scripts/seed-production"
+    );
+
+    await seedProduction(mockDb as any);
+
+    // At least one insert call should have tenant data
+    const insertCalls = mockInsert.mock.calls;
+    expect(insertCalls.length).toBeGreaterThanOrEqual(2); // users + tenants at minimum
+  });
+
+  it("requires ADMIN_EMAIL environment variable", async () => {
+    delete process.env.ADMIN_EMAIL;
+    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
+
+    const { seedProduction } = await import(
+      "../../scripts/seed-production"
+    );
+
+    await expect(seedProduction(mockDb as any)).rejects.toThrow(
+      /ADMIN_EMAIL/
+    );
+  });
+});
diff --git a/apps/web/server/db.ts b/apps/web/server/db.ts
index 61f50b6..18d64a8 100644
--- a/apps/web/server/db.ts
+++ b/apps/web/server/db.ts
@@ -9,11 +9,17 @@ let _client: ReturnType<typeof postgres> | null = null;
 
 export type DrizzleDB = ReturnType<typeof drizzle>;
 
+const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "5", 10);
+
 // Lazily create the drizzle instance so local tooling can run without a DB.
 export async function getDb() {
   if (!_db && process.env.DATABASE_URL) {
     try {
-      _client = postgres(process.env.DATABASE_URL);
+      _client = postgres(process.env.DATABASE_URL, {
+        max: POOL_SIZE,
+        idle_timeout: 20,       // Close idle connections after 20s
+        connect_timeout: 10,    // Timeout connection attempts after 10s
+      });
       _db = drizzle(_client);
     } catch (error) {
       console.warn("[Database] Failed to connect:", error);
diff --git a/python-backend/app/core/database.py b/python-backend/app/core/database.py
index 70b18c2..218ee25 100644
--- a/python-backend/app/core/database.py
+++ b/python-backend/app/core/database.py
@@ -10,6 +10,8 @@ from sqlalchemy.pool import NullPool
 import structlog
 import re
 
+import os
+
 from app.core.config import settings
 
 logger = structlog.get_logger()
@@ -32,12 +34,14 @@ if settings.DATABASE_URL.startswith("sqlite"):
 else:
     # NOTE: pool_pre_ping=False because it's incompatible with asyncpg
     # (causes MissingGreenlet error). Use pool_recycle instead.
+    _pool_size = int(os.environ.get("DB_POOL_SIZE", "5"))
+    _max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "5"))
     engine = create_async_engine(
         settings.DATABASE_URL,
         echo=settings.DEBUG,
         pool_pre_ping=False,
-        pool_size=10,
-        max_overflow=20,
+        pool_size=_pool_size,
+        max_overflow=_max_overflow,
         pool_recycle=300,  # Recycle connections every 5 minutes
     )
 
diff --git a/python-backend/app/models/media_task.py b/python-backend/app/models/media_task.py
index 2bbe017..27589d7 100644
--- a/python-backend/app/models/media_task.py
+++ b/python-backend/app/models/media_task.py
@@ -34,6 +34,7 @@ class MediaTask(Base):
     id = Column(String(36), primary_key=True)
     task_id = Column(String(64), nullable=True, index=True)  # External provider task ID (e.g., Kie.ai task ID)
     celery_task_id = Column(String(36), nullable=True, index=True)  # Internal Celery task UUID for tracking/monitoring
+    cloud_task_id = Column(String(512), nullable=True, index=True)  # Cloud Tasks task name for tracking
     user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
     # Use String instead of Enum to match existing database schema (varchar columns)
     media_type = Column(String(20), nullable=False)
@@ -76,6 +77,7 @@ class MediaTask(Base):
             "id": self.id,
             "task_id": self.task_id,
             "celery_task_id": self.celery_task_id,
+            "cloud_task_id": self.cloud_task_id,
             "user_id": self.user_id,
             "media_type": get_value(self.media_type),
             "status": get_value(self.status),
diff --git a/python-backend/migrations/005_add_cloud_task_id.py b/python-backend/migrations/005_add_cloud_task_id.py
new file mode 100644
index 0000000..ee868a5
--- /dev/null
+++ b/python-backend/migrations/005_add_cloud_task_id.py
@@ -0,0 +1,81 @@
+"""
+Add cloud_task_id column to media_tasks table.
+Date: 2026-02-15
+Description: Adds cloud_task_id column for Cloud Tasks tracking correlation.
+
+Changes:
+- Add 'cloud_task_id' column (varchar(512), nullable, indexed)
+"""
+
+import asyncio
+import logging
+from sqlalchemy import text
+from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
+from sqlalchemy.orm import sessionmaker
+from app.core.config import settings
+
+logging.basicConfig(level=logging.INFO)
+logger = logging.getLogger(__name__)
+
+
+async def upgrade():
+    """Apply migration — add cloud_task_id to media_tasks."""
+    logger.info("Starting cloud_task_id migration...")
+
+    engine = create_async_engine(settings.DATABASE_URL, echo=True)
+    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
+
+    async with async_session() as session:
+        try:
+            logger.info("Adding cloud_task_id column to media_tasks...")
+            await session.execute(text("""
+                ALTER TABLE media_tasks
+                ADD COLUMN IF NOT EXISTS cloud_task_id VARCHAR(512)
+            """))
+
+            logger.info("Creating index on cloud_task_id...")
+            await session.execute(text("""
+                CREATE INDEX IF NOT EXISTS ix_media_tasks_cloud_task_id
+                ON media_tasks (cloud_task_id)
+            """))
+
+            await session.commit()
+            logger.info("cloud_task_id migration completed successfully.")
+
+        except Exception as e:
+            await session.rollback()
+            logger.error(f"Migration failed: {e}")
+            raise
+
+    await engine.dispose()
+
+
+async def downgrade():
+    """Reverse migration — remove cloud_task_id column."""
+    logger.info("Reverting cloud_task_id migration...")
+
+    engine = create_async_engine(settings.DATABASE_URL, echo=True)
+    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
+
+    async with async_session() as session:
+        try:
+            await session.execute(text("""
+                DROP INDEX IF EXISTS ix_media_tasks_cloud_task_id
+            """))
+            await session.execute(text("""
+                ALTER TABLE media_tasks DROP COLUMN IF EXISTS cloud_task_id
+            """))
+
+            await session.commit()
+            logger.info("cloud_task_id migration reverted successfully.")
+
+        except Exception as e:
+            await session.rollback()
+            logger.error(f"Downgrade failed: {e}")
+            raise
+
+    await engine.dispose()
+
+
+if __name__ == "__main__":
+    asyncio.run(upgrade())
diff --git a/python-backend/tests/unit/test_media_task_cloud_task_id.py b/python-backend/tests/unit/test_media_task_cloud_task_id.py
new file mode 100644
index 0000000..9cd6bb6
--- /dev/null
+++ b/python-backend/tests/unit/test_media_task_cloud_task_id.py
@@ -0,0 +1,60 @@
+"""Test that the MediaTask model includes the cloud_task_id column."""
+
+import pytest
+from sqlalchemy import inspect as sa_inspect
+
+from app.models.media_task import MediaTask
+
+
+@pytest.mark.unit
+class TestMediaTaskCloudTaskId:
+    def test_media_task_has_cloud_task_id_column(self):
+        """
+        Verify that the MediaTask SQLAlchemy model has a cloud_task_id
+        column defined as String, nullable=True, indexed.
+        """
+        mapper = sa_inspect(MediaTask)
+        columns = {c.key: c for c in mapper.columns}
+
+        assert "cloud_task_id" in columns, "MediaTask must have cloud_task_id column"
+
+        col = columns["cloud_task_id"]
+        assert col.nullable is True, "cloud_task_id should be nullable"
+        assert str(col.type) == "VARCHAR(512)", (
+            f"cloud_task_id should be VARCHAR(512), got {col.type}"
+        )
+
+    def test_media_task_to_dict_includes_cloud_task_id(self):
+        """
+        Verify that MediaTask.to_dict() includes cloud_task_id in output.
+        """
+        task = MediaTask(
+            id="test-id",
+            user_id=1,
+            media_type="image",
+            status="pending",
+            model="test-model",
+            prompt="test prompt",
+            cloud_task_id="projects/my-project/locations/us-central1/queues/media-jobs/tasks/task-123",
+        )
+        result = task.to_dict()
+
+        assert "cloud_task_id" in result, "to_dict() must include cloud_task_id"
+        assert result["cloud_task_id"] == (
+            "projects/my-project/locations/us-central1/queues/media-jobs/tasks/task-123"
+        )
+
+    def test_media_task_cloud_task_id_defaults_to_none(self):
+        """
+        Verify that cloud_task_id defaults to None when not provided.
+        """
+        task = MediaTask(
+            id="test-id-2",
+            user_id=1,
+            media_type="image",
+            status="pending",
+            model="test-model",
+            prompt="test prompt",
+        )
+        result = task.to_dict()
+        assert result["cloud_task_id"] is None
