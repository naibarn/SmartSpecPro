# Section 01 — Decision Domain and Persistence

## Scope

Implement Spec 265 §§3–6 durable domain contracts and storage for DecisionProject, DecisionQuestion, DecisionTemplate, FactorDefinition, DecisionScenario, immutable AnalysisRun, Claim and WatchDefinition.

## Implementation

- Tenant scoped ownership and authorization; version pin template, policy, calculation and evidence/admission receipts.
- AnalysisRun is append-only; no evidence truth or shared source authority is stored here.
- Additive migration; do not remove or rewrite unrelated data.

## Tests

Repository isolation, immutable run history, reference validation and version pinning.
