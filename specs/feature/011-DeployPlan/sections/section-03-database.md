Now I have all the necessary context. Let me produce the complete section content.

# Section 3: Database Setup (Neon Postgres)

## Overview

This section covers configuring Neon Postgres for staging and production environments, defining table ownership between Drizzle ORM (Node.js) and SQLAlchemy/Alembic (Python), creating a new `cloud_task_events` table, adding a `cloud_task_id` column to the Python-owned `media_tasks` table, establishing connection pooling limits, and writing an idempotent production seed script.

**Local development continues using the existing PostgreSQL 15 instance** from `docker-compose.infra.yml`. Nothing in this section changes the local dev workflow.

## Dependencies

- **section-01-gcp-bootstrap** must be complete (GCP Secret Manager must exist for storing `DATABASE_URL`).

## Blocked By This Section

- **section-04-cloud-tasks** requires the `cloud_task_events` table and `media_tasks.cloud_task_id` column.
- **section-05-bullmq-migration** depends on the database being production-ready.
- **section-18-auth-hardening** depends on production database configuration.

---

## Tests First

All tests for this section validate schema migration correctness, connection pooling behavior, and seed script idempotency.

### 3.1 Schema Migration Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/cloudTaskEvents.schema.test.ts`

These tests validate that the new `cloud_task_events` table definition in Drizzle schema has the expected shape. They do not require a live database -- they validate the TypeScript schema definition object exported from `drizzle/schema.ts`.

```typescript
import { describe, it, expect } from "vitest";

describe("cloud_task_events schema", () => {
  it("table exists with expected columns after import", async () => {
    /**
     * Import cloudTaskEvents from schema and verify it has all expected columns:
     * id (serial PK), taskId (varchar), queueName (varchar), jobId (varchar),
     * status (varchar), attemptCount (integer), createdAt (timestamp),
     * completedAt (timestamp nullable), errorMessage (text nullable)
     */
  });

  it("has appropriate indexes for taskId and status lookups", () => {
    /**
     * Verify the table definition includes indexes on taskId and status
     * for efficient querying by the DLQ handler and admin dashboard.
     */
  });
});
```

### 3.2 Migration Ordering Test (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/migrationOrdering.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("migration ordering", () => {
  it("Drizzle migration generates SQL without errors against a fresh schema", () => {
    /**
     * Verify that running `drizzle-kit generate` produces valid SQL files.
     * This is a dry-run validation -- check that the generated migration
     * directory contains .sql files and the journal is updated.
     */
  });

  it("Alembic migration runs successfully after Drizzle migration", () => {
    /**
     * Verify that the Python Alembic models for Drizzle-owned tables use
     * `__table_args__ = {"extend_existing": True}` so they read without
     * conflicting with Drizzle-created tables.
     */
  });

  it("cloud_task_events table exists with expected columns after migration", () => {
    /**
     * After generating the migration, parse the SQL output and verify it
     * contains CREATE TABLE cloud_task_events with the expected columns.
     */
  });

  it("media_tasks.cloud_task_id column exists after migration", () => {
    /**
     * Verify that the Alembic migration for adding cloud_task_id to
     * media_tasks produces an ALTER TABLE statement.
     */
  });
});
```

### 3.3 Connection Pooling Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/connectionPool.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("connection pooling configuration", () => {
  it("DB client respects max pool size configuration", () => {
    /**
     * Verify that the postgres() client constructor receives max: 5
     * when POOL_SIZE env or a config constant is set.
     * Mock the postgres module and check the options passed.
     */
  });

  it("DB client reconnects after transient connection failure", () => {
    /**
     * Simulate a connection error and verify that subsequent getDb() calls
     * attempt to re-establish the connection rather than returning the
     * failed instance.
     */
  });

  it("PgBouncer connection string works with Drizzle queries", () => {
    /**
     * Verify that a DATABASE_URL containing ?pgbouncer=true does not
     * cause the postgres-js driver to reject the connection string.
     * This is a configuration validation test.
     */
  });
});
```

### 3.4 Seed Data Tests (Vitest)

**File:** `/home/dev/projects/SmartSpecPro/apps/web/scripts/__tests__/seedProduction.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("seed-production script", () => {
  it("creates admin user when DB is empty", () => {
    /**
     * With an empty users table, running seedProduction() should insert
     * one user with role='admin' and the email from ADMIN_EMAIL env var.
     * Mock the DB and verify the insert call.
     */
  });

  it("is idempotent - running twice does not duplicate data", () => {
    /**
     * Run seedProduction() twice against the same mock DB.
     * Verify that the second run does not insert duplicate users,
     * tenants, or system settings (uses ON CONFLICT DO NOTHING or
     * existence checks).
     */
  });

  it("creates default tenant with domain smartaihub.app", () => {
    /**
     * Verify that seedProduction() inserts a tenant with
     * primaryDomain='smartaihub.app' and slug='smartaihub'.
     */
  });

  it("creates system settings for SMTP and default LLM preferences", () => {
    /**
     * Verify that seedProduction() inserts system_settings rows
     * for categories 'email' and 'llm' with placeholder values.
     */
  });
});
```

### 3.5 Python-side Migration Test (pytest)

**File:** `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_media_task_cloud_task_id.py`

```python
"""Test that the MediaTask model includes the cloud_task_id column."""

import pytest
from sqlalchemy import inspect

@pytest.mark.unit
class TestMediaTaskCloudTaskId:
    def test_media_task_has_cloud_task_id_column(self):
        """
        Verify that the MediaTask SQLAlchemy model has a cloud_task_id
        column defined as String(36), nullable=True, indexed.
        """
        pass

    def test_media_task_to_dict_includes_cloud_task_id(self):
        """
        Verify that MediaTask.to_dict() includes cloud_task_id in output.
        """
        pass
```

---

## Implementation Details

### 3.A Neon Postgres Project Setup

Create two Neon databases (this is done in the Neon console or CLI, not in application code):

1. **Staging:** Create a Neon project named `smartspecpro-staging`. Note the pooled connection string (uses PgBouncer, port 5432, includes `?pgbouncer=true`). Store as `DATABASE_URL` in GCP Secret Manager.

2. **Production:** Create a separate Neon project named `smartspecpro-prod`. Same connection string pattern. Store separately in Secret Manager.

3. **Local dev:** Continue using the existing PostgreSQL 15 from `docker-compose.infra.yml` with `DATABASE_URL` in `apps/web/.env`. No changes needed.

Region selection: Choose the Neon region closest to the GCP Cloud Run region selected in section-01 (e.g., if Cloud Run is in `asia-southeast1`, use Neon's `ap-southeast-1`).

### 3.B Table Ownership Map

The codebase uses two ORMs against the same PostgreSQL database. To prevent migration conflicts, each ORM owns specific tables and must never create or alter the other ORM's tables in the same release.

**Drizzle ORM (Node.js) owns all tables in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`:**
- `users`, `credit_transactions`, `credit_packages`, `tenants`, `user_groups`, `sessions`, `system_settings`, `video_editor_projects`, `email_verification_tokens`, `workflows`, `template_categories`, `workflow_templates`, `gallery_items`, `media_models`, `llm_providers`, `model_provider_map`, `routing_rules`, `provider_usage_log`, `scheduled_messages`, `direct_messages`, `registration_events`, `device_fingerprints`, `blocked_patterns`, `menu_config`, and all other tables defined in `schema.ts`.
- **New table:** `cloud_task_events` (see 3.C below).

**SQLAlchemy/Alembic (Python) owns:**
- `media_tasks` table (defined in `/home/dev/projects/SmartSpecPro/python-backend/app/models/media_task.py`)
- Any other Python-only models in `/home/dev/projects/SmartSpecPro/python-backend/app/models/`

**Migration Execution Order (CI/CD):**
1. Run Drizzle migrations first: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push`
2. Run Alembic migrations second: `cd /home/dev/projects/SmartSpecPro/python-backend && alembic upgrade head`
3. Both ORMs must never create or alter the same table in the same release.

Python Alembic models that reference Drizzle-owned tables (e.g., the `users` table referenced via foreign key from `media_tasks.user_id`) must use `__table_args__ = {"extend_existing": True}` to read without conflicting.

### 3.C New Table: `cloud_task_events`

Add this table to `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`. It tracks Cloud Tasks execution for observability and DLQ handling. The Node.js API service reads and writes this table.

**Schema definition to add:**

```typescript
// Cloud Task Events — Tracks Cloud Tasks execution for observability and DLQ
export const cloudTaskEvents = pgTable("cloud_task_events", {
  id: serial("id").primaryKey(),

  /** Cloud Tasks task ID (from X-CloudTasks-TaskName header) */
  taskId: varchar("taskId", { length: 512 }).notNull(),

  /** Queue name (e.g., 'media-jobs', 'video-jobs-short') */
  queueName: varchar("queueName", { length: 128 }).notNull(),

  /** Application-level job ID (links to media_tasks or other job tables) */
  jobId: varchar("jobId", { length: 128 }),

  /** Task status: queued, processing, completed, failed, dead_letter */
  status: varchar("status", { length: 32 }).notNull().default("queued"),

  /** Number of retry attempts (from X-CloudTasks-TaskRetryCount) */
  attemptCount: integer("attemptCount").default(0).notNull(),

  /** Task payload (JSON body sent to the handler) */
  payload: json("payload").$type<Record<string, unknown>>(),

  /** Error message on failure */
  errorMessage: text("errorMessage"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  completedAt: timestamp("completedAt", { withTimezone: true }),
}, (t) => [
  index("cloud_task_events_task_id_idx").on(t.taskId),
  index("cloud_task_events_status_idx").on(t.status),
  index("cloud_task_events_queue_name_idx").on(t.queueName),
  index("cloud_task_events_job_id_idx").on(t.jobId),
]);

export type CloudTaskEvent = typeof cloudTaskEvents.$inferSelect;
export type InsertCloudTaskEvent = typeof cloudTaskEvents.$inferInsert;
```

After adding this definition to `schema.ts`, run the migration immediately:

```bash
cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push
```

### 3.D Add `cloud_task_id` to `media_tasks` (Python/Alembic)

The Python-owned `media_tasks` table needs a new column to correlate Cloud Tasks with application jobs.

**Modify:** `/home/dev/projects/SmartSpecPro/python-backend/app/models/media_task.py`

Add the following column to the `MediaTask` class (alongside the existing `celery_task_id` column):

```python
cloud_task_id = Column(String(512), nullable=True, index=True)  # Cloud Tasks task name for tracking
```

Update the `to_dict()` method to include `cloud_task_id` in the output dictionary.

**Create Alembic migration:**

Create a new migration file at `/home/dev/projects/SmartSpecPro/python-backend/migrations/005_add_cloud_task_id.py` that runs:

```sql
ALTER TABLE media_tasks ADD COLUMN IF NOT EXISTS cloud_task_id VARCHAR(512);
CREATE INDEX IF NOT EXISTS ix_media_tasks_cloud_task_id ON media_tasks (cloud_task_id);
```

The migration must be idempotent (use `IF NOT EXISTS`) to be safe for re-runs.

### 3.E Connection Pooling Configuration

Neon provides connection pooling via PgBouncer in transaction mode. Configure the `DATABASE_URL` to use the pooled connection string (port 5432 with `?pgbouncer=true`).

**Per-service pool size limits** (to stay within Neon's 100-connection plan limit):

| Service | Max Pool Per Instance | Max Instances | Total Connections |
|---------|----------------------|---------------|-------------------|
| Node.js Cloud Run Service | 5 | 5 | 25 |
| Python Cloud Run Service | 5 | 3 | 15 |
| Cloud Run Jobs (video) | 2 | 3 | 6 |
| **Total** | | | **~46** |

**Node.js configuration change in:** `/home/dev/projects/SmartSpecPro/apps/web/server/db.ts`

The current `getDb()` function creates the postgres client without explicit pool configuration. Update it to pass `max` to the `postgres()` constructor:

```typescript
const POOL_SIZE = parseInt(process.env.DB_POOL_SIZE || "5", 10);

_client = postgres(process.env.DATABASE_URL, {
  max: POOL_SIZE,
  idle_timeout: 20,       // Close idle connections after 20s
  connect_timeout: 10,    // Timeout connection attempts after 10s
});
```

**Python configuration change in:** `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py`

Update the `create_async_engine` call to use a smaller pool in production:

```python
pool_size = int(os.environ.get("DB_POOL_SIZE", "5"))
max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "5"))

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=False,
    pool_size=pool_size,
    max_overflow=max_overflow,
    pool_recycle=300,
)
```

**Monitoring:** Add a Cloud Monitoring alert for connection pool utilization > 80% using Neon's metrics. This is configured in section-16 (Cloud Monitoring) but the alert threshold is defined here: warn at 80 connections, critical at 90 connections out of the 100 limit.

### 3.F Environment Configuration

- **Production/Staging:** `DATABASE_URL` is stored in GCP Secret Manager (created in section-01). Cloud Run mounts it as an environment variable.
- **Local dev:** Continues using `apps/web/.env` with `DATABASE_URL=postgresql://smartspec:smartspec_dev@localhost:5432/smartspec`.
- **CI/CD migrations:** The `pnpm db:push` command runs locally against Neon during deployment, or as a CI step (see section-17).

No changes are needed to local `.env` files. The split is handled by which `DATABASE_URL` value is provided at runtime.

### 3.G Production Seed Script

Create a new script at `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-production.ts` that bootstraps a fresh production database with the minimum required data.

**Run with:** `npx tsx scripts/seed-production.ts`

The script must be fully idempotent -- safe to run multiple times without creating duplicates. Use `ON CONFLICT DO NOTHING` for all inserts.

**Seed data to create:**

1. **Default admin user:**
   - Email from `ADMIN_EMAIL` environment variable (required).
   - `openId` generated as a UUID (for local login, not OAuth).
   - `role` set to `admin`.
   - Temporary password hash (bcrypt) -- the admin must change it on first login.
   - `ON CONFLICT DO NOTHING` on email to prevent duplicates.

2. **Default tenant:**
   - `id`: generated UUID string.
   - `slug`: `"smartaihub"`.
   - `name`: `"SmartAI Hub"`.
   - `primaryDomain`: `"smartaihub.app"`.
   - `isActive`: `true`.
   - `ownerId`: link to the admin user created above.
   - `ON CONFLICT DO NOTHING` on `slug`.

3. **System settings:**
   - Category `"email"`, key `"smtp_host"` -- placeholder value (admin configures via UI).
   - Category `"email"`, key `"smtp_port"` -- default `"587"`.
   - Category `"llm"`, key `"default_provider"` -- value `"openrouter"`.
   - Category `"llm"`, key `"default_model"` -- value `"gpt-4o-mini"`.
   - Use `ON CONFLICT DO NOTHING` to avoid overwriting existing settings.

4. **Media model definitions:**
   - Delegate to the existing seed script at `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-media-models-kie-ai.ts` by importing and calling its exported function, or by running it as a separate step. The existing script already uses `ON CONFLICT DO NOTHING`.

**Script structure (stub):**

```typescript
/**
 * seed-production.ts
 *
 * Bootstrap a fresh production database with minimum required data.
 * Fully idempotent -- safe to run multiple times.
 *
 * Usage: ADMIN_EMAIL=admin@example.com DATABASE_URL=... npx tsx scripts/seed-production.ts
 */

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { users, tenants, systemSettings } from "../drizzle/schema";
// ... imports for bcrypt, uuid generation

async function seedProduction(): Promise<void> {
  // 1. Validate ADMIN_EMAIL is set
  // 2. Connect to database
  // 3. Insert admin user (ON CONFLICT DO NOTHING)
  // 4. Insert default tenant (ON CONFLICT DO NOTHING)
  // 5. Insert system settings (ON CONFLICT DO NOTHING)
  // 6. Call media model seed (or instruct to run separately)
  // 7. Log results and disconnect
}

seedProduction().catch(console.error);
```

This script runs as a one-time CI step after the initial migration, not on every deploy. The CI/CD pipeline (section-17) calls it only when the `SEED_PRODUCTION=true` flag is set.

### 3.H Neon Branching (Optional)

Neon supports database branching for isolated testing. For staging:

- Create a branch from the main staging database before running risky migrations.
- Test the migration against the branch.
- If successful, apply to the main branch.
- If failed, delete the branch with no impact.

This is optional for MVP but recommended as a safety net. No code changes are required -- branching is done via the Neon console or CLI.

---

## File Summary

| File | Action | Description |
|------|--------|-------------|
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Modify | Add `cloudTaskEvents` table definition |
| `/home/dev/projects/SmartSpecPro/apps/web/server/db.ts` | Modify | Add explicit pool size configuration (`max`, `idle_timeout`, `connect_timeout`) |
| `/home/dev/projects/SmartSpecPro/apps/web/scripts/seed-production.ts` | Create | Production seed script (admin user, tenant, system settings) |
| `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/cloudTaskEvents.schema.test.ts` | Create | Schema validation tests for `cloud_task_events` |
| `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/connectionPool.test.ts` | Create | Connection pooling configuration tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/__tests__/migrationOrdering.test.ts` | Create | Migration ordering validation tests |
| `/home/dev/projects/SmartSpecPro/apps/web/scripts/__tests__/seedProduction.test.ts` | Create | Seed script idempotency tests |
| `/home/dev/projects/SmartSpecPro/python-backend/app/models/media_task.py` | Modify | Add `cloud_task_id` column to `MediaTask` model |
| `/home/dev/projects/SmartSpecPro/python-backend/migrations/005_add_cloud_task_id.py` | Create | Alembic migration to add `cloud_task_id` column |
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/database.py` | Modify | Make pool size configurable via environment variables |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/unit/test_media_task_cloud_task_id.py` | Create | Tests for the new `cloud_task_id` column |

---

## Implementation Checklist

1. Add `cloudTaskEvents` table definition to `schema.ts` and run `pnpm db:push`
2. Add `cloud_task_id` column to Python `MediaTask` model and create Alembic migration
3. Update `db.ts` to accept pool size from environment variable
4. Update `database.py` to accept pool size from environment variable
5. Create `seed-production.ts` with idempotent inserts for admin, tenant, and settings
6. Write all test files listed above
7. Run `pnpm test` to verify schema tests pass
8. Run `pytest` to verify Python migration tests pass
9. Verify migration ordering: Drizzle first, then Alembic, no conflicts