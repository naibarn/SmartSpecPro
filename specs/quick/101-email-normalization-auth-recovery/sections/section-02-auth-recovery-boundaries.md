# Section 02: Auth and Recovery Boundaries

## Ownership

Own web/desktop login, registration, email verification, forgot/reset, backup
email, 2FA recovery email, and admin-managed email writes.

## Files

- `apps/web/server/routers.ts`
- `apps/web/server/routers/users.ts`
- `apps/web/server/_core/deviceAuthRoutes.ts`
- auth regression tests

## TDD

- Add tests for mixed-case inputs across login and recovery.
- Add tests for 400-class invalid reset/verification errors.
- Add tests for null-password web login rejection.

## Acceptance

- All email boundaries use one helper.
- Existing password algorithms remain supported.
- Expected user errors do not become auto-reported internal failures.
