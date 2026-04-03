# 066 - Beam Billing & Invoice Phase 1

Version: 1.0
Date: 2026-03-31
Status: Proposed
Depends-on: 003 (SmartSpec web app), existing credits/package flows, current domain invoice config page

---

## 1. Executive summary

This feature adds SmartSpecPro Billing Phase 1 with Beam as the first payment provider and PromptPay QR as the primary payment method.

Phase 1 introduces a production-grade billing foundation for:

- one-time credit top-up
- monthly subscription renewal by invoice
- invoice document generation and versioning
- billing profile management
- tax and numbering policy control
- audit, reconciliation, and support recovery

The core design principle is that SmartSpecPro owns all business billing state while Beam is only a payment execution provider.

## 2. Goals

### 2.1 Beam-first payment flow

- support Beam as the only Phase 1 provider
- support PromptPay QR as the default payment method
- support Beam Charges API as the default integration path
- allow Beam Payment Links as a fallback or support flow

### 2.2 Business flows

- support one-time top-up for credits
- support monthly subscription renewal through invoice issuance and monthly re-charge flow
- downgrade users to the free plan when renewal invoices remain unpaid for 7 days after issuance

### 2.3 Real invoice/document handling

- store seller and buyer billing headers
- snapshot invoice document data at issuance time
- render PDF invoices with version and language history
- allow header sync for editable unpaid invoices
- allow replace/reissue flows for paid invoices

### 2.4 Operational safety

- prevent duplicate invoice issuance, duplicate charges, duplicate business effects, and duplicate notifications
- support reconciliation, paid-unapplied recovery, and downgrade reversal
- keep all critical changes auditable

## 3. Non-goals

- saved card or automatic card charging
- multi-provider customer-facing payment selection
- full cross-country tax engine
- full accounting export suite
- complete credit-note or debit-note workflow

## 4. Core design principles

### 4.1 App-owned billing state

SmartSpecPro is the source of truth for:

- current plan
- subscription lifecycle
- invoices
- payments and payment attempts
- credit grants
- billing profiles
- audit and notification history

Beam is responsible only for:

- charge or payment-link creation
- QR-based payment execution
- webhook notifications
- provider-side payment status lookup

### 4.2 Provider-agnostic payment architecture

Although Phase 1 only implements Beam, the business logic must depend on a provider abstraction such as:

- `createInvoiceCharge(invoice)`
- `createTopupCharge(order)`
- `getPaymentStatus(providerPaymentId)`
- `cancelPayment(providerPaymentId)`
- `verifyWebhook(rawBody, signature)`
- `normalizeWebhookEvent(payload)`

### 4.3 Snapshot-first invoice legality

When an invoice is issued, the system must snapshot:

- seller header
- buyer header
- line items
- tax policy and computed totals
- invoice stream and classification metadata

Rendering or re-rendering PDF documents must be possible from invoice-owned snapshot data without re-reading live profile tables.

### 4.4 Document safety and version history

- unpaid `draft` invoices may be edited freely
- unpaid `issued` or `payment_pending` invoices may be updated only through header versioning and PDF regeneration with audit history
- paid invoices must never be silently overwritten
- paid invoice corrections require replace/reissue flow with archival of prior documents

## 5. Business rules

### 5.1 Invoice streams

Invoices must be classified into at least:

- `domestic`
- `international`

Rules:

- each stream has its own numbering sequence
- each stream may use different tax policy, footer templates, and reporting segmentation
- stream classification is snapshotted at issuance time
- later billing-profile changes must not silently change a previously issued invoice stream

Example numbering:

- `TH-INV-2026-000001`
- `INT-INV-2026-000001`

### 5.2 Tax rules

Web pricing is always a base price before VAT/tax.

The system must:

- compute `subtotal` from base line items
- compute `tax_amount` from the active tax policy for the invoice stream
- compute `grand_total = subtotal + tax_amount`
- snapshot tax rate, tax label, stream, and rounding policy at issuance time

Admin-configurable policy requirements:

- domestic VAT on/off
- domestic VAT rate
- international tax/VAT on/off
- international tax/VAT rate
- effective date windows
- default tax label per stream
- rounding policy

### 5.3 Subscription renewal overdue policy

For `subscription_renewal` invoices:

- due period is 7 days from `issued_at`
- when still unpaid after 7 days:
  - mark invoice `canceled_overdue`
  - mark current active payment attempt inactive, expired, or internally canceled
  - mark subscription `downgraded_to_free`
  - move user to free plan
  - revoke paid entitlements according to free-plan rules
  - emit timeline and notifications

This job must be idempotent and must perform one final reconciliation with Beam before downgrade is finalized.

### 5.4 Credit grant rules

- credits are granted only after payment success is confirmed
- issuing an invoice or creating a charge does not grant credits
- canceling or expiring an invoice must not affect credits
- top-up credit application must be exactly once per invoice

### 5.4A Amount and currency integrity rules

Before any invoice or payment can be marked `paid`, the system must verify:

- provider settled amount matches the expected invoice payable amount
- provider settled currency matches invoice currency
- payment reference maps to the currently valid invoice/payment attempt

Required behavior:

- `expected_amount` and `expected_currency` must be snapshotted onto the payment attempt when the provider object is created
- provider reconciliation must populate `settled_amount` and `settled_currency`
- if amount or currency does not match, the system must not auto-apply business effects
- mismatched cases must move to a recovery state such as `manual_review_required` or `reconciliation_required`
- partial payment, overpayment, underpayment, or payment against a replaced invoice must never silently mark the invoice `paid`
- stale paid events for a replaced, canceled, or superseded payment attempt must be recorded for investigation but must not reactivate the invoice automatically

### 5.5 Invoice lifecycle

Required statuses:

- `draft`
- `issued`
- `payment_pending`
- `paid`
- `expired`
- `canceled`
- `canceled_overdue`
- `replaced`

Recovery-oriented states may also be needed for payment and support workflows, including:

- `provider_pending_unknown`
- `reconciliation_required`
- `paid_unapplied`
- `paid_recovered`
- `grant_pending_recovery`
- `downgraded_pending_reversal`
- `manual_review_required`

## 6. Invoice document requirements

### 6.1 Header data

Seller-side fields must support at least:

- company/entity name in Thai and English
- addresses
- phone
- accounting email
- tax ID
- HQ/branch type
- signer name and title
- footer note in Thai and English
- auto-generated document note in Thai and English
- company logo

Buyer-side fields must support at least:

- person/entity name in Thai and English
- addresses
- phone
- billing email
- tax ID
- contact name
- invoice note

### 6.2 Invoice body

Each invoice must be able to render:

- invoice number
- invoice stream
- issue date
- due date
- currency
- line items
- quantity
- unit price
- discount
- subtotal
- tax amount
- effective tax rate
- total amount
- document notes
- document status
- subscription/order/payment references
- Beam charge or payment-link references

### 6.3 Language variants

One invoice transaction may have many document renditions:

- Thai PDF
- English PDF
- bilingual PDF
- regenerated versions after sync-header or reissue

Rules:

- all renditions keep the same invoice number
- rendering a new language must not create a new invoice transaction
- changing or adding language must not create a new charge
- rendition history must keep:
  - `document_language`
  - `document_version`
  - `render_reason`
  - `rendered_at`
  - `rendered_by`

### 6.4 Thai legal note requirement

Admin must be able to configure a default Thai automatic-document note, including support for the default message:

`เอกสารนี้ออกด้วยระบบอัตโนมัติ ไม่จำเป็นต้องมีลายเซ็นต์ผู้มีอำนาจลงนาม`

The note must support:

- per-language display toggles
- revision history
- stable rendering behavior under snapshot/versioning policy

## 7. Billing profile and settings surfaces

### 7.1 User billing profile

Add `Settings > Billing Profile` with:

- buyer-header editing
- validation for required billing fields
- preview of the next invoice header
- status that this profile will be used for the next invoice

### 7.2 Admin billing settings

Add:

- `Admin > Billing Settings > Tax & Numbering`
- `Admin > Billing Settings > Document Header`

Required capabilities:

- domestic/international sequence configuration
- domestic/international tax policy configuration
- preview next invoice number
- preview tax calculation from base price
- header preview and sample render
- revision history
- admin override with reason and audit log

## 8. Header snapshot, sync, and reissue rules

### 8.1 Snapshot at issuance

On `draft -> issued`, copy into invoice-owned snapshot fields:

- seller header
- buyer header
- line items
- tax data
- computed totals

### 8.2 Sync-header action

Admin action: `Sync Header`

Supported modes:

- sync seller header only
- sync buyer header only
- sync both

Allowed statuses:

- `draft`
- `issued`
- `payment_pending`

Results:

- increment `header_version`
- regenerate PDF
- store `synced_by`, `synced_at`, `sync_reason`
- persist before/after diff in audit history

### 8.3 Paid invoice replace/reissue

If a paid invoice header is wrong:

- mark original invoice `replaced`
- create a new corrective invoice record with a new invoice number in the correct stream
- keep relation `replaced_by_invoice_id`
- archive prior PDFs
- show full replace history in admin

The implementation must keep payment history and business effects non-duplicative.

Replace/reissue safety rules:

- replace/reissue must never create a second payable obligation for money already collected
- the reissued invoice must reference the original payment and original invoice id
- any still-open payment attempt on the replaced invoice must be invalidated before the corrective document becomes active
- customer-facing download surfaces must clearly show which invoice is replaced and which invoice supersedes it
- `reopen invoice` is allowed only for unpaid invoices that were expired or canceled without confirmed settlement
- paid invoices must not use `reopen`; they must use replace/reissue or recovery flow only

## 9. Beam integration design

### 9.1 Payment modes

- top-up credits: Beam Charges API first
- subscription renewal: Beam Charges API first
- support/manual collection: Beam Payment Links fallback

### 9.2 Payment mapping

- `invoice` = business document in SmartSpecPro
- `payment` = one money movement record tracked internally
- `provider_payment_ref` = Beam charge ID or payment-link ID

Phase 1 starts with one active payment attempt per invoice, but the model must preserve attempt history.

## 10. Core flows

### 10.1 Monthly renewal

1. scheduler finds due subscriptions
2. create or reuse invoice for billing cycle
3. pull current billing profiles
4. build line items and totals
5. reserve invoice number
6. set invoice `issued`
7. create Beam charge
8. set invoice `payment_pending`
9. notify user with invoice/QR access

### 10.2 Successful payment

1. verify webhook
2. resolve payment/invoice
3. idempotency check
4. mark payment paid
5. mark invoice paid
6. extend subscription or grant top-up credits
7. send the correct invoice/receipt document link

### 10.3 Top-up

1. user selects package
2. system creates one-time order/invoice
3. system creates Beam charge
4. page shows QR and expiry countdown
5. payment success triggers invoice/payment paid state
6. system applies credits once

## 11. Duplicate-prevention and exactly-once rules

### 11.1 Invoice uniqueness

The system must prevent duplicate recurring invoice creation for the same billing cycle.

Recommended guard:

- unique (`subscription_id`, `billing_cycle_start`, `billing_cycle_end`, `invoice_type`)

### 11.2 Active payment attempt uniqueness

- only one active payment attempt per invoice
- new attempt creation is allowed only after old attempt is expired, canceled, replaced, or explicitly invalidated

### 11.3 Business effect idempotency

Persist exactly-once keys such as:

- `grant_credits:invoice:{invoiceId}`
- `renew_subscription:invoice:{invoiceId}`
- `downgrade_subscription:invoice:{invoiceId}`
- `reverse_downgrade:invoice:{invoiceId}`

### 11.4 Notification dedupe

Persist notification dispatches with dedupe keys such as:

- `invoice_issued:{invoiceId}`
- `invoice_overdue_reminder:{invoiceId}:day6`
- `payment_success:{invoiceId}`

Rules:

- duplicate webhook or reconciliation events must not spam users
- reminders must have cooldowns
- replaced, canceled, or paid invoices must suppress stale reminders

## 12. Security, privacy, and access control

### 12.1 Webhook authenticity and replay protection

Beam webhook handling must enforce:

- signature verification against the raw unmodified request body
- timestamp tolerance to reject stale signatures
- replay protection using unique provider event ids and/or signature replay cache
- event dedupe at persistence level before business effects are applied
- support for webhook secret rotation with current and previous valid secrets during rotation windows
- rejection and audit logging for invalid signatures, invalid timestamp windows, malformed payloads, and duplicate replay attempts

If verification passes but event ordering is ambiguous:

- store the event
- avoid unsafe business effects
- route the payment to reconciliation when necessary

### 12.2 Sensitive data protection

Billing, invoice, and recovery data include regulated or sensitive data such as:

- names
- tax IDs
- postal addresses
- phone numbers
- billing emails
- provider references
- uploaded evidence or slips
- raw webhook/provider payloads

The implementation must support:

- encryption at rest for uploaded evidence and any secrets
- field-level redaction or masking in admin list views and logs for sensitive fields
- access logging for raw payload and evidence access
- retention policy for evidence, raw payloads, and audit artifacts
- least-privilege access to sensitive data, especially in support tooling

### 12.3 Invoice/PDF/evidence access control

Document and evidence access must enforce:

- object-level authorization so users can access only their own invoices and documents
- tenant/domain scoping for admin and support views
- non-enumerable identifiers or equivalent object access checks on invoice routes
- short-lived signed URLs or equivalent gated download flow for PDFs and uploaded evidence
- download/view audit logging for invoice PDFs, archived documents, and recovery evidence

### 12.4 Recovery-console security

Recovery actions that can alter paid state, entitlement state, or document history are privileged operations.

The implementation must support:

- stricter permissions than ordinary admin invoice viewing
- mandatory reason input
- optional evidence attachment where relevant
- step-up confirmation for high-impact actions
- immutable audit logs for all recovery-console actions
- prevention of self-approval if a future approval workflow is introduced

## 13. Recovery and reconciliation

### 13.1 Failure scenarios in scope

- client refresh or close during QR payment
- provider timeout after create-charge request
- late, missing, duplicate, or out-of-order webhooks
- database failure during webhook processing
- paid at provider but unpaid internally
- downgrade performed before late paid state is discovered
- document generation failure after invoice issuance

### 13.2 Reconciliation model

The system must support:

- webhook-driven reconciliation
- scheduled reconciliation
- admin manual sync
- support-triggered recovery

### 13.3 Recovery jobs

Required jobs:

- `subscriptionRenewalJob`
- `invoiceOverdueDowngradeJob`
- `expiredPaymentCleanupJob`
- `paymentReconciliationJob`
- `paidButUnappliedRecoveryJob`
- `downgradeReversalRecoveryJob`
- `documentRecoveryJob`
- `invoicePdfBackfillJob`

### 13.4 Admin recovery console

Admin must be able to:

- search by invoice number, user, Beam reference, payment ID
- inspect invoice/payment/webhook/reconciliation timeline
- inspect raw provider payload
- sync transaction now
- retry reconciliation
- recheck provider state
- regenerate QR or new payment attempt
- mark as paid manually with reason and evidence
- apply missing credits
- apply missing subscription renewal
- reverse wrong downgrade
- cancel stale payment attempt
- reopen invoice
- replace invoice
- regenerate PDF

### 13.5 Manual recovery safety

All manual recovery actions must store:

- actor
- timestamp
- reason
- before state
- after state
- linked evidence or external reference

Manual recovery safety additions:

- `Mark As Paid (Manual Recovery)` must require `finance_admin` or equivalent elevated billing role
- `Reverse Wrong Downgrade` must require `billing_admin` or higher
- `Reopen Invoice` must reject paid invoices
- `Replace Invoice` for paid documents must require elevated billing role and explicit confirmation that no duplicate receivable will be created
- admin UIs must surface the amount-match state and provider verification state before allowing manual recovery

## 14. Data model

### 14.1 New or expanded tables

Core tables:

- `billing_profiles`
- `seller_profiles`
- `invoices`
- `invoice_documents`
- `tax_policies`
- `document_number_sequences`
- `invoice_line_items`
- `payments`
- `payment_attempts`
- `webhook_events`
- `invoice_audit_logs`
- `notification_dispatches`
- `reconciliation_runs`
- `support_recovery_cases`

### 14.2 Important invoice fields

At minimum:

- `invoice_number`
- `invoice_stream`
- `tax_policy_id`
- `invoice_type`
- `user_id`
- `subscription_id`
- `order_id`
- `status`
- `currency`
- `subtotal`
- `tax_amount`
- `total_amount`
- `issued_at`
- `due_at`
- `paid_at`
- `canceled_at`
- `cancel_reason`
- `header_version`
- `seller_snapshot_json`
- `buyer_snapshot_json`
- `totals_snapshot_json`
- `default_document_language`
- `replaced_by_invoice_id`

Additional recommended invoice integrity fields:

- `billing_cycle_start`
- `billing_cycle_end`
- `supersedes_invoice_id`
- `document_access_scope`

### 14.3 Important payment recovery fields

Add payment fields for:

- `reconciliation_status`
- `last_reconciled_at`
- `provider_status_last_seen`
- `business_effect_status`
- `manual_recovery_required`
- `manual_recovery_resolved_at`
- `expected_amount`
- `expected_currency`
- `settled_amount`
- `settled_currency`
- `amount_match_status`
- `provider_event_last_seen_id`

Add subscription fields for:

- `downgraded_at`
- `downgrade_reason`
- `last_recovery_action_at`

Additional recommended storage controls:

- retention metadata for evidence and raw provider payloads
- access-log records for raw payload and evidence views
- optional encrypted blob reference fields for uploaded recovery evidence

## 15. API and service requirements

### 15.1 Core services

- `classifyInvoiceStream(billingProfile)`
- `getActiveTaxPolicy(stream, issuedAt)`
- `calculateInvoiceTotalsFromBasePrice(lineItems, taxPolicy)`
- `reserveNextInvoiceNumber(stream)`
- `previewInvoiceNumber(stream)`
- `createOrGetInvoiceForBillingCycle(subscriptionId, cycleKey)`
- `renderInvoiceDocument(invoiceId, language, reason)`
- `listInvoiceDocuments(invoiceId)`
- `sendInvoiceNotification(invoiceId, notificationType)`
- `shouldSendNotification(dedupeKey)`
- `createOrReuseActivePaymentAttempt(invoiceId)`
- `validatePaymentSettlement(invoiceId, paymentAttemptId, providerState)`
- `authorizeBillingAction(actor, action, target)`
- `createSignedInvoiceDocumentAccess(invoiceDocumentId, actor)`

### 15.2 User APIs

- `GET /api/billing/profile`
- `PUT /api/billing/profile`
- `GET /api/invoices`
- `GET /api/invoices/:id`
- `GET /api/invoices/:id/pdf`
- `POST /api/topup/checkout`
- `GET /api/subscription/current`

### 15.3 Admin APIs

- `GET /api/admin/billing/seller-profile`
- `PUT /api/admin/billing/seller-profile`
- `POST /api/admin/invoices/:id/sync-header`
- `POST /api/admin/invoices/:id/reissue`
- `POST /api/admin/invoices/:id/cancel`
- `GET /api/admin/invoices/:id/audit-log`
- `POST /api/admin/invoices/:id/regenerate-pdf`

Admin recovery and evidence endpoints should also exist for:

- transaction recheck/reconcile
- manual mark-paid
- downgrade reversal
- evidence upload and evidence audit view

### 15.4 Beam/webhook endpoints

- `POST /api/payments/beam/webhook`
- internal: `createBeamChargeForInvoice(invoiceId)`
- internal: `reconcileBeamPayment(paymentId)`

## 16. Notifications

Minimum notification triggers:

- invoice issued
- QR ready
- payment success
- overdue reminder
- overdue downgrade
- invoice replaced or reissued

Minimum channels:

- in-app
- email

## 17. Permissions

### 17.1 User

- manage own billing profile
- view own invoices
- download own PDFs
- pay own invoices

### 17.2 Admin role model

At minimum, the system should distinguish:

- `support_admin`
- `billing_admin`
- `finance_admin`
- `super_admin`

### 17.3 Permission matrix

- `support_admin`
  - view invoice, payment, webhook, and notification history within allowed tenant scope
  - create support recovery case
  - request reconciliation or provider recheck
  - must not manual mark paid, reverse downgrade, or alter tax/numbering policy
- `billing_admin`
  - manage seller header
  - sync header
  - regenerate PDF
  - replace/reissue invoices
  - reverse wrong downgrade
  - view audit log and reconciliation data
- `finance_admin`
  - manage tax and numbering
  - perform manual mark paid with evidence and reason
  - cancel or reopen unpaid invoices under policy
  - inspect raw provider payloads and financial evidence
- `super_admin`
  - full access, including emergency recovery actions

High-impact actions must require:

- explicit reason
- positive authorization check
- audit log
- optional step-up confirmation for production environments

## 18. Feature flags

Required flags include:

- `PAYMENT_PROVIDER=beam`
- `PAYMENT_METHOD_QR_PROMPTPAY=true`
- `PAYMENT_METHOD_CARD=false`
- `SUBSCRIPTION_MODE=manual_monthly_invoice`
- `INVOICE_HEADER_SYNC_ENABLED=true`
- `PAID_INVOICE_REISSUE_ENABLED=true`
- `AUTO_DOWNGRADE_AFTER_7_DAYS=true`
- `BEAM_PAYMENT_LINK_FALLBACK=true`
- `DOMESTIC_INTERNATIONAL_INVOICE_STREAMS_ENABLED=true`
- `SEPARATE_INVOICE_RUNNING_BY_STREAM=true`
- `ADMIN_TAX_POLICY_CONFIG_ENABLED=true`
- `WEB_PRICES_ARE_PRE_VAT=true`
- `PAYMENT_RECONCILIATION_ENABLED=true`
- `FINAL_RECONCILIATION_BEFORE_DOWNGRADE=true`
- `ADMIN_MANUAL_MARK_PAID_ENABLED=true`
- `ADMIN_DOWNGRADE_REVERSAL_ENABLED=true`
- `SUPPORT_RECOVERY_CASES_ENABLED=true`
- `DOCUMENT_RECOVERY_ENABLED=true`

## 19. Acceptance criteria

- invoices are classified into domestic and international streams with separate numbering
- web prices are treated as pre-tax base prices
- invoice tax snapshots do not change retroactively when policy changes later
- one invoice transaction can have multiple language variants without creating a new invoice or charge
- recurring scheduler reruns do not create duplicate invoices for the same cycle
- invoice-level active payment attempts are not duplicated
- webhook replay, reconciliation retry, or manual recovery rerun do not duplicate credits, renewal, downgrade, reversal, or notifications
- unpaid renewal invoices older than 7 days downgrade the user to free only once and only after final reconciliation
- admin can sync headers on editable unpaid invoices and sees versioned diff/audit history
- paid invoice correction uses replace/reissue flow rather than silent overwrite
- admin recovery tools can close paid-but-unapplied and wrong-downgrade cases without direct database editing
- Thai automatic-document note can be configured and rendered consistently in Thai invoice PDFs
- replayed or duplicated Beam webhooks cannot re-apply business effects after the first successful application
- invalid webhook signature, invalid timestamp, or replayed event is rejected and audited
- amount or currency mismatch cannot auto-mark invoice `paid`
- stale payment for replaced or canceled invoice cannot reopen or auto-pay the invoice
- users cannot access invoices or PDFs outside their ownership scope
- admin/support access to raw provider payloads and evidence is permission-gated and audited
- manual mark-paid is restricted to elevated billing/finance roles and requires reason plus evidence
- signed or gated PDF/evidence access expires and cannot be reused indefinitely across tenants or users

## 20. Open questions

1. Should corrective paid-invoice reissue use a fresh invoice number in every case, or are there any accounting/legal scenarios where a revision suffix is preferred?
2. Should Phase 1 start with VAT enabled immediately or allow a no-VAT launch mode first?
3. Should a separate receipt document exist in Phase 1, or is paid invoice status enough?
4. How many overdue reminders should be sent before day 7 downgrade?
5. Which paid entitlements and credits should be revoked immediately on downgrade to free?

## 21. Delivery milestones

### Milestone A

- buyer billing profile
- seller billing settings
- invoice schema and PDF generator

### Milestone B

- Beam QR top-up flow
- payment webhook
- credit grant integration

### Milestone C

- monthly renewal invoice flow
- overdue auto downgrade
- invoice cancel automation

### Milestone D

- sync-header
- replace/reissue
- audit logs
- admin recovery console
