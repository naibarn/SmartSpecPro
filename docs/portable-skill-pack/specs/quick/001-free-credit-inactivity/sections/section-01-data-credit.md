# Section 01 — data and credit boundary

## Ownership

Own schema/migration, the free-credit lifecycle service, `addCredits`,
`deductCredits`, signup grant normalization, and invite grant metadata.

## Target files

- `apps/web/drizzle/schema.ts`
- `apps/web/drizzle/<new migration>.sql`
- `apps/web/server/services/freeCreditInactivityService.ts`
- `apps/web/server/services/creditService.ts`
- `apps/web/server/services/inviteCodeService.ts`
- `apps/web/server/routers.ts` email registration branch

## TDD expectations

Write failing tests for status calculation, daily claim, expiry reset, grant
tracking, purchase cancellation, and disabled deduction before implementation.

## Acceptance

All free grants are ledger-backed and tracked once. Purchase cancellation and
expiry reset are transaction-safe and auditable.

## Risks

Do not overwrite existing dirty schema changes. Preserve credit idempotency and
the current `lastCreditUsedAt` semantics.
