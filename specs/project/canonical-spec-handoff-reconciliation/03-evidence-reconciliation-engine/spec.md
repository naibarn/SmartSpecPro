# Evidence Reconciliation Engine

## Goal
Reconcile each inventory record into authority, disposition, requirement-level lifecycle, continuation, confidence, successor mapping, blockers, and non-fabricated event history using explicit repository evidence.

## Scope
Implement deterministic evidence collection and reconciliation rules, conservative normative requirement extraction, multi-successor and partial-supersession graph, relevance analysis, continuation assessment, and idempotent per-Spec updates. Do not implement feature requirements or alter normative `spec.md` files.

## User-Facing Behavior
An operator can see why a Spec is active, superseded, retired, unresolved, or recommended for continuation, including residual requirements and cited evidence.

## Technical Constraints
Keep inferred, observed, and manual values distinct. Age is metadata only. History uses observed/inferred/reconciliation/current-transition events and never invents past times. Low/unresolved evidence cannot auto-COMPLETE.

## Dependencies
Splits 01 and 02. Use git history and current source/tests/interfaces only as evidence, not as sole truth.

## Outputs
Reconciliation engine, relationship graph, conservative requirement ledger extractor, continuation policy, per-Spec history, tests, consolidated ambiguity records.

## Edge Cases
Newer revision conflicts with canonical decision; removed legacy implementation intentionally; old security obligation still applies; partial merge leaves one residual; runtime solves requirement through different architecture.

## Error Handling
Conflicts become `AUTHORITY_CONFLICT` and `RECONCILIATION_REQUIRED`; insufficient evidence becomes LOW/UNRESOLVED; no silent winner or false completion.

## Testing Expectations
Authority/supersession graph, continuation decision table, requirement provenance, equivalent capability evidence, manual overrides, idempotence, event timestamps, and all matching scenarios from the parent requirements.
