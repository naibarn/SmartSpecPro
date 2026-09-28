# Research notes

- Production `https://smartaihub.app/api/oauth/google/authorize` returned a
  valid redirect to `/auth/callback/google`; URL configuration is not the
  reported root cause.
- Production logs showed Google callback success followed by repeated
  `auth.oauthExchangeSession: Registration requires an invite code` errors.
- Production data for `ottoagel@gmail.com` was a single active Google OAuth
  user with `registeredDomain=smartaihub.app` and
  `currentTenantId=tenant-ZCSKEM9s`; the account had no password by design.
- `apps/web/server/routers.ts` calls `requiresOAuthOnboarding(existing,
  isNewOAuthSignup)` before issuing the session.
- `apps/web/server/services/oauthRegistration.ts` currently returns true when
  either `isNewOAuthSignup` is true or the row is pending. This is the defect:
  the claim can override completed persisted state.
- Existing focused tests cover pending rows but do not cover a completed row
  with a true new-user claim.

## Security boundary

The fix is fail-closed for incomplete OAuth rows: a row missing either marker
still enters the existing registration and invite checks. Only completed rows
skip onboarding.
