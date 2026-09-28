# Section 02 — authentication and background enforcement

## Ownership

Own SDK user resolution, `auth.me` projection, and the inactive-user job.

## Target files

- `apps/web/server/_core/sdk.ts`
- `apps/web/server/routers.ts`
- `apps/web/server/services/inactiveUserService.ts`
- `apps/web/server/jobs/inactiveUserJob.ts`

## TDD expectations

Cover expired users, stale-session rejection, admin/system exemption, and job
idempotency. Avoid claiming production authentication proof.

## Acceptance

The same lifecycle service is used on login and in the 24-hour backstop. An
expired account is reset/disabled before protected use and cannot deduct.

## Risks

Do not break email verification or system-agent sessions. Keep account state
checks at the authoritative auth/credit boundaries.
