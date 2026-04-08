# Research Notes — Feature 068

## Relationship to Feature 066

Feature 066 already delivered the difficult foundation:

- payment attempts
- invoice lifecycle
- reconciliation
- recovery console
- notification history
- document access and audit

Phase 068 should be intentionally thinner than 066 because it can stand on that existing base.

## Expected codebase touch points

- `apps/web/drizzle/schema.ts`
- `apps/web/server/services/billing/*`
- `apps/web/server/routers/billing.ts`
- `apps/web/server/routers/adminBilling.ts`
- `apps/web/server/jobs/billingJobs.ts`
- `apps/web/client/src/pages/BillingCenter.tsx`
- `apps/web/client/src/pages/AdminBillingCenter.tsx`

## Biggest unknowns for implementation

- exact Beam support for card setup/tokenization in current account/config
- decline-code taxonomy available from Beam for retry classification
- whether stored payment-method support requires additional backend callbacks/webhooks
