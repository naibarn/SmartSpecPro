# Section 07 — API, Observability, Evaluation, Migration

## Scope

Implement Spec 265 §§32, 38, 42–46, 48–54 and migration clauses from §49.

## Implementation

- Tenant-scoped public APIs/MCP/skills expose stable references and safe reasons, not private payloads.
- Audit cost, evidence gaps, run lineage, model/method versions and outcome quality.
- Preserve previous runs and migrate only with explicit compatibility/replay proof.
- Record criterion-to-test mapping; production rollout/utility and external gates remain explicit.

## Tests

Authorization, redaction, version compatibility, replay, cost accounting and criteria matrix.
