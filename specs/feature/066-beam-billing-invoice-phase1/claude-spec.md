# Claude Spec Synthesis — Feature 066: Beam Billing & Invoice Phase 1

## Product intent

SmartSpecPro needs a Beam-first billing foundation for Thai QR payments, monthly subscription renewal, legal-quality invoice documents, and operational recovery when provider and internal state diverge.

## Scope

### In scope

- one-time top-up via Beam QR
- monthly renewal via invoice + Beam charge
- buyer/seller billing profiles
- domestic/international invoice streams
- pre-tax pricing with tax-policy snapshots
- multilingual PDF variants
- header sync, replace/reissue, and audit history
- duplicate prevention for invoices, charges, business effects, and notifications
- reconciliation jobs and admin recovery console

### Out of scope

- saved-card billing
- customer-facing multi-provider selection
- full accounting export
- cross-country tax engine

## Architectural stance

- SmartSpecPro owns invoice, payment, subscription, credits, and audit truth.
- Beam remains a provider adapter, not the source of business truth.
- Invoice rendering must be snapshot-based.
- Sensitive documents and evidence must be permission-gated and access-audited.
- Payment success must require amount/currency match plus exactly-once business-effect application.

## Repo fit

- Use tRPC for authenticated billing APIs.
- Use an Express raw-body route for Beam webhook ingress.
- Use Drizzle migrations for all billing schema work.
- Reuse `creditService`, `storage.ts`, scheduler initialization, and `auditLogger` patterns.
- Add centralized billing authorization because current roles are too coarse for financial recovery operations.

## Success criteria

- one recurring billing cycle creates at most one invoice
- one invoice has at most one active payment attempt
- paid events apply credits/renewal exactly once
- overdue downgrade happens only after final reconciliation
- invoice document variants do not create duplicate invoices or charges
- admin recovery can resolve paid-but-unapplied cases without direct DB edits
