# Section 05 — Accounting Reports and tRPC APIs

## Goal

Expose tenant-safe history context, work summary, detail, and export through a
single accounting service so all surfaces have identical totals.

## Dependencies and owned files

Depends on sections 01–04. Own:

- `apps/web/server/services/creditContextReports.ts`
- `apps/web/server/routers/credits.ts`
- report/router focused tests

## Required implementation

Build one report service that normalizes UTC-inclusive start/exclusive end
dates, bounded interactive/export ranges, validates separate context and
persisted transaction source namespaces, captures or reuses
`asOfTransactionId`, and applies tenant/user predicates before labels/joins.

Accounting predicate includes negative `usage`, positive `refund` with one
valid reversal to qualifying work, and explicitly allow-listed linked
`work_adjustment`. Exclude purchases, bonuses, creator/revenue distribution,
admin/system compatibility rows, invalid refunds, and unrepaired integrity
exceptions from named production cost. Group by primary work only; parent/root/
execution/conversation/revenue links are explanatory and do not multiply
transaction IDs.

Summary returns scope, distinct users, named rows, by-work/source/context-source/
Skill/model/stage breakdowns, page metadata, global charged/refund/net/count
totals, separate unattributed/ambiguous totals, and integrity-exception totals.
Order rows deterministically. Detail uses the same service/predicate, stable
transaction order, completeness/data-quality status, and authorized retry/
attempt data. Export uses the same aggregation and safe human labels; require
explicit bounded dates, omit raw IDs by default, and use a bounded async
artifact with query spec+watermark, tenant/user binding, expiry/cleanup, and
download-time permission only when overflow is authorized.

Extend existing history with context presentation (`linked`, `partial`,
`unattributed`, `ambiguous`, safe primary/root/work/stage labels, and technical
reference availability) without breaking existing fields or metadata safety.

Add self protected procedures `usageByContext`, `contextUsageDetail`, and
`exportUsageByContext`. Add explicit admin procedures
`adminUsageByContext`, `adminContextUsageDetail`, and
`adminExportUsageByContext`; require existing tenant-admin authorization,
explicit target tenant, optional target user, pre-join predicates, returned
scope/watermark, and `auditLogger.log` metadata for operator/target/filters/
watermark. Self endpoints cannot accept foreign tenant/user selectors.

Add the self protected `seriesUsageSummary` procedure for the Drama Series
detail page. It accepts only the requested Series ID, verifies the current
tenant and owner, and returns an all-time summary from the same accounting
predicate: charged, refunded, net actual credits, transaction counts,
integrity exceptions, first/last activity, a fresh ledger watermark, and the
product-defined USD estimate (`netActualCredits / 1,000`). For rollout
compatibility, the service may union verified legacy rows whose structured
`seriesId`/`series_id` metadata matches the owned Series; it must label the
result as complete, partial, legacy-unattributed, or no-usage rather than
silently treating missing context links as zero spend.

Return stable typed errors for invalid range, foreign/unauthorized context,
missing tenant, export overflow, and unavailable dependency with no raw IDs,
titles, prompts, or provider details.

## TDD-first tests

Use two tenants/users, Series/Job/Run links, Skill revenue rows, valid/invalid
refunds, admin adjustments, retries, null legacy tenant, ambiguous/unattributed
rows, model/stage metadata, watermark inserts, filters, pagination, self/admin
authorization, audit, detail, CSV equivalence, async expiry, and raw-ID leak
fixtures. Compare exact report totals to direct-ledger calculations.

## Completion evidence

Run focused report/router tests, inspect SQL predicates/query plans where DB is
available, and record report flag/index prerequisites. The service is the sole
source for summary/detail/export totals.

## Implemented locally

Added the single tenant-safe report service, tenant-constrained joins, shared
classification predicate, root/refund grouping, data-quality totals, detail
and CSV export, self/admin tRPC procedures, typed dependency errors, audit
events, and safe history presentation. Refunds without their own context link
inherit the verified original usage context for totals and root detail.
The Drama Series detail summary now reuses this service for all-time credits and
the explicitly labelled 1,000-credits-per-USD internal estimate.
