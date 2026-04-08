# 068 - Billing Phase 2: Saved Cards, Auto-Renew, and Dunning

Version: 1.0
Date: 2026-04-01
Status: Proposed
Depends-on: 066 (Beam Billing & Invoice Phase 1)

---

## 1. Executive summary

Feature 068 extends the Phase 1 billing foundation with card-on-file payment methods, automatic monthly renewal charging, retry and dunning policy, and customer/admin tooling for payment-method management.

Phase 2 keeps the Phase 1 invoice, tax, numbering, reconciliation, and audit model intact. The new layer adds a secure payment-method domain and a more automated subscription-renewal experience.

## 2. Goals

### 2.1 Saved payment methods

- support Beam-backed card tokenization or vault references
- allow users to add, list, set default, and remove saved cards
- preserve explicit customer consent and audit history for auto-renew enrollment
- avoid storing raw PAN, CVV, or card secrets in SmartSpecPro

### 2.2 Automatic renewal

- support subscription renewals that automatically attempt card payment at the start of a billing cycle
- keep invoice issuance as the business-document source of truth
- allow fallbacks from auto-charge to manual invoice payment flows when needed

### 2.3 Retry and dunning

- define retry policy for soft-decline and transient payment failures
- send customer-facing reminders and card-update prompts
- downgrade only after retry policy and grace rules are exhausted

### 2.4 Customer continuity

- allow users to update cards before downgrade
- allow support/admin to pause dunning, retry a failed charge, or switch the invoice back to manual collection
- preserve exactly-once business effects and strong auditability

## 3. Non-goals

- multi-provider checkout UI
- direct raw card collection by SmartSpecPro servers
- marketplace-style split payments
- multi-country tax-engine redesign
- installment plans or BNPL
- full accounting export suite beyond what Phase 1 already provides

## 4. Core design principles

### 4.1 Phase 1 remains authoritative

Invoices, payments, subscriptions, documents, tax policy, numbering, and reconciliation remain application-owned and continue to live in the Phase 1 billing domain.

Saved cards and auto-renew are an extension layer, not a replacement for invoice-first billing.

### 4.2 No sensitive card data at rest in app tables

SmartSpecPro may store only provider-issued references and masked presentation data such as:

- brand
- last4
- exp month/year
- cardholder name if provider allows
- provider token or payment-method reference

The app must never persist:

- full card number
- CVV/CVC
- raw magnetic-track or equivalent secrets

### 4.3 Consent and reversibility

Auto-renew must be opt-in, explain its behavior clearly, and remain reversible by the customer or authorized admin.

Required controls:

- explicit enrollment event
- default payment method selection
- clear UI for disabling auto-renew
- audit trail for enable/disable/change-default actions

Consent evidence must also snapshot:

- consent text or consent template version
- locale shown to the user
- enrollment source (`billing_center`, `admin_assisted`, `migration_prompt`, etc.)
- actor user id
- timestamp
- request metadata such as IP/user-agent when available under platform policy
- withdrawal timestamp and effective future-cycle behavior when consent is revoked

### 4.4 Provider-agnostic future path

Even though Beam is still the only provider in Phase 2, payment methods and renewal attempts must be represented in provider-agnostic tables and services so future providers can be added without changing subscription business logic.

### 4.5 Provider capability fallback

Phase 2 must not assume every Beam account/environment already supports the exact card setup or off-session flow required for general rollout.

The implementation must define a capability matrix for:

- setup/tokenization support
- customer vault/payment-method reference support
- off-session charge support
- decline-code taxonomy available for retry classification

Required fallback policy:

- if Beam card setup capability is unavailable, Phase 2 customer card setup must remain feature-flagged off
- if setup exists but off-session charging is unavailable, saved cards may exist while subscriptions remain on `manual_invoice`
- if decline-code taxonomy is incomplete, unknown failures must default to `manual_review_required` rather than optimistic retry
- rollout cohorts must only include tenants/accounts whose provider capability level is explicitly confirmed

## 5. Business rules

### 5.1 Renewal modes

Subscriptions must support at least two renewal modes:

- `manual_invoice`
- `auto_charge`

Rules:

- existing Phase 1 subscriptions may remain on `manual_invoice`
- new or migrated subscriptions may opt in to `auto_charge`
- renewal mode is snapshotted onto each billing cycle attempt
- switching renewal mode affects future cycles only unless explicitly recovered by admin

### 5.2 Auto-renew cycle

For an `auto_charge` subscription:

1. scheduler opens the next billing cycle
2. system issues invoice from the same Phase 1 invoice domain
3. system creates an automatic payment attempt using the default saved payment method
4. if payment succeeds, invoice becomes `paid` and business effects apply
5. if payment fails, invoice remains open and enters dunning/retry handling
6. if retries are exhausted, invoice may fall back to manual collection or overdue downgrade flow according to policy

### 5.3 Retry and dunning policy

Phase 2 must support retry-policy configuration with at least:

- retry count
- retry spacing
- soft-decline vs hard-decline classification
- reminder schedule
- grace period before downgrade

Minimum default policy:

- attempt 1 at cycle start
- retry 2 after 24 hours for retryable failures
- retry 3 after 72 hours for retryable failures
- switch to manual invoice collection or downgrade decision after final failure according to subscription policy

### 5.3A Renewal and dunning state model

At minimum, the internal state model must distinguish:

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

Rules:

- hard decline or revoked/expired card may move directly to `requires_new_card` or `manual_fallback_active`
- retryable soft declines may move to `retry_scheduled`
- unknown provider outcomes may move to `manual_review_required`
- entering `manual_fallback_active` must suppress further automatic off-session retries unless explicitly resumed
- `settled` and `terminal_failure` are terminal states for a renewal-attempt path

### 5.4 Card lifecycle

Each saved payment method must support statuses such as:

- `active`
- `requires_verification`
- `expired`
- `revoked`
- `provider_unavailable`

Rules:

- only one default payment method per customer/tenant billing scope
- revoked or expired cards must not be used for new auto-charge attempts
- deleting a card that is still default on an auto-renew subscription must require reassignment or auto-renew disablement

### 5.5 Manual fallback safety

When auto-charge fails:

- system must not silently create duplicate attempts
- fallback to manual collection must reference the same invoice unless policy requires corrective replacement
- customer and admin must be able to see whether an invoice is on `auto_charge_failed_manual_fallback`

### 5.6 Card payment amount integrity

Phase 1 amount/currency integrity rules still apply.

Additional rules for card renewals:

- provider authorization amount must match invoice payable amount
- off-session charge success must still map to the exact active attempt
- stale success events from superseded retry attempts must not apply a second time

## 6. Data model additions

### 6.1 New / expanded tables

#### `billing_payment_methods`

- id
- user_id
- tenant_id
- provider
- provider_customer_id
- provider_payment_method_id
- method_type (`card`)
- brand
- last4
- exp_month
- exp_year
- cardholder_name
- is_default
- status
- auto_renew_eligible
- consent_version
- consented_at
- revoked_at
- metadata_json
- consent_snapshot_json
- created_at
- updated_at

#### `subscription_payment_settings`

- id
- subscription_id
- renewal_mode (`manual_invoice`, `auto_charge`)
- default_payment_method_id
- retry_policy_json
- dunning_policy_json
- auto_renew_enabled
- consent_withdrawn_at
- rollout_cohort
- updated_by
- updated_at

#### `payment_method_audit_logs`

- id
- payment_method_id
- action
- actor_type
- actor_id
- reason
- before_json
- after_json
- created_at

#### `renewal_attempts`

- id
- subscription_id
- invoice_id
- cycle_key
- renewal_mode_snapshot
- payment_method_id
- attempt_no
- status
- retry_classification
- scheduled_at
- executed_at
- failure_code
- failure_message
- next_retry_at
- final_outcome
- metadata_json
- superseded_by_attempt_id
- created_at
- updated_at

### 6.2 Existing table expansions

`payments`

- add `paymentMethodId`
- add `offSession`
- add `declineCode`
- add `declineCategory`

`billing_subscriptions`

- add `renewalMode`
- add `defaultPaymentMethodId`
- add `autoRenewEnabled`
- add `nextRetryAt`
- add `graceEndsAt`

### 6.3 Required uniqueness and guardrails

At minimum, the schema should enforce or strongly recommend:

- only one default active payment method per user/tenant/provider scope
- unique live `provider_payment_method_id` per provider/customer scope
- one active `subscription_payment_settings` row per subscription
- one primary renewal attempt path per `subscription_id + cycle_key`
- one active retryable renewal attempt at a time for a given invoice
- one active off-session provider payment attempt per invoice

## 7. APIs and services

### 7.1 Customer-facing APIs

- `GET /api/billing/payment-methods`
- `POST /api/billing/payment-methods/setup-intent`
- `POST /api/billing/payment-methods/confirm`
- `POST /api/billing/payment-methods/:id/default`
- `DELETE /api/billing/payment-methods/:id`
- `POST /api/subscription/auto-renew/enable`
- `POST /api/subscription/auto-renew/disable`

### 7.2 Admin APIs

- `POST /api/admin/billing/subscriptions/:id/force-renewal-attempt`
- `POST /api/admin/billing/subscriptions/:id/pause-dunning`
- `POST /api/admin/billing/subscriptions/:id/resume-dunning`
- `POST /api/admin/billing/invoices/:id/fallback-to-manual`
- `POST /api/admin/billing/payment-methods/:id/revoke`

### 7.3 Core services

- `createPaymentMethodSetupIntent(userId)`
- `confirmPaymentMethodSetup(setupResult)`
- `setDefaultPaymentMethod(userId, paymentMethodId)`
- `createAutoRenewalAttempt(subscriptionId, cycleKey)`
- `classifyRenewalFailure(providerResult)`
- `scheduleNextRetry(renewalAttemptId)`
- `fallbackInvoiceToManualCollection(invoiceId)`
- `disableAutoRenewForSubscription(subscriptionId, reason)`

### 7.4 Authorization model

Phase 2 should map actions at least as follows:

- `support_admin`
  - view masked renewal/payment-method status
  - open support recovery case
- `billing_admin`
  - change renewal mode
  - pause/resume dunning
  - fallback invoice to manual collection
- `finance_admin`
  - force retry
  - revoke payment method
  - view masked decline metadata and provider references
- `super_admin`
  - all Phase 2 actions including rollout overrides

## 8. UI requirements

### 8.1 User UI

Add to Billing Center:

- saved cards list
- add-card flow
- set default card
- remove card
- enable/disable auto-renew
- retry status banner when renewal is failing
- grace-period / downgrade-risk messaging
- next scheduled auto-charge date
- next retry date if a retry is pending
- card expiry / revoked warning state
- `requires_verification` recovery messaging
- explicit self-service switch back to manual renewal when policy allows

### 8.2 Admin UI

Extend Admin Billing Console with:

- saved payment-method visibility at masked level
- renewal attempt timeline
- dunning status and retry schedule
- force retry
- switch subscription between auto-charge and manual-invoice modes
- revoke payment method
- view renewal/dunning state-machine timeline
- view consent enrollment/withdrawal summary
- view rollout cohort and override status

## 9. Security and compliance

### 9.1 Payment-method security

- use provider-hosted tokenization/setup flows where possible
- do not log raw setup payloads containing sensitive data
- store only masked and provider-reference fields
- audit all payment-method management actions

### 9.2 Off-session charging controls

- off-session charge attempts must require prior customer consent
- consent version and timestamp must be stored
- failed off-session attempts must be surfaced clearly to users and admins

### 9.3 Access control

- users may manage only their own payment methods
- finance/billing admins may view masked payment-method metadata
- only privileged finance roles may revoke or override card-based renewal configuration

### 9.4 Step-up authentication

The implementation should require recent authentication or step-up confirmation for high-risk actions such as:

- user adds a new payment method
- user changes default auto-renew card
- user enables auto-renew for off-session charging
- admin revokes a payment method
- admin forces retry or changes renewal mode

## 10. Acceptance criteria

- a user can add a card without SmartSpecPro storing raw PAN or CVV
- a user can set a default card and enable auto-renew
- the next renewal cycle can attempt automatic charge using the default card
- a successful off-session renewal marks the invoice paid exactly once
- retryable failures produce bounded retries without duplicate active attempts
- exhausted retries move the subscription into visible dunning/manual-fallback state
- admin can force retry, pause dunning, and fallback to manual collection
- all payment-method and auto-renew changes are auditable
- card metadata shown in UI is masked appropriately
- consent evidence is queryable for enrollment and withdrawal events
- rollout cohorts can be enabled or rolled back without changing unaffected subscriptions

## 11. Feature flags

- `BILLING_PHASE2_SAVED_CARDS_ENABLED=true`
- `BILLING_PHASE2_AUTO_RENEW_ENABLED=true`
- `BILLING_PHASE2_DUNNING_ENABLED=true`
- `BILLING_PHASE2_CARD_SETUP_ENABLED=true`
- `BILLING_PHASE2_FORCE_MANUAL_FALLBACK_ENABLED=true`

## 12. Milestones

### Milestone A

- payment method schema
- provider tokenization abstraction
- add/list/remove/default card UI

### Milestone B

- subscription payment settings
- auto-renew enable/disable
- renewal attempt orchestration

### Milestone C

- retry engine
- dunning notifications
- admin retry/fallback controls

### Milestone D

- rollout hardening
- compliance review
- migration of selected manual subscriptions to auto-renew

## 13. Migration and rollback rules

During rollout, the source of truth is:

- `billing_subscriptions` for subscription commercial state
- `subscription_payment_settings` for renewal mode and retry/dunning policy
- feature flags and rollout cohort assignment for whether Phase 2 automation is active

Required migration behavior:

- migrating a subscription to `auto_charge` must not affect already-issued invoices
- rollback from `auto_charge` to `manual_invoice` must affect future cycles only unless an admin explicitly falls the current invoice back to manual collection
- pilot cohorts must be reversible without deleting saved payment methods
- rollback must suppress future automatic retries once a subscription leaves the cohort
