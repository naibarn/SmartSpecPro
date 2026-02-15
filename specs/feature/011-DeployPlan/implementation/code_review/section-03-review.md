# Section 03 Code Review

## HIGH Issues

1. **Hardcoded temporary password in source code** - seed-production.ts has `const TEMPORARY_PASSWORD = "ChangeMe!2026"` committed to git
2. **onConflictDoNothing targets openId which is always a fresh UUID** - seed script generates `randomUUID()` for openId every run, so conflict never fires → duplicate admin users on re-run
3. **Seed script can't link tenant to existing admin on re-run** - when admin exists, `insertedUsers` is empty, `adminId` is undefined, tenant gets no owner
4. **systemSettings onConflictDoNothing without unique constraint** - `system_settings` has no unique on `(category, key)` so conflict never fires → duplicate settings rows

## MEDIUM Issues

5. Missing migrationOrdering.test.ts from plan
6. Seed test placed in server/__tests__ vs scripts/__tests__ (works with vitest config)
7. Seed test doesn't verify actual tenant data values
8. Missing PgBouncer and reconnect test cases
9. Python migration is standalone script, not Alembic revision (matches project convention)
10. POOL_SIZE parsed at module load time, not connection time
11. Missing postgres client cleanup in seed script

## LOW Issues

12. `as any` cast in seed script
13. Admin email logged to stdout
14. `import os` placement in Python database.py
15. Media model seed delegation not documented

## What Was Done Well

- Schema definition matches plan exactly
- Python model change is clean and minimal
- Python migration follows project conventions
- Python tests are thorough
- Connection pooling changes are conservative
- Schema tests are well-structured
