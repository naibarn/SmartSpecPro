I now have all the context needed to write section-01-schema. The latest migration is `0120_next_black_knight.sql`, so the new one will be `0121_content_composer_drafts.sql`.

# Section 01 — Database Schema

## section-01-schema

### Overview

This section adds the two schema changes required for Feature 060. All subsequent sections depend on the type exports produced here.

**Blocks:** section-03-trpc-crud, section-08-generation-stream, section-09-publish

**Dependency graph position:** Batch 1 (no dependencies, safe to start immediately in parallel with section-02-safe-html-state)

---

### Files to Create or Modify

| File | Action |
|---|---|
| `apps/web/drizzle/schema.ts` | Add `contentComposerDrafts` table; add `mediaAttachments` column to `blogPosts` |
| `apps/web/drizzle/0121_content_composer_drafts.sql` | Generated migration SQL (created by `pnpm db:push`) |

---

### Background: Existing Schema Patterns

The schema file is at `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`. Key conventions in use:

- All imports come from `drizzle-orm/pg-core` (line 1).
- `tenants.id` is `varchar("id", { length: 36 })` — a string UUID PK.
- `users.id` is `serial("id")` — an integer PK.
- `libraryItems.id` is `serial("id")` — an integer PK. The column `sourceUrl` is `text("source_url")` and `status` uses `libraryItemStatusEnum`.
- `blogPosts` lives at schema line 2984; its PK is `serial("id")` (integer). It uses `varchar("tenantId", { length: 36 })` (camelCase column name, quoted in SQL).
- Timestamps with timezone: `timestamp("col", { withTimezone: true }).defaultNow().notNull()`.
- JSON columns: `json("col").$type<T>()`.
- Indexes use the `(t) => [index("name").on(t.col), ...]` callback form.
- Type exports immediately follow each table: `export type Foo = typeof foos.$inferSelect`.
- The most recent migration is `0120_next_black_knight.sql`; the new migration will be `0121_content_composer_drafts.sql`.

---

### 3.1 New Table: `contentComposerDrafts`

Add the following table definition to `apps/web/drizzle/schema.ts`. Place it after the `blogPosts` type exports (after line 3038) and before the `scheduleStatusEnum` declaration (currently line 3044), or at the end of the "Content" section — whichever keeps logical grouping.

```typescript
// ============================================================
// Content Composer Drafts — Feature 060
// ============================================================

export const contentComposerDrafts = pgTable("content_composer_drafts", {
  /** UUID primary key */
  id: varchar("id", { length: 36 }).primaryKey(),

  /** Tenant this draft belongs to */
  tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => tenants.id, { onDelete: "cascade" }),

  /** User who created this draft */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Article topic (max 2,000 chars enforced in tRPC) */
  topic: text("topic").notNull().default(""),

  /** "skill" | "agency" */
  executionSource: varchar("executionSource", { length: 20 }),

  /** Selected skill ID */
  skillId: varchar("skillId", { length: 255 }),

  /** Selected agency ID */
  agencyId: varchar("agencyId", { length: 255 }),

  /** Sanitized HTML article body; null until generation completes */
  articleBody: text("articleBody"),

  /** Whether to include web search during generation */
  requiresWebSearch: boolean("requiresWebSearch").notNull().default(false),

  /** Whether to enable extended thinking during generation */
  requiresThinking: boolean("requiresThinking").notNull().default(false),

  /** Array of libraryItems.id integers */
  attachmentIds: json("attachmentIds").$type<number[]>().notNull().default([]),

  /** "docs" | "blog" | "social" */
  destinationKind: varchar("destinationKind", { length: 20 }),

  /** "doc_page" | "cms_page" — used when destinationKind = "docs" */
  docsSubKind: varchar("docsSubKind", { length: 20 }),

  /** Existing doc_pages.id or tenant_pages.id to update; null = create new */
  docsTargetId: integer("docsTargetId"),

  /** Existing blog_posts.id to update; null = create new */
  blogTargetId: integer("blogTargetId"),

  /** "youtube" | "facebook" | "tiktok" | "upload_post" */
  socialPlatform: varchar("socialPlatform", { length: 50 }),

  /** socialPages.id */
  socialTargetId: integer("socialTargetId"),

  /** Auto-generated + user-edited social caption */
  socialCaption: text("socialCaption"),

  /** "draft" | "published" | "failed" | "deleted" */
  status: varchar("status", { length: 30 }).notNull().default("draft"),

  /** Error detail set when status = "failed" */
  errorMessage: text("errorMessage"),

  /** Timestamp when publish succeeded */
  publishedAt: timestamp("publishedAt", { withTimezone: true }),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("ccd_tenant_user_status_idx").on(t.tenantId, t.userId, t.status),
  index("ccd_tenant_updated_at_idx").on(t.tenantId, t.updatedAt),
]);

export type ContentComposerDraft = typeof contentComposerDrafts.$inferSelect;
export type InsertContentComposerDraft = typeof contentComposerDrafts.$inferInsert;
```

**Important:** `id` is a `varchar(36)` UUID string, not a serial integer — consistent with tenants.id and the draft lifecycle where the client generates the UUID with `crypto.randomUUID()` before the first save.

---

### 3.2 Modified Table: `blogPosts`

Inside the existing `blogPosts = pgTable(...)` definition (around line 3034, just before `createdAt`), add:

```typescript
  /** Library attachment IDs from the Article Composer (integer[]) */
  mediaAttachments: json("mediaAttachments").$type<number[]>(),
```

This is a nullable JSON column (no `.notNull()`) — backward compatible with all existing rows. The updated `BlogPost` and `InsertBlogPost` type exports (lines 3037–3038) will automatically include `mediaAttachments: number[] | null | undefined` once Drizzle re-infers them.

---

### 3.3 Migration

After editing `schema.ts`, run the migration immediately:

```
cd apps/web && pnpm db:push
```

This generates `apps/web/drizzle/0121_content_composer_drafts.sql` and applies it. The expected SQL content (for reference and manual fallback) is:

```sql
CREATE TABLE IF NOT EXISTS "content_composer_drafts" (
  "id" varchar(36) PRIMARY KEY NOT NULL,
  "tenantId" varchar(36) NOT NULL,
  "userId" integer NOT NULL,
  "topic" text DEFAULT '' NOT NULL,
  "executionSource" varchar(20),
  "skillId" varchar(255),
  "agencyId" varchar(255),
  "articleBody" text,
  "requiresWebSearch" boolean DEFAULT false NOT NULL,
  "requiresThinking" boolean DEFAULT false NOT NULL,
  "attachmentIds" json DEFAULT '[]'::json NOT NULL,
  "destinationKind" varchar(20),
  "docsSubKind" varchar(20),
  "docsTargetId" integer,
  "blogTargetId" integer,
  "socialPlatform" varchar(50),
  "socialTargetId" integer,
  "socialCaption" text,
  "status" varchar(30) DEFAULT 'draft' NOT NULL,
  "errorMessage" text,
  "publishedAt" timestamp with time zone,
  "createdAt" timestamp with time zone DEFAULT now() NOT NULL,
  "updatedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_composer_drafts"
  ADD CONSTRAINT "content_composer_drafts_tenantId_tenants_id_fk"
  FOREIGN KEY ("tenantId") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "content_composer_drafts"
  ADD CONSTRAINT "content_composer_drafts_userId_users_id_fk"
  FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccd_tenant_user_status_idx"
  ON "content_composer_drafts" USING btree ("tenantId", "userId", "status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ccd_tenant_updated_at_idx"
  ON "content_composer_drafts" USING btree ("tenantId", "updatedAt");
--> statement-breakpoint
ALTER TABLE "blog_posts"
  ADD COLUMN IF NOT EXISTS "mediaAttachments" json;
```

If `pnpm db:push` fails to apply, execute this SQL directly via `psql "$DATABASE_URL"` then record the migration hash in `drizzle/__drizzle_migrations` as described in the web app CLAUDE.md.

---

### 3.4 Database Safety Protocol

Follow the Database Safety Protocol before running the migration:

1. Identify affected tables: `blog_posts` (column add), `content_composer_drafts` (new table — no backup needed for new table).
2. Backup `blog_posts` before altering it:
   ```
   pg_dump "$DATABASE_URL" --data-only --table=blog_posts \
     --file=".db-backups/blog_posts_$(date +%Y%m%d_%H%M%S).sql"
   ```
3. Record pre-migration row count:
   ```sql
   SELECT count(*) FROM blog_posts;
   ```
4. Run `pnpm db:push`.
5. Verify `blog_posts` row count is unchanged.
6. Spot-check that `mediaAttachments` column exists:
   ```sql
   SELECT "mediaAttachments" FROM blog_posts LIMIT 1;
   ```
7. Verify the new table exists:
   ```sql
   SELECT count(*) FROM content_composer_drafts;
   -- Expected: 0
   ```

Both operations are low-risk (nullable column add + new empty table) but the backup step is mandatory per project protocol.

---

### 3.5 Type Exports Used by Other Sections

The following types produced in this section are imported directly by sections 03, 08, and 09:

| Export | Used by |
|---|---|
| `ContentComposerDraft` | section-03-trpc-crud (procedure return types), section-09-publish (validation) |
| `InsertContentComposerDraft` | section-03-trpc-crud (saveDraft insert) |
| `contentComposerDrafts` (table ref) | section-03-trpc-crud (Drizzle queries) |
| `blogPosts` (updated table ref) | section-09-publish (blog fan-out handler) |
| `BlogPost` (updated inferred type) | section-09-publish |

All imports use the path `@shared/` or the relative path `../../drizzle/schema` depending on the importing file's location. Section-03 and later sections import from `apps/web/drizzle/schema.ts` via the server-side path.

---

### TDD Expectations (Section 1)

**Test file:** `apps/web/server/routers/__tests__/contentComposerMigration.test.ts`

These are schema-level integration tests. They run Drizzle queries against a test database that has the migration applied and verify column existence and defaults. Do not mock the DB layer for these tests.

```typescript
// Test: content_composer_drafts table exists after migration
// → INSERT a minimal row (id, tenantId, userId, topic) and SELECT it back

// Test: all required columns exist
// → SELECT id, tenantId, userId, topic, executionSource, skillId, agencyId,
//          articleBody, requiresWebSearch, requiresThinking, attachmentIds,
//          destinationKind, docsSubKind, docsTargetId, blogTargetId,
//          socialPlatform, socialTargetId, socialCaption, status,
//          errorMessage, publishedAt, createdAt, updatedAt
//   FROM content_composer_drafts LIMIT 0  (no error = columns exist)

// Test: status defaults to "draft"
// → INSERT row without status field; SELECT status; assert === "draft"

// Test: requiresWebSearch defaults to false
// → INSERT row without requiresWebSearch; SELECT requiresWebSearch; assert === false

// Test: requiresThinking defaults to false
// → INSERT row without requiresThinking; SELECT requiresThinking; assert === false

// Test: attachmentIds defaults to []
// → INSERT row without attachmentIds; SELECT attachmentIds; assert deepEqual []

// Test: blog_posts table has mediaAttachments column after migration
// → SELECT "mediaAttachments" FROM blog_posts LIMIT 0 (no error = column exists)

// Test: blog_posts.mediaAttachments is nullable
// → SELECT id FROM blog_posts WHERE "mediaAttachments" IS NULL LIMIT 1
//   (existing rows should have null, not throw)
```

Stub the test file with `describe` blocks and `it.todo` markers first; implement when the migration is confirmed applied.

---

### Checklist for Implementer

- [ ] Edit `apps/web/drizzle/schema.ts`: add `contentComposerDrafts` table with all fields above
- [ ] Edit `apps/web/drizzle/schema.ts`: add `mediaAttachments` nullable JSON column to `blogPosts`
- [ ] Backup `blog_posts` table before running migration
- [ ] Run `cd apps/web && pnpm db:push`
- [ ] Confirm `0121_content_composer_drafts.sql` was generated and applied
- [ ] Verify `blog_posts` row count unchanged
- [ ] Verify both schema changes visible in the database
- [ ] Create stub test file `apps/web/server/routers/__tests__/contentComposerMigration.test.ts`
- [ ] Confirm `ContentComposerDraft` and `InsertContentComposerDraft` types are exported and importable by section-03