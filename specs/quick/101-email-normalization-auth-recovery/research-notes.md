# Research Notes

## Discovery

- SocratiCode MCP was not exposed in this session; discovery used targeted
  `rg`, line-range reads, PostgreSQL read-only queries, and production probes.
- `apps/web/server/db.ts:getUserByEmail` currently compares `users.email` with
  raw input using PostgreSQL equality.
- `apps/web/server/routers.ts` contains web login, registration, email
  verification, forgot/reset password, backup-email, 2FA recovery, and token
  flows.
- `apps/web/server/_core/deviceAuthRoutes.ts` contains desktop login and already
  supports bcrypt plus Argon2.
- `emailAnalysis.normalizeEmail` intentionally collapses Gmail aliases and is
  not suitable for auth identity canonicalization.
- The token table stores phone values in its `email` column for SMS channels.
- `apps/web/server/routers/users.ts` has an admin email update path that writes
  raw input directly.
- Drizzle migrations are SQL files under `apps/web/drizzle`; scripts use
  `pnpm db:migrate`.

## Runtime evidence reused

- Production had one mixed-case primary email row and no duplicate lowercase
  email groups at investigation time.
- A recent reset wrote `passwordChangedAt` successfully before a login failed
  at the user lookup branch, proving the observed case was not password-write
  propagation delay.
- Current runtime already contains the prior invalid-login `TRPCError` change,
  but that change is uncommitted and must be preserved rather than recreated or
  reverted.

## Risk notes

- A functional unique index must be preceded by a duplicate preflight.
- Lookup compatibility should use `lower(btrim(users.email))` until the
  migration has canonicalized existing rows.
- Expected invalid reset-code failures must use a 400-class tRPC error and the
  verification endpoint needs its own rate-limit bucket.
