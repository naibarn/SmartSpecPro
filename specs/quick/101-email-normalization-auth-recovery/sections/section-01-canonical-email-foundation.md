# Section 01: Canonical Email Foundation

## Ownership

Own the auth normalization helper, shared DB lookup/upsert behavior, and the
dedicated reset-code rate-limit export.

## Files

- `apps/web/server/services/emailNormalization.ts`
- `apps/web/server/db.ts`
- `apps/web/server/_core/trpc.ts`
- focused helper/DB contract tests

## TDD

- Test trim/lowercase behavior first.
- Test lookup SQL/contract against mixed-case and whitespace legacy values.
- Test the verify-reset rate-limit export and namespace.

## Acceptance

- No Gmail alias collapsing.
- `getUserByEmail` uses canonical input and `lower(btrim(...))` compatibility.
- `upsertUser` writes canonical primary email.
- SMS values are not passed through this helper.
