# Section 02 — Goal/Plan Persistence

## Source coverage

Feature 196 sections 9–15, 26, 46–51, 57–61, 112–116, 217, 223, 230, 235, 239–241 and 276.

## Deliverable

Add only missing tenant-scoped Goal/Plan/Offer/Approval/Decision persistence and indexes, with immutable revisions, idempotency and retention. Verify existing schema before migration.

## Files

- Modify: `apps/web/drizzle/schema.ts` only for confirmed gaps
- Create/modify: additive migration and orchestration repositories
- Test: schema/repository/revision tests

## TDD steps

Test migration safety, tenant isolation, revision collision, stale approval, deletion and replay first; implement; rerun focused tests.

## Completion gate

Feature 196 never becomes a second Job ledger or mutates an approved Plan in place.

