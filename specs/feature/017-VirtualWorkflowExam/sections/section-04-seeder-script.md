**Status: IMPLEMENTED**

# Section 04: Seeder Script

## Overview

This section covers creating the idempotent TypeScript seeder script at `/home/dev/projects/SmartSpecPro/scripts/seed-workflow-templates.ts`. The seeder reads the 60 template JSON files from `specs/feature/017-VirtualWorkflowExam/templates/`, generates an SVG preview for each, and upserts them into the database.

## Dependencies (Must Be Completed First)

This section depends on:

- **section-01-schema-extension** — The `workflowTemplates` table must have `previewSvg`, `industry`, `stepCount`, `estimatedSetupMinutes`, and `templateKey` columns, and `pnpm db:push` must have been run.
- **section-02-svg-generator** — The `generateWorkflowSvg` function must exist at `/home/dev/projects/SmartSpecPro/apps/web/server/lib/workflowSvgGenerator.ts`.
- **section-03-template-json-files** — All 60 JSON files must exist under `specs/feature/017-VirtualWorkflowExam/templates/tpl-*.json`.

## Tests First

Write the integration test file before implementing the seeder. These tests require a live database connection.

**File:** `/home/dev/projects/SmartSpecPro/scripts/__tests__/seedWorkflowTemplates.test.ts`

The test suite is integration-level (requires DB). Test cases to implement:

```typescript
// Integration tests (require DB — run with DATABASE_URL set):
//
// System user handling:
// - Seeder creates 'system@smartspecpro.internal' user if it doesn't exist
// - Seeder reuses existing system user on subsequent runs (SELECT count(*) remains 1)
//
// Category seeding:
// - Seeder inserts all 15 templateCategories before any template insert
// - Every seeded template row has a categoryId that references an existing templateCategories row
//
// Template seeding (after first run):
// - Exactly 60 rows in workflowTemplates with isPublic=true AND status='published'
// - Every row has a non-null templateKey
// - All templateKey values are unique
// - Every row has authorId === systemUser.id (not null)
//
// Idempotency (after second run):
// - Row count remains exactly 60 (no duplicates created)
// - A modified name in a template JSON is reflected in the updated database row
//
// Error resilience:
// - SVG generation failure (malformed workflowJson) → script logs warning, continues, doesn't abort
// - Templates that generated SVG successfully have non-null previewSvg
//
// Exit code:
// - Script exits with code 0 on complete success
// - Script exits with code 1 on DB connection failure
```

## Implementation Details

### File to Create

**`/home/dev/projects/SmartSpecPro/scripts/seed-workflow-templates.ts`**

This is a standalone Node.js script that uses `dotenv/config` and imports from the web app's server modules.

### Script Skeleton

```typescript
/**
 * Idempotent seeder for workflow template examples (Feature 017).
 *
 * Reads 60 JSON files from specs/feature/017-VirtualWorkflowExam/templates/,
 * generates SVG previews, and upserts into the database.
 *
 * Usage:
 *   cd apps/web && npx tsx ../../scripts/seed-workflow-templates.ts
 *
 * Safe to run multiple times. Uses templateKey as the ON CONFLICT target.
 * Exit code 0 = success (warnings allowed), 1 = unrecoverable error.
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs";

// Import Drizzle client and schema from the web app
// (run from apps/web/ so relative imports work)
import { db } from "./server/db"; // adjust to actual db client export path
import { workflowTemplates, templateCategories, users } from "./drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { generateWorkflowSvg } from "./server/lib/workflowSvgGenerator";

// -- Types ---------------------------------------------------------------

interface TemplateJson {
  id: string;            // e.g. "tpl-001"
  name: string;
  description: string;
  category: string;      // must match one of the 15 category names
  industry: string[];
  tags: string[];
  stepCount: number;
  estimatedSetupMinutes: number;
  workflowJson: {
    nodes: Array<{ id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> }>;
    edges: Array<{ id: string; source: string; target: string }>;
  };
}

// -- Constants -----------------------------------------------------------

/** Canonical list of 15 category names. Order determines display sort. */
const CATEGORY_NAMES: string[] = [
  "Sales & Marketing",
  "HR & People",
  "Finance & Accounting",
  "IT & DevOps",
  "Healthcare",
  "Education",
  "Government & Public",
  "Personal Productivity",
  "Real Estate",
  "Logistics & Supply Chain",
  "Content & Media",
  "Food & Restaurant",
  "Legal & Compliance",
  "Customer Service",
  "AI & Automation",
];

const TEMPLATES_DIR = path.resolve(
  __dirname,
  "../specs/feature/017-VirtualWorkflowExam/templates"
);

const SVG_TIMEOUT_MS = 10_000;

// -- Main ----------------------------------------------------------------

async function main(): Promise<void> {
  // Step 0: seed templateCategories
  // Step 1: resolve system user
  // Step 2: load + seed all 60 template files
  // Step 3: print summary, exit
}

main().catch((err) => {
  console.error("Seeder failed (unrecoverable):", err);
  process.exit(1);
});
```

### Step 0: Seed `templateCategories`

The seeder must run this step before any template insert because `workflowTemplates.categoryId` is a foreign key.

```typescript
async function seedCategories(
  db: /* Drizzle DB type */
): Promise<Map<string, number>> {
  /**
   * Upserts all 15 categories into templateCategories.
   * Uses category name as the unique conflict target.
   * Returns a Map<categoryName, categoryId> for FK resolution.
   *
   * Note: The templateCategories table has a `slug` NOT NULL column.
   * Derive slug from name: lowercase, replace spaces+& with hyphens.
   * Example: "Sales & Marketing" → "sales-marketing"
   */
}
```

Use Drizzle's `onConflictDoUpdate` targeting the `name` column (or `slug` if `name` doesn't have a unique constraint — check the schema). If neither has a unique constraint, use `onConflictDoNothing` and then query back the IDs.

**Note from schema inspection:** The `templateCategories` table has `name varchar(100) NOT NULL` and `slug varchar(100) NOT NULL UNIQUE`. Use `slug` as the conflict target. Derive slug from name with: `name.toLowerCase().replace(/\s+&\s+/g, '-').replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')`.

The 15 slugs derived from the category names:
- "sales-marketing", "hr-people", "finance-accounting", "it-devops", "healthcare", "education", "government-public", "personal-productivity", "real-estate", "logistics-supply-chain", "content-media", "food-restaurant", "legal-compliance", "customer-service", "ai-automation"

### Step 1: Resolve System User

```typescript
async function resolveSystemUser(db: /* Drizzle DB type */): Promise<number> {
  /**
   * Finds or creates the system user 'system@smartspecpro.internal'.
   * Returns the user's integer id.
   *
   * Insert minimal fields required by the users table NOT NULL constraints:
   * - email: 'system@smartspecpro.internal'
   * - name: 'System'
   * - role: 'system' (or the closest available role enum value — check users table)
   *
   * Use onConflictDoNothing on the email column, then query back by email.
   * Never throw if the user already exists.
   */
}
```

To determine the exact fields required (NOT NULL columns without defaults), check the `users` table definition in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`. The role value must be a valid value in the `roleEnum`.

### Step 2: Load and Upsert Templates

```typescript
async function seedTemplates(
  db: /* Drizzle DB type */,
  systemUserId: number,
  categoryMap: Map<string, number>
): Promise<{ ok: number; warned: number; errored: number }> {
  /**
   * Reads all tpl-*.json files from TEMPLATES_DIR, generates SVGs,
   * and upserts each into workflowTemplates.
   *
   * Per-template:
   * 1. Parse JSON with try/catch — on parse error: log [ERROR], increment errored, continue
   * 2. Generate SVG with 10s timeout — on timeout/error: previewSvg = null, log [WARN]
   * 3. Resolve categoryId from categoryMap — on missing category: log [ERROR], continue
   * 4. Upsert via onConflictDoUpdate targeting templateKey column
   *    - On conflict: update name, description, workflowJson, previewSvg, tags,
   *      industry, stepCount, estimatedSetupMinutes, updatedAt
   *
   * System template values (same for all 60):
   *   tenantId: null
   *   isPublic: true
   *   status: 'published'
   *   authorId: systemUserId
   *
   * stepCount: use template.workflowJson.nodes.length (authoritative — recompute, don't trust JSON value)
   */
}
```

### SVG Generation with Timeout

Wrap the `generateWorkflowSvg` call in a `Promise.race` against a timeout promise:

```typescript
async function generateSvgWithTimeout(
  workflowJson: TemplateJson["workflowJson"],
  timeoutMs: number
): Promise<string | null> {
  /**
   * Calls generateWorkflowSvg inside a Promise.race with a timeout.
   * Returns null on timeout or any thrown error.
   * Logs a warning with the template id when null is returned.
   *
   * Note: generateWorkflowSvg is synchronous. Wrap in Promise.resolve() to
   * allow the race pattern to work. The timeout protects against
   * pathologically large workflow graphs that could hang the process.
   */
}
```

### Drizzle Upsert Pattern

```typescript
await db
  .insert(workflowTemplates)
  .values({
    templateKey: template.id,
    name: template.name,
    description: template.description,
    workflowJson: template.workflowJson,
    previewSvg,                         // null if generation failed
    industry: template.industry,
    tags: template.tags,
    stepCount: template.workflowJson.nodes.length,
    estimatedSetupMinutes: template.estimatedSetupMinutes,
    categoryId,
    authorId: systemUserId,
    tenantId: null,
    isPublic: true,
    status: "published",
  })
  .onConflictDoUpdate({
    target: workflowTemplates.templateKey,   // unique column added in section-01
    set: {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      workflowJson: sql`excluded."workflowJson"`,
      previewSvg: sql`excluded."previewSvg"`,
      industry: sql`excluded.industry`,
      tags: sql`excluded.tags`,
      stepCount: sql`excluded."stepCount"`,
      estimatedSetupMinutes: sql`excluded."estimatedSetupMinutes"`,
      updatedAt: sql`now()`,
    },
  });
```

### Summary Output

The seeder must print a line per template and a final summary:

```
[OK]   tpl-001 — Daily Sales Report
[OK]   tpl-002 — Lead Scoring Pipeline
[WARN] tpl-042 — SVG timeout (previewSvg=null)
[ERROR] tpl-017 — Category not found: "Finance & Accounting" (check categoryMap)

Seeded 60 templates: 58 OK, 1 warned (SVG), 1 errored
```

Exit with `process.exit(0)` on completion (even if some templates warned/errored). Exit with `process.exit(1)` only for unrecoverable errors: DB connection failure, cannot create system user, cannot connect at all.

### Running the Seeder

```bash
cd apps/web && npx tsx ../../scripts/seed-workflow-templates.ts
```

The script must be run from `apps/web/` so that relative imports from `./drizzle/schema` and `./server/lib/workflowSvgGenerator` resolve correctly. The `__dirname` for the templates glob must account for this working directory.

Alternatively, use absolute paths computed from `__dirname` at the script's own location for portability.

## Idempotency Contract

| Run | Expected Outcome |
|-----|-----------------|
| First run (empty DB) | 15 category rows inserted, 1 system user created, 60 template rows inserted |
| Second run (no changes) | No new rows; all 60 rows updated in-place (same data, `updatedAt` refreshed) |
| Second run (JSON changed) | Modified fields reflected in DB row; row count remains 60 |
| Run after partial failure | Previously failed templates retried; successful ones updated in-place |

## Key Constraints to Enforce

- `workflowTemplates.authorId` is `NOT NULL` — the system user resolution (Step 1) must succeed or the script must abort with exit code 1 and a clear error message.
- `workflowTemplates.categoryId` is a FK to `templateCategories.id` — all 15 categories must be seeded (Step 0) before any template is inserted.
- `templateKey` must be unique — never insert two templates with the same `templateKey`. The JSON files ensure uniqueness via the `tpl-NNN` naming convention.
- `tenantId = null` marks a system-level resource visible to all tenants — do not pass the current user's tenantId.

## File Locations Summary

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/scripts/seed-workflow-templates.ts` | Create (main seeder) |
| `/home/dev/projects/SmartSpecPro/scripts/__tests__/seedWorkflowTemplates.test.ts` | Create (integration tests) |

## Verification After Running

After running the seeder, confirm correctness with these queries:

```sql
-- Row counts
SELECT count(*) FROM workflow_templates WHERE "isPublic" = true AND status = 'published';
-- Expected: 60

-- Category distribution
SELECT tc.name, count(wt.id) as cnt
FROM template_categories tc
LEFT JOIN workflow_templates wt ON wt."categoryId" = tc.id
GROUP BY tc.name ORDER BY tc.name;
-- Expected: 15 rows, sums to 60

-- System user
SELECT id, email, role FROM users WHERE email = 'system@smartspecpro.internal';
-- Expected: 1 row

-- No null authorId
SELECT count(*) FROM workflow_templates WHERE "authorId" IS NULL;
-- Expected: 0

-- SVG coverage
SELECT count(*) FROM workflow_templates WHERE "previewSvg" IS NULL;
-- Expected: 0 (warn if > 0)
```

## Implementation Notes

### Deviations from Spec

1. **Import strategy**: Spec suggested `import 'dotenv/config'` and relative imports from `./drizzle/schema`. Implementation uses manual `.env` loading from `apps/web/.env` and absolute-relative imports from `../apps/web/drizzle/schema` since the script lives in `/scripts/` outside `apps/web/`. Run command uses `NODE_PATH=./node_modules`.

2. **System user conflict target**: Spec said `onConflictDoNothing` on email column. Implementation uses `openId` because `email` has no unique constraint in the schema, while `openId` does. This is the correct choice.

3. **System user role**: Spec suggested `role: 'system'`. No 'system' role exists in enum. Used `role: 'user'` (per code review decision — safer than 'admin').

4. **Drizzle client**: Spec suggested `import { db } from './server/db'`. Implementation creates its own `postgres` + `drizzle` client directly since the lazy proxy in `server/db.ts` doesn't work outside the web app context.

### Code Review Fixes Applied

- Fixed timer leak in `generateSvgWithTimeout` (clearTimeout on both success and error paths)
- Fixed counting bug: templates with SVG warnings now correctly logged as OK for DB upsert
- Added `categoryId` to `onConflictDoUpdate` set clause for full idempotency
- Changed system user role from 'admin' to 'user'
- Test queries changed from `users.email` to `users.openId` for consistency
- Category count assertion tightened from `>=15` to exact `toBe(15)`
- Removed unused `count` import from test file

### Run Command

```bash
cd apps/web && NODE_PATH=./node_modules npx tsx ../../scripts/seed-workflow-templates.ts
```

### Verification Results

- First run: 15 categories, 1 system user (id=106), 60 templates — all OK, 0 warnings
- Second run: idempotent — same results, no duplicates