# Section 04 — Beam Adapter, Webhook, and Payment Attempts

## Overview

This section implements the provider boundary: charge creation, payment-attempt tracking, webhook verification, replay defense, and provider-state normalization.

## Files to create or modify

| File | Action |
|---|---|
| `apps/web/server/services/billing/providers/beamProvider.ts` | Beam adapter |
| `apps/web/server/routes/beamWebhook.ts` | Raw-body webhook route |
| `apps/web/server/services/billing/paymentAttemptService.ts` | Attempt create/reuse/invalidate logic |
| `apps/web/server/_core/index.ts` | Register webhook route |

## Implementation details

- Implement provider abstraction with Beam as the only adapter.
- Snapshot expected amount/currency onto the payment attempt when creating the provider object.
- Reuse existing active attempt when possible; never create duplicate active attempts for the same invoice.
- Verify webhooks from raw body with signature + timestamp checks.
- Persist webhook events before applying business logic.
- Normalize provider outcomes and route ambiguous cases into reconciliation.
- Support webhook secret rotation with bounded dual-secret verification.
- Persist unique provider event identifiers and handle schema-invalid or out-of-order events in an audited reconciliation-safe path.

## Tests to write first

- Active attempt reuse tests.
- Invalid signature and stale timestamp tests.
- Replay-dedupe tests.
- Amount/currency mismatch tests that block `paid`.
- Secret rotation verification tests.
- Partial/over/under-payment negative tests.
