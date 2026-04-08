# Feature 066: Beam Billing & Invoice Phase 1

## Objective

Add a Beam-first billing foundation for SmartSpecPro that supports QR-first payments, monthly subscription renewal, real invoice documents, tax/numbering controls, duplicate-prevention guardrails, and operational recovery paths.

## Current-codebase fit

The current codebase has credit and package primitives but does not yet expose a complete billing transaction model. This feature should therefore be treated as a new billing slice in the web app, while reusing existing concepts where possible:

- reuse credit-grant services and user credit balance semantics
- evolve existing invoice-header admin ideas into a broader billing settings model
- add new billing routes, scheduler jobs, and persistence tables rather than overloading the current lightweight credit-only flows

## In-scope outcomes

1. Beam provider abstraction and Beam adapter for charge creation, cancellation, webhook verification, and payment-status reconciliation.
2. Invoice, payment, payment-attempt, billing-profile, seller-profile, document, tax-policy, numbering, audit-log, reconciliation-run, and support-recovery data models.
3. Monthly subscription renewal flow based on manual invoice issuance and PromptPay QR payment.
4. One-time top-up flow that grants credits only after confirmed successful payment.
5. Snapshot-based invoice issuance with sync-header, replace/reissue, and document-version history.
6. Domestic and international invoice streams with separate numbering and tax policy resolution.
7. Multi-language PDF renditions under one invoice transaction.
8. Duplicate protection for invoices, charges, business effects, and notifications.
9. Recovery console and scheduled reconciliation before overdue downgrade is finalized.

## Out of scope

- Saved card and auto-card-renew flows
- multi-provider end-user UI
- full accounting export and credit-note workflows
- complete cross-border tax engine

## Implementation approach

### 1. Billing domain model and persistence

Add billing-oriented tables and fields centered on:

- `billing_profiles`
- `seller_profiles`
- `invoices`
- `invoice_documents`
- `invoice_line_items`
- `tax_policies`
- `document_number_sequences`
- `payments`
- `payment_attempts`
- `webhook_events`
- `invoice_audit_logs`
- `notification_dispatches`
- `reconciliation_runs`
- `support_recovery_cases`

Also extend subscriptions with downgrade and recovery fields.

### 2. Billing services

Create services for:

- invoice stream classification
- tax policy resolution by stream and effective date
- base-price tax calculation
- invoice numbering reservation and preview
- recurring-cycle uniqueness and invoice creation
- payment-attempt create-or-reuse semantics
- PDF rendering by language and version
- notification dedupe
- business-effect idempotency for credits, renewal, downgrade, and downgrade reversal

### 3. Beam integration

Implement a provider-agnostic contract with a Beam adapter for:

- charge creation for top-up and renewal invoices
- webhook verification and normalization
- payment status lookup
- cancellation or internal invalidation of stale payment attempts

### 4. User and admin surfaces

Add or expand web routes and pages for:

- `Settings > Billing Profile`
- `Admin > Billing Settings > Tax & Numbering`
- `Admin > Billing Settings > Document Header`
- invoice detail and PDF download surfaces
- recovery-console actions for reconciliation and manual support cases

### 5. Automation

Add scheduled jobs for:

- subscription renewal creation
- overdue downgrade with final reconciliation
- expired payment cleanup
- payment reconciliation
- paid-but-unapplied recovery
- downgrade reversal recovery
- document recovery / PDF backfill

## Risks and mitigations

- Duplicate invoice issuance:
  - enforce billing-cycle uniqueness and idempotent scheduler design
- Duplicate charging:
  - enforce one active attempt per invoice and reconciliation-before-retry policy
- Silent legal-document mutation:
  - snapshot headers and keep versioned document renditions
- Late or missing webhook events:
  - scheduled reconciliation and admin manual recovery tools
- Wrongful downgrade:
  - final reconciliation before downgrade and explicit reversal flow
- Notification spam:
  - persist notification dispatches with dedupe keys and cooldowns

## Acceptance criteria

The feature is complete when:

- Beam is the active Phase 1 provider behind a provider abstraction.
- One-time top-up and monthly renewal both issue invoices and QR-backed payment attempts.
- Credits and subscription renewal effects apply exactly once after paid state.
- Domestic and international invoice streams are classified and numbered independently.
- Web prices are treated as pre-VAT base prices and invoice tax snapshots are immutable after issuance.
- One invoice transaction can have multiple PDF language variants without new invoice issuance.
- Header sync, replace/reissue, and audit history work according to invoice status rules.
- Scheduler reruns, duplicate webhooks, and recovery retries do not duplicate invoices, charges, credits, renewal, downgrade, or notifications.
- Admin recovery flows can resolve paid-but-unapplied and wrong-downgrade cases without direct database edits.
