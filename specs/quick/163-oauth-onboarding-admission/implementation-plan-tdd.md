# TDD guidance

## Red case

Add a test for a completed Google OAuth row with a true first-callback claim.
Before the fix, the existing predicate returns true and the test fails.

## Green case

Make the predicate depend only on persisted pending markers, then update the
router call site and rerun the focused suite.

## Regression matrix

- OAuth row missing domain and tenant: pending.
- OAuth row with domain but no tenant: pending.
- OAuth row with tenant but no domain: pending.
- OAuth row with both markers: not pending, regardless of callback claim.
- Non-OAuth row: not handled by OAuth onboarding predicate.

## Commands

`npm --workspace apps/web test -- server/services/oauthRegistration.test.ts`

`git diff --check`
