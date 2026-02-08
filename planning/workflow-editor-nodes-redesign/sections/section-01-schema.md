Now I have all the context I need. Let me generate the section content for section-01-schema:

# Section 01: Database Schema + Migrations

## Overview

This section implements the database foundation for the workflow editor redesign. Four new tables enable workflow persistence, template marketplace, search, and ratings. The schema follows the existing Drizzle ORM patterns in `apps/web/drizzle/schema.ts` and adds GIN indexes for performance.

**Dependencies:** None (foundation layer)

**Blocks:** Section 02 (registry needs node types API), Section 13 (template browser needs tables)

---

## Background Context

The current workflow editor has hardcoded example workflows with no persistence. This redesign introduces:

1. **User workflows** (`workflows` table) — draft storage, separate from templates
2. **Template marketplace** (`workflow_templates` table) — public/private template library
3. **Categories** (`template_categories` table) — hierarchical organization
4. **Ratings** (`template_ratings` table) — user feedback on templates

The Python backend is the source of truth for node type definitions (fetched via API), but workflow JSON is stored in PostgreSQL for multi-tenant isolation.

---

## Tests FIRST

Create test file: `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_schema.py`

```python
"""
Test suite for workflow schema tables.
Run: cd python-backend && uv run pytest tests/test_workflow_schema.py -v
"""
import pytest
from datetime import datetime

# Test: workflows table creation
async def test_workflows_table_insert():
    """Insert a workflow with required fields, verify it persists."""
    # Create workflow with name, description, workflowJson, userId, tenantId
    # Verify default status is 'draft'
    # Verify schemaVersion defaults to '1.0'
    pass

# Test: workflows table — workflowJson column stores and retrieves valid JSON
async def test_workflows_json_column():
    """Verify workflowJson stores nodes/edges arrays correctly."""
    # Insert workflow with {nodes: [...], edges: [...], viewport: {...}}
    # Retrieve and verify JSON structure matches
    pass

# Test: workflows table — status enum only accepts valid values
async def test_workflows_status_enum():
    """Status enum accepts: draft, compiled, running, completed, failed."""
    # Insert workflow with status='draft' → success
    # Insert workflow with status='invalid' → error
    pass

# Test: workflows table — userId FK constraint rejects non-existent user
async def test_workflows_user_fk():
    """FK constraint to users table enforced."""
    # Insert workflow with non-existent userId → FK error
    pass

# Test: workflows table — tenantId scoping
async def test_workflows_tenant_isolation():
    """Two tenants, each sees only own workflows."""
    # Create 2 tenants, insert workflow for each
    # Query tenant1's workflows → only sees tenant1's data
    # Query tenant2's workflows → only sees tenant2's data
    pass

# Test: workflows table — schemaVersion defaults to '1.0'
async def test_workflows_schema_version_default():
    """SchemaVersion auto-populates if not provided."""
    # Insert workflow without schemaVersion
    # Verify schemaVersion = '1.0'
    pass

# Test: workflows table — updatedAt auto-updates on modification
async def test_workflows_updated_at_auto():
    """UpdatedAt timestamp changes when row modified."""
    # Insert workflow, capture createdAt and updatedAt
    # Update workflow name
    # Verify updatedAt > original updatedAt
    pass

# Test: workflow_templates table — insert with required fields succeeds
async def test_templates_table_insert():
    """Insert template with name, description, workflowJson, authorId."""
    # Verify isPublic defaults to false
    # Verify downloadCount defaults to 0
    # Verify status defaults to 'draft'
    pass

# Test: workflow_templates table — isPublic defaults to false
async def test_templates_is_public_default():
    """New templates are private by default."""
    # Insert template without isPublic field
    # Verify isPublic = false
    pass

# Test: workflow_templates table — tags array stores and retrieves correctly
async def test_templates_tags_gin_index():
    """Tags stored as array, GIN indexed for @> operator."""
    # Insert template with tags: ["automation", "llm"]
    # Query WHERE tags @> ARRAY['automation'] → finds template
    # Query WHERE tags @> ARRAY['nonexistent'] → empty
    pass

# Test: workflow_templates table — status enum accepts valid values
async def test_templates_status_enum():
    """Status: draft, pending_review, published, archived."""
    # Insert template with status='published' → success
    # Insert template with status='invalid' → error
    pass

# Test: workflow_templates table — downloadCount defaults to 0
async def test_templates_download_count_default():
    """DownloadCount initializes to 0."""
    # Insert template without downloadCount
    # Verify downloadCount = 0
    pass

# Test: template_categories table — hierarchical (parentId self-FK works)
async def test_categories_hierarchical():
    """ParentId references same table for hierarchy."""
    # Insert category "AI Tools" (parentId=null)
    # Insert category "LLM Workflows" (parentId = "AI Tools".id)
    # Verify child category links to parent
    pass

# Test: template_categories table — slug unique constraint enforced
async def test_categories_slug_unique():
    """Slug must be unique across all categories."""
    # Insert category with slug="automation"
    # Insert another category with slug="automation" → unique constraint error
    pass

# Test: template_ratings table — UNIQUE(templateId, userId) prevents duplicates
async def test_ratings_unique_constraint():
    """User can only rate a template once."""
    # Insert rating (templateId=1, userId=1, rating=5)
    # Insert duplicate rating → unique constraint error
    pass

# Test: template_ratings table — rating value constrained between 1-5
async def test_ratings_value_range():
    """Rating must be 1-5."""
    # Insert rating with value=3 → success
    # Insert rating with value=0 → check constraint error
    # Insert rating with value=6 → check constraint error
    pass

# Test: search_vector tsvector — full-text search finds templates by name
async def test_templates_search_by_name():
    """Full-text search on name field."""
    # Insert template with name="LLM Chat Assistant"
    # Search for "chat" → finds template
    # Search for "nonexistent" → empty
    pass

# Test: search_vector tsvector — full-text search finds templates by description
async def test_templates_search_by_description():
    """Full-text search on description field."""
    # Insert template with description="Automate email responses using GPT-4"
    # Search for "email" → finds template
    # Search for "automation" → finds template
    pass

# Test: GIN index on tags — array contains operator (@>) works for tag filtering
async def test_templates_tags_filter():
    """GIN index enables fast tag filtering."""
    # Insert template1 with tags=["llm", "chat"]
    # Insert template2 with tags=["image", "generation"]
    # Query WHERE tags @> ARRAY['llm'] → finds template1 only
    pass
```

---

## Implementation Details

### Step 1: Add Enums

Edit `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`:

Add new enums after existing enum definitions (around line 28):

```typescript
// Workflow status enum
export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "compiled",
  "running",
  "completed",
  "failed",
]);

// Template status enum
export const templateStatusEnum = pgEnum("template_status", [
  "draft",
  "pending_review",
  "published",
  "archived",
]);
```

### Step 2: Add workflows Table

Add after existing tables (around line 2038):

```typescript
/**
 * Workflows — User's active workflow drafts
 * Separate from templates. Users edit workflows, then optionally save as template.
 */
export const workflows = pgTable("workflows", {
  id: serial("id").primaryKey(),

  /** Workflow name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Workflow description */
  description: text("description"),

  /** ReactFlow state: {nodes: [], edges: [], viewport: {}} */
  workflowJson: json("workflowJson").$type<{
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, any>;
      parentId?: string; // For loop groups
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      type?: string;
    }>;
    viewport?: { x: number; y: number; zoom: number };
  }>().notNull(),

  /** Owner user */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Tenant for multi-tenant isolation */
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }),

  /** Current workflow state */
  status: workflowStatusEnum("status").default("draft").notNull(),

  /** Last compilation timestamp */
  lastCompiledAt: timestamp("lastCompiledAt", { withTimezone: true }),

  /** Schema version for forward compatibility */
  schemaVersion: varchar("schemaVersion", { length: 10 }).default("1.0").notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflows_user_idx").on(t.userId),
  index("workflows_tenant_idx").on(t.tenantId),
  index("workflows_status_idx").on(t.status),
]);

export type Workflow = typeof workflows.$inferSelect;
export type InsertWorkflow = typeof workflows.$inferInsert;
```

### Step 3: Add template_categories Table

```typescript
/**
 * Template Categories — Hierarchical organization
 */
export const templateCategories = pgTable("template_categories", {
  id: serial("id").primaryKey(),

  /** Category name */
  name: varchar("name", { length: 100 }).notNull(),

  /** URL-safe slug */
  slug: varchar("slug", { length: 100 }).notNull().unique(),

  /** Parent category (null for root categories) */
  parentId: integer("parentId"), // Self-reference added below

  /** Display order */
  sortOrder: integer("sortOrder").default(0).notNull(),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

// Add self-reference after table definition
export const templateCategoriesRelations = {
  parent: templateCategories.parentId,
};

export type TemplateCategory = typeof templateCategories.$inferSelect;
export type InsertTemplateCategory = typeof templateCategories.$inferInsert;
```

### Step 4: Add workflow_templates Table

```typescript
/**
 * Workflow Templates — Marketplace
 * Public templates visible to all, private templates scoped to tenant
 */
export const workflowTemplates = pgTable("workflow_templates", {
  id: serial("id").primaryKey(),

  /** Template name */
  name: varchar("name", { length: 255 }).notNull(),

  /** Template description */
  description: text("description"),

  /** Validated ReactFlow state (same structure as workflows.workflowJson) */
  workflowJson: json("workflowJson").$type<{
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: Record<string, any>;
      parentId?: string;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      sourceHandle?: string;
      targetHandle?: string;
      type?: string;
    }>;
    viewport?: { x: number; y: number; zoom: number };
  }>().notNull(),

  /** Template author */
  authorId: integer("authorId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Tenant (null for public templates) */
  tenantId: integer("tenantId").references(() => tenants.id, { onDelete: "cascade" }),

  /** Category */
  categoryId: integer("categoryId").references(() => templateCategories.id, { onDelete: "set null" }),

  /** Tags for filtering */
  tags: json("tags").$type<string[]>().default([]),

  /** Public visibility */
  isPublic: boolean("isPublic").default(false).notNull(),

  /** Featured on marketplace */
  isFeatured: boolean("isFeatured").default(false).notNull(),

  /** Publication status */
  status: templateStatusEnum("status").default("draft").notNull(),

  /** Download counter */
  downloadCount: integer("downloadCount").default(0).notNull(),

  /** Version string */
  version: varchar("version", { length: 20 }).default("1.0").notNull(),

  /** Full-text search vector (auto-generated from name + description) */
  searchVector: text("searchVector"), // tsvector in migration SQL

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index("workflow_templates_author_idx").on(t.authorId),
  index("workflow_templates_tenant_idx").on(t.tenantId),
  index("workflow_templates_category_idx").on(t.categoryId),
  index("workflow_templates_status_idx").on(t.status),
  // GIN indexes added in migration SQL (can't express in Drizzle directly)
]);

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = typeof workflowTemplates.$inferInsert;
```

### Step 5: Add template_ratings Table

```typescript
/**
 * Template Ratings — User feedback
 */
export const templateRatings = pgTable("template_ratings", {
  id: serial("id").primaryKey(),

  /** Template being rated */
  templateId: integer("templateId").notNull().references(() => workflowTemplates.id, { onDelete: "cascade" }),

  /** User who rated */
  userId: integer("userId").notNull().references(() => users.id, { onDelete: "cascade" }),

  /** Rating value (1-5) */
  rating: integer("rating").notNull(),

  /** Optional review text */
  review: text("review"),

  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  uniqueIndex("template_ratings_unique").on(t.templateId, t.userId),
  index("template_ratings_template_idx").on(t.templateId),
]);

export type TemplateRating = typeof templateRatings.$inferSelect;
export type InsertTemplateRating = typeof templateRatings.$inferInsert;
```

### Step 6: Generate and Apply Migration

**CRITICAL: Follow Database Safety Protocol (CLAUDE.md)**

```bash
# 1. Create backup directory
mkdir -p /home/dev/projects/SmartSpecPro/.db-backups

# 2. This is a NEW table creation (no existing data risk), but backup users table as reference
pg_dump "$DATABASE_URL" --data-only --table=users \
  --file="/home/dev/projects/SmartSpecPro/.db-backups/users_$(date +%Y%m%d_%H%M%S).sql"

# 3. Generate migration
cd /home/dev/projects/SmartSpecPro/apps/web
pnpm drizzle-kit generate

# This creates: drizzle/XXXX_workflow_tables.sql
# The migration will include CREATE TABLE statements for all 4 tables

# 4. Manually add to the generated migration SQL (after CREATE TABLE statements):

-- GIN index for tags (array contains operator)
CREATE INDEX workflow_templates_tags_gin ON workflow_templates USING GIN (tags);

-- Add tsvector column and GIN index for full-text search
ALTER TABLE workflow_templates ADD COLUMN search_vector tsvector;

-- Auto-update search_vector from name + description
CREATE OR REPLACE FUNCTION workflow_templates_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.name, '') || ' ' || COALESCE(NEW.description, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_templates_search_vector_trigger
BEFORE INSERT OR UPDATE ON workflow_templates
FOR EACH ROW EXECUTE FUNCTION workflow_templates_search_vector_update();

-- GIN index on search_vector
CREATE INDEX workflow_templates_search_vector_gin ON workflow_templates USING GIN (search_vector);

-- Check constraint for rating value (1-5)
ALTER TABLE template_ratings ADD CONSTRAINT template_ratings_rating_check CHECK (rating >= 1 AND rating <= 5);

# 5. Apply migration
pnpm drizzle-kit migrate

# 6. Verify tables created
psql "$DATABASE_URL" -c "\dt workflows"
psql "$DATABASE_URL" -c "\dt workflow_templates"
psql "$DATABASE_URL" -c "\dt template_categories"
psql "$DATABASE_URL" -c "\dt template_ratings"

# 7. Verify indexes
psql "$DATABASE_URL" -c "\d+ workflow_templates"

# 8. Test insert (smoke test)
psql "$DATABASE_URL" -c "
INSERT INTO template_categories (name, slug, sort_order)
VALUES ('AI Workflows', 'ai-workflows', 1) RETURNING id;
"
```

### Step 7: Seed Initial Categories

Create seed script: `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seed-workflow-categories.ts`

```typescript
/**
 * Seed initial workflow template categories.
 * Run: cd apps/web && tsx drizzle/seed-workflow-categories.ts
 */
import { db } from "../server/_core/db";
import { templateCategories } from "./schema";

async function seedCategories() {
  console.log("Seeding workflow template categories...");

  const categories = [
    { name: "AI Workflows", slug: "ai-workflows", sortOrder: 1 },
    { name: "Automation", slug: "automation", sortOrder: 2 },
    { name: "Data Processing", slug: "data-processing", sortOrder: 3 },
    { name: "Content Generation", slug: "content-generation", sortOrder: 4 },
    { name: "Customer Support", slug: "customer-support", sortOrder: 5 },
  ];

  for (const cat of categories) {
    await db.insert(templateCategories).values(cat).onConflictDoNothing();
    console.log(`✓ ${cat.name}`);
  }

  console.log("Categories seeded successfully.");
}

seedCategories().catch(console.error);
```

---

## Verification Steps

1. **Row count check**: After migration, all 4 tables exist with 0 rows (except categories after seed)
2. **Index verification**: `\d+ workflow_templates` shows 3 GIN indexes (tags, search_vector, and any auto-created)
3. **Constraint verification**: Insert rating with value=0 → check constraint error
4. **Unique constraint verification**: Insert duplicate (templateId, userId) rating → unique constraint error
5. **Full-text search test**: Insert template, search with `to_tsquery('english', 'keyword')` → finds template
6. **Tag search test**: Insert template with tags, query `WHERE tags @> ARRAY['tag']` → finds template

---

## Key Decisions

1. **Drizzle ORM over raw SQL**: Consistency with existing schema, type safety
2. **ReactFlow JSON structure**: Store entire ReactFlow state (nodes, edges, viewport) for easy restore
3. **Tenant isolation**: `tenantId` on both workflows and templates for multi-tenant support
4. **Search vector auto-update**: Trigger ensures search_vector stays in sync with name/description
5. **Rating check constraint**: Added in migration SQL (Drizzle doesn't support check constraints declaratively)
6. **Forward compatibility**: `schemaVersion` field allows future schema migrations without breaking old workflows

---

## Migration Rollback Plan

If migration fails or data is lost:

```bash
# Drop tables in reverse dependency order
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS template_ratings CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS workflow_templates CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS workflows CASCADE;"
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS template_categories CASCADE;"
psql "$DATABASE_URL" -c "DROP TYPE IF EXISTS workflow_status CASCADE;"
psql "$DATABASE_URL" -c "DROP TYPE IF EXISTS template_status CASCADE;"

# Re-run from clean state if needed
```

---

## Next Section Dependencies

**Section 02 (Registry)** needs:
- None from this section (registry is in-memory Python)

**Section 13 (Template Browser)** needs:
- `workflow_templates` table
- `template_categories` table
- `template_ratings` table
- Full-text search index

**Section 08 (Workflow API)** needs:
- `workflows` table for CRUD operations

---

## File Paths Summary

**Modified:**
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` (add 4 tables + 2 enums)

**Created:**
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/XXXX_workflow_tables.sql` (generated migration)
- `/home/dev/projects/SmartSpecPro/apps/web/drizzle/seed-workflow-categories.ts` (seed script)
- `/home/dev/projects/SmartSpecPro/python-backend/tests/test_workflow_schema.py` (tests)

**Database:**
- `workflows` (new table)
- `workflow_templates` (new table)
- `template_categories` (new table)
- `template_ratings` (new table)
- `workflow_status` (new enum)
- `template_status` (new enum)