# Section 04: Web Execution Plumbing and Lineage Capture

## Goal

Extend the web backend so it packages, launches, and traces subagent-aware runs while preserving the current auth and execution envelope.

## Scope

This section covers:

- skill bundle packaging into sandbox execution
- launch context propagation for subagent-aware runs
- lineage and trace metadata capture
- router/API exposure for parent-child runtime details
- preserving the current execution token and authorization model

## Files to touch

- `apps/web/server/services/skillExecutor.ts`
- `apps/web/server/services/skillStudioService.ts`
- `apps/web/server/routers/skills.ts`

## Implementation notes

- Package the new bundle files into sandbox runs so the runtime receives `agents/` and `subagents.json`.
- Keep the existing skip rules for `runs/`, `.git`, virtualenvs, and other generated noise.
- Use the same lineage model for admin-triggered runs, skill studio runs, runtime-driven orchestrator calls, and retry/resume flows.
- Persist parent run IDs, child run IDs, task IDs, bundle version, and verification state in the same metadata path used by current execution traces.
- Preserve the current execution token and tenant scoping so subagent-aware runs do not bypass auth checks.
- Surface run details through the existing skills router so the frontend can consume them without a new API surface.

## Acceptance criteria

- A subagent-aware bundle can be launched through the same web entrypoints as a standard bundle.
- The packaged sandbox payload contains the new contract files and still excludes garbage paths.
- Router responses can describe parent and child lineage without breaking existing consumers.

## Test-first guidance

- Write packaging and route tests before updating UI views.
- Cover file inclusion/exclusion, lineage metadata propagation, and authorization preservation.
