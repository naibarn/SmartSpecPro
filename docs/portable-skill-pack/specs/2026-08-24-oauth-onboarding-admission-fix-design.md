# OAuth Onboarding Admission Fix

## Root cause

The Google OAuth callback and provider exchange succeed, but the Node session
exchange can still enter the invite-only onboarding branch for an already
approved OAuth user. The current predicate treats the signed
`isNewOAuthSignup` claim as sufficient to require onboarding, even when the
shared `users` row already has both `registeredDomain` and `currentTenantId`.
That makes a completed account depend on a stale or absent invite cookie.

## Design

Use the shared user row as the authoritative admission state. Require OAuth
onboarding only when the OAuth user is missing either registration marker. Keep
the invite-only gate for genuinely new or pending rows, and keep cleanup of a
newly-created rejected pending row unchanged.

This is an application-only change: no schema, data repair, or provider
configuration change is required.

## Acceptance criteria

- A completed Google/GitHub OAuth user can exchange a valid provider token for
  a session without an invite code.
- A pending OAuth row missing a domain or tenant still requires registration
  admission and an invite when the policy is invite-only.
- The regression is covered by a focused unit test.
- No production database mutation is performed by the fix.
