# Plan Quality Uplift Checkpoint

## Recommended Uplift Items

### U1 - Slide order invariants and constraint strategy
- severity: high
- impact: high-impact
- rationale: The plan mentions transactional reorder but does not yet pin explicit DB-level invariants to prevent duplicate/invalid order slots under concurrent mutations.
- concrete plan delta:
  - Add explicit uniqueness/invariant strategy for `(presentation_id, order_index)` with transaction-safe reorder algorithm.
  - Include conflict-safe reorder test matrix (swap, insert-middle, bulk move, concurrent reorder).

### U2 - Conversion idempotency and retry safety
- severity: high
- impact: high-impact
- rationale: One-time PPTX conversion can be retried due to network/user re-clicks; without idempotency it may create duplicate derived decks or inconsistent source mappings.
- concrete plan delta:
  - Require idempotency key and source-locking for conversion endpoint.
  - Add duplicate-click and retry tests to guarantee at-most-one active conversion result per source item.

### U3 - Deck size accounting and quota consistency
- severity: medium
- impact: high-impact
- rationale: Limits are defined, but source-of-truth accounting for total deck bytes and warning threshold behavior is not explicit.
- concrete plan delta:
  - Define authoritative byte accounting formula and recalculation triggers.
  - Add reconciliation job/check for asset-link bytes vs reported deck size.

### U4 - Cross-service export contract hardening
- severity: medium
- impact: low-impact
- rationale: Export worker integration is covered, but explicit versioned payload contract between web app and Python worker is not yet documented.
- concrete plan delta:
  - Add render-spec schema version field and validation guard at enqueue and worker ingest.
  - Add compatibility fallback behavior for unknown schema version.

### U5 - Observability SLO thresholds and alert policies
- severity: medium
- impact: low-impact
- rationale: Monitoring categories are listed but no concrete alert thresholds or on-call trigger conditions are defined.
- concrete plan delta:
  - Add first-pass SLOs/alerts for conflict rate, conversion failure rate, export queue latency, and export failure rate.

### U6 - Accessibility baseline for editor/player controls
- severity: low
- impact: low-impact
- rationale: MVP includes keyboard navigation in player, but accessibility requirements for focus order, labels, and canvas control alternatives are not explicit.
- concrete plan delta:
  - Add baseline accessibility acceptance checks for keyboard-only operation and labeled controls in editor/player shell.
