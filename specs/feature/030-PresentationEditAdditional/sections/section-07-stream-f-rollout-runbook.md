# Section 07: Stream F Rollout Runbook

## Objective
Operationalize safe rollout with measurable promotion gates, representative canary traffic, and fast rollback execution.

## Scope
- Document worker operational commands and ownership paths.
- Define rollout stages and hold criteria.
- Add canary cohort composition requirements.
- Add alert windows and rollback SLA enforcement.

## Dependencies
- Requires Sections 05 and 06 outputs.

## Target Files
- `specs/feature/030-PresentationEditAdditional/` runbook and rollout docs
- operational docs that reference `celery-presentation` and export monitoring

## TDD First (Stubs)
- Stub: runbook includes restart/status/log commands for `celery-presentation`.
- Stub: stage policy contains dogfood -> 1% -> 5% -> 25% -> 50% -> 100% and hold rule.
- Stub: canary cohort gates include media-heavy, dense-layout, and low-complexity baseline mix.
- Stub: stop conditions and rollback ownership are explicit.
- Stub: alert windows (5m and 30m) and rollback SLA timings are explicit.

## Implementation Tasks
1. Write runbook steps for detect, diagnose, rollback, and verify recovery.
2. Encode stage-gate checklist with representative cohort requirements.
3. Add threshold stop conditions and authority map for rollback execution.
4. Define mandatory rollback rehearsal at <=5% before 25% promotion.

## Validation
- Dry-run checklist in staging can be executed without missing steps.
- Alert and SLA fields are present and actionable.
- Ownership and escalation contacts are explicit.

## Risks and Rollback
- Risk: operational ambiguity causes delayed response during incidents.
- Rollback: freeze stage promotion until runbook gaps are resolved.

## Done Criteria
- Runbook and rollout policy are complete, testable, and approved.
