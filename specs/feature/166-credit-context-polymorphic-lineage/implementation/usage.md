# Feature 166 Usage Guide

## Runtime flags

`CREDIT_CONTEXT_WRITE_ENABLED=false` and
`CREDIT_CONTEXT_STRICT_REQUIRED=false` are the safe defaults. Enable writes only
after migration verification; enable strict mode only after canary coverage is
acceptable.

## Application APIs

- `credits.usageByContext`: current user's bounded work summary.
- `credits.contextUsageDetail`: authorized detail for a selected work context.
- `credits.exportUsageByContext`: bounded CSV using the same report predicate.
- `credits.adminUsageByContext`, `adminContextUsageDetail`, and
  `adminExportUsageByContext`: explicit tenant-scoped admin reporting with
  audit events.

The API returns human-readable snapshots for normal presentation. Technical
UUID/source references remain internal/audit-only.

## Backfill and audit

```bash
npm --workspace apps/web exec tsx scripts/backfill-credit-context-lineage.ts --dry-run --batch-size 100
npm --workspace apps/web exec tsx scripts/audit-credit-context-lineage.ts
npm --workspace apps/web exec tsx scripts/audit-credit-context-callers.ts --format json --fail-on-unclassified
```

Backfill is dry-run by default, scoped, resumable, lease-protected, and never
changes balances. See `docs/runbooks/credit-context-lineage-rollout.md` before
using `--apply`.

## Verification

```bash
npm --workspace apps/web test -- shared/creditContextContracts.test.ts server/services/__tests__/creditContextFoundation.test.ts server/services/__tests__/creditContextReports.test.ts server/services/verticalDramaLlmBilling.test.ts server/__tests__/creditReservation.test.ts
NODE_OPTIONS=--max-old-space-size=8192 npm --workspace apps/web run typecheck
```

The migration and browser/staging/production checks must be run by the release
operator in their authorized environment and recorded separately.
