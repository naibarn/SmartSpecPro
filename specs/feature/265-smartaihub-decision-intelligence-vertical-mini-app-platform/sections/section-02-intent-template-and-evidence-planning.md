# Section 02 — Intent, Template, Evidence Planning

## Scope

Implement Spec 265 §§7–10: question interpretation, template selection, factor plans, provider-neutral DataRequirements and explicit missing/optional evidence.

## Implementation

- Require confirmation for ambiguous high-impact interpretation; do not fabricate missing inputs.
- Evidence planner asks Spec 266 resolver; only eligible shared evidence references bind to an AnalysisRun.
- Compute readiness from evidence quality, freshness, scope and policy.

## Tests

Vague intent, no eligible offers, conflicting/stale evidence and required/optional factor cases.
