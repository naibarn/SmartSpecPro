# Free-credit inactivity lifecycle design

## Goal

Users who receive free credits through signup or an invite code get a 15-day
period to use them. If they neither use credits nor purchase additional
credits during that period, the system resets their remaining balance to zero
and disables the account. A purchase permanently cancels this policy for that
user. Administrators and system users are excluded from automatic disabling.

## Current gap

The repository already has `lastCreditUsedAt` and a daily inactive-user job,
but the job only considers admin invite-code users, only disables accounts,
and is controlled by a default-off setting. Email signup also writes the
initial balance directly, while OAuth signup and invite bonuses use separate
paths. The dashboard has no server-owned lifecycle status, and an existing
session can continue authenticating a disabled user.

## Chosen architecture

Use a small lifecycle state on `users`, maintained at the credit service
boundary:

- `freeCreditGrantedAt`: first timestamp at which a positive signup/invite
  free-credit grant is delivered.
- `freeCreditPolicyCancelledAt`: timestamp of the first successful purchase;
  non-null means the policy is permanently cancelled.
- `freeCreditNoticeSentAt`: last timestamp on which the daily warning was
  claimed for the user.

The existing `lastCreditUsedAt` remains the activity timestamp. The effective
inactivity anchor is the later of `freeCreditGrantedAt` and
`lastCreditUsedAt`; the deadline is that anchor plus 15 days. The server
returns the derived status (`eligible`, `daysRemaining`, `deadlineAt`, and
`noticeDue`) rather than making the client infer policy state.

All signup and invite grants go through `addCredits` with an explicit
free-credit grant marker. The email signup path creates the user with zero
credits and then uses the same grant function, so the credit ledger and
lifecycle state cannot diverge. `addCredits` marks purchase cancellation in
the same transaction as the purchase balance update.

## Request and job flow

On authentication, the server loads the current user row and calls the
lifecycle service. If the deadline has passed, the service atomically:

1. deducts any remaining credits as an auditable inactivity-reset transaction;
2. sets the balance to zero and `isDisabled = true` with reason `inactive`;
3. rejects the current authentication request.

If the deadline has not passed, the service atomically claims a warning when
`freeCreditNoticeSentAt` is older than the current UTC day. `auth.me` includes
the status for Dashboard. The existing 24-hour job calls the same service for
users who do not log in, so login and background enforcement share one rule.

Disabled users are rejected at the authentication boundary and credit
deduction also requires `isDisabled = false`, preventing stale sessions or
direct service paths from continuing to spend after disablement. Admin
reactivation remains available; it does not cancel the policy, so only a real
purchase permanently cancels it.

## Dashboard behavior

The priority snapshot gets a critical warning for eligible users. It states
that unused free credits will be reset to zero and the account disabled after
15 days, includes the calculated days remaining, and links to the credit
purchase page. The warning is returned only once per UTC day per user, while
the current policy status remains available for rendering and refreshes.

## Migration and compatibility

Add nullable timestamp columns and indexes needed by the lifecycle query. Do
not auto-disable legacy accounts whose free-credit provenance cannot be
identified. Backfill only explicit signup/invite credit ledger evidence and
invite-linked users, while excluding users with an existing purchase. New
signup and invite grants are fully tracked from the migration onward.

The existing registration setting is retained for administrative compatibility,
but the feature defaults to 15 days for the new lifecycle. A setting value of
zero continues to disable the policy for operational rollback; the default
application behavior is 15 days.

## Failure modes and safety

- Missing database: authentication fails closed for protected requests; the
  background job reports no mutation.
- Duplicate login tabs: the daily notice claim is guarded by an atomic update.
- Usage versus expiry race: expiry checks the unchanged activity/cancellation
  state in its update condition; a committed usage or purchase wins.
- Expiry versus purchase race: both operations update the same user row in a
  transaction, and the expiry update requires no cancellation.
- Repeated job execution: disabled-state and reset conditions are idempotent.
- Existing unrelated worktree changes: only focused hunks in schema, credit,
  auth, registration, dashboard, localization, job, and tests are changed.

## Verification

Add focused server tests for grant tracking, purchase cancellation, deadline
enforcement, reset ledger, daily notice idempotency, disabled-user rejection,
and race guards. Add Dashboard tests for eligible/warning/disabled states.
Run the focused Vitest files, `git diff --check`, touched-file TypeScript
diagnostics, and the existing atomic build if the dirty baseline permits.
Do not claim authenticated production, payment-provider, or browser proof
unless those checks are actually run.
