Good, the latest migration is `0106`. Now I have everything needed.

# Section 01 — Database Migration

## Overview

This section covers all Drizzle ORM schema changes required by the 052 Agency Swarm Full Capability Upgrade. It creates 4 new tables and adds 27 new columns across 4 existing tables, plus a data migration for the `modelSettings` JSONB column. All changes are additive (nullable columns, new tables) with no destructive operations.

**This section is the prerequisite for every other section in the plan.** No other section can begin implementation until this migration is applied.

## Dependencies

- None (this is the first section; all others depend on it)

## Blocked Sections

All sections 02 through 23 depend on this migration being complete.

---

## Files to Modify

| File | Action |
|------|--------|
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts` | Add 4 new table definitions, add columns to 4 existing tables |
| `/home/dev/projects/SmartSpecPro/apps/web/drizzle/0107_agency_swarm_full_capability.sql` | Generated migration file (via `pnpm db:push`) |

## Files to Create

| File | Purpose |
|------|---------|
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencySwarmMigration.test.ts` | Migration verification tests |

---

## TDD: Tests to Write First

All tests go in `/home/dev/projects/SmartSpecPro/apps/web/server/services/__tests__/agencySwarmMigration.test.ts`.

Use Vitest. These tests verify schema correctness after the migration is applied. They query the database or import the Drizzle schema objects and inspect their shape.

```
Test: "new tables exist with correct columns"
- Import agency_guardrails, agency_agent_guardrails, agency_shared_tools, agency_run_traces from schema
- Assert each table export is defined and has the expected column names

Test: "agency_guardrails has all required columns"
- Verify columns: id, tenantId, agencyId, name, type, mode, strategy, config, validationAttempts, isEnabled, sortOrder, createdAt, updatedAt
- Verify tenantId references tenants.id with ON DELETE CASCADE
- Verify agencyId references agencies.id with ON DELETE CASCADE

Test: "agency_agent_guardrails has UNIQUE(agentId, guardrailId) constraint"
- Import the table and verify the unique index exists on (agentId, guardrailId)
- Verify both FKs have ON DELETE CASCADE

Test: "agency_shared_tools has UNIQUE(agencyId, toolId) constraint"
- Import the table and verify the unique index on (agencyId, toolId)
- Verify agencyId FK has ON DELETE CASCADE
- Verify toolId is varchar(100) with NO foreign key (allows builtin string IDs)

Test: "agency_run_traces has required indexes"
- Verify indexes on: tenantId, runId, agencyId, createdAt

Test: "agencies table has new columns"
- Import agencies from schema
- Verify new columns exist: sharedInstructions, userContext, conversationStarters, topology, cacheConversationStarters
- Verify topology defaults to 'custom'
- Verify cacheConversationStarters defaults to false

Test: "agencyAgents table has new columns"
- Import agencyAgents from schema
- Verify new columns: outputSchema, examples, mcpServers, mcpServerTokensEncrypted, parallelToolCalls, maxTurns
- Verify parallelToolCalls defaults to true
- Verify maxTurns defaults to 25

Test: "agencyTools table has new columns"
- Import agencyTools from schema
- Verify new columns: inputSchema, outputSchema, httpMethod, headersEncrypted, retryPolicy, icon, category, version, isExposedAsApi, strictSchema, oneCallAtATime, isEnabled, updatedAt
- Verify version defaults to 1
- Verify isExposedAsApi defaults to false
- Verify strictSchema defaults to false
- Verify oneCallAtATime defaults to false
- Verify isEnabled defaults to true

Test: "agencyCommunicationFlows table has flowConfig column"
- Import agencyCommunicationFlows from schema
- Verify flowConfig column exists as JSONB nullable

Test: "modelSettings snake_case to camelCase migration is idempotent"
- Describe the SQL transformation; verify that running it twice on the same row
  produces the same result (no double-renaming, no corruption)
- This test should construct a mock modelSettings value with top_p and max_tokens,
  apply the SQL transform logic in JS, and verify the output has topP and maxTokens
  with correct values, and no top_p or max_tokens keys remaining
```

---

## Implementation Details

### 1. Schema Changes in `drizzle/schema.ts`

All changes are made in `/home/dev/projects/SmartSpecPro/apps/web/drizzle/schema.ts`. Insert new tables after the existing `agencyVersions` definition (around line 4924). Modify existing table definitions in-place.

#### 1.1 ALTER: `agencies` table (line ~4580)

Add 5 new columns after the existing `rejectionReason` field:

- `sharedInstructions` — `text("sharedInstructions")` (nullable). Shared system prompt prepended to all agents.
- `userContext` — `jsonb("userContext").$type<Record<string, unknown>>()` (nullable). Initial context key-value pairs from frontend.
- `conversationStarters` — `jsonb("conversationStarters").$type<string[]>()` (nullable). Suggestion chips for chat UI.
- `topology` — `varchar("topology", { length: 30 }).default("custom")`. Values: handoff_chain, orchestrator_worker, hybrid, custom.
- `cacheConversationStarters` — `boolean("cacheConversationStarters").default(false)`. Redis cache toggle.

#### 1.2 ALTER: `agencyAgents` table (line ~4650)

Add 6 new columns after the existing `nodeConfig` field:

- `outputSchema` — `jsonb("outputSchema").$type<Record<string, unknown>>()` (nullable). Per-agent structured output JSON Schema.
- `examples` — `jsonb("examples").$type<Array<{ role: string; content: string }[]>>()` (nullable). Few-shot example conversation pairs.
- `mcpServers` — `jsonb("mcpServers").$type<Array<{ url: string; name?: string }>>()` (nullable). MCP server URL/config list.
- `mcpServerTokensEncrypted` — `text("mcpServerTokensEncrypted")` (nullable). AES-256-GCM encrypted MCP tokens via crypto.ts.
- `parallelToolCalls` — `boolean("parallelToolCalls").default(true)`. Whether the agent can call tools in parallel.
- `maxTurns` — `integer("maxTurns").default(25)`. Per-agent turn limit (cap enforced at 100 in Zod, not DB).

Also update the `modelSettings` TypeScript type to include the new camelCase keys and `reasoningEffort`:

```typescript
modelSettings: json("modelSettings").$type<{
  maxTokens?: number;      // was max_tokens
  temperature?: number;
  topP?: number;           // was top_p
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}>(),
```

**Important**: The column type remains `json` -- only the TypeScript `$type<>` annotation changes. The actual data migration (renaming keys) is handled by a separate SQL statement.

#### 1.3 ALTER: `agencyTools` table (line ~4764)

Add 13 new columns after the existing `requiresApproval` field:

- `inputSchema` — `jsonb("inputSchema").$type<Record<string, unknown>>()` (nullable). JSON Schema for input validation.
- `outputSchema` — `jsonb("outputSchema").$type<Record<string, unknown>>()` (nullable). JSON Schema for output validation.
- `httpMethod` — `varchar("httpMethod", { length: 10 })` (nullable). GET/POST/PUT/DELETE.
- `headersEncrypted` — `text("headersEncrypted")` (nullable). AES-256-GCM encrypted HTTP headers.
- `retryPolicy` — `jsonb("retryPolicy").$type<{ maxRetries?: number; backoffMs?: number }>()` (nullable).
- `icon` — `varchar("icon", { length: 50 })` (nullable). Lucide icon name.
- `category` — `varchar("category", { length: 50 })` (nullable). UI grouping.
- `version` — `integer("version").default(1)`. Auto-incremented on update.
- `isExposedAsApi` — `boolean("isExposedAsApi").default(false)`. Standalone API toggle.
- `strictSchema` — `boolean("strictSchema").default(false)`. Enforce 100% schema match.
- `oneCallAtATime` — `boolean("oneCallAtATime").default(false)`. Prevent concurrent execution.
- `isEnabled` — `boolean("isEnabled").default(true)`. Soft-disable without deleting.
- `updatedAt` — `timestamp("updatedAt", { withTimezone: true }).defaultNow()`. Last modification timestamp.

#### 1.4 ALTER: `agencyCommunicationFlows` table (line ~4822)

Add 1 new column after the existing `flowType` field:

- `flowConfig` — `jsonb("flowConfig").$type<{ contextFields?: string[]; requireSummary?: boolean; maxRoundTrips?: number; timeout?: number }>()` (nullable).

#### 1.5 NEW TABLE: `agencyGuardrails`

Insert after `agencyVersions` (around line 4924).

```
Table name: agency_guardrails
Columns:
  id         - varchar(36) PK
  tenantId   - varchar(36) NOT NULL, FK → tenants.id ON DELETE CASCADE
  agencyId   - varchar(36) NOT NULL, FK → agencies.id ON DELETE CASCADE
  name       - varchar(100) NOT NULL
  type       - varchar(10) NOT NULL  (values: 'input', 'output')
  mode       - varchar(10) NOT NULL  (values: 'guidance', 'strict')
  strategy   - varchar(30) NOT NULL  (values: keyword_block, regex_match, llm_classify, json_schema, max_length, pii_detection, custom_endpoint)
  config     - jsonb, nullable
  validationAttempts - integer, default 1
  isEnabled  - boolean, default true
  sortOrder  - integer, default 0
  createdAt  - timestamp with tz, defaultNow, NOT NULL
  updatedAt  - timestamp with tz, defaultNow, NOT NULL

Indexes:
  index on (tenantId)
  index on (agencyId)
  composite index on (agencyId, isEnabled)
```

Export types: `AgencyGuardrail`, `InsertAgencyGuardrail`.

#### 1.6 NEW TABLE: `agencyAgentGuardrails`

Junction table linking agents to guardrails.

```
Table name: agency_agent_guardrails
Columns:
  id          - varchar(36) PK
  agentId     - varchar(36) NOT NULL, FK → agency_agents.id ON DELETE CASCADE
  guardrailId - varchar(36) NOT NULL, FK → agency_guardrails.id ON DELETE CASCADE
  createdAt   - timestamp with tz, defaultNow, NOT NULL

Constraints:
  UNIQUE(agentId, guardrailId)
```

Export types: `AgencyAgentGuardrail`, `InsertAgencyAgentGuardrail`.

**App-layer enforcement**: The tRPC procedure (section-05) must verify that `guardrail.tenantId` matches the agent's agency `tenantId` before inserting. This is NOT a DB constraint.

#### 1.7 NEW TABLE: `agencySharedTools`

Junction table for tools shared across all agents in an agency.

```
Table name: agency_shared_tools
Columns:
  id       - varchar(36) PK
  agencyId - varchar(36) NOT NULL, FK → agencies.id ON DELETE CASCADE
  toolId   - varchar(100) NOT NULL  (NO foreign key — allows builtin string IDs like "builtin-web-search" + UUIDs)
  createdAt - timestamp with tz, defaultNow, NOT NULL

Constraints:
  UNIQUE(agencyId, toolId)
```

Export types: `AgencySharedTool`, `InsertAgencySharedTool`.

#### 1.8 NEW TABLE: `agencyRunTraces`

Structured execution traces for observability.

```
Table name: agency_run_traces
Columns:
  id         - varchar(36) PK
  tenantId   - varchar(36) NOT NULL
  runId      - varchar(36) NOT NULL  (no FK — Python-owned agency_runs table)
  agencyId   - varchar(36) NOT NULL  (no FK — allows traces to survive agency deletion)
  createdBy  - integer, FK → users.id ON DELETE SET NULL
  trace      - jsonb NOT NULL
  durationMs - integer
  totalTokens - integer
  totalCost  - numeric(10, 6)
  status     - varchar(20)
  createdAt  - timestamp with tz, defaultNow, NOT NULL

Indexes:
  index on (tenantId)
  index on (runId)
  index on (agencyId)
  index on (createdAt)  — for retention cleanup queries
```

Export types: `AgencyRunTrace`, `InsertAgencyRunTrace`.

**Design note**: `agencyId` and `runId` are intentionally NOT foreign keys. The `runId` references a Python-owned table (`agency_runs`), and keeping `agencyId` as a plain varchar allows traces to persist after an agency is deleted (important for audit trails). This follows the same pattern as `agencyRunArtifacts.runId`.

### 2. Data Migration: modelSettings snake_case to camelCase

After the Drizzle migration is generated and applied, run a one-time SQL data migration. This can be included in the generated migration SQL file or run as a post-migration step.

**SQL statement:**

```sql
UPDATE agency_agents
SET "modelSettings" = jsonb_strip_nulls(
  ("modelSettings"::jsonb) - 'top_p' - 'max_tokens'
  || jsonb_build_object(
      'topP', ("modelSettings"::jsonb)->'top_p',
      'maxTokens', ("modelSettings"::jsonb)->'max_tokens')
)
WHERE ("modelSettings"::jsonb) ? 'top_p' OR ("modelSettings"::jsonb) ? 'max_tokens';
```

**Why `jsonb_strip_nulls`**: If `top_p` or `max_tokens` is not present in a given row, the `jsonb_build_object` would insert a `null` value for `topP` or `maxTokens`. `jsonb_strip_nulls` removes those null entries, keeping only the keys that actually had values.

**Idempotency**: The `WHERE` clause filters for rows that still have the old keys. Running this statement a second time matches zero rows and makes no changes.

**Risk**: LOW. This is a non-destructive transformation on a JSONB column. The old keys are removed and new keys are added in a single atomic UPDATE. No rows are deleted.

### 3. Migration Execution Steps

Follow the Database Safety Protocol from CLAUDE.md:

1. **Backup affected tables** before running the migration (agencies, agency_agents, agency_tools, agency_communication_flows).
2. **Edit schema.ts** with all changes described above.
3. **Run `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm db:push`** to generate and apply the Drizzle migration.
4. **Run the modelSettings data migration SQL** if not included in the generated migration file.
5. **Verify row counts** on all affected tables match pre-migration counts.
6. **Spot-check** a few `agencyAgents` rows to confirm `modelSettings` has `topP`/`maxTokens` (not `top_p`/`max_tokens`).

### 4. nodeConfig Type Extensions

The `agencyAgents.nodeConfig` TypeScript type should be extended with the new node type configurations. Add the following to the existing `$type<>` in the `nodeConfig` field:

```typescript
// conditional_branch (section-17)
evaluationMode?: "rule_based" | "llm_classify" | "context_check";
branches?: Array<{
  condition: string;
  operator?: string;
  value?: string;
  targetNodeId: string;
  label?: string;
}>;
defaultTargetNodeId?: string;  // already exists for router, reused
llmClassifyPrompt?: string;
contextKey?: string;

// parallel_fan_out (section-18)
parallelBranches?: Array<{ targetNodeId: string; label?: string }>;
mergeStrategy?: "wait_all" | "first_complete" | "majority" | "custom_prompt";
mergePrompt?: string;
maxConcurrent?: number;
branchTimeout?: number;
continueOnError?: boolean;

// loop_retry (section-19)
loopTargetNodeId?: string;
maxIterations?: number;
exitCondition?: "max_iterations" | "rule_based" | "llm_evaluate" | "context_check";
exitRule?: { contextKey: string; operator: string; value: string };
feedbackTemplate?: string;
loopTimeout?: number;
creditCap?: number;

// skill_discovery (section-20)
confidenceThreshold?: number;
maxResults?: number;
skillCategory?: string;

// error_handler (section-21)
errorStrategy?: "retry" | "fallback" | "skip" | "terminate";
watchedNodeIds?: string[];
maxRetries?: number;
fallbackNodeId?: string;
skipMessage?: string;
retryBackoffMs?: number;

// data_transform (section-21)
transformMode?: "jsonpath" | "template" | "filter";
jsonpathExpression?: string;
templateString?: string;
filterCondition?: string;
outputContextKey?: string;
```

These are added to the existing union type. Since `nodeConfig` is `json` (not validated by DB), this is a TypeScript-only change that enables type checking in the frontend and backend. No database migration is needed for this -- it is part of the schema.ts edit in step 2.

---

## Verification Checklist

After implementation, verify:

- [ ] All 4 new tables exist in the database: `agency_guardrails`, `agency_agent_guardrails`, `agency_shared_tools`, `agency_run_traces`
- [ ] All 27 new columns exist on the 4 altered tables
- [ ] `agencies.topology` defaults to `'custom'`
- [ ] `agencyAgents.parallelToolCalls` defaults to `true`
- [ ] `agencyAgents.maxTurns` defaults to `25`
- [ ] `agencyTools.version` defaults to `1`
- [ ] `agencyTools.isEnabled` defaults to `true`
- [ ] UNIQUE constraint on `agency_agent_guardrails(agentId, guardrailId)` is enforced
- [ ] UNIQUE constraint on `agency_shared_tools(agencyId, toolId)` is enforced
- [ ] CASCADE deletes work: deleting an agency removes its guardrails, shared tools
- [ ] `modelSettings` data migration: existing rows with `top_p`/`max_tokens` now have `topP`/`maxTokens`
- [ ] Row counts on all affected tables match pre-migration counts
- [ ] Existing agency builder UI continues to work (no breaking changes)
- [ ] All tests in `agencySwarmMigration.test.ts` pass
- [ ] `pnpm check` passes (TypeScript compilation with updated types)