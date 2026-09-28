# Implementation plan

## Objective

Implement the approved 15-day free-credit inactivity lifecycle with canonical
server state, atomic reset/disable enforcement, permanent purchase cancellation,
daily Dashboard warning, and focused regression coverage.

## Ownership and target files

### Data and lifecycle service

- `apps/web/drizzle/schema.ts`
- new migration under `apps/web/drizzle/`
- `apps/web/server/services/freeCreditInactivityService.ts`
- `apps/web/server/services/inactiveUserService.ts`

Add nullable lifecycle timestamps and a service that derives status, claims the
daily notice, and atomically resets/disables expired users. Keep queries
tenant-neutral because the policy is user/account state, while excluding
admin/system users.

### Credit and registration boundaries

- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/inviteCodeService.ts`
- `apps/web/server/_core/oauth.ts`
- `apps/web/server/routers.ts`

Extend `addCredits` with an explicit free-grant marker and purchase-cancellation
behavior. Normalize email signup to create zero balance then call the central
signup grant. Mark invite bonuses as free grants. Keep idempotency semantics.

### Authentication and API projection

- `apps/web/server/_core/sdk.ts`
- `apps/web/server/_core/trpc.ts` if needed
- `apps/web/server/routers.ts` (`auth.me`)

Run lifecycle enforcement after resolving a user and before returning a
protected authenticated user. Return the derived status through `auth.me` for
Dashboard. Reject disabled users, while preserving the existing email
verification flow and system user behavior.

### Background enforcement

- `apps/web/server/jobs/inactiveUserJob.ts`

Reuse the lifecycle service for the periodic sweep. Preserve startup and
24-hour scheduling, but remove the admin-invite-only restriction.

### Dashboard and copy

- `apps/web/client/src/contexts/AuthContext.tsx`
- `apps/web/client/src/pages/Dashboard.tsx`
- `apps/web/client/src/locales/en/dashboard.json`
- `apps/web/client/src/locales/th/dashboard.json`

Project `freeCreditStatus` into the auth user and insert a critical priority
notice before lower-priority notices. Include days remaining, explicit reset
and disable consequence, and `/credits` CTA. Keep responsive/accessibility
behavior consistent with the existing notice cards.

### Tests

- new focused lifecycle service tests
- update credit service tests for free grant, purchase cancellation, and
  disabled deduction
- update auth/Dashboard tests if existing harnesses can cover the projection

## Risks and mitigations

- Existing dirty files: inspect exact hunks before applying patches; do not
  format whole files.
- Migration drift: generate one SQL migration and inspect journal/schema
  consistency; do not run production migration.
- Race conditions: use conditional updates with activity/cancellation guards
  and transaction-local balance ledger rows.
- Legacy data: backfill only evidence-backed rows; unknown provenance remains
  untouched.
- Auth compatibility: retain email verification semantics and system-agent
  exemption; test disabled user rejection separately.

## Acceptance criteria

1. Positive signup and invite grants set `freeCreditGrantedAt` exactly once.
2. A purchase sets cancellation and prevents future inactivity disablement.
3. After 15 days without usage, remaining credits are reset to zero, an audit
   transaction is written when needed, and the account is disabled as inactive.
4. A committed usage or purchase prevents the expiry mutation.
5. Login/dashboard status is warning-due at most once per UTC day.
6. Dashboard copy clearly states the 15-day reset-to-zero and disable behavior.
7. Disabled stale sessions and deductions cannot continue using the account.
8. The background job is a reliable backstop and remains idempotent.
9. Focused tests and diff checks pass; any baseline-wide failure is reported
   separately.
