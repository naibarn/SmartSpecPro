## Review Report

### Verdict: APPROVE_WITH_FIXES

---

### Findings

| Severity | File:Line | Issue | Recommended Fix |
|---|---|---|---|
| CRITICAL | `0107_nosy_gwen_stacy.sql` (absent) | **modelSettings data migration SQL is missing from the migration file.** The spec (§2) requires an `UPDATE agency_agents SET "modelSettings" = jsonb_strip_nulls(...)` statement that renames `top_p`→`topP` and `max_tokens`→`maxTokens` in existing rows. The `.sql` file ends after `CREATE UNIQUE INDEX agency_shared_tools_unique` with no `UPDATE` statement. Production rows written with the old snake_case keys will be invisible to any code using the new TypeScript type, silently dropping those settings at runtime. | Append the spec's `UPDATE agency_agents ... WHERE ("modelSettings"::jsonb) ? 'top_p' OR ... ? 'max_tokens'` statement to `0107_nosy_gwen_stacy.sql` before this migration is applied to any environment. |
| CRITICAL | `schema.ts:30838` (nodeConfig diff) | **`defaultTargetNodeId` omitted from the conditional_branch additions.** The spec (§4, conditional_branch block) explicitly lists `defaultTargetNodeId?: string; // already exists for router, reused` in the conditional_branch section. The field already exists in the current schema (line 4679) for `router` node types. Adding it again to the union comment is a no-op for the DB, but **the spec requires it to be listed in the conditional_branch section** so that downstream section-17 authors and type-checkers know it is shared. The omission is a documentation/type-coherence gap that will cause confusion in section-17. | Add `defaultTargetNodeId?: string; // reused from router, used by conditional_branch` to the `// conditional_branch (section-17)` block in the `nodeConfig.$type<>` annotation. |
| HIGH | `schema.ts` (agencies diff, line 30808) | **`topology` and `cacheConversationStarters` are not `notNull()`.** The spec declares `topology` as having a `default("custom")` but does not declare it nullable — it implies a required column with a safe default, consistent with the existing `isEntryPoint`, `isOptional`, etc. pattern in the same file. Without `.notNull()`, Drizzle infers the column as nullable at the TypeScript level (`string | null`), which means callers must null-check even though a default always provides a value. Same issue for `cacheConversationStarters`. | Add `.notNull()` to both: `varchar("topology", { length: 30 }).default("custom").notNull()` and `boolean("cacheConversationStarters").default(false).notNull()`. Compare with `isEntryPoint: boolean("isEntryPoint").default(false).notNull()` two tables away. |
| HIGH | `schema.ts` (agencyAgents diff, line 30877-30878) | **`parallelToolCalls` and `maxTurns` are missing `.notNull()`.** Both have DB defaults (`true` and `25`) and are semantically required runtime values — the spec says "cap enforced at 100 in Zod" for `maxTurns`, implying it must always be numeric. Without `.notNull()`, the TypeScript type is `boolean | null` and `number | null`, requiring null-guards in every consumer. | Add `.notNull()`: `boolean("parallelToolCalls").default(true).notNull()` and `integer("maxTurns").default(25).notNull()`. |
| HIGH | `schema.ts` (agencyGuardrails diff, line 30934-30936) | **`validationAttempts`, `isEnabled`, and `sortOrder` are missing `.notNull()` on `agencyGuardrails`.** All three have DB defaults and are used in filter/sort queries. Without `.notNull()`, the Drizzle TypeScript types become nullable, even though the DB guarantees a value. The spec table description marks these as having defaults, which in Drizzle convention means they should also be `.notNull()` when they have application meaning. | Add `.notNull()` to all three: `integer("validationAttempts").default(1).notNull()`, `boolean("isEnabled").default(true).notNull()`, `integer("sortOrder").default(0).notNull()`. |
| HIGH | `schema.ts` (agencyTools diff, line 30893-30897) | **`version`, `isExposedAsApi`, `strictSchema`, `oneCallAtATime`, `isEnabled` are all missing `.notNull()` on `agencyTools`.** These are boolean/integer flags with application meaning and DB defaults. Same reasoning as above — the existing `requiresApproval: boolean(...).default(false).notNull()` on the same table sets the convention. | Add `.notNull()` to all five: `integer("version").default(1).notNull()`, `boolean("isExposedAsApi").default(false).notNull()`, `boolean("strictSchema").default(false).notNull()`, `boolean("oneCallAtATime").default(false).notNull()`, `boolean("isEnabled").default(true).notNull()`. |
| MEDIUM | `schema.ts` (agencyTools diff, line 30899) | **`updatedAt` on `agencyTools` is not `.notNull()`.** The spec (§1.3) lists `updatedAt — timestamp with tz, defaultNow()` without nullable marker. Every other `updatedAt` in the project schema (e.g., `agencies.updatedAt`, `agencyAgents.updatedAt`) is `.defaultNow().notNull()`. Inconsistency means the ORM type is `Date | null` instead of `Date`. | Change to `timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull()`. Also update the SQL migration: `ALTER TABLE "agency_tools" ADD COLUMN "updatedAt" timestamp with time zone DEFAULT now() NOT NULL;` |
| MEDIUM | `agencySwarmMigration.test.ts:31057-31063` | **`agency_agent_guardrails` unique constraint is not verified in tests.** The spec TDD requirement explicitly states: "Verify the unique index exists on (agentId, guardrailId)". The current test (`agency_agent_guardrails has required columns and unique constraint shape`) only checks column existence — it never inspects the Drizzle index list. Same gap for `agency_shared_tools_unique`. | Use `getTableIndexes` or inspect `agencyAgentGuardrails[Symbol.for('drizzle:Indexes')]` to assert the unique index names are present. Alternatively, assert using the Drizzle `uniqueIndex(...)` symbol path: `expect(JSON.stringify(agencyAgentGuardrails)).toContain("agency_agent_guardrails_unique")`. |
| MEDIUM | `agencySwarmMigration.test.ts:31073-31083` | **`agency_run_traces` index coverage test is vacuous.** The spec TDD requirement says "Verify indexes on: tenantId, runId, agencyId, createdAt". The current test only checks column names — it makes no assertion about indexes existing. | Assert index names by inspecting the table config object, similar to the unique constraint gap above. |
| MEDIUM | `agencySwarmMigration.test.ts` | **Default value assertions are entirely absent.** The spec TDD explicitly requires: verify `topology` defaults to `'custom'`, `cacheConversationStarters` defaults to `false`, `parallelToolCalls` defaults to `true`, `maxTurns` defaults to `25`, `version` defaults to `1`, `isEnabled` defaults to `true`. None of these are tested. | Add assertions using `getTableColumns(table).columnName.default`. For example: `expect(getTableColumns(agencies).topology.default).toBe("custom")` and `expect(getTableColumns(agencyAgents).maxTurns.default).toBe(25)`. |
| MEDIUM | `agencySwarmMigration.test.ts` | **FK cascade direction tests absent.** The spec TDD requires verifying both FKs on `agency_agent_guardrails` have ON DELETE CASCADE, and `agency_guardrails` FKs have CASCADE. No test asserts FK target or cascade policy. | Inspect Drizzle table config or use `getTableConfig(agencyGuardrails).foreignKeys` to assert cascade behavior. |
| LOW | `0107_nosy_gwen_stacy.sql:91` | **Missing newline at end of file.** The diff shows `\ No newline at end of file`. While harmless to PostgreSQL execution, this violates POSIX text file convention and will show as a diff hunk in future migrations. | Add a trailing newline. |
| LOW | `schema.ts` (users diff, line 30787-30796) | **Out-of-scope change: `users.userPreferences.privateVault` type extension is bundled into this diff.** The spec (§1) says this migration only touches agencies, agency_agents, agency_tools, agency_communication_flows, and the 4 new tables. The `privateVault` nested type under `users.userPreferences` is unrelated to Agency Swarm and belongs to a different feature (Feature 044 given the branch name `codex/feature-044-multimodal-chat-memory`). It is a TypeScript-only change with no DB impact, but it muddies the migration's intent and history. | Move the `privateVault` type extension to its own commit or feature branch PR, keeping this migration purely Agency Swarm scope. |
| LOW | `schema.ts` (agencyAgents nodeConfig diff) | **`defaultTargetNodeId` comment note in spec is a reuse signal, not a new addition.** Since the field already exists in the pre-migration schema (line 4679), adding it to the conditional_branch comment block is documentation only. No schema change needed — just add a comment clarifying shared usage. | See CRITICAL finding #2 — add the comment to document the reuse. |

---

### Contract Compliance

| Item | Status | Notes |
|---|---|---|
| 4 new tables present: `agency_guardrails`, `agency_agent_guardrails`, `agency_shared_tools`, `agency_run_traces` | PASS | All 4 tables present in SQL and schema.ts |
| 27 new columns across 4 altered tables | PASS | Count verified: 5 (agencies) + 6 (agencyAgents) + 13 (agencyTools) + 1 (agencyCommunicationFlows) + 2 (modelSettings type only) = 27 structural columns |
| `agency_guardrails` FK: `tenantId → tenants.id CASCADE` | PASS | Correct |
| `agency_guardrails` FK: `agencyId → agencies.id CASCADE` | PASS | Correct |
| `agency_agent_guardrails` FK: `agentId → agency_agents.id CASCADE` | PASS | Correct |
| `agency_agent_guardrails` FK: `guardrailId → agency_guardrails.id CASCADE` | PASS | Correct |
| `agency_shared_tools` FK: `agencyId → agencies.id CASCADE`, no FK on `toolId` | PASS | Correct — `toolId varchar(100)` with no FK as spec requires |
| `agency_run_traces` FK: `createdBy → users.id SET NULL` | PASS | Correct |
| `agency_run_traces` has no FK on `runId` or `agencyId` | PASS | Intentionally omitted per spec design note |
| UNIQUE constraint on `agency_agent_guardrails(agentId, guardrailId)` | PASS | `CREATE UNIQUE INDEX agency_agent_guardrails_unique` present in SQL |
| UNIQUE constraint on `agency_shared_tools(agencyId, toolId)` | PASS | `CREATE UNIQUE INDEX agency_shared_tools_unique` present in SQL |
| `agency_guardrails` indexes: tenantId, agencyId, (agencyId, isEnabled) | PASS | All 3 present |
| `agency_run_traces` indexes: tenantId, runId, agencyId, createdAt | PASS | All 4 present |
| `agencies.topology` defaults to `'custom'` | PASS (DB) / FAIL (TypeScript) | SQL default correct; `.notNull()` missing — see HIGH finding |
| `agencyAgents.modelSettings` TypeScript type updated to camelCase | PASS | `maxTokens`, `topP`, `reasoningEffort` all present |
| `agencyAgents.nodeConfig` extended with 6 new node type configs | PASS | All fields from spec §4 present (minus `defaultTargetNodeId` comment — see CRITICAL) |
| `agencyTools.$type<>` annotations match spec | PASS | All 13 new columns have correct Drizzle types |
| `agencyCommunicationFlows.flowConfig` JSONB type | PASS | Type matches spec exactly |
| modelSettings data migration SQL | FAIL | Missing from `.sql` file — see CRITICAL finding #1 |
| Journal entry idx:107, tag `0107_nosy_gwen_stacy` | PASS | Correct |
| Export types for all 4 new tables | PASS | `AgencyGuardrail`, `InsertAgencyGuardrail`, `AgencyAgentGuardrail`, `InsertAgencyAgentGuardrail`, `AgencySharedTool`, `InsertAgencySharedTool`, `AgencyRunTrace`, `InsertAgencyRunTrace` all exported |
| All changes additive/nullable (no data loss risk) | PASS | All `ALTER TABLE ... ADD COLUMN` statements; no DROP, no RENAME |
| Tests cover: new table column existence | PASS | All 8 plan-required column tests present |
| Tests cover: modelSettings idempotent migration | PASS | JS simulation test covers first run, second run, and partial-key edge case |
| Tests cover: default value assertions | FAIL | None of the required default value assertions are present |
| Tests cover: FK cascade and unique index shape | FAIL | Index/FK assertions are absent from tests |

---

### Summary

The structural database migration is essentially correct: all 4 new tables, all 27 new columns, all required FKs, CASCADE policies, indexes, unique constraints, and TypeScript types are present and match the spec. The two blocking issues are (1) the `modelSettings` snake_case-to-camelCase `UPDATE` SQL is absent from the migration file — this is a data loss scenario for any existing agency-agent rows that have `top_p` or `max_tokens` — and (2) a pervasive `.notNull()` omission across approximately 11 columns that have DB defaults, which inflates every consumer's TypeScript types with spurious `| null` and diverges from the established pattern in the same file. The test file covers column existence well but misses all default-value, index-shape, and FK-cascade assertions that the spec's TDD section explicitly required.

---

### Pre-commit Checklist

Before merging this section:

- [ ] Append the `UPDATE agency_agents SET "modelSettings" = jsonb_strip_nulls(...)` statement to `0107_nosy_gwen_stacy.sql`
- [ ] Add `.notNull()` to: `agencies.topology`, `agencies.cacheConversationStarters`, `agencyAgents.parallelToolCalls`, `agencyAgents.maxTurns`, `agencyGuardrails.validationAttempts`, `agencyGuardrails.isEnabled`, `agencyGuardrails.sortOrder`, `agencyTools.version`, `agencyTools.isExposedAsApi`, `agencyTools.strictSchema`, `agencyTools.oneCallAtATime`, `agencyTools.isEnabled`, `agencyTools.updatedAt`
- [ ] Add `defaultTargetNodeId?: string; // reused from router, used by conditional_branch` to the `nodeConfig.$type<>` conditional_branch block
- [ ] Add default value assertions to `agencySwarmMigration.test.ts`
- [ ] Add index-shape assertions (unique constraint verification) to `agencySwarmMigration.test.ts`
- [ ] Move `users.userPreferences.privateVault` type extension out of this diff
- [ ] Add newline at end of `0107_nosy_gwen_stacy.sql`
- [ ] After amending the SQL file, re-run `pnpm db:push` to regenerate the snapshot and re-run the test suite
