# Admin Billing Phase 2 Runbook

## Scope

This runbook covers saved cards, auto-renew, retry scheduling, dunning pause/resume, manual fallback, and payment-method revocation.

## Quick checks

- confirm the subscription renewal mode and rollout cohort
- confirm the default payment method is active and auto-renew eligible
- review the latest renewal attempt state and next retry date
- inspect invoice payment timeline, webhook events, and reconciliation history

## Common actions

- pause dunning when a provider outcome is ambiguous
- force retry only after reviewing the latest payment and decline metadata
- fallback to manual collection when off-session attempts should stop for the current cycle
- force disable auto-renew when the customer withdraws consent or support wants future cycles back on manual invoicing
- revoke a payment method only when a replacement exists or auto-renew is disabled

## Rollout rollback

- remove the subscription cohort from the Phase 2 allowed cohort list
- force disable auto-renew for the affected subscriptions if future automatic retries must stop immediately
- do not mutate already paid invoices or delete saved payment methods during rollback

## Warning states

- `requires_new_card`: customer must update the card before the next renewal attempt
- `manual_fallback_active`: invoice remains open but off-session retries are suppressed
- `manual_review_required`: investigate provider/reconciliation data before retrying
