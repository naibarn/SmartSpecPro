# Claude Research — Feature 068

## Existing implementation baseline

Feature 066 already established:

- invoice-first billing domain
- payments and payment attempts
- Beam adapter with webhook verification
- exactly-once business effects
- reconciliation and recovery jobs
- billing user/admin UI
- document rendering and access control

Phase 2 must reuse these foundations rather than introduce a parallel subscriptions or payment stack.

## Practical product extension

The most natural next phase after QR-first/manual-invoice billing is:

- payment-method management
- optional auto-renew enrollment
- off-session renewal attempts
- decline-aware retries and dunning
- customer-visible continuity messaging

This sequencing preserves Phase 1 value while moving toward lower-friction renewals.

## Main engineering risks

### 1. Compliance boundary drift

If the app accidentally stores raw card data or logs sensitive provider setup payloads, Phase 2 creates a compliance problem larger than the feature gain.

### 2. Duplicate renewals

Auto-renew introduces more retry states and more provider ambiguity. The system must preserve one business invoice per cycle and one active renewal attempt path at a time.

### 3. Subscription confusion

A subscription may switch between `manual_invoice` and `auto_charge`. The design must keep future-cycle behavior predictable and auditable.

### 4. Dunning UX

Retry logic without good customer/admin visibility leads to support volume and silent churn.

## Recommended implementation posture

- tokenization only through provider-hosted or provider-tokenized flows
- keep invoice issuance unchanged
- model payment methods and renewal attempts explicitly
- keep auto-renew opt-in and reversible
- treat failed card renewals as a stateful recovery workflow, not a one-off error
