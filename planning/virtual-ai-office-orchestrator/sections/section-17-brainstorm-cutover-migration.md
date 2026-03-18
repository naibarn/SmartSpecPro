Now I have all the context needed. Let me produce the section content.

# Section 17: Brainstorm Cutover and Migration

## Overview

This section covers three distinct migration/cutover tasks that clean up legacy features and bridge old data into the new Virtual AI Office Orchestrator system:

1. **Brainstorm Hard Cutover** -- Remove the brainstorm toggle, model-B selector, and related streaming logic from ChatView. Replace with team-based discussion preset templates. Old brainstorm messages remain readable.
2. **Entity Memories to Scoped Memories Migration** -- Write a data migration script that copies records from the `entity_memories` table into the new `scoped_memories` table (created in Section 03). Implement a dual-write adapter during the transition period.
3. **Discussion Preset Templates** -- Seed `assistant_team_templates` (created in Section 01) with four built-in presets that replace brainstorm workflows: "Discuss as Team", "Debate", "Critique Draft", "Synthesize".
4. **Localization Fields** -- Add `roomLanguage` to `team_rooms` (Section 02 schema) and ensure summary/prompt services pass it through.
5. **Rate Limiting Config** -- Wire the orchestrator rate-limit constants into a tenant-configurable settings structure.

### Dependencies

- **Section 01** (schema-identity): `assistant_team_templates` table must exist.
- **Section 02** (schema-rooms-runs): `team_rooms` table must exist.
- **Section 03** (scoped-memory): `scoped_memories` table and `memory_promotions` table must exist.
- **Section 05** (room-run-engine): Run engine must be operational for the new discussion presets to function end-to-end.

---

## Tests First

All tests use Vitest. Test files should be created before implementation.

### Test File: `apps/web/server/services/__tests__/brainstormCutover.test.ts`

```typescript
/**
 * Brainstorm Hard Cutover Tests
 *
 * Validates that brainstorm-specific fields and UI entry points are removed
 * while preserving backward compatibility for existing brainstorm messages.
 */
import { describe, it, expect } from "vitest";

describe("Brainstorm Hard Cutover", () => {
  describe("Schema changes", () => {
    it("conversations table no longer has brainstormPartnerModel column after migration", async () => {
      // Query information_schema.columns for conversations table
      // Assert brainstormPartnerModel does not exist
    });

    it("conversations table no longer has brainstormMaxRounds column after migration", async () => {
      // Query information_schema.columns for conversations table
      // Assert brainstormMaxRounds does not exist
    });

    it("brainstorm column drop migration does not affect existing messages", async () => {
      // Insert a conversation with brainstorm messages before migration
      // Run migration
      // Assert all messages still exist and are readable
    });
  });

  describe("Credit source type backward compat", () => {
    it("'brainstorm' remains a valid credit source type for historical records", () => {
      // The CreditSourceType union and VALID_SOURCE_TYPES set
      // must still include 'brainstorm' for querying old transactions
    });
  });
});
```

### Test File: `apps/web/server/services/__tests__/entityMemoryMigration.test.ts`

```typescript
/**
 * Entity Memory -> Scoped Memory Migration Tests
 *
 * Validates data integrity during the migration from entity_memories
 * to scoped_memories.
 */
import { describe, it, expect } from "vitest";

describe("Entity Memory Migration", () => {
  it("entity_memories -> scoped_memories migration preserves all data", async () => {
    // Insert 5 entity_memories with various entityTypes
    // Run migration function
    // Assert 5 corresponding scoped_memories records exist
    // Assert field mapping is correct (entityType->memoryKind, facts->content, etc.)
  });

  it("dual-write creates records in both tables during transition", async () => {
    // Call the dual-write adapter with a new memory
    // Assert record exists in entity_memories
    // Assert record exists in scoped_memories
    // Assert content is equivalent
  });

  it("migration maps entityType to correct ownerType and memoryKind", async () => {
    // For each entityType (user, project, preference, technical, etc.)
    // assert the correct ownerType and memoryKind mapping
  });

  it("migration preserves importance, confidence, and reinforcementCount", async () => {
    // Insert entity_memory with specific importance=8, confidence=0.95, reinforcementCount=3
    // Run migration
    // Assert scoped_memory has matching values
  });

  it("migration handles null projectId by setting ownerType to 'user'", async () => {
    // Insert entity_memory with projectId=null
    // Run migration
    // Assert scoped_memory.ownerType = 'user' and ownerId = userId
  });

  it("migration handles non-null projectId by setting ownerType to 'project'", async () => {
    // Insert entity_memory with projectId='proj_123'
    // Run migration
    // Assert scoped_memory.ownerType = 'project' and ownerId = 'proj_123'
  });
});
```

### Test File: `apps/web/client/src/components/chat/__tests__/brainstormCutover.test.tsx`

```typescript
/**
 * Frontend Brainstorm Cutover Tests
 *
 * Validates UI changes for brainstorm removal.
 */
import { describe, it, expect } from "vitest";

describe("Brainstorm UI Cutover", () => {
  it("brainstorm toggle is removed from ChatView header", () => {
    // Render ChatView with mock data
    // Assert no element with brainstorm toggle text/icon exists
  });

  it("old brainstorm conversations still render messages correctly", () => {
    // Render ChatView with messages that have skillUsed='brainstorm'
    // Assert messages display with colored badges (model_a, model_b, summary)
    // The rendering code for brainstorm badges stays for backward compat
  });

  it("new conversation creation does not offer brainstorm option", () => {
    // Render conversation creation flow
    // Assert no brainstorm-related option appears
  });
});
```

### Test File: `apps/web/server/services/__tests__/discussionPresets.test.ts`

```typescript
/**
 * Discussion Preset Template Tests
 */
import { describe, it, expect } from "vitest";

describe("Discussion Preset Templates", () => {
  it("seed creates 4 system discussion templates", async () => {
    // Run seed function
    // Query assistant_team_templates where isSystem=true and category='discussion'
    // Assert 4 templates: discuss, debate, critique, synthesize
  });

  it("each template has valid teamConfigJson and memberTemplateJson", async () => {
    // For each seeded template, validate JSON structure
  });
});
```

### Test File: `apps/web/server/services/__tests__/rateLimitConfig.test.ts`

```typescript
/**
 * Rate Limiting Configuration Tests
 */
import { describe, it, expect } from "vitest";

describe("Orchestrator Rate Limiting Config", () => {
  it("concurrent run limit rejects run.start when limit reached", async () => {
    // Mock 3 active runs for user
    // Attempt to start 4th run
    // Assert rejection with appropriate error
  });

  it("agent turn tool call limit stops agent after max 5 tool calls per turn", async () => {
    // Mock agent execution with 6 tool calls
    // Assert 6th call is rejected
  });

  it("inter-agent message rate limit rejects after 100/minute", async () => {
    // Mock 100 messages in 60 seconds from one source
    // Assert 101st is rate-limited
  });
});
```

---

## Implementation Details

### Part 1: Brainstorm Hard Cutover

#### 1A. Schema Migration -- Drop Brainstorm Columns

**File to create:** `apps/web/drizzle/XXXX_drop_brainstorm_columns.sql`

Write a Drizzle migration (or raw SQL if needed) that:

1. Drops column `brainstormPartnerModel` from the `conversations` table.
2. Drops column `brainstormMaxRounds` from the `conversations` table.

These columns are defined in `apps/web/drizzle/schema.ts` at approximately line 1335-1338. Remove both column definitions from the schema file, then run `pnpm db:push` to generate the migration.

**CRITICAL**: Follow the Database Safety Protocol. Before running the migration:
- Back up the `conversations` table data.
- Record row counts.
- Verify no data loss after migration.
- Old messages in the `messages` table are NOT affected (they have no brainstorm columns).

**File to modify:** `apps/web/drizzle/schema.ts`
- Remove the `brainstormPartnerModel` field (line ~1335).
- Remove the `brainstormMaxRounds` field (line ~1338).

#### 1B. Remove Brainstorm UI Toggle and Model-B Selector

**File to modify:** `apps/web/client/src/components/chat/ChatView.tsx`

Remove the following elements:

1. **State variables** (around line 539-543):
   - `brainstormMode`, `setBrainstormMode`
   - `brainstormPartnerModel`, `setBrainstormPartnerModel`
   - `brainstormModelDialogOpen`, `setBrainstormModelDialogOpen`
   - `brainstormStreamingRole`, `setBrainstormStreamingRole`
   - `brainstormStreamingRound`, `setBrainstormStreamingRound`

2. **Brainstorm toggle button** (around line 2377-2391): The `<Button>` with `<Lightbulb>` icon and "Brainstorm" label.

3. **Model B selector** (around line 2405-2460): The `CommandDialog` for selecting brainstorm partner model.

4. **Brainstorm streaming function** (`streamBrainstorm`): The function that calls `/api/llm/brainstorm` and handles `brainstorm_turn`, `brainstorm_chunk`, `brainstorm_done`, `brainstorm_credits`, `brainstorm_error` SSE events.

5. **The conditional dispatch** (around line 2053): `else if (brainstormMode && brainstormPartnerModel)` -- remove this branch.

**KEEP the following for backward compatibility:**
- Brainstorm message rendering badges (lines ~2547-2573): Messages with `skillUsed === "brainstorm"` still need colored badges to display old conversations.
- Brainstorm streaming content styling (lines ~2750-2770): Keep styles for `brainstormStreamingRole` values but make them dead code (they will never trigger since brainstorm mode is removed). Alternatively, simplify to only the static rendering path.
- The `skillArgs` type on the `ChatMessage` interface (line ~231): Keep `brainstormRound` and `brainstormRole` for reading old data.

#### 1C. Remove Brainstorm API Endpoint

**File to modify:** `apps/web/server/_core/llmRoutes.ts`

Remove or deprecate the `/api/llm/brainstorm` POST handler (around line 1916). Options:

- **Option A (recommended)**: Return a 410 Gone response with a message directing users to team discussions. This prevents breaking any external integrations gracefully.
- **Option B**: Remove the route entirely.

**File to modify:** `apps/web/server/_core/index.ts`
- Remove brainstorm from the `VALID_SOURCE_TYPES` set only if no historical credit transactions reference it. Since they do, **keep "brainstorm" in the set** but add a comment marking it as legacy.

**File to modify:** `apps/web/server/services/creditService.ts`
- Keep `"brainstorm"` in the `CreditSourceType` union for backward compatibility with existing `credit_transactions` records. Add a comment marking it legacy.

#### 1D. Replace With Discussion Actions

The brainstorm toggle is replaced by four preset team-based actions. These are not implemented as buttons in ChatView but rather as quick-start options in the new Team creation flow (Section 13 handles the UI). This section only needs to ensure the templates exist (see Part 3 below).

---

### Part 2: Entity Memory to Scoped Memory Migration

#### 2A. Migration Script

**File to create:** `apps/web/scripts/migrate-entity-to-scoped-memories.ts`

This script reads all records from `entity_memories` and inserts corresponding records into `scoped_memories`. It should be idempotent (safe to re-run).

**Field mapping:**

| entity_memories field | scoped_memories field | Mapping logic |
|---|---|---|
| `id` | (new uuid) | Generate fresh UUID |
| `userId` | `ownerId` | String(userId) |
| (derived) | `ownerType` | If projectId is null: `"user"`, else `"project"` |
| (derived) | `tenantId` | Look up user's tenantId from users table |
| `entityType` | `memoryKind` | Map: user->fact, project->fact, preference->preference, technical->fact, rule->rule, decision->decision, plan->note, architecture->note, component->note, task->note, code_knowledge->fact |
| `entityName` | `title` | Direct copy |
| `facts` | `content` | JSON.stringify(facts) or join with newlines |
| `confidence` | `confidence` | Direct copy |
| `importance` | `importance` | Direct copy |
| `reinforcementCount` | `reinforcementCount` | Direct copy |
| `source` | `sourceType` | Map: auto->auto, manual->manual, suggested->auto |
| `projectId` | `projectId` | Direct copy (nullable) |
| `lastAccessedAt` | `lastAccessedAt` | Direct copy |
| `createdAt` | `createdAt` | Direct copy |
| `updatedAt` | `updatedAt` | Direct copy |
| (default) | `visibility` | `"private"` (user-scoped memories are private by default) |
| (default) | `embedding` | `null` (backfilled later by Celery task in Section 15) |
| (default) | `tags` | `[]` |
| (default) | `metadataJson` | `{ migratedFrom: "entity_memories", originalId: entity_memory.id }` |

**Processing**: Batch in groups of 100 using a transaction per batch. Log progress. Skip records that already exist in scoped_memories (check metadataJson for originalId).

#### 2B. Dual-Write Adapter

**File to create:** `apps/web/server/services/memoryDualWriteAdapter.ts`

A thin wrapper that intercepts memory writes during the transition period. When a new entity memory is created via the existing `memoryService.ts` functions (`upsertEntityMemory`), the adapter also writes to `scoped_memories`.

```typescript
/**
 * Dual-write adapter for entity_memories -> scoped_memories transition.
 *
 * Wraps the existing upsertEntityMemory function to also write
 * to scoped_memories. This enables a gradual migration where
 * reads can switch to scoped_memories while writes go to both.
 *
 * Remove this adapter once all reads are migrated to scopedMemoryService.
 */
```

The adapter should:
- Import `upsertEntityMemory` from `memoryService.ts`.
- After successful entity_memory write, create corresponding scoped_memory record.
- Use the same field mapping as the migration script (Part 2A).
- On scoped_memory write failure, log the error but do NOT fail the entity_memory write (graceful degradation).

**File to modify:** `apps/web/server/services/memoryService.ts`
- At the bottom of `upsertEntityMemory` (around line 600), add a call to the dual-write adapter.
- Guard with a feature flag: `if (process.env.MEMORY_DUAL_WRITE_ENABLED === "true")`.

#### 2C. Read Cutover

Once dual-write is verified working:
- `apps/web/server/services/chatService.ts` and any other files that call `getEntityMemories` should be updated to read from `scoped_memories` instead.
- The `entity_memories` table is NOT dropped. It remains readable indefinitely for historical queries.

This read cutover can happen in a follow-up after the dual-write has been running. For this section, implement only the migration script and dual-write adapter.

---

### Part 3: Discussion Preset Templates

**File to modify:** `apps/web/drizzle/seed.ts`

Add seed data for 4 system discussion templates in the `assistant_team_templates` table. Each template is a system-level preset (tenantId=null, isSystem=true).

**Templates to seed:**

1. **Discuss as Team** (`discuss`)
   - category: `"discussion"`
   - description: "Open team discussion where members share perspectives and build on each other's ideas"
   - teamConfigJson: `{ defaultViewMode: "transparent", defaultAutonomyLevel: "guided", turnStrategy: "lead-directed" }`
   - memberTemplateJson: `[{ roleTitle: "Discussion Lead", isLead: true }, { roleTitle: "Subject Expert", isLead: false }, { roleTitle: "Critical Analyst", isLead: false }]`
   - defaultDiscussionMode: `"team_chat"`

2. **Debate** (`debate`)
   - category: `"discussion"`
   - description: "Structured debate with opposing viewpoints, moderated by a lead"
   - teamConfigJson: `{ defaultViewMode: "transparent", defaultAutonomyLevel: "autonomous", turnStrategy: "round-robin" }`
   - memberTemplateJson: `[{ roleTitle: "Moderator", isLead: true }, { roleTitle: "Advocate (Pro)", isLead: false }, { roleTitle: "Advocate (Con)", isLead: false }]`
   - defaultDiscussionMode: `"team_chat"`

3. **Critique Draft** (`critique`)
   - category: `"discussion"`
   - description: "Team reviews and critiques a draft document or plan"
   - teamConfigJson: `{ defaultViewMode: "milestone", defaultAutonomyLevel: "guided", turnStrategy: "round-robin" }`
   - memberTemplateJson: `[{ roleTitle: "Author", isLead: true }, { roleTitle: "Technical Reviewer", isLead: false }, { roleTitle: "Quality Reviewer", isLead: false }]`
   - defaultDiscussionMode: `"review"`

4. **Synthesize** (`synthesize`)
   - category: `"discussion"`
   - description: "Collect information from multiple specialists and produce a unified synthesis"
   - teamConfigJson: `{ defaultViewMode: "summary", defaultAutonomyLevel: "autonomous", turnStrategy: "lead-directed" }`
   - memberTemplateJson: `[{ roleTitle: "Synthesizer", isLead: true }, { roleTitle: "Domain Expert A", isLead: false }, { roleTitle: "Domain Expert B", isLead: false }]`
   - defaultDiscussionMode: `"team_chat"`

---

### Part 4: Localization Fields

**File to modify:** `apps/web/drizzle/schema.ts`

Add a `roomLanguage` field to the `team_rooms` table definition (this table is created in Section 02). The field should be:

```typescript
roomLanguage: varchar("roomLanguage", { length: 10 }).default("inherit"),
```

When `"inherit"`, the room uses the orchestrator user's `preferredLanguage`. Otherwise it is a BCP-47 tag like `"th"`, `"en"`, `"ja"`.

**Integration points** (reference only -- these are implemented in other sections):
- `summaryService.ts` (Section 08): Passes `roomLanguage` in the summary generation prompt.
- `promptComposer.ts` (Section 06): Includes `roomLanguage` in system message behavioral rules with the instruction: "All shared output must be in {roomLanguage}".

**Validation**: Agent `displayName` and `nickname` fields (in `assistant_profiles`, Section 01) use `text` columns with no Latin-only constraints. Thai and other Unicode characters are fully supported by the Drizzle `text()` type and PostgreSQL.

---

### Part 5: Rate Limiting Configuration

**File to create:** `apps/web/server/services/orchestratorRateLimits.ts`

Define the rate-limiting constants and a service that checks them. These values should be tenant-overridable via system_settings.

```typescript
/**
 * Orchestrator Rate Limiting Configuration
 *
 * Default values for all orchestrator rate limits.
 * Each can be overridden per-tenant via system_settings table
 * (category: 'orchestrator', key: 'rate_limits').
 */

export const ORCHESTRATOR_RATE_LIMITS = {
  maxConcurrentRunsPerUser: 3,
  maxConcurrentRunsPerTenant: 10,
  maxAgentsPerTeam: 10,
  maxRoundsPerRun: 50,
  maxRunDurationMinutes: 60,
  maxToolCallsPerAgentPerTurn: 5,
  maxMemoryWritesPerRun: 100,
  maxInterAgentMessagesPerMinute: 100,
} as const;

export type OrchestratorRateLimits = typeof ORCHESTRATOR_RATE_LIMITS;
```

The service should:
- Export a `getEffectiveRateLimits(tenantId: number)` function.
- Load tenant overrides from `system_settings` (category `"orchestrator"`, key `"rate_limits"`).
- Merge with defaults (tenant overrides win).
- Cache result for 60 seconds per tenant using a simple in-memory map.

**File to create:** `apps/web/server/services/orchestratorRateLimitGuard.ts`

A guard service used by the run engine (Section 05) to enforce limits:

```typescript
/**
 * Rate limit guard functions for the orchestrator.
 *
 * checkConcurrentRunLimit(userId, tenantId) - throws if user/tenant at max
 * checkToolCallLimit(runId, assistantId, currentCount) - throws if exceeded
 * checkInterAgentMessageRate(sourceAgentId) - throws if exceeded
 */
```

The guard uses Redis to track:
- Concurrent runs: Redis SET keyed by `orchestrator:runs:user:{userId}` and `orchestrator:runs:tenant:{tenantId}`.
- Tool calls per turn: In-memory counter (resets each turn), no Redis needed.
- Inter-agent message rate: Redis sorted set with timestamps, keyed by `orchestrator:iamsg:{sourceAgentId}`.

---

## File Summary

### Files to Create
| File | Purpose |
|---|---|
| `apps/web/server/services/__tests__/brainstormCutover.test.ts` | Tests for brainstorm column drop and backward compat |
| `apps/web/server/services/__tests__/entityMemoryMigration.test.ts` | Tests for entity_memories -> scoped_memories migration |
| `apps/web/client/src/components/chat/__tests__/brainstormCutover.test.tsx` | Tests for brainstorm UI removal |
| `apps/web/server/services/__tests__/discussionPresets.test.ts` | Tests for discussion template seeds |
| `apps/web/server/services/__tests__/rateLimitConfig.test.ts` | Tests for rate limit config and guards |
| `apps/web/scripts/migrate-entity-to-scoped-memories.ts` | Migration script: entity_memories -> scoped_memories |
| `apps/web/server/services/memoryDualWriteAdapter.ts` | Dual-write adapter for transition period |
| `apps/web/server/services/orchestratorRateLimits.ts` | Rate limit constants and tenant-override loader |
| `apps/web/server/services/orchestratorRateLimitGuard.ts` | Redis-backed rate limit enforcement |

### Files to Modify
| File | Change |
|---|---|
| `apps/web/drizzle/schema.ts` | Remove `brainstormPartnerModel` and `brainstormMaxRounds` from conversations; add `roomLanguage` to team_rooms |
| `apps/web/client/src/components/chat/ChatView.tsx` | Remove brainstorm toggle, model-B selector, streaming logic; keep backward-compat message rendering |
| `apps/web/server/_core/llmRoutes.ts` | Deprecate `/api/llm/brainstorm` endpoint (return 410 Gone) |
| `apps/web/server/_core/index.ts` | Mark "brainstorm" as legacy in VALID_SOURCE_TYPES |
| `apps/web/server/services/creditService.ts` | Mark "brainstorm" as legacy in CreditSourceType |
| `apps/web/server/services/memoryService.ts` | Add dual-write call at end of upsertEntityMemory (feature-flagged) |
| `apps/web/drizzle/seed.ts` | Add 4 system discussion preset templates |

### Migration Files Generated
| File | Purpose |
|---|---|
| `apps/web/drizzle/XXXX_drop_brainstorm_columns.sql` | Drop brainstormPartnerModel and brainstormMaxRounds from conversations |