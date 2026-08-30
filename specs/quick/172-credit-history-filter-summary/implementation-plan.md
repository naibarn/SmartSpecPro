# Implementation Plan

## Objective

ส่ง date/source filters ให้ transaction history และเพิ่ม server-side filtered credit summary ที่แสดงเครดิตเข้า เครดิตออก และยอดสุทธิครบทุก transaction ที่ตรง filter

## Files

- `apps/web/server/services/creditService.ts`: เพิ่ม shared filter predicate/helper และ aggregate summary service; ใช้ exclusive end boundary
- `apps/web/server/routers/credits.ts`: เพิ่ม protected `historySummary` query ด้วย input contract เดียวกับ history
- `apps/web/client/src/pages/Credits.tsx`: state/default range, shared query inputs, summary query, controls, summary cards, invalid-range handling
- `apps/web/client/src/locales/th/billing.json`: Thai labels/copy
- `apps/web/client/src/locales/en/billing.json`: English labels/copy
- focused tests under `apps/web/server/services/__tests__` or existing credit service test location and `apps/web/client/src/pages/__tests__` as repository patterns allow

## Implementation approach

1. Add a service-level `getTransactionHistorySummary` accepting `TransactionHistoryParams` and building the same user/tenant/type/source/date predicates as history. Select `SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END)`, `SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END)`, signed net sum, and count; normalize nullable DB aggregates to numbers.
2. Change history's end-date comparison to exclusive `lt` and document the contract. Existing callers without endDate are unchanged.
3. Add `credits.historySummary` protected query and pass authenticated user/current tenant plus input filters.
4. In Credits, derive date-only defaults and query dates. Send `startDate` and `endDate` to both queries; disable both for invalid range. Reset page on any source/date change. Keep source enum typing.
5. Render a compact three-card summary in the transaction card. Use signed net color convention but show labels and zero values during no-match state.
6. Add localization and tests for query inputs, aggregation, date inclusivity, invalid range, and UI summary/filter behavior.

## Risks and mitigations

- Predicate drift between history and summary: centralize helper and test both calls.
- End-date off-by-one: use explicit exclusive next-day Date and `lt`; test timestamp at end-day and next midnight.
- Tenant leakage: summary must take tenant from ctx only; test tenant predicate shape/service params.
- Existing baseline failures: run focused tests and report workspace-wide check separately.

## Acceptance checks

- default date range is calendar-month-minus-one through today
- source/date filters reach both queries
- summary is all-pages and signed correctly
- empty/invalid/loading states are safe
- Dashboard history contract unchanged
- focused tests, targeted typecheck if feasible, and diff check pass
