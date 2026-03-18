I now have enough context. Let me produce the section content.

# Section 04 -- Team Service

## Overview

This section implements the Team Service (`teamService.ts`), a service layer responsible for all team CRUD operations, template instantiation, member management, and validation. It depends on the schema tables defined in Section 01 (core identity tables: `assistant_teams`, `assistant_profiles`, `assistant_team_templates`, `user_orchestrator_profiles`) and integrates with existing agency infrastructure (the `agencies` and `agencyAgents` tables).

The team service is consumed by the tRPC team router (Section 10) and the frontend team builder (Section 13).

## Dependencies

- **Section 01 (schema-identity)**: Must be completed first. Provides Drizzle table definitions for `assistantTeams`, `assistantProfiles`, `assistantTeamTemplates`, and `userOrchestratorProfiles`.
- **Existing codebase**: Uses the existing `agencies`, `agencyAgents`, and `personaTemplates` tables from `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`.
- **Existing codebase**: Uses the `db` proxy from `/home/dev/projects/SmartSpecPro/apps/web/server/db.ts` including its `db.transaction()` helper.

## File to Create

**`/home/dev/projects/SmartSpecPro/apps/web/server/services/teamService.ts`**

## Tests (Write First)

**Test file: `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/teamService.test.ts`**

Tests use Vitest. Mock the `db` module to control database interactions. Each test verifies one behavior.

### Test Stubs

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the db module
vi.mock("../../db", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
  },
}));

describe("teamService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createTeam", () => {
    it("creates agency + team + profiles + memory scopes in one transaction", async () => {
      /**
       * Verify db.transaction is called exactly once.
       * Inside the transaction callback, assert:
       *   1. An agency record is inserted into the agencies table
       *   2. An assistant_teams record is inserted referencing that agency
       *   3. For each member in input, an agencyAgents record is inserted
       *   4. For each member, an assistant_profiles record is inserted
       *      linking the agencyAgent + persona
       *   5. For each member, a scoped_memories seed record is created
       *      with ownerType="agent"
       * Returns: { teamId, agencyId, members: [...] }
       */
    });

    it("rolls back ALL records if profile creation fails mid-way", async () => {
      /**
       * Mock db.transaction to simulate an error thrown during
       * assistant_profiles insert (e.g., second member fails).
       * Verify that the transaction rejects and no partial data persists.
       */
    });

    it("throws validation error when no members provided", async () => {
      /**
       * Call createTeam with members: [].
       * Expect a validation error with message indicating
       * at least 1 member is required.
       */
    });

    it("throws validation error when no lead member designated", async () => {
      /**
       * Call createTeam with members that all have isLead: false.
       * Expect a validation error about exactly one lead required.
       */
    });

    it("throws validation error when multiple leads designated", async () => {
      /**
       * Call createTeam with 2 members both having isLead: true.
       * Expect a validation error about exactly one lead.
       */
    });
  });

  describe("createFromTemplate", () => {
    it("loads template config and instantiates correct number of members", async () => {
      /**
       * Mock db.select to return a template with memberTemplateJson
       * containing 3 member definitions.
       * Verify createTeam is called internally with those 3 members
       * and any overrides applied.
       */
    });

    it("throws NOT_FOUND when template does not exist", async () => {
      /**
       * Mock db.select to return empty array for templateId lookup.
       * Expect an error.
       */
    });

    it("applies overrides on top of template defaults", async () => {
      /**
       * Provide overrides: { name: "Custom Name", members: [{ ... }] }.
       * Verify the team name uses the override, not template default.
       */
    });
  });

  describe("updateTeamMember", () => {
    it("syncs changes to both assistant_profile and underlying agency_agent", async () => {
      /**
       * Call updateTeamMember(profileId, { displayName, model, instructions }).
       * Verify db.update is called twice within a transaction:
       *   1. assistant_profiles table with displayName
       *   2. agencyAgents table with model and instructions
       */
    });

    it("throws NOT_FOUND when profile does not exist", async () => {
      /**
       * Mock db.select returning empty for the profileId.
       * Expect error.
       */
    });
  });

  describe("archiveTeam", () => {
    it("sets status=archived, does NOT delete data", async () => {
      /**
       * Call archiveTeam(teamId, tenantId).
       * Verify db.update sets status="archived" on assistant_teams.
       * Verify db.delete is NOT called.
       */
    });

    it("throws NOT_FOUND for nonexistent team", async () => {
      /**
       * Mock db.select returning empty.
       * Expect error.
       */
    });
  });

  describe("validation", () => {
    it("rejects member without personaId", async () => {
      /**
       * Call createTeam with a member missing personaId.
       * Expect validation error about persona required.
       */
    });

    it("validates personaId references a real persona for the tenant", async () => {
      /**
       * Provide a personaId that doesn't exist in personaTemplates.
       * Expect validation error.
       */
    });
  });
});
```

## Implementation Details

### Service Architecture

The service follows the same pattern as other services in the codebase (see `personaService.ts`, `creditService.ts`): exported async functions, using the `db` proxy from `server/db.ts`, with explicit TypeScript types for inputs and outputs.

### Type Definitions

Define input/output types at the top of the file:

- **`CreateTeamInput`**: Contains `tenantId`, `ownerUserId`, `name`, `description`, `category`, optional policy fields (`defaultViewMode`, `defaultSummaryMode`, `defaultAutonomyLevel`, `defaultModelId`, `memoryPolicyJson`, `artifactPolicyJson`), and `members[]` array.

- **`CreateTeamMemberInput`**: Contains `personaId`, `displayName`, `nickname`, `roleTitle`, `genderStyle`, `specialtyTags[]`, `preferredModelId`, `modelSelectionPolicy`, `instructions` (for the underlying agency_agent), `isLead`, `isActive`, `sortOrder`, optional policy fields (`toolPolicyJson`, `approvalPolicyJson`, `memoryPolicyJson`, `visibilityPolicyJson`).

- **`UpdateTeamMemberInput`**: Partial version of member fields that can be updated after creation. Includes both assistant_profile fields and agency_agent fields.

- **`CreateTeamResult`**: Returns `teamId`, `agencyId`, and `members[]` (each with `profileId`, `agencyAgentId`, `displayName`).

### Key Functions

#### `createTeam(input: CreateTeamInput): Promise<CreateTeamResult>`

Validation (before transaction):
1. `input.members.length >= 1` -- at least one member required
2. Exactly one member has `isLead: true`
3. Every member has a `personaId` set
4. All `personaId` values exist in `personaTemplates` where `tenantId` matches the team's `tenantId` or is null (platform-scope personas)
5. Member count does not exceed 10 (hard limit from rate limiting config)

Transaction steps:
1. Generate UUIDs for agencyId, teamId, and each member's agentId + profileId
2. Insert into `agencies`: create a backing agency with `status: "active"`, `name` matching team name, `tenantId`, `createdBy: input.ownerUserId`. Generate a slug from the name (lowercase, hyphenated, append short random suffix for uniqueness)
3. Insert into `assistantTeams`: reference the new agencyId, copy team-level config fields
4. For each member:
   a. Insert into `agencyAgents`: use the generated agentId, set `agencyId`, `name` from displayName, `instructions` from member input, `model` from member's preferredModelId, `isEntryPoint` if member isLead, `nodeType: "agent"`
   b. Insert into `assistantProfiles`: link teamId, agencyAgentId, personaId, copy all profile fields
5. Return `{ teamId, agencyId, members }` with IDs

The entire operation is wrapped in `db.transaction()`. If any insert fails, the transaction rolls back automatically (Drizzle/postgres-js behavior).

#### `createFromTemplate(templateId: string, tenantId: string, ownerUserId: number, overrides?: Partial<CreateTeamInput>): Promise<CreateTeamResult>`

Steps:
1. Query `assistantTeamTemplates` by id. Verify it exists and is accessible (either `tenantId` matches or `tenantId` is null for platform templates)
2. Parse `teamConfigJson` for team-level fields and `memberTemplateJson` for member definitions
3. Merge overrides on top of template defaults (overrides take precedence)
4. Call `createTeam()` with the merged input

#### `updateTeamMember(profileId: string, tenantId: string, updates: UpdateTeamMemberInput): Promise<void>`

Steps:
1. Query `assistantProfiles` by id, verify `tenantId` matches
2. Within a transaction:
   a. Update `assistantProfiles` with profile-level fields (displayName, nickname, roleTitle, sortOrder, isActive, policy JSON fields)
   b. If agent-level fields are present (instructions, model, modelSettings), also update the linked `agencyAgents` row using `profile.agencyAgentId`
3. If `isLead` is being changed to `true`, also set `isLead: false` on all other profiles in the same team (enforce exactly-one-lead constraint)

#### `archiveTeam(teamId: string, tenantId: string): Promise<void>`

Steps:
1. Query `assistantTeams` by id, verify `tenantId` matches
2. Update `assistantTeams` set `status: "archived"`, `updatedAt: new Date()`
3. Optionally update the backing `agencies` row to `status: "archived"` as well
4. No deletion of any data -- archiving is soft-delete

#### `getTeam(teamId: string, tenantId: string): Promise<TeamWithMembers | null>`

Query `assistantTeams` joined with `assistantProfiles` (and their linked `personaTemplates` for display info). Return null if not found or tenant mismatch.

#### `listTeams(tenantId: string, ownerUserId?: number, status?: string): Promise<TeamSummary[]>`

Query `assistantTeams` filtered by tenantId, optionally by ownerUserId and status. Return summary records (id, name, description, category, status, member count, createdAt).

### Validation Helper

Extract a `validateTeamInput(input: CreateTeamInput)` helper that runs all validation checks and throws descriptive errors. This keeps the main `createTeam` function focused on the transaction logic. Use a custom error class or throw `TRPCError` with `code: "BAD_REQUEST"` for consistency with the rest of the codebase.

### Slug Generation

Reuse the pattern from the existing agency creation in the `saveBuilder` mutation. Generate slugs with:

```typescript
function generateTeamSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .substring(0, 80);
  const suffix = crypto.randomBytes(3).toString("hex");
  return `${base}-${suffix}`;
}
```

### Integration Notes

- The service does NOT create scoped_memories records directly in Phase 1. Memory scope provisioning is handled by Section 03 (scoped-memory). The team service should call into the scoped memory service (once available) to create initial private memory scopes per agent. For now, include a placeholder comment or optional call site.

- The service uses `crypto.randomUUID()` (Node.js built-in) for UUID generation rather than the `uuid` package, matching patterns seen elsewhere in the codebase.

- All JSON policy fields (`memoryPolicyJson`, `toolPolicyJson`, etc.) are stored as JSONB and typed loosely as `Record<string, unknown>` at the service layer. Zod validation for these shapes belongs in the tRPC router (Section 10).

### Error Handling

- **NOT_FOUND**: When team, profile, or template lookup returns no rows
- **BAD_REQUEST**: When validation fails (no members, no lead, missing persona, etc.)
- **FORBIDDEN**: When tenantId mismatch detected (imported from TRPCError if used directly, or throw plain errors for service-level calls to be caught by the router)

The service itself should throw plain `Error` instances with descriptive messages. The tRPC router layer (Section 10) will catch these and convert to appropriate `TRPCError` codes.

### Imports

The service will import from:
- `"../db"` -- the `db` proxy
- `"../../drizzle/schema"` -- table definitions (`agencies`, `agencyAgents`, `assistantTeams`, `assistantProfiles`, `assistantTeamTemplates`, `personaTemplates`)
- `"drizzle-orm"` -- `eq`, `and`, `inArray`, `sql`, `count`
- `"crypto"` -- for `randomUUID()` and slug suffix generation