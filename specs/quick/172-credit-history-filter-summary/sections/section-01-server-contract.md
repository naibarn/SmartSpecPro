# Section 01 — Server Contract

## Ownership

Own `apps/web/server/services/creditService.ts` and `apps/web/server/routers/credits.ts` plus focused server tests. Do not change schema or existing history response shape.

## Work

- centralize transaction predicates for user, tenant, source, type, startDate and exclusive endDate
- keep history pagination/order unchanged
- add `getTransactionHistorySummary` with numeric `creditIn`, `creditOut`, `net`, `transactionCount`
- expose protected `credits.historySummary` using ctx identity and current tenant

## TDD and acceptance

- mixed signed aggregation, empty aggregation, source/date predicates and tenant scope tested
- end-date row at next-day midnight excluded
- existing history callers continue receiving array

## Security

Never accept userId from summary input. Reuse current tenant resolution and legacy null-tenant behavior exactly as history.
