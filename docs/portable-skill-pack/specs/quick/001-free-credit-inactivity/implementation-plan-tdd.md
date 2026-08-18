# TDD guidance

## Red tests first

1. Lifecycle pure status tests: no grant, active grant, usage reset, purchase
   cancellation, deadline boundary, admin/system exclusion.
2. Service tests: atomic daily notice claim, expiry reset ledger, idempotent
   repeated expiry, and conditional guard when activity/purchase changed.
3. Credit tests: free-grant metadata sets timestamp once; purchase sets
   cancellation; disabled users cannot deduct.
4. Registration tests: email signup no longer writes a balance directly and
   invokes the central grant; invite bonus marks free eligibility.
5. Dashboard tests: warning copy, remaining days, CTA, and no warning for
   cancelled/non-eligible users.

## Fixtures and mocks

Use the existing Vitest `vi.hoisted`/mock database patterns in service tests.
Inject `now` into pure lifecycle calculations and service options where needed
instead of relying on wall-clock sleeps. Use UTC dates for daily notice claims.

## Verification commands

```bash
npm --workspace apps/web test -- server/services/freeCreditInactivityService.test.ts server/services/creditService.test.ts
npm --workspace apps/web test -- client/src/pages/__tests__/Dashboard.freeCreditInactivity.test.tsx
git diff --check
npm --workspace apps/web check
```

If the full check is noisy from pre-existing worktree failures, capture the
touched-file diagnostics and report baseline failures separately.
