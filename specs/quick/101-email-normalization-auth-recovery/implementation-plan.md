# Implementation Plan

## Objective

Implement the approved email-normalization and auth-recovery hardening design
without touching unrelated Feature 141 changes.

## Section 1: Canonical email foundation

Target files:

- `apps/web/server/services/emailNormalization.ts`
- `apps/web/server/db.ts`
- `apps/web/server/_core/trpc.ts`
- `apps/web/drizzle/schema.ts`

Work:

- Add and export `normalizeAuthEmail(value)` using trim + lowercase only.
- Make `getUserByEmail` compare against `lower(btrim(users.email))`.
- Canonicalize primary email in `upsertUser`.
- Add a dedicated rate-limited `verifyResetCodeProcedure`.
- Add focused helper and lookup tests.

## Section 2: Auth and recovery boundaries

Target files:

- `apps/web/server/routers.ts`
- `apps/web/server/routers/users.ts`
- `apps/web/server/_core/deviceAuthRoutes.ts`

Work:

- Normalize email input before all primary email auth/verification/token
  lookups and writes.
- Normalize backup-email writes and recovery comparisons.
- Convert expected invalid reset/verification code failures to 400-class
  `TRPCError` responses.
- Apply verification rate limiting.
- Reject null-password users in web password login.
- Preserve desktop bcrypt/Argon2 support.

## Section 3: Data safety and proof

Target files:

- new migration under `apps/web/drizzle/`
- `apps/web/server/__tests__/...`
- `apps/web/drizzle/...test.ts` or a focused migration verification test

Work:

- Add duplicate preflight and canonical backfill for users, backup emails, and
  email-channel tokens only.
- Add partial unique functional index for primary email.
- Add regression coverage for mixed-case legacy lookup, new writes, reset and
  verification flows, null-password rejection, error codes, and SMS preservation.
- Run targeted tests, TypeScript check, and migration SQL verification.

## Acceptance criteria

- `normalizeAuthEmail("  User@Example.COM ")` returns
  `user@example.com`.
- Legacy mixed-case and whitespace rows are found by email auth lookup.
- New primary/backup email and email-token writes are lowercase and trimmed.
- SMS token payloads are unchanged by migration logic.
- Duplicate logical primary emails abort migration before data update/indexing.
- Invalid reset code returns a 400-class response and verification is rate
  limited.
- OAuth-only password login is rejected.
- Focused tests and typecheck pass.

## Scope protection

Use `git diff --` and `git status --short` only for listed auth/migration/test
paths. Do not stage or modify the existing Feature 141 files.
