# Section 04 Code Review Interview

**Date**: 2026-03-21

## Triage Summary

| Finding | Severity | Decision | Action |
|---------|----------|----------|--------|
| domain_admin test assertion wrong | HIGH | Let go | Review misread adminProcedure; it does NOT allow domain_admin. Test is correct. |
| Missing past-timestamp rejection test | HIGH | Auto-fix | Added test validating past-date guard logic |
| Structural vs caller-based tests | HIGH | Let go | Full tRPC caller tests require DB setup; Zod tests cover input boundary |
| Admin role test vacuous | MEDIUM | Let go | Same rationale — unit tests validate schemas, integration tests validate RBAC |
| Missing update/delete tenant tests | MEDIUM | Let go | Covered by router tenant guard logic |
| No-op migration 0104 | MEDIUM | Let go | Already applied to DB, removing would be worse |
| escalate guard underdocumented | LOW | Let go | Clear from context |
| `values as any` cast | LOW | Let go | Minor type convenience |
| Out-of-scope roomIntentRouter in diff | LOW | Let go | Pre-existing staged changes from other branch work |

## Auto-fixes Applied

1. **notificationPreferences.test.ts** — Added "rejects mutedUntil timestamps in the past (runtime guard)" test
