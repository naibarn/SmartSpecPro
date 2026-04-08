# Implementation Plan — Feature 068: Billing Phase 2

## 1. Scope

Build the post-Phase-1 billing layer for:

- saved cards
- auto-renew subscriptions
- retry and dunning automation
- customer and admin payment-method tooling

Phase 2 must reuse the Phase 1 invoice, payment, reconciliation, document, and notification foundation instead of duplicating it.

## 2. Architecture

Implement Phase 2 as five coordinated slices:

1. payment-method domain and provider tokenization
2. subscription payment settings and consent
3. automatic renewal attempt orchestration
4. dunning, retry, and manual fallback
5. user/admin UI and rollout hardening

## 3. Key decisions

- invoices remain the business-document source of truth even for off-session card renewals
- each automatic renewal attempt maps to one invoice and one active payment attempt at a time
- setup/tokenization must use provider-hosted or provider-tokenized flows only
- retry policy must be explicit and bounded
- manual fallback reuses the same invoice whenever legally and operationally safe

## 4. Section breakdown

### Section 01 — Payment Methods and Consent

- add `billing_payment_methods`, `subscription_payment_settings`, `payment_method_audit_logs`, `renewal_attempts`
- add masked payment-method CRUD services
- add consent capture and audit events

### Section 02 — Provider Setup and Vault References

- add provider setup-intent abstraction
- confirm/save provider payment methods
- normalize masked card metadata
- add tests for no-raw-card persistence

### Section 03 — Auto-Renew Orchestration

- create renewal attempt state machine
- issue invoice from Phase 1 domain
- create off-session payment attempt against default payment method
- wire exact-once business effects through existing payment processing

### Section 04 — Retry, Dunning, and Manual Fallback

- classify retryable vs terminal failures
- schedule bounded retries
- send dunning reminders and card-update prompts
- allow fallback to manual invoice collection
- pause/resume dunning and force retry in admin

### Section 05 — UI, Security, and Rollout

- customer billing-center payment-method UI
- admin renewal/dunning controls
- masked data rules
- migration/cutover plan from manual to auto-renew cohorts

## 5. Rollout

- start with internal/staff-only enablement
- migrate a small cohort from `manual_invoice` to `auto_charge`
- monitor failed-renewal rate, recovery time, duplicate-attempt rate, and support-case volume
- only then enable customer-facing self-service broadly
