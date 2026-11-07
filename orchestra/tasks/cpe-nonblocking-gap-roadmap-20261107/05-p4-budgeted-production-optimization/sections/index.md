<!-- PROJECT_CONFIG
runtime: typescript-pnpm
test_command: pnpm --filter @smartspec/web exec vitest run <focused files>
END_PROJECT_CONFIG -->

<!-- SECTION_MANIFEST
section-01-cost-ledger-and-authorized-budget
section-02-bounded-optimization-and-learning
section-03-observability-rollout-and-completion-evidence
END_MANIFEST -->

# P4 Sections — Budgeted Production Optimization

## Dependency Graph

| Section | Depends On | Blocks | Parallelizable |
|---|---|---|---|
| section-01-cost-ledger-and-authorized-budget | P0, P2 | 02, 03 | No |
| section-02-bounded-optimization-and-learning | 01, P2, P3 | 03 | No |
| section-03-observability-rollout-and-completion-evidence | 01, 02 | Project completion | No |

## Execution Order

Run sequentially: recommendations must consume settled, revision-bound evidence and cannot outrun budget, authorization or reconciliation contracts.

## Section Summaries

### section-01-cost-ledger-and-authorized-budget
Reconcile the canonical cost owner and verify snapshot, reserve, settlement, idempotency and ambiguous-outcome handling.

### section-02-bounded-optimization-and-learning
Connect optional outcome learning/recommendations without autonomous paid changes or any new image/video quality gate.

### section-03-observability-rollout-and-completion-evidence
Prove tenant-safe cost visibility, feature-off/failure fallback, non-blocking eligibility and canonical handoff closure.
