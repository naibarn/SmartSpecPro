## Planning depth

- Decision: `standard`
- Why:
  - The request is broad enough to span data model, payment adapter boundaries, scheduling, documents, admin UX, and recovery.
  - It is still appropriate for a feature-spec package because the user supplied detailed product requirements and the work stays within one product domain.

## Key design decisions

### D1. Create a new feature directory `066-beam-billing-invoice-phase1`

- Rationale:
  - The request introduces a major billing architecture and deserves its own feature anchor rather than being folded into an unrelated spec.

### D2. Treat SmartSpecPro as source of truth for billing business state

- Decision:
  - Beam only owns charge creation, payment links, QR flow, and webhook delivery.
  - SmartSpecPro owns invoice, payment, subscription, credit grants, billing profiles, numbering, and audit state.

### D3. Keep provider abstraction even though Beam is the only Phase 1 provider

- Decision:
  - The spec requires a provider interface layer and a Beam adapter implementation.
- Rationale:
  - This preserves business logic and keeps Phase 1 from hard-coding Beam throughout the app.

### D4. Model invoices as snapshot-based legal documents with document variants

- Decision:
  - Header, tax, totals, and line items are snapshotted onto the invoice at issuance.
  - Language-specific PDFs live as document renditions under the same invoice transaction.
- Rationale:
  - This matches the request's legal-document safety requirement and avoids mutating history silently.

### D5. Separate domestic and international invoice streams

- Decision:
  - Domestic and international invoices get separate numbering sequences, tax policy selection, and reporting segmentation.

### D6. Build explicit recovery and reconciliation into Phase 1

- Decision:
  - Reconciliation, paid-unapplied recovery, downgrade reversal, and admin recovery tools are Phase 1 scope, not later nice-to-haves.
- Rationale:
  - Beam payment correctness and customer continuity are high-risk operational concerns.

### D7. Keep the initial subscription mode manual-monthly-invoice

- Decision:
  - Monthly renewals create invoice + QR/charge flows each cycle.
  - Saved card auto-renew is explicitly deferred.
