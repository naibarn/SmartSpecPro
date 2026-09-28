# Research notes

## Current paths

- `apps/web/drizzle/schema.ts`: `users` already has `credits`, `isDisabled`,
  `disabledReason`, `referredByInviteCodeId`, and `lastCreditUsedAt`.
- `apps/web/server/services/creditService.ts`: `deductCredits` owns the
  atomic usage update; `addCredits` owns balance additions.
- `apps/web/server/_core/oauth.ts`: OAuth signup grants signup bonus and then
  processes invite usage.
- `apps/web/server/routers.ts`: email signup inserts `credits` directly and
  then processes invite usage; `auth.me` returns a narrow user projection.
- `apps/web/server/services/inviteCodeService.ts`: invite bonus delivery uses
  `addCredits` with `type: bonus`.
- `apps/web/server/services/inactiveUserService.ts` and
  `apps/web/server/jobs/inactiveUserJob.ts`: existing job only checks admin
  invite users and disables without reset.
- `apps/web/client/src/pages/Dashboard.tsx`: priority snapshot already renders
  server/client notices and has a credit purchase CTA.

## Auth/security observations

- `sdk.resolveUserFromSession` and bearer resolution return disabled users;
  only email login has a verification-specific disabled check.
- `protectedProcedure` checks presence, not `isDisabled`.
- A disabled account with a stale session could otherwise reach credit paths.
- The new lifecycle must be checked at auth resolution and in deductions.

## Payment observation

`apps/web/server/services/billing/businessEffects.ts` grants paid top-ups via
`addCredits({ type: "purchase" })`. Marking cancellation in `addCredits` keeps
all successful purchase callers covered.

## Data safety

New lifecycle columns should be nullable and introduced with a focused
migration. Legacy rows must not be disabled solely because provenance is
unknown. Existing unrelated worktree edits overlap schema, auth, credit,
router, and Dashboard files, so patches must be narrow.

## Verification targets

Focused service tests, auth tests where practical, Dashboard notice tests,
`git diff --check`, touched-file diagnostics, and the relevant Vitest command.
