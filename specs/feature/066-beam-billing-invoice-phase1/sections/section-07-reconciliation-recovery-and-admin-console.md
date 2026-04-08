# Section 07 — Reconciliation, Recovery, and Admin Console

## Overview

This section covers the operational core of the feature: reconciliation jobs, overdue downgrade safety, downgrade reversal, and operator recovery tooling.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/jobs/billing/*.ts` | Renewal, reconciliation, downgrade, and recovery jobs |
| `apps/web/server/services/billing/reconciliationService.ts` | Recheck/fix provider-vs-internal state |
| `apps/web/server/routers/adminBilling.ts` | Recovery-console actions |
| `apps/web/client/src/pages/admin/...` | Recovery console UI |
| `apps/web/server/_core/index.ts` | Initialize billing jobs |

## Implementation details

- Add jobs for renewal issuance, final-reconciliation-before-downgrade, expired attempt cleanup, paid-but-unapplied recovery, downgrade reversal, and document recovery.
- Build a recovery console that shows invoice/payment/webhook/reconciliation timelines.
- Require reasons and elevated authorization for manual recovery actions.
- Surface amount-match state and provider verification state before allowing high-impact recovery actions.
- Enforce that `reopen_invoice` is unavailable for settled or replaced invoices.
- Enforce that replacement invalidates active attempts on superseded invoices before the corrective invoice becomes active.

## Tests to write first

- Renewal job rerun safety.
- Overdue downgrade idempotency and final reconciliation checks.
- Paid-but-unapplied recovery exactly-once behavior.
- Recovery action authorization and audit-log tests.
- Reopen rejection tests for settled/replaced invoices.
- Replacement invalidation tests for active attempts.
