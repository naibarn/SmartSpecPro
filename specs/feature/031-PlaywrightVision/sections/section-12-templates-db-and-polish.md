Now I have enough context. Let me write the section content.

# Section 12: Templates DB and Polish

## Overview

This is the final section of Feature 031-PlaywrightVision (Wave 5). It adds the `automationTemplates` database table, the migration, and the template save/load UI that lets users save successful automations for reuse and browse a marketplace of public templates.

**Dependencies:** This section depends on all previous sections (01-11) being implemented. Specifically:
- Section 09 must be complete (the `automationExecutions` table and tRPC router exist)
- Section 10 must be complete (the `AutomationChatModal` exists to integrate template loading)
- Section 11 must be complete (admin settings and navigation are in place)

## Background

The `automationTemplates` table stores successful automation intents and scripts so users can reuse them without going through the full Vision LLM analysis pipeline again. Templates can be marked public for a marketplace view, sorted by usage count. The tenant FK uses `varchar(36)` referencing `tenants.id` with `ON DELETE CASCADE`, following the pattern used throughout the codebase (see `libraryItems`, `agencyVersions`, etc. in `apps/web/drizzle/schema.ts`).

The `browser_automation` value already exists in `creditSourceTypeEnum` in the schema, so no enum migration is needed for this section.

---

## Tests

Tests are split between the Python backend (for the `/templates` endpoint integration) and the Node.js side (for schema validation and template CRUD via tRPC).

### 7.1-7.2 Database Schema Tests (Vitest)

**File:** `apps/web/server/routers/__tests__/automationTemplates.test.ts`

These tests validate the Drizzle schema definition and basic CRUD behavior.

- **Test: automationTemplates table has correct columns and indexes** -- Import `automationTemplates` from `drizzle/schema.ts` and verify it has all expected column names: `id`, `tenantId`, `userId`, `name`, `description`, `intent`, `scripts`, `thumbnailUrl`, `isPublic`, `usageCount`, `lastUsedAt`, `createdAt`, `updatedAt`.
- **Test: automationTemplates cascade-deletes when tenant deleted** -- Insert a template row, delete the parent tenant, verify the template row no longer exists.
- **Test: isPublic + usageCount DESC index supports marketplace queries** -- Verify the index definition exists in the table's index list. The index should be defined on `(isPublic, usageCount)` to support queries like `WHERE isPublic = true ORDER BY usageCount DESC`.

### Template CRUD Tests (Vitest)

**File:** `apps/web/client/src/components/automation/__tests__/AutomationTemplates.test.tsx`

These tests use React Testing Library with mocked tRPC procedures.

- **Test: save template from successful execution** -- Render the success state of `AutomationChatModal`, click the "Save as template" button, verify a dialog appears with name/description fields, submit the form, verify the `saveTemplate` tRPC mutation is called with the correct intent and scripts payload.
- **Test: load template populates AutomationChatModal** -- Render a template list, click on a template, verify the `AutomationChatModal` opens with the template's intent pre-populated in the prompt field and the preview panel showing the template's steps.
- **Test: template list shows only tenant's templates (+ public templates)** -- Mock the `listTemplates` tRPC query to return a mix of own and public templates, verify all are rendered, verify templates from other tenants that are not public are not shown.
- **Test: usageCount incremented when template used** -- Load a template and execute it, verify the `useTemplate` mutation is called which increments the usage count.

### Python Integration Tests (pytest)

These tests are additions to the existing file `tests/integration/test_automation_copilot_api.py`.

- **Test: /templates returns only tenant's own templates** -- Insert templates for two different tenants, request `/templates` with tenant A's ID, verify only tenant A's templates are returned.
- **Test: /templates uses timestamp cursor pagination (not UUID)** -- Insert multiple templates, request with `limit=2`, verify `next_cursor` is a timestamp string, request again with that cursor, verify the next batch is returned and does not overlap.

---

## Implementation Details

### Step 1: Add `automationTemplates` table to Drizzle schema

**File to modify:** `apps/web/drizzle/schema.ts`

Add the following table definition. Place it near the `automationExecutions` table (added in section 09) for logical grouping.

Table name: `automation_templates`

Columns:
- `id` -- `uuid` primary key, default `gen_random_uuid()`
- `tenantId` -- `varchar("tenant_id", { length: 36 })`, NOT NULL, FK to `tenants.id` with `onDelete: "cascade"`
- `userId` -- `integer("user_id")`, NOT NULL, FK to `users.id`
- `name` -- `text("name")`, NOT NULL
- `description` -- `text("description")`, nullable
- `intent` -- `jsonb("intent")`, NOT NULL (stores the `AutomationIntent` object)
- `scripts` -- `jsonb("scripts")`, NOT NULL (stores the array of `PlaywrightScript` objects)
- `thumbnailUrl` -- `text("thumbnail_url")`, nullable
- `isPublic` -- `boolean("is_public")`, default `false`, NOT NULL
- `usageCount` -- `integer("usage_count")`, default `0`, NOT NULL
- `lastUsedAt` -- `timestamp("last_used_at", { withTimezone: true })`, nullable
- `createdAt` -- `timestamp("created_at", { withTimezone: true })`, `defaultNow()`, NOT NULL
- `updatedAt` -- `timestamp("updated_at", { withTimezone: true })`, `defaultNow()`, NOT NULL

Indexes (defined in the table's third argument function):
- `index("automation_templates_tenant_idx").on(t.tenantId)`
- `index("automation_templates_public_usage_idx").on(t.isPublic, t.usageCount)` -- supports marketplace queries sorted by popularity

Export the inferred types:
```typescript
export type AutomationTemplate = typeof automationTemplates.$inferSelect;
export type InsertAutomationTemplate = typeof automationTemplates.$inferInsert;
```

### Step 2: Generate and apply the migration

This step is review-gated per the plan. The process:

1. Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push` to generate migration SQL via `drizzle-kit generate` and apply it via `drizzle-kit migrate`.
2. Before applying, back up any affected tables per the Database Safety Protocol.
3. Since this is a new table (ADD TABLE), risk is Low -- no existing data is at risk.
4. After migration, verify the table exists: `psql "$DATABASE_URL" -c "\d automation_templates"`
5. Verify the indexes exist: `psql "$DATABASE_URL" -c "\di automation_templates_*"`

### Step 3: Add tRPC procedures for template CRUD

**File to modify:** `apps/web/server/routers/automationCopilot.ts` (created in section 09)

Add four new procedures to the existing `automationCopilot` router:

**`automationCopilot.saveTemplate`** (mutation)
- Input: `{ name: string, description?: string, intentJson: string, scriptsJson: string, isPublic?: boolean }`
- Inserts a row into `automationTemplates` with `tenantId` from session, `userId` from session
- Returns `{ id: string }`

**`automationCopilot.listTemplates`** (query)
- Input: `{ limit?: number (default 20, max 50), cursor?: string (ISO timestamp) }`
- Queries templates WHERE `tenantId = session.tenantId OR isPublic = true`
- Orders by `createdAt DESC` with timestamp cursor pagination
- Returns `{ templates: AutomationTemplate[], nextCursor?: string }`

**`automationCopilot.useTemplate`** (mutation)
- Input: `{ templateId: string }`
- Increments `usageCount` by 1, sets `lastUsedAt` to now
- Returns the template's `intent` and `scripts` JSON for the frontend to populate the chat modal

**`automationCopilot.deleteTemplate`** (mutation)
- Input: `{ templateId: string }`
- Deletes the template WHERE `id = templateId AND tenantId = session.tenantId` (prevents cross-tenant deletion)
- Returns `{ deleted: true }`

### Step 4: Update the Python `/templates` endpoint

**File to modify:** `python-backend/app/api/automation_copilot.py` (created in section 08)

The `/templates` GET endpoint was stubbed in section 08. Update it to query the `automation_templates` table via SQLAlchemy. The endpoint must:

- Accept query params: `tenant_id`, `limit` (default 20), `cursor` (optional ISO timestamp string)
- Query: `WHERE tenant_id = :tenant_id OR is_public = true`
- If cursor provided: `AND created_at < :cursor`
- Order by `created_at DESC`
- Limit to `limit + 1` rows to determine if there is a next page
- Return `{ templates: [...], next_cursor: <created_at of last item if more exist> }`

Note: The Python endpoint is used only when the Node.js tRPC layer is bypassed (direct API access). The primary path goes through tRPC. Both must enforce tenant isolation.

### Step 5: Template save/load UI

**Files to modify:**
- `apps/web/client/src/components/automation/AutomationChatModal.tsx` (created in section 10)

**Save template flow:**
When `AutomationChatModal` reaches the `success` state, render a "Save as template" button. Clicking it opens an inline form (or a small dialog) with:
- `name` text input (required)
- `description` textarea (optional)
- `isPublic` checkbox (default unchecked)
- Submit button that calls `trpc.automationCopilot.saveTemplate.useMutation()`

On successful save, show a success toast via Sonner.

**Load template flow:**
Add a "Templates" tab or button in the `idle` state of `AutomationChatModal`. Clicking it renders a list of templates from `trpc.automationCopilot.listTemplates.useQuery()`. Each template shows:
- Name and description
- Usage count badge
- "Public" badge if `isPublic`
- Thumbnail if available

Clicking a template calls `trpc.automationCopilot.useTemplate.useMutation()`, which returns the intent and scripts. The modal then transitions to `preview_ready` state with the template's data pre-populated, allowing the user to review before executing.

**Template list component:**
Create a small `TemplateListPanel` component (can be inline in the same file or a separate file at `apps/web/client/src/components/automation/TemplateListPanel.tsx`). This component handles:
- Infinite scroll via the cursor-based pagination
- Search/filter by name (client-side filter on loaded data is acceptable for v1)
- Delete button (own templates only) calling `trpc.automationCopilot.deleteTemplate.useMutation()`

### Step 6: Marketplace queries

The marketplace view is a filtered version of the template list that shows only public templates, sorted by `usageCount DESC`. This is served by the same `listTemplates` tRPC query but with an additional filter parameter.

**Modify `automationCopilot.listTemplates`** to accept an optional `publicOnly: boolean` input. When `publicOnly` is true, the query becomes `WHERE isPublic = true ORDER BY usageCount DESC, createdAt DESC` with cursor pagination on `usageCount` + `createdAt` (compound cursor).

The `automation_templates_public_usage_idx` index on `(isPublic, usageCount)` supports this query efficiently.

---

## File Summary

| File | Action |
|------|--------|
| `apps/web/drizzle/schema.ts` | Add `automationTemplates` table definition |
| `apps/web/drizzle/*.sql` | Generated migration file (via `drizzle-kit generate`) |
| `apps/web/server/routers/automationCopilot.ts` | Add 4 template CRUD procedures |
| `apps/web/client/src/components/automation/AutomationChatModal.tsx` | Add save template form in success state, templates tab in idle state |
| `apps/web/client/src/components/automation/TemplateListPanel.tsx` | New component for browsing/loading templates |
| `python-backend/app/api/automation_copilot.py` | Update `/templates` endpoint with real DB query |
| `apps/web/server/routers/__tests__/automationTemplates.test.ts` | Schema and CRUD tests |
| `apps/web/client/src/components/automation/__tests__/AutomationTemplates.test.tsx` | UI tests for save/load/list |
| `python-backend/tests/integration/test_automation_copilot_api.py` | Add template endpoint tests |

---

## Key Conventions

- **Tenant isolation:** Every query to `automationTemplates` must include `WHERE tenant_id = $1` (except marketplace queries which show public templates from all tenants). The `tenantId` comes from the authenticated session, never from user-supplied input.
- **Timestamp cursor pagination:** Use `createdAt` as cursor (ISO string). Do not use UUID-based cursors. The cursor is the `createdAt` value of the last item in the current page.
- **Column naming:** Use `snake_case` for DB column names (matching the `libraryItems` pattern), `camelCase` for Drizzle field names.
- **Migration safety:** This is a new table addition (Low risk). Follow the Database Safety Protocol anyway -- back up before applying, verify table creation after.
- **No `page.evaluate()` with user content:** The template system only stores and retrieves data. It does not execute scripts directly -- execution always goes through the full `AutomationChatModal` flow which calls the secure backend pipeline.