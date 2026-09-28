# Spec 207 Research

## Scope and evidence boundary

This is an existing SmartSpecPro monorepo. SocratiCode was unavailable, so
research used targeted shell discovery and exact source reads. Spec 207 is a
target architecture: current code has Credits, provider reservations, Job
settlements and skill revenue paths, but not the complete multi-wallet,
double-entry, mandate and financial-calendar system.

## Relevant repository evidence

- Durable execution: `apps/web/server/services/jobControlPlaneTypes.ts`,
  `jobControlPlane.ts`, `jobControlPlaneGateway.ts`, and schema tables
  `workerJobs`, `workerJobAttempts`, `workerJobEvents`, `workerJobDispatches`,
  `workerJobOutbox`, `workerJobSettlements`.
- Existing economic rails: `apps/web/server/services/creditService.ts`,
  billing/payment services, reservation helpers, `skillRevenueBilling.ts`,
  and the `creditTransactions`/settlement schema family.
- Tenant and actor authority must be derived from authenticated server context;
  client wallet/provider/runner fields are request data only.
- Existing tests use Vitest under `apps/web/server/**/__tests__` and focused
  commands through `npm --workspace apps/web test -- <paths>`.
- Repository-wide TypeScript typecheck is prohibited by `AGENTS.md` unless the
  user explicitly requests it; this plan uses focused tests, migration checks,
  Prettier and `git diff --check`.

## Research decisions

- Keep the first implementation modular inside the existing web backend and
  Drizzle schema. Do not add a microservice or a second queue.
- Represent monetary values as integer minor units plus an explicit currency;
  never use floating-point arithmetic for authorization or ledger entries.
- Make reserve/capture/release and settlement idempotent by tenant-scoped
  idempotency keys and canonical Job/attempt correlation.
- Treat production payment-provider certification, reconciliation and rollback
  as release gates rather than claiming them from local tests.

## Testing approach

Vitest is the repository test runner. New pure policy/ledger helpers get unit
tests; router/service boundaries get tenant and idempotency tests; migrations
get schema/SQL assertions; financial scenarios get integration tests when a
database is available.

