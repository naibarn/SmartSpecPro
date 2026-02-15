# Section 03 Code Review Interview

## Auto-fixed (obvious improvements)

1. **HIGH: Hardcoded temp password** → Reads from `ADMIN_TEMP_PASSWORD` env var or generates random UUID
2. **HIGH: onConflictDoNothing on always-new openId** → Replaced with SELECT-before-INSERT on email
3. **HIGH: Seed can't link tenant to existing admin** → Uses existingUsers[0].id when admin exists
4. **HIGH: systemSettings onConflictDoNothing without unique constraint** → Replaced with SELECT-before-INSERT pattern
5. **MEDIUM: POOL_SIZE parsed at module load time** → Moved inside getDb() function
6. **MEDIUM: Missing postgres client cleanup** → Added `await client.end()` in both .then/.catch
7. **LOW: import os placement** → Moved to stdlib group with `re`

## User decision

8. **MEDIUM: Missing migrationOrdering.test.ts** → User chose "Add simplified" → Added simplified test checking schema definitions and migration file structure

## Let go (not worth fixing)

9. Python migration not Alembic-integrated (matches project convention)
10. Seed test in server/__tests__ vs scripts/__tests__ (works with vitest config, no benefit to moving)
11. `as any` cast in seed entry point (unavoidable for standalone script pattern)
12. Admin email logged to stdout (only runs during initial setup, not in prod runtime)
13. Media model seed delegation not implemented (can run separately as documented)
