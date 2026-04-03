# Implementation Plan — Feature 066: Beam Billing & Invoice Phase 1

## 1. What We Are Building

Feature 066 adds a new billing subsystem to the SmartSpecPro web app. It supports Beam-first PromptPay QR payments for one-time credit top-up and monthly subscription renewal, while also introducing invoice documents, tax/numbering policy, exactly-once business effects, reconciliation, and operational recovery.

This feature should be built as an application-owned billing domain, not as a thin payment gateway wrapper.

## 2. Architecture Overview

The implementation should split into five coordinated layers:

1. billing persistence and state machines
2. Beam adapter and webhook ingress
3. document rendering and secure access
4. scheduler and reconciliation workflows
5. user/admin billing surfaces

Authenticated APIs are best implemented in tRPC routers. Beam webhook ingress should be an Express route that verifies signatures from the raw body.

## 3. Schema and Authorization Foundation

Add dedicated billing tables for profiles, invoices, payments, payment attempts, documents, tax policies, numbering sequences, audit rows, notification dispatches, reconciliation runs, and support recovery cases.

Do not delete or overload `invoice_config`. Treat it as legacy invoice-header configuration that can inform defaults while the new billing subsystem becomes authoritative.

Introduce a centralized billing authorization service for:

- user ownership checks
- tenant/domain admin scope
- high-impact recovery action gating
- raw payload/evidence access gating

This preserves a future path to explicit finance/support roles without spreading ad hoc permission checks across the feature.

### 3.1 Phase 1 authorization decision

Phase 1 should not block on a full user-role migration. The concrete implementation choice should be:

- keep current authenticated roles unchanged (`user`, `admin`, `domain_admin`, `system_agent`)
- implement a billing action authorization service that maps high-impact billing actions to explicit allow rules
- treat ordinary `admin` as the only privileged role in initial production unless the product team approves a schema-backed capability model during implementation
- keep the service interface action-based so it can later map to `support_admin`, `billing_admin`, and `finance_admin` without rewriting business logic

At minimum, the authorization layer must define decisions for:

- `view_invoice`
- `download_invoice_document`
- `edit_billing_profile`
- `edit_seller_profile`
- `edit_tax_and_numbering`
- `sync_invoice_header`
- `replace_paid_invoice`
- `manual_mark_paid`
- `reverse_wrong_downgrade`
- `view_raw_provider_payload`
- `view_recovery_evidence`

### 3.2 Migration and rollout preconditions

Before automatic renewal or overdue jobs are enabled, the implementation must define a migration/backfill path for existing commercial users.

This plan should assume:

- existing `users.plan` and any currently active paid experience remain the live entitlement source during migration
- a backfill job or one-time migration seeds billing-domain subscription state for users who should enter Beam billing
- recurring renewal automation stays disabled until backfill validation completes
- the product team explicitly decides which existing plans/packages map to the new monthly invoice model

Required migration outputs:

- initial subscription billing-cycle anchor per migrated paid user
- mapping from legacy package/catalog rows to billing plan metadata
- operator-visible report of migrated users, skipped users, and ambiguous cases
- explicit "cutover complete" gate before renewal scheduling starts

## 4. Invoice Domain

Implement invoices as snapshot-based business documents with explicit state transitions.

Key rules:

- invoices are classified into `domestic` or `international`
- each stream has independent numbering
- totals are calculated from pre-tax base price
- issuance snapshots seller, buyer, line items, tax, totals, and document-note state
- paid invoices are never silently overwritten
- paid corrections create replacement invoices with new invoice numbers and preserved relations to original payment history

Atomic number reservation and recurring-cycle uniqueness guards are mandatory.

### 4.1 Transaction boundaries and crash safety

The implementation must explicitly separate what happens inside a single database transaction from what happens asynchronously.

Recommended transaction boundaries:

1. `createOrGetInvoiceForBillingCycle`
   - lock/find recurring-cycle uniqueness key
   - create draft invoice if missing
   - do not call Beam inside this transaction
2. `issueInvoice`
   - reserve document number
   - snapshot seller/buyer/tax/totals/line items
   - move invoice to `issued`
   - create document-render-needed marker or enqueue document render job
3. `createPaymentAttempt`
   - create internal payment/payment_attempt row with `expected_amount` and `expected_currency`
   - mark attempt as pending provider creation before making the external Beam call
4. Beam call phase
   - outside the DB transaction
   - on timeout or ambiguous response, mark attempt `provider_pending_unknown` or `reconciliation_required`
   - never create a second attempt blindly
5. `applyPaidBusinessEffects`
   - reserve exactly-once business-effect key in the database first
   - mutate credits/subscription state only after that reservation succeeds

Each boundary must define recovery behavior for process crash, timeout, or partial write so operators can reconcile without direct DB surgery.

## 5. Beam Adapter and Payment Attempts

Implement a provider abstraction with Beam as the first adapter.

The payment-attempt layer should own:

- active attempt reuse
- expected amount/currency snapshot
- provider reference storage
- provider-status normalization
- invalidation/cancel semantics

Webhook processing must:

- verify raw body signature and timestamp
- dedupe replayed events
- persist webhook rows before business effects
- route ambiguous cases into reconciliation instead of blind retry

### 5.1 Webhook secret rotation and invalid-event handling

Webhook verification must support operational secret rotation without downtime.

The implementation should:

- allow current and previous valid Beam webhook secrets during a bounded rotation window
- persist which secret version validated the event when possible
- reject events that pass transport-level checks but fail schema validation, while still recording enough audit detail for investigation
- preserve out-of-order but otherwise valid events for reconciliation instead of dropping them silently
- keep a unique provider event identifier and replay cache so rotation does not weaken dedupe behavior

## 6. Documents and Secure Access

Implement invoice documents as renditions under one invoice transaction.

Each rendition stores:

- language
- version
- render reason
- render actor
- render timestamp

Document generation must use invoice snapshots only. PDFs and uploaded recovery evidence should be served through short-lived signed or proxy-gated access using the existing storage abstraction.

Header sync is allowed for editable unpaid invoices and must record diffs. Paid invoice corrections use replace/reissue only.

### 6.1 Privacy and retention controls

The implementation must turn the spec's privacy requirements into explicit controls:

- uploaded evidence must use encrypted-at-rest storage or encrypted blob references consistent with the platform's secret/storage model
- list views and broad admin tables must redact or mask tax IDs, addresses, phone numbers, and billing emails where full values are not needed
- raw provider payloads and recovery evidence must have access logs that are queryable by invoice/payment/case
- retention windows must be configurable for:
  - raw webhook payloads
  - uploaded evidence
  - archived document variants
  - recovery-case attachments

Privacy-sensitive data should have one owner service so redaction and retention rules stay consistent across billing UI and support tools.

## 7. Top-up, Renewal, and Business Effects

Implement top-up and renewal flows as billing orchestrations that culminate in exactly-once business effects.

Business effects include:

- grant credits
- renew subscription period
- downgrade to free
- reverse wrong downgrade

These effects must be tracked independently from provider paid state so the system can recover "paid but unapplied" cases without duplicate side effects.

## 8. Reconciliation and Recovery

Add recurring jobs for:

- subscription renewal issuance
- overdue downgrade with final reconciliation
- expired attempt cleanup
- payment reconciliation
- paid-but-unapplied recovery
- downgrade reversal
- document recovery/PDF backfill

Add an admin recovery console that exposes invoice/payment/webhook/reconciliation timelines and privileged actions such as manual mark-paid, reverse wrong downgrade, replace invoice, regenerate payment attempt, and regenerate PDF.

High-impact actions must require explicit reason capture and billing authorization.

### 8.1 Recovery action safety requirements

For implementers, the following behaviors are mandatory:

- `manual_mark_paid` must display amount-match state, provider last-seen state, and current invoice status before submit
- `reverse_wrong_downgrade` must refuse execution if the related renewal has already been fully reversed/applied
- `reopen_invoice` must reject any invoice with confirmed settlement or replacement relation
- `replace_invoice` must invalidate open attempts on the superseded invoice before activating the corrective document

## 9. User and Admin Surfaces

Add:

- user billing profile page
- invoice list/detail/download UI
- admin seller header settings
- admin tax and numbering settings
- admin recovery console

The user experience should clearly show pending, verifying, paid, overdue, and under-review states.

## 10. Testing Strategy

Write tests at four levels:

- pure service tests for tax, numbering, authorization, and state guards
- router tests for ownership and privileged actions
- webhook/route tests for signature validation and replay defense
- job tests for renewal, downgrade, reconciliation, and recovery idempotency

Avoid binary PDF snapshot testing. Validate document metadata, relations, storage references, and access behavior instead.

## 11. Implementation Order

Recommended order:

1. schema and authorization foundation
2. billing profiles and admin settings
3. invoice domain, tax, and numbering
4. Beam adapter, webhook, and payment attempts
5. document rendering and access
6. top-up, renewal, and business effects
7. reconciliation and recovery console
8. notifications, tests, and rollout hardening

## 12. Rollout

Keep Beam billing behind feature flags initially.

Before enabling production automation, verify:

- replay-safe webhook handling
- amount/currency mismatch rejection
- document access expiry and ownership checks
- duplicate notification suppression
- final reconciliation before overdue downgrade
- migrated subscriptions have valid billing-cycle anchors
- no legacy paid users are left in an ambiguous renewal state
