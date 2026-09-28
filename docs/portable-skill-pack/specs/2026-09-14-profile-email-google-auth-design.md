# Profile email verification and Google-only login design

## Goal

Allow an authenticated user to request a new login email from `/settings`,
prove control of that address through a single-use verification URL, and then
bind Google authentication to the existing account. After an explicit warning
and a second confirmation, the account becomes Google-only: password login is
disabled without creating a new user or changing ownership.

The existing numeric `users.id`, `currentTenantId`, credits, domain records,
settings, API keys, jobs, and all other user-owned data remain unchanged.

## Existing boundaries

The Settings page currently edits the email only in React state. The Node auth
router already has authenticated procedures, password verification/reset,
SMTP email delivery, and a Google OAuth callback that exchanges a Python token
for a Node session. The new account-linking callback must be a separate,
authenticated flow and must never fall through to OAuth signup or match an
account using a browser-supplied email.

## Data model

Add `account_email_change_requests` with:

- immutable request ID and `userId` foreign key;
- server-resolved `tenantId` for audit/scope checks;
- normalized pending email and a SHA-256 token hash;
- expiration, consumed timestamp, and creation timestamp;
- source IP/user-agent metadata in bounded/redacted form where supported.

The current `users.email` remains authoritative until verification succeeds.
The table has indexes for token lookup, user pending requests, expiry cleanup,
and a unique active request guard per user. The migration is additive and does
not depend on the pending Feature 189 migration columns.

Reuse the existing shared `oauth_connections` table as the provider identity
mapping, adding only the missing Node/Drizzle projection for the fields needed
by this flow. Google linking uses this mapping instead of overwriting the
legacy `users.openId`; existing sessions and legacy references therefore remain
valid. Python's provider-subject lookup can resolve the durable mapping even if
the verified login email later changes.

The account conversion stores a `login_only` connection when the user does not
already have a Google Drive token. Python's Drive service excludes that status
from usable Drive connections, while a later Drive-consent flow upgrades the
same row to `active` without creating a duplicate user/provider record.

Add `account_google_link_transactions` with a hashed one-time state, user and
session binding, expiry, consumed timestamp, and provider metadata. It stores
no OAuth access token and lets the callback complete only the authenticated
user's pending link transaction.

## Email-change flow

1. A protected procedure receives the requested email and current password.
2. The server derives the authenticated user and tenant; client tenant/actor
   fields are ignored.
3. It verifies the current password, rejects the current address and any
   address already belonging to another user, invalidates the user's older
   pending request, and stores only the token hash.
4. It sends a URL containing the raw one-time token to the new address. The
   raw token is never stored or logged. SMTP failure removes the pending row
   and returns a truthful error.
5. A public confirmation route accepts the token, locks the request/user,
   checks expiry and single-use state, rechecks email uniqueness, updates
   `users.email` and `users.normalizedEmail`, marks the request consumed, and
   keeps `users.id` and `currentTenantId` unchanged in one transaction.
6. Replays, expired links, cross-user attempts, and email races fail closed.

## Google linking and password removal

The protected procedure first verifies the current password, creates a short-
lived account-link transaction bound to the current user/session, and starts
Google OAuth with a server-generated state. The callback validates state and
exchanges the provider code server-to-server using the existing OAuth settings;
the browser callback never receives provider secrets. It verifies the Google
identity server-side and rejects identities already bound to another user. It
then inserts the provider identity mapping, marks the user as Google-only, and
clears the password hash in one guarded transaction. It does not overwrite the
legacy `users.openId`, run the normal OAuth signup path, or modify tenant
assignment.

The account-link transaction is single-use, short-lived, session-bound, and
stores no provider access token. Callback errors leave the account unchanged.
The existing password-reset flow remains available before the switch; after
the switch, password login returns the existing safe authentication failure
and the UI directs the user to Google login.

## UI

The Profile tab gets:

- a read-only current email display plus a new-email field;
- current-password confirmation and “Send verification link” action;
- pending-email/expiry feedback and a link to the verification page;
- a “Sign in with Google instead” card with a clear warning that password
  login will stop working after confirmation;
- current-password input, Google-link action, and explicit final confirmation;
- a Forgot Password link before the Google-only action.

Successful email verification refreshes auth data. Successful Google linking
refreshes the current user and clearly shows Google-only status. Existing
profile, safety, recovery, notification, and tenant settings remain intact.

## Error handling and security

Use stable safe errors for invalid password, duplicate email, expired/replayed
link, invalid OAuth state, Google identity conflict, and SMTP/database failure.
Do not reveal whether an unrelated email belongs to another account beyond the
necessary authenticated Settings response. Rate-limit email-change requests
and OAuth-link starts. Escape all values inserted into email HTML, redact
tokens and provider responses, and never accept `userId` or `tenantId` from
the callback query.

## Verification

Focused tests cover schema/migration shape, password confirmation, duplicate
and expired email links, token replay, email uniqueness races, same-user and
cross-user tenant preservation, OAuth state/replay/conflict handling, password
login rejection after the switch, and Settings rendering of warnings/actions.
Run the focused Vitest files and `git diff --check`; do not run `npm run check`
or the full TypeScript check because the environment is memory-constrained.

## Trade-offs

The dedicated request/transaction records add two small tables and migration
work, but keep signup/reset tokens separate and make replay/audit behavior
explicit. Password removal is irreversible through the normal UI, so the
flow requires the current password, Google verification, and a final warning;
forgot-password remains the recovery path before conversion.
