# Review Summary

Generated: 2026-03-11

## Improvement Items

### R1

- Severity: high
- Impact: high-impact
- Affected area: committed artifact persistence model
- Rationale: the plan does not make a concrete Phase 1 choice for where saved research and storyboard outputs live after user confirmation
- Recommended action: choose a concrete commit target, preferably library-backed artifacts indexed by `agency_run_artifacts`

### R2

- Severity: high
- Impact: high-impact
- Affected area: deck preview and commit contract
- Rationale: the plan does not yet choose whether deck preview payloads are based on `AIPresentationSlide[]`, final slide content, or a new schema
- Recommended action: choose one canonical preview payload contract, preferably `AIPresentationSlide[]` plus deck metadata

### R3

- Severity: medium
- Impact: low-impact
- Affected area: preview lifecycle and retries
- Rationale: preview and commit states needed more explicit lifecycle modeling
- Recommended action: add explicit preview states and idempotent commit tokens
- Status: auto-applied

### R4

- Severity: medium
- Impact: low-impact
- Affected area: Python/Node contract normalization
- Rationale: existing `output` versus `response` drift required a canonical contract and shape-level tests
- Recommended action: define a normalized run response and add contract tests
- Status: auto-applied
