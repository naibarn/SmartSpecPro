# Section 03 — Invoice Domain, Tax, and Numbering

## Overview

This section defines how invoices are assembled, classified, numbered, issued, replaced, and queried.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/services/billing/invoiceService.ts` | Invoice assembly and issuance |
| `apps/web/server/services/billing/taxService.ts` | Tax resolution and total computation |
| `apps/web/server/services/billing/numberingService.ts` | Stream-specific numbering |
| `apps/web/server/services/billing/invoiceStateMachine.ts` | Legal transitions and guards |

## Implementation details

- Implement stream classification from billing profile plus optional admin override with audit.
- Compute totals strictly from pre-tax base prices.
- Reserve document numbers atomically per stream.
- Snapshot seller, buyer, line items, tax policy, totals, and stream metadata on issuance.
- Support paid invoice correction through replacement invoice creation with preserved relation to original payment history.
- Define explicit database transaction boundaries for draft creation, invoice issuance, and business-effect application.
- Define crash-recovery states for cases where invoice issuance succeeds but downstream document render or payment-attempt creation does not.

## Tests to write first

- Stream classification tests.
- Effective tax policy selection tests.
- Numbering uniqueness/concurrency tests.
- Replace/reissue relation tests.
- Crash-safety tests around invoice issuance and deferred charge creation.
