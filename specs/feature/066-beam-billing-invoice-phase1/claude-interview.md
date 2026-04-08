# Interview Transcript — Feature 066: Beam Billing & Invoice Phase 1

## Interview mode

No live stakeholder Q&A was run in this pass.

Reason:

- the source spec already contains detailed product rules
- the user explicitly asked to continue straight into deep-plan

## Synthesized answers used for planning

### Q1: New subsystem or small extension?

**Answer used:** New billing subsystem that reuses existing credits, storage, and audit infrastructure.

### Q2: How to handle privileged recovery permissions with the current coarse role model?

**Answer used:** Add centralized billing action authorization now, with a future path to explicit `support_admin` / `billing_admin` / `finance_admin`.

### Q3: What is the corrective flow for paid invoice mistakes?

**Answer used:** Create a replacement invoice with a fresh invoice number, preserve relation to original payment, never reopen the paid invoice as payable.

### Q4: What happens when provider state is ambiguous?

**Answer used:** Persist the event/state and route to reconciliation rather than blind retry or direct business-effect mutation.

### Q5: How should PDFs and recovery evidence be delivered?

**Answer used:** Use short-lived signed or proxy-gated access through the existing storage abstraction.

## Still-open product policy questions

1. Whether VAT is enabled at initial launch.
2. Whether a separate receipt document is needed in Phase 1.
3. Exact overdue reminder cadence before day-7 downgrade.
4. Exact entitlement revocation rules on downgrade to free.
