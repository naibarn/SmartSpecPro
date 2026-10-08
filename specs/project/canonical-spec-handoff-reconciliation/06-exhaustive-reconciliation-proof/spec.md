# Exhaustive Reconciliation Proof

**Revision:** R1.1 — explicit reconciliation requirements (2026-10-08)

## Normative Requirements

- `R06-01`: Reconciliation MUST discover canonical Specs and candidate records from the configured repository roots; it MUST NOT implement legacy feature behavior.
- `R06-02`: The final report MUST connect each canonical Spec's intended requirements to observed implementation, current relevance, and a justified next action using evidence paths.
- `R06-03`: Generated metadata and repository-wide projections are in scope. Automated batch reconciliation MUST treat normative feature Specs and runtime code as read-only; separately authorized amendments MUST follow the repository's Spec governance and preserve existing contracts.
- `R06-04`: Completion claims MUST use applicable verification, deployment, and acceptance evidence; a source-declared status is not sufficient.
- `R06-05`: Ambiguous records MUST be consolidated for review, and queue order MUST NOT be inferred from Spec number or age.
- `R06-06`: Uncertain records MUST remain LOW or UNRESOLVED with a next action, and global invariants MUST fail closed.
- `R06-07`: Reconciliation outputs MUST include inventory, invariant evidence, prioritized continuation, ambiguity findings, review coverage, migration summary, and unresolved evidence boundaries.
- `R06-08`: The process MUST account for moved Specs, concurrent canonical-ref advances, hidden or nested candidates, missing live production evidence, and stale generated indexes.
- `R06-09`: Validation MUST cover the parent scenarios, discovery/index equality, no false completion, evidence-backed continuation decisions, no fabricated history, and idempotent complete reruns.

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
