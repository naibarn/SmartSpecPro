# Email Normalization and Auth Recovery Hardening

Date: 2026-07-26
Status: Design approved for implementation

## Problem

Email/password login currently compares the raw request email with the stored
PostgreSQL `users.email` value. PostgreSQL comparisons are case-sensitive, so a
user stored as `User@Example.com` can fail to log in when the browser submits
`user@example.com`. The same mismatch affects forgot-password, verification, and
reset-token lookups.

The current recovery flow also exposes invalid reset-code failures as tRPC
`INTERNAL_SERVER_ERROR` responses, does not rate-limit reset-code verification,
and the web login path skips password verification for OAuth-only users whose
password is null.

## Goals

1. Store primary and recovery email addresses in lowercase, trimmed canonical
   form.
2. Make every email-auth lookup use the same canonicalization rule.
3. Keep legacy mixed-case rows usable during and after migration.
4. Detect duplicate logical email accounts before applying canonicalization.
5. Return authentication/recovery errors with correct HTTP semantics.
6. Add regression coverage for mixed-case login and recovery flows.

## Non-goals

- Do not apply Gmail dot or plus-alias collapsing to the authentication
  identity. The existing `normalizedEmail` field remains dedicated to fraud and
  registration analysis.
- Do not change display-name, tenant, OAuth provider, or Feature 141 behavior.
- Do not deploy, push, or commit unrelated dirty-tree changes.

## Canonicalization contract

Create a small auth-focused helper, separate from `emailAnalysis.normalizeEmail`:

```ts
normalizeAuthEmail(value: string): string
// returns value.trim().toLowerCase()
```

The helper is intentionally conservative. It does not remove dots, plus tags,
or other provider-specific aliases because those transformations can merge
distinct addresses outside Gmail.

The helper is applied at write boundaries and lookup boundaries. Primary email,
backup email, verification/reset token email, admin-managed email changes, and
email-based auth inputs all use this contract. Phone values are unchanged.

The token table has a polymorphic `email` column: SMS verification rows store a
phone number in that column. Email canonicalization must only run for rows whose
channel is an email channel; SMS rows must remain byte-for-byte unchanged.

## Runtime changes

### Shared database lookup

`getUserByEmail` normalizes its input and compares it with
`lower(btrim(users.email))` so legacy rows with mixed case or surrounding
whitespace remain usable before migration completes. Registration and OAuth
upsert paths write canonical primary email values.

### Auth and recovery routers

- Normalize email input before login, registration, verification, resend,
  forgot-password, reset-code verification, reset-password, admin-managed email
  changes, and relevant backup-email lookups.
- Store canonical email values in new verification/reset token rows.
- Use `TRPCError` with an authentication or client-input code for expected
  credential and reset-code failures instead of plain `Error`.
- Protect `verifyResetCode` with a dedicated rate-limit policy.
- Reject OAuth-only users from password login rather than treating a missing
  password as automatically valid.

### Desktop login

Use the same canonical email lookup as web login. Preserve the existing Argon2
and bcrypt verification behavior in the desktop route.

## Migration and duplicate safety

Add a serial Drizzle SQL migration that:

1. Checks for duplicate groups using `lower(btrim(email))` and aborts with a
   clear error if any exist.
2. Updates non-null primary and backup emails to `lower(btrim(...))`.
3. Updates verification/reset token addresses to canonical form only for email
   channels; SMS token rows remain unchanged because their `email` column holds
   phone numbers.
4. Adds a partial unique index on canonical primary email values.

The migration must not silently choose a winner for duplicate accounts. The
duplicate query and migration SQL receive focused tests or a verification
script. Existing production data was inspected before design approval; the
current dataset has no duplicate lowercase-email groups and one mixed-case
primary email row.

## Error and security behavior

- Wrong credentials remain a generic `401 UNAUTHORIZED` response.
- Invalid or expired reset codes return a client-input error (400-class), not a
  server failure or auto-generated system incident.
- Reset-code verification is rate-limited independently from sending and
  consuming reset codes.
- A user with no local password cannot authenticate through the password route.
- Password reset continues to write `passwordChangedAt`; session invalidation
  must not be claimed unless the session validation path actually enforces it.
  If the existing session layer cannot safely enforce it within this focused
  change, the implementation will document it as a separate follow-up rather
  than introducing an unsafe partial mechanism.

## Tests and verification

Add focused tests for:

- canonicalization of whitespace and mixed-case email values;
- `getUserByEmail` matching a legacy mixed-case row;
- register/OAuth writes storing lowercase email;
- login and desktop login finding mixed-case legacy users;
- forgot/reset/verification token flow with mixed-case input;
- duplicate detection and migration SQL shape;
- invalid reset code status and rate-limit behavior;
- OAuth-only password login rejection;
- existing invalid-login `401` regression behavior.

Run the focused auth tests, the relevant TypeScript check, and the migration
verification against a disposable/test database. Production migration and
deployment remain separate operator actions after source review.

## Rollout and rollback

1. Add runtime compatibility first: normalize lookups and writes while allowing
   legacy rows.
2. Run the duplicate-checking migration.
3. Verify canonical row counts and auth smoke tests.
4. Deploy the application and monitor login/reset error rates.

If migration preflight finds duplicates, stop without changing data and resolve
the accounts manually. If an application regression appears, rollback the
application code while preserving the safe lowercase data migration; the
case-insensitive lookup remains backward-compatible.

## Scope guard

Only auth/recovery source, auth tests, the email-normalization helper, and the
email canonicalization migration are in scope. Existing Feature 141 changes,
staged files, generated artifacts, and unrelated service changes must remain
untouched.
