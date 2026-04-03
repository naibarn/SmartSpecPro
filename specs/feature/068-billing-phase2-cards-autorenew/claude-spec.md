# Claude Spec Notes — Feature 068

## Spec shape

The Phase 2 spec should stay narrower than a full billing redesign.

It should explicitly cover:

- saved cards
- consent
- auto-renew modes
- retry and dunning
- manual fallback
- customer/admin UI
- compliance guardrails

It should explicitly not expand into:

- multi-provider checkout
- full accounting export
- credit-note redesign
- global tax redesign

## Design stance

Phase 2 is an extension of Feature 066, not a replacement. Any place where Phase 2 is tempted to bypass invoices, payment attempts, reconciliation, or audit trails should be treated as a design smell.
