# Section 05 — Code Review Interview

## Review Verdict: APPROVE_WITH_FIXES → All fixes applied

## Auto-fixes Applied

### 1. HIGH: Add `queued` status to migration SQL and startup guard
- **File:** `apps/web/drizzle/0105_stop_legacy_team_runs.sql` — added `'queued'` to `IN` clause
- **File:** `apps/web/server/services/runEngine.ts` — added `"queued"` to `inArray` call
- **Rationale:** Queued legacy runs can't start under the new pipeline; leaving them would create orphans.

### 2. HIGH: Add `stopReason IS NULL` guard to SQL migration
- **File:** `apps/web/drizzle/0105_stop_legacy_team_runs.sql` — added `AND "stopReason" IS NULL`
- **Rationale:** Prevents overwriting legitimate stop reasons on re-run of migration.

### 3. MEDIUM: Add `idx` assertion to journal test
- **File:** `apps/web/server/services/__tests__/runEngine.migration.test.ts` — added `expect(entry.idx).toBe(105)`
- **Rationale:** Catches idx collisions that could cause migration ordering issues.

### 4. LOW: Remove unused mock variables
- **File:** `apps/web/server/services/__tests__/runEngine.migration.test.ts` — removed `mockUpdate`, `mockSet`, `mockWhere`, `mockSelect`, `mockFrom`
- **Rationale:** Dead code in tests.

## Items Let Go

### HIGH: Test `recoverActiveRunsOnStartup()` Node.js path directly
- **Decision:** Deferred to section-06 (testing section). The SQL migration test validates the query shape. Integration-level testing of the Drizzle chain mock is better placed in the dedicated testing section.

### MEDIUM: Migration number differs from plan (0103 → 0105)
- **Decision:** Correct — the plan said "check the latest migration number and use the next sequential number." 0105 is correct given current journal state.

### MEDIUM: Spec 049 frontend files in diff
- **Decision:** These are NOT staged — only in the working tree from prior work. Not relevant to this section.

### LOW: console.log vs structured logger
- **Decision:** Matches surrounding code style in `recoverActiveRunsOnStartup()`.
