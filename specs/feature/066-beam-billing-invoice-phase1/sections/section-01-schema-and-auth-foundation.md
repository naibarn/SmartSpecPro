# Section 01 — Schema and Auth Foundation

## Overview

This section creates the persistence and authorization foundations for Feature 066. All later sections depend on the billing tables, indexes, and billing-action authorization service defined here.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/drizzle/schema.ts` | Add billing domain tables and supporting fields |
| `apps/web/drizzle/*_beam_billing_phase1.sql` | Generated migration SQL |
| `apps/web/server/services/billing/authorization.ts` | Central action-based billing authorization |

## Implementation details

- Add dedicated tables for billing profiles, seller profiles, invoices, invoice line items, invoice documents, tax policies, document number sequences, payments, payment attempts, webhook events, invoice audit logs, notification dispatches, reconciliation runs, and support recovery cases.
- Extend subscription-related state with downgrade and recovery fields.
- Add uniqueness constraints for recurring cycle invoices, active payment attempts, and business-effect keys.
- Implement one billing authorization service for ownership checks, tenant scope, raw payload/evidence access, and privileged recovery actions.
- Define the concrete Phase 1 permission mapping using the current role system so implementers are not blocked by future role expansion.
- Add migration/backfill metadata needed to gate renewal automation until legacy paid users are mapped into the new billing domain.

## Tests to write first

- Schema/migration verification tests.
- Ownership and denied privileged-action tests.
- Uniqueness tests for recurring invoices and active attempts.
- Backfill/cutover gate tests for renewal scheduling.
