# Implementation plan

## Objective

Prevent approved OAuth users from being sent back through invite-only
onboarding while preserving admission controls for incomplete accounts.

## Files

- `apps/web/server/services/oauthRegistration.ts`: make the onboarding
  predicate server-state authoritative.
- `apps/web/server/routers.ts`: call the predicate without the untrusted/stale
  new-user claim.
- `apps/web/server/services/oauthRegistration.test.ts`: add the completed
  account regression and retain pending-state assertions.

## Approach

1. Remove `isNewOAuthSignup` from `requiresOAuthOnboarding`.
2. Return `isOAuthRegistrationPending(user)` directly.
3. Update the one router call site.
4. Replace the old claim-only test with a test proving a completed OAuth row
   does not require onboarding even when the callback claim was true.
5. Run the focused Vitest suite, syntax/type diagnostics for changed files,
   and `git diff --check`.

## Acceptance

- Completed OAuth row: no invite gate.
- Missing domain or tenant: invite gate remains.
- No production state changes during verification.
