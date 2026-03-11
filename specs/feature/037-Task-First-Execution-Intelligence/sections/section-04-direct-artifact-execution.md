# Section 04 — Direct Artifact Execution

## Objective

Allow the runtime to complete selected tasks as artifacts rather than plain text.

## Scope

1. define artifact-oriented execution paths for report and presentation outcomes
2. route presentation tasks between direct completion and deterministic draft pipeline
3. persist artifact linkage to task runs and downstream messages

## Primary files

- `apps/web/server/services/aiPresentationService.ts`
- planner/task runtime services
- artifact persistence/linkage services aligned with Spec 034

## Strategy rules

- Prefer deterministic presentation pipeline when layout/media fidelity matters.
- Allow direct completion/report generation where a strong model can finish the work reliably.
- Persist routeReason so future telemetry can show when direct completion or deterministic routing was chosen.

## Acceptance criteria

1. presentation/report tasks are represented as artifact-oriented task runs
2. the runtime can choose deterministic pipeline vs direct completion intentionally
3. resulting artifacts are linked to runtime/audit records
