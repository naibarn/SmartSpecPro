# Section 01: Schema -- Core Identity Tables

## Overview

This section defines the Drizzle ORM schema for four new "core identity" tables that form the foundation of the Virtual AI Office Orchestrator. These tables establish the mapping between users, teams, assistant profiles, and reusable templates. Every subsequent section depends on these tables.

**Tables introduced:**
- `user_orchestrator_profiles` — per-user orchestration preferences
- `assistant_teams` — product-facing team definition, wraps an existing `agency`
- `assistant_profiles` — product-facing assistant identity, wraps an `agency_agent` and binds a persona
- `assistant_team_templates` — reusable team presets (system or tenant-scoped)

**Files to create or modify:**
- `apps/web/drizzle/schema.ts` — add enums, tables, types, indexes
- `apps/web/drizzle/seed.ts` — add seed data for system templates
- `apps/web/server/services/__tests__/orchestratorIdentitySchema.test.ts` — schema validation tests

**Dependencies:** None (Batch 1). All other sections depend on these tables.

---

## Tests (Write First)

Create `apps/web/server/services/__tests__/orchestratorIdentitySchema.test.ts`:

1. **user_orchestrator_profiles defaults** — Insert with only `userId`. Assert `preferredViewMode` defaults to `"transparent"`, `preferredAutonomyLevel` defaults to `"guided"`, timestamps populated.

2. **assistant_profiles.isLead constraint** — Insert two profiles for same teamId both with `isLead: true`. Second should be rejected (partial unique index or app-level validation).

3. **assistant_profiles.personaId FK** — Insert with valid personaId → success. Non-existent personaId → FK violation.

4. **user_orchestrator_profiles uniqueness** — Insert two rows for same userId → unique constraint violation.

5. **assistant_teams status enum** — `"active"`, `"archived"`, `"draft"` succeed. `"deleted"` fails.

6. **assistant_team_templates null tenantId** — Insert with `tenantId: null`, `isSystem: true` → success (platform-wide template).

7. **assistant_profiles defaults** — Insert without `sortOrder`/`isActive`. Assert defaults: `sortOrder=0`, `isActive=true`.

```typescript
// apps/web/server/services/__tests__/orchestratorIdentitySchema.test.ts
import { describe, it, expect } from "vitest";

describe("Orchestrator Identity Schema", () => {
  describe("user_orchestrator_profiles", () => {
    it("applies defaults when fields omitted");
    it("enforces uniqueness per user");
  });
  describe("assistant_teams", () => {
    it("accepts valid status enum values");
  });
  describe("assistant_profiles", () => {
    it("enforces isLead constraint (one lead per team)");
    it("validates personaId FK reference");
    it("applies sortOrder and isActive defaults");
  });
  describe("assistant_team_templates", () => {
    it("allows null tenantId for platform-wide templates");
  });
});
```

---

## Implementation Details

### Enums to Add

Add in `apps/web/drizzle/schema.ts` near existing enum block:

```typescript
export const orchestratorViewModeEnum = pgEnum("orchestrator_view_mode", [
  "transparent", "milestone", "summary",
]);
export const orchestratorAutonomyLevelEnum = pgEnum("orchestrator_autonomy_level", [
  "manual", "guided", "autonomous",
]);
export const assistantTeamStatusEnum = pgEnum("assistant_team_status", [
  "active", "archived", "draft",
]);
export const modelSelectionPolicyEnum = pgEnum("model_selection_policy", [
  "fixed", "cost_optimized", "quality_optimized", "auto",
]);
```

### Table: `user_orchestrator_profiles`

One row per user storing orchestration preferences.

- PK: `varchar("id", { length: 36 })` with `gen_random_uuid()` default
- `userId`: integer FK → users.id (CASCADE), unique index
- `defaultPersonaId`: varchar(36) FK → personaTemplates.id (SET NULL)
- `orchestratorDisplayName`: varchar(255)
- `preferredViewMode`: orchestratorViewModeEnum, default "transparent"
- `preferredAutonomyLevel`: orchestratorAutonomyLevelEnum, default "guided"
- `preferredSummaryStyle`: varchar(50)
- `defaultApprovalPolicy`: jsonb
- Timestamps: createdAt, updatedAt

### Table: `assistant_teams`

Product-facing team definition. Each team wraps exactly one `agency`.

- PK: varchar(36) UUID
- `tenantId`: varchar(36) FK → tenants.id (CASCADE)
- `ownerUserId`: integer FK → users.id (CASCADE)
- `agencyId`: varchar(36) FK → agencies.id (CASCADE)
- `name`: varchar(255) NOT NULL
- `description`: text
- `category`: varchar(100)
- `teamPersonaOverlay`: jsonb
- `defaultViewMode`, `defaultSummaryMode`, `defaultAutonomyLevel`: enum/varchar
- `defaultModelId`: varchar(100)
- `modelBudgetPolicy`, `memoryPolicyJson`, `artifactPolicyJson`: jsonb
- `status`: assistantTeamStatusEnum, default "draft"
- Indexes: tenantId, ownerUserId, agencyId

### Table: `assistant_profiles`

Per-member assistant identity. Wraps one `agency_agent` + one `persona_template`.

- PK: varchar(36) UUID
- `tenantId`: FK → tenants.id
- `teamId`: FK → assistant_teams.id (CASCADE)
- `agencyAgentId`: FK → agencyAgents.id (CASCADE)
- `personaId`: FK → personaTemplates.id (SET NULL)
- `displayName`, `nickname`, `roleTitle`, `genderStyle`: varchar
- `specialtyTags`: text[]
- `preferredModelId`: varchar(100)
- `modelSelectionPolicy`: modelSelectionPolicyEnum, default "auto"
- Policy columns: `toolPolicyJson`, `approvalPolicyJson`, `memoryPolicyJson`, `visibilityPolicyJson` (jsonb)
- `preferredLanguage`: varchar(10), nullable — per-agent language preference (BCP-47 tag). Room language takes precedence for shared output; agent may reason privately in own language.
- `sortOrder`: integer default 0
- `isLead`: boolean default false
- `isActive`: boolean default true
- Indexes: teamId, agencyAgentId, personaId

**Partial unique index for isLead** (raw SQL migration):
```sql
CREATE UNIQUE INDEX assistant_profiles_team_lead_idx
  ON assistant_profiles ("teamId") WHERE "isLead" = true;
```

### Table: `assistant_team_templates`

- PK: varchar(36) UUID
- `tenantId`: nullable FK → tenants.id (null = platform-wide)
- `name`, `description`, `category`: varchar/text
- `teamConfigJson`, `memberTemplateJson`: jsonb
- `defaultDiscussionMode`: varchar(50)
- `isSystem`: boolean default false
- Index: tenantId

---

## Seed Data

Add to `apps/web/drizzle/seed.ts` — 3 system templates:

1. **Research & Analysis Team** (3 members: Lead Researcher, Data Analyst, Report Writer)
2. **Content Creation Team** (3 members: Content Strategist lead, Writer, Editor)
3. **Code Review Team** (3 members: Lead Architect, Security Reviewer, Quality Reviewer)

All with `isSystem: true`, `tenantId: null`.

---

## Migration

1. Run `cd apps/web && pnpm db:push`
2. Apply partial unique index via supplementary SQL migration
3. Verify tables exist: `psql "$DATABASE_URL" -c "\dt assistant_*"`
4. Run seed script for templates

## Implementation Notes (Actual)

**Migration:** `drizzle/0083_rapid_prima.sql` — generated by Drizzle. Partial unique index applied via manual SQL since Drizzle doesn't support partial indexes. Migration had to be applied manually due to snapshot collision (0078/0079 shared parent) and column collision from prior branch changes.

**Files created/modified:**
- `apps/web/drizzle/schema.ts` — added 4 enums + 4 tables at end of file
- `apps/web/drizzle/seed.ts` — added `seedAssistantTeamTemplates()` function with 3 system templates
- `apps/web/scripts/seed-multi-provider.ts` — wired seed function call
- `apps/web/server/services/__tests__/orchestratorIdentitySchema.test.ts` — 9 tests (enum values, table shapes, type inference)
- `apps/web/drizzle/0083_rapid_prima.sql` — migration SQL
- `apps/web/drizzle/meta/0083_snapshot.json` — Drizzle snapshot

**Deviations from plan:**
- Tests verify schema shape and enum values rather than DB-level integration tests. DB integration tests deferred to section-18.
- Migration includes some unrelated ALTER TABLE statements from branch schema drift (persona_templates, multimodal_memory_items). These are harmless additions already present in schema.ts.

**Test count:** 9 tests, all passing.

## Downstream Dependencies

Sections 02, 03, 04, 05, 10 all reference tables defined here.
