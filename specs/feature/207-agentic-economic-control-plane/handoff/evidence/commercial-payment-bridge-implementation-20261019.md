# SPEC-207/280 Commercial Payment Bridge Implementation Checkpoint

**Source base:** `3c44e4353f241d46c1a0a87bf76e2fac54a744a4` (`origin/main`, fetched 2026-10-19)
**Implementation commit:** `8062840ce402a74e2015e0651c10d2d4980ba21e` (PR #1156)
**Integrated main:** `fd69f5799139aba3e05a0f5053251e17eae78a68`
**WorkUnit:** `SPEC-207-WU-PAYMENT-INTEROP-CONTRACT` / `SPEC-280-WU-USAGE-TO-PAYMENT-MAPPING`
**Worktree:** registered task worktree `workspace:2494bc6d-78fc-4abf-a9a5-0174a5af9653`
**Runtime:** non-production only; no payment credentials, live adapters, charges, database migration execution, or production flow wiring.

## Ownership and implemented delta

- SPEC-280 supplies the immutable versioned CommercialSnapshot and beneficiary allocation snapshot; the shared typed contract carries it into SPEC-207 PaymentRequest.
- SPEC-207 coordinator owns bounded task reservations, payer/tenant global cap checks, overdraft denial by default, idempotency hash checks, task fencing, authorization outcomes, receipt deduplication, settlement/refund and balanced ledger postings.
- Provider adapters normalize Credits, fiat PAYG, x402 and MPP. A server-selected ordered route may advance only after an explicit decline; an unknown authorization/capture/release/refund is held for original-provider reconciliation.
- A deterministic network-free mock exercises task start through settlement and partial refund. Crash/restart coverage serializes and restores the deterministic test store; it does not prove PostgreSQL restart durability.
- Migration `0408_spec207_280_commercial_payment_bridge.sql` adds separate spending-limit, request, provider-attempt, usage-receipt, settlement, posting and refund tables. It does not rewrite or backfill existing Credits, payment attempts, invoices, or skill settlements. Rollback is disable-and-retain; the migration has not been applied to any database.
- No SPEC-224 or SPEC-014 files changed. SPEC-224 remains a future optional typed-interface consumer only; no runner, acceptance, or scheduling dependency was added.

## Verification evidence

Passing focused command from `apps/web`:

```text
pnpm exec vitest run server/services/__tests__/commercialPayments.test.ts server/__tests__/commercialPaymentBridgeMigration.test.ts server/services/__tests__/skillRevenueBilling.test.ts server/services/billing/paymentProcessing.test.ts server/services/billing/recovery.test.ts
5 test files passed, 29 tests passed
git diff --check passed
Drizzle journal JSON parse passed
```

Scenarios include parallel cap exhaustion, idempotent request retry and conflict, duplicate usage callback, unknown authorization/capture/refund reconciliation without provider failover, explicit-decline provider failover, default-denied and bounded overdraft, usage cap enforcement, checkpoint/resume fencing after test-store crash restore, deterministic settlement/release/partial refund, and debit/credit ledger balance.

Environment limitations: Drizzle schema/journal check passed with `DATABASE_URL=postgresql://localhost:5432/smartspec_test` (the check did not connect to a database); the migration was not applied to the database's public schema and no PostgreSQL-backed restart test ran. The isolated legacy `creditService.test.ts` run has 3 failing reservation tests (23 passed) because the suite expects the obsolete Redis/mock `get` path while current source uses `getDb()` PostgreSQL storage; no credit source files were changed in this work. Preserve this as a pre-existing compatibility-test discrepancy and reconcile before claiming legacy-credit acceptance.

The migration DDL was additionally executed in a transaction with `search_path` set to a unique temporary schema inside the repository's disposable `smartspec_test` database; PostgreSQL created all 7 new tables/index sets, and `ROLLBACK` removed the probe schema. This proves the DDL parses and applies without changing the database's public schema or data. It does not prove application persistence or a process-restart flow.

## Remaining work / HandOff

1. Implement the durable PostgreSQL repository that executes reservations under payer/tenant row locks or serializable transactions and writes attempt/usage/settlement/refund/posting state atomically. Current coordinator is exercised with its deterministic store; it is not wired into live task execution.
2. Run migration 0408 only on an authorized disposable sandbox database, verify additive DDL and rollback-by-disable, and exercise process restart against PostgreSQL.
3. Bind the optional SPEC-224 economic hook only after its existing interface owner schedules it; do not change SPEC-224 acceptance or Live Acceptance.
4. Complete provider security/compliance onboarding and sandbox acceptance before any provider activation. No live payment is enabled by this checkpoint.

This checkpoint does not mark either SPEC accepted or complete. Registry authority and disposition remain `UNRESOLVED` / `DORMANT_UNRESOLVED` pending the existing reconciliation process.
