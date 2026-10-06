# Exhaustive Reconciliation Proof

## Goal
Run and prove a repository-wide reconciliation over all canonical Specs and candidates, close global invariants, and present continuation recommendations plus unresolved legacy ambiguities without implementing legacy features.

## Scope
Execute batch discovery/reconciliation, cross-Spec requirement residual analysis, evidence coverage, review rounds, and final report. Generated metadata is in scope; normative Spec documents and feature runtime code are read-only.

## User-Facing Behavior
The final report answers intended requirement, actual implementation, current relevance, and next justified action for each Spec, with aggregate counts and evidence paths.

## Technical Constraints
Never use Spec number or age for queue order. Ambiguous records are consolidated, not one-by-one user prompts. Completion claims require applicable verification/deployment/acceptance evidence.

## Dependencies
Splits 02, 03, 04, and 05.

## Outputs
Full inventory/reconciliation results, invariant evidence, prioritized continuation and ambiguity reports, ten distinct meaningful review passes, migration summary and open evidence boundaries.

## Edge Cases
Spec moved between roots during run; concurrent canonical ref advance; hidden/nested candidates; missing live production evidence; generated index stale during final verify.

## Error Handling
Any uncertain record remains LOW/UNRESOLVED with next action. Global invariants fail closed. External production claims remain unverified when access/evidence is unavailable.

## Testing Expectations
The 30 parent scenarios plus global discovery/index equality, no false COMPLETE, no continue based solely on incomplete, no DO_NOT_CONTINUE without evidence, no fabricated history, and idempotent complete rerun.
