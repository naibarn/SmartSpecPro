# Section 06 — Watches, Mini Apps, Packs, Commercial

## Scope

Implement Spec 265 §§25–31, 39, and 47. Watches use canonical scheduling/notifications; Mini Apps use SPAAS; commercial operations use canonical billing.

## Implementation

- New immutable AnalysisRun for material changes with dedupe, budget and reauthorization.
- Decision/vertical packs are versioned and use declarative screen/form/interaction steps; no legacy workflow engine.
- Cross-tenant sharing, data use and creator revenue require canonical permissions/billing.

## Tests

Watch replay, materiality/budget, pack validation/version/kill switch, permissions and billing references.
