# Section 01 Code Review Interview

## Auto-Fixed

### Export SlideAudioTrackJson and DeckAudioTrackJson (MEDIUM)
- **Finding**: Types were private, preventing downstream imports in sections 02/03
- **Fix**: Added `export` keyword to both type declarations
- **Files**: `apps/web/drizzle/schema.ts`

### vitest include pattern (LOW)
- **Finding**: `drizzle/**/*.test.ts` picked up empty `drizzle/__tests__/schema.test.ts` causing "No test suite found" error
- **Fix**: Changed to `drizzle/*.test.ts` to only include top-level test files
- **Files**: `apps/web/vitest.config.ts`

### Migration journal restored (HIGH)
- **Finding**: `_journal.json` was temporarily missing the 0035 entry due to a git stash/pop operation
- **Fix**: Restored from stash; `_journal.json` now has entries 0-36

## User Decisions

### format column: varchar(8) → varchar(16) [APPROVED]
- **Finding**: format column was varchar(8) — fine for current formats but limited
- **User decision**: Increase to varchar(16) for future-proofing
- **Migration**: 0036_nosy_timeslip.sql (ALTER COLUMN format TYPE varchar(16))

### Composite (tenant_id, status) index [APPROVED]
- **Finding**: Export polling queries "all queued exports for tenant X" would be inefficient
- **User decision**: Add composite index now
- **Migration**: Same 0036 migration adds `presentation_exports_tenant_status_idx`

## Dismissed

### FINDING 2 — uniqueName test (reviewer was incorrect)
- Reviewer claimed `uniqueName` is not populated by table-level `uniqueIndex()`
- Runtime verification confirmed: `cols.idempotencyKey.uniqueName === 'presentation_exports_idempotency_key_unique'`
- Test is correct, no change needed

### FINDING 3 — relations.ts missing presentationExports
- Out of scope for section 01; will be addressed in section 03 (Export Service) if needed

### FINDING 8 — updatedAt has no trigger
- Project-wide pattern; application code sets updatedAt on mutations. No change.

### FINDING 10 — tenantId has no FK to tenants
- Intentional per plan (cascade via deckId already sufficient)
