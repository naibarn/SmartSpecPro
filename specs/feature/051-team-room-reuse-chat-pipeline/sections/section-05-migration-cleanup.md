Now I have all the context needed. Let me produce the section content.

# Section 05: Migration and Cleanup

## Overview

This section handles the data migration and code cleanup after the Python backend removal (section-04). It has three responsibilities:

1. Stop all old running/paused team runs that used the legacy pipeline
2. Remove the `team-discussion-assistant` internal skill definition
3. Clean up dead references to removed code across the codebase

**Depends on:** section-04 (Python removal must be complete before cleanup)
**Blocks:** section-06 (testing)

---

## TDD: Tests First

### File: `apps/web/server/services/__tests__/runEngine.migration.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("migration — stop old runs", () => {
  it("should set running runs to stopped with system_migration_051 reason");
  it("should set paused runs to stopped with system_migration_051 reason");
  it("should not affect already stopped runs");
  it("should not affect completed runs");
  it("should not affect failed runs");
  it("should not affect queued runs");
  it("should log count of affected runs");
});
```

**Mocking strategy:** Mock Drizzle `db.update()` and `db.select()` calls. Verify that the `WHERE` clause targets only `status IN ('running', 'paused')` and that the update sets `status = 'stopped'` and `stopReason = 'system_migration_051'`.

### File: `apps/web/server/services/__tests__/internalSkills.cleanup.test.ts`

```typescript
import { describe, it, expect } from "vitest";

describe("internalSkills — post-migration", () => {
  it("should return empty array from getInternalSkillDefinitions()");
  it("should return false from isInternalSkillId for team-discussion-assistant");
  it("should not export TEAM_DISCUSSION_SKILL_ID");
});
```

---

## Implementation Details

### 1. Migration SQL: Stop Old Runs

**File to create:** `apps/web/drizzle/0103_stop_legacy_team_runs.sql`

This is a one-time migration that stops any runs still in `running` or `paused` state. These runs used the old Python-bridge pipeline and cannot continue under the new Node.js-only pipeline.

The SQL should include a time-bound guard (MED-1 security fix — prevents stopping newly created runs during staggered deployment):
```sql
UPDATE team_runs
SET status = 'stopped', "stopReason" = 'system_migration_051', "endedAt" = NOW()
WHERE status IN ('running', 'paused')
  AND "startedAt" < NOW() - INTERVAL '5 minutes';
```
This is safe because old runs were broken anyway (per interview decision Q4: "Reset all")

After creating the SQL file, the migration journal at `apps/web/drizzle/meta/_journal.json` must be updated with a new entry referencing this file. Follow the existing pattern in the journal (incrementing index, adding tag and timestamp).

**Important:** Do NOT use `drizzle-kit generate` for this migration. It is a data-only migration (no schema change), so write the SQL manually and register it in the journal.

### 2. Startup Guard in runEngine.ts

**File to modify:** `apps/web/server/services/runEngine.ts`

Modify the existing `recoverActiveRunsOnStartup()` function (line 1301) to add a pre-check that stops any legacy runs that might have been missed by the migration. This is a safety net.

The function currently:
1. Queries `teamRuns` where `status = 'running'`
2. Re-starts auto-stop checkers and auto-advance queues

Add a step before the existing logic:
1. Query runs where `status IN ('running', 'paused')` AND `stopReason IS NULL` (i.e., not already migration-stopped)
2. For any found, update to `status = 'stopped'`, `stopReason = 'system_migration_051'`, `endedAt = NOW()`
3. Log the count: `[RunRecovery] Stopped N legacy runs from pre-migration pipeline`

This ensures that even if the SQL migration was not applied (e.g., manual deployment), the startup code catches stale runs.

The existing recovery logic (lines 1305-1339) then proceeds as normal for any legitimately running runs started under the new pipeline.

### 3. Remove team-discussion-assistant Internal Skill

**File to modify:** `apps/web/server/services/internalSkills.ts`

Current state: exports `TEAM_DISCUSSION_SKILL_ID`, `getInternalSkillDefinitions()` (returns array with one skill), and `isInternalSkillId()`.

Changes:
- Remove the `TEAM_DISCUSSION_SKILL_ID` constant export
- Remove the `TEAM_DISCUSSION_SYSTEM_PROMPT` and `TEAM_DISCUSSION_SKILL` objects
- Change `getInternalSkillDefinitions()` to return an empty array `[]`
- Change `isInternalSkillId()` to always return `false`
- Keep the function signatures so that callers do not break (skillRegistry.ts calls both)

The file should shrink to approximately:

```typescript
import type { SkillDefinition } from "@smartspec/skills";

export function getInternalSkillDefinitions(): SkillDefinition[] {
  return [];
}

export function isInternalSkillId(_skillId: string): boolean {
  return false;
}
```

### 4. Clean Up Dead References to TEAM_DISCUSSION_SKILL_ID

**File to modify:** `apps/web/server/services/roomIntentRouter.ts`

Current state (line 3): `import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills";`
Current state (line 74): falls back to `selectedSkillId: TEAM_DISCUSSION_SKILL_ID`

After section-01 implementation, the assistant-origin branch should already use detected skills with a content-appropriate fallback. However, if section-01 still references `TEAM_DISCUSSION_SKILL_ID` as a fallback, this section must update it.

The fallback at line 71-77 should be changed to use a content-appropriate default skill instead. The fallback logic:
- If message contains Thai characters (regex `[\u0E00-\u0E7F]`) use a Thai-capable general skill ID (e.g., `"general-article-writer"` or similar from the skill registry)
- Otherwise use a general English content skill
- Remove the import of `TEAM_DISCUSSION_SKILL_ID`

**File to modify:** `apps/web/server/services/teamRunSkillExecutor.ts`

Current state (line 7): `import { TEAM_DISCUSSION_SKILL_ID } from "./internalSkills";`
Current state (line 75): `const internal = await getSkillByIdAsync(TEAM_DISCUSSION_SKILL_ID);`

After section-03 implementation, this file should no longer reference `TEAM_DISCUSSION_SKILL_ID`. Verify that the import and all usages are removed. If any remain, remove them.

**File to modify:** `apps/web/server/services/skillRegistry.ts`

Current state (lines 636-648): `getInternalSkillDefinitions()` is called to merge internal skills into the registry. After cleanup, this call still works but returns an empty array, so no functional change is needed. The call can optionally be removed for clarity, but is not required since it is a no-op.

**File to verify:** `apps/web/server/services/__tests__/roomIntentRouter.test.ts`

Current state (line 2): imports `TEAM_DISCUSSION_SKILL_ID`. Update test expectations:
- Remove references to `TEAM_DISCUSSION_SKILL_ID`
- Update assistant-origin test cases to expect the new fallback skill ID
- Verify that the `"assistant_discussion_default"` reason is updated

### 5. Remove formatPromptMessagesForAgent from runEngine.ts

**File to modify:** `apps/web/server/services/runEngine.ts`

The `formatPromptMessagesForAgent()` function at line 141 is now dead code (section-03 removes usage from `teamRunSkillExecutor.ts`, section-04 removes the Python bridge).

Remove this exported function. Also update `apps/web/server/services/__tests__/runEngine.test.ts` to remove its test at line 54.

### 6. Remove Dynamic Import of Bridge in runEngine.ts

**File to modify:** `apps/web/server/services/runEngine.ts`

At line 1198, there is a dynamic import: `const bridge = await import("./teamOrchestrationBridge");`

This references the file removed in section-04. Remove the dynamic import and any code block that uses it. This line is inside a function body -- trace the surrounding logic to determine if the entire code path should be removed or just the bridge call.

---

## File Summary (Actual Implementation)

| File | Action | Description |
|------|--------|-------------|
| `apps/web/drizzle/0105_stop_legacy_team_runs.sql` | CREATE | Migration to stop running/paused/queued runs (numbered 0105, not 0103 per plan, due to intervening migrations) |
| `apps/web/drizzle/meta/_journal.json` | MODIFY | Add journal entry idx=105 for new migration |
| `apps/web/server/services/internalSkills.ts` | MODIFY | Gutted — returns empty array/false. All skill constants removed. |
| `apps/web/server/services/runEngine.ts` | MODIFY | Added startup guard in `recoverActiveRunsOnStartup()`, removed `formatPromptMessagesForAgent`, removed unused `PromptMessage` import |
| `apps/web/server/services/__tests__/runEngine.test.ts` | MODIFY | Removed `formatPromptMessagesForAgent` test |
| `apps/web/server/services/__tests__/roomIntentRouter.test.ts` | MODIFY | Replaced `TEAM_DISCUSSION_SKILL_ID` import with `FALLBACK_CONTENT_SKILL_ID` from roomIntentRouter |
| `apps/web/server/services/__tests__/runEngine.migration.test.ts` | CREATE | Tests for migration SQL content and journal entry |
| `apps/web/server/services/__tests__/internalSkills.cleanup.test.ts` | CREATE | Tests verifying gutted internalSkills returns empty/false |

### Deviations from Plan

- **Migration numbered 0105** (plan said 0103): Correct because migrations 0103-0104 were added by other features between planning and implementation.
- **Added `queued` status** to migration SQL and startup guard: Code review identified that queued legacy runs would be orphaned.
- **Added `stopReason IS NULL` guard** to migration SQL: Code review identified re-run safety gap.
- **roomIntentRouter.ts was not modified**: Section-01 already removed the `TEAM_DISCUSSION_SKILL_ID` import and fallback. Only the test file needed updating.
- **skillRegistry.ts not modified**: Plan noted this was optional; the call is now a no-op returning `[]`.

## Verification Results (All Pass)

1. `runEngine.migration.test.ts` — 5 tests pass
2. `internalSkills.cleanup.test.ts` — 4 tests pass
3. `TEAM_DISCUSSION_SKILL_ID` — zero matches in production code (only in test negative assertions)
4. `teamOrchestrationBridge` — zero matches in production code
5. `formatPromptMessagesForAgent` — zero matches in production code
6. `executeAgentTurn` — zero matches anywhere
7. All 31 related tests pass

---

## Dependencies

- **section-03** complete ✓ (skill executor no longer references `TEAM_DISCUSSION_SKILL_ID` or `executeAgentTurn`)
- **section-04** complete ✓ (`teamOrchestrationBridge.ts` deleted, Python endpoints removed)