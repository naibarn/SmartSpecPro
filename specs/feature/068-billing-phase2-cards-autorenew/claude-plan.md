# Implementation Plan — Feature 068: Billing Phase 2

## 1. What We Are Building

Feature 068 adds saved cards, auto-renew subscription charging, retry and dunning policy, and payment-method management on top of the Feature 066 billing platform.

This is a continuation phase, not a restart. The implementation must plug into the existing invoice/payment/business-effect flow.

## 2. Architecture Overview

The work should be split into five coordinated layers:

1. payment-method persistence and consent
2. provider setup/tokenization integration
3. auto-renew orchestration
4. retry, dunning, and manual fallback
5. user/admin UI, security, and rollout

## 3. Payment-Method Domain

Add dedicated entities for:

- saved payment methods
- subscription payment settings
- payment-method audit logs
- renewal attempts

Rules:

- only masked metadata and provider references are stored
- exactly one default method per scope
- deleting/revoking an in-use method must enforce reassignment or auto-renew disablement
- consent must be versioned and auditable

## 4. Provider Setup and Compliance Boundary

The application must never collect or persist raw card data directly.

Implementation rules:

- use provider-hosted setup or tokenization
- normalize setup confirmation into masked metadata only
- redact raw provider setup payloads from logs and generic admin tables
- store consent version, consented_at, and actor trail

### 4.1 Provider capability matrix and fallback

Before implementation begins, the adapter layer must define a capability matrix for the current Beam integration:

- setup/tokenization available or not
- reusable provider payment-method references available or not
- off-session charge support available or not
- reliable decline classification fields available or not

Implementation must branch cleanly:

- full capability: enable saved cards + auto-renew
- setup only: enable saved cards but keep renewal mode manual
- incomplete decline taxonomy: route uncertain failures to manual review, not automatic retry
- no card capability: Phase 2 surfaces stay disabled behind flags

This prevents the app from shipping UI and state-model assumptions that the configured provider account cannot actually satisfy.

### 4.2 Consent snapshot model

Consent must not be represented only by booleans and timestamps. The model should capture:

- consent text/version shown
- locale
- enrollment source
- actor
- timestamp
- optional request metadata under policy
- withdrawal event and effective future-cycle behavior

This should live either in a dedicated consent snapshot JSON or in normalized audit payloads that are guaranteed queryable.

## 5. Auto-Renew Orchestration

Each auto-renew cycle must:

1. determine renewal mode for the subscription
2. issue the invoice through the existing invoice domain
3. create exactly one renewal attempt for the cycle
4. create one active payment attempt against the default payment method
5. route success through existing payment processing and business effects
6. route failures into retry/dunning without duplicating business invoices

### 5.1 Transaction and crash boundaries

The implementation must define explicit boundaries:

1. cycle open / invoice issue
2. renewal-attempt creation
3. off-session provider charge call
4. provider response normalization
5. paid business-effect application

If the process crashes after invoice issue but before provider confirmation, the system must recover through reconciliation instead of creating a second blind attempt.

### 5.2 Renewal-attempt state machine

The implementation should define explicit renewal-attempt states such as:

- `scheduled`
- `charge_in_progress`
- `retry_scheduled`
- `grace_period_active`
- `requires_new_card`
- `manual_fallback_active`
- `paused_dunning`
- `settled`
- `terminal_failure`
- `manual_review_required`

This state machine should be the source of truth for:

- retry scheduling
- customer banners
- admin recovery actions
- downgrade eligibility

Avoid deriving these semantics ad hoc from payment rows alone.

## 6. Retry, Dunning, and Manual Fallback

Introduce a retry engine with:

- retry classification
- bounded retry schedule
- grace-period visibility
- manual fallback to invoice collection

The default implementation should separate:

- retryable soft declines
- non-retryable hard declines
- provider-unknown states requiring reconciliation

### 6.1 Safety rules

- one active renewal attempt path per cycle
- one active provider payment attempt per invoice
- fallback to manual collection must not create duplicate invoices
- admin force retry must require reason capture and authorization

### 6.2 Transition ownership

The plan should assign ownership clearly:

- renewal-attempt state changes happen in a renewal orchestration service
- provider settlement still flows through existing payment-processing services
- retry scheduling happens in jobs based on renewal-attempt state, not by ad hoc router mutation
- fallback-to-manual suppresses future off-session retries for the current cycle unless explicitly resumed

## 7. UI and Access Control

### User UI

Add to Billing Center:

- payment method list
- add card / confirm setup flow
- default card selection
- remove card
- auto-renew enable/disable
- renewal failure banner and card-update prompt

### Admin UI

Extend Admin Billing Console with:

- masked payment-method summary
- renewal attempt timeline
- retry schedule visibility
- pause/resume dunning
- force retry
- fallback to manual
- revoke method

## 8. Migration and Rollout

Auto-renew must not be enabled for all existing subscriptions at once.

Required rollout steps:

- keep Phase 2 behind dedicated feature flags
- migrate internal/staff cohort first
- migrate selected low-risk paid subscriptions after monitoring
- keep a per-subscription switch between `manual_invoice` and `auto_charge`

### 8.1 Source-of-truth transition and rollback

The plan should make rollout rules explicit:

- `billing_subscriptions` remains the commercial subscription source of truth
- `subscription_payment_settings` becomes the source of truth for renewal mode and retry/dunning behavior
- cohort assignment and feature flags decide whether automation is active
- rollback must stop future auto-renew attempts without mutating already-settled invoices or deleting saved payment methods

## 9. Metrics and Operational Readiness

Track at minimum:

- auto-renew attempt success rate
- retry recovery rate
- fallback-to-manual rate
- duplicate-attempt incidents
- support-case volume for failed renewals

## 10. Implementation Order

1. payment-method schema and consent
2. provider setup/tokenization integration
3. auto-renew orchestration
4. retry/dunning/manual fallback
5. UI, rollout flags, and monitoring

## 11. Authorization Detail

Phase 2 should extend the Feature 066 billing authorization service with action-based rules for:

- `manage_payment_method`
- `set_default_payment_method`
- `enable_auto_renew`
- `disable_auto_renew`
- `force_retry_renewal`
- `pause_dunning`
- `resume_dunning`
- `fallback_to_manual_collection`
- `revoke_payment_method`
- `view_decline_metadata`

These actions should map explicitly to `support_admin`, `billing_admin`, `finance_admin`, and `super_admin` before implementation starts.
