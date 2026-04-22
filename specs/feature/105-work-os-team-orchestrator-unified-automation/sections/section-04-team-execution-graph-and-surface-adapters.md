# Section 04 - Team Execution Graph and Surface Adapters

## Goal

Make Team execution plan-driven instead of heuristic-first.

## Ownership boundaries

- Team kickoff seed data
- runEngine plan seeding
- teamRunSkillExecutor routing precedence
- runtime request enrichment

## Current touchpoints

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/teamRunSkillExecutor.ts`
- `apps/web/server/services/agentRuntime/requestBuilder.ts`

## Deliverables

1. Add `teamExecutionPlanService` to hydrate approved plans for Team runtime.
2. Seed `runEngine` with compiled brief and approved step graph at kickoff.
3. Make `teamRunSkillExecutor` honor the plan's explicit step surface and selected capability before using heuristics.
4. Propagate governed-context metadata and source refs into runtime requests.
5. Enforce the approved execution-budget envelope, contract-compatibility state, and per-surface authority checks at runtime dispatch.
6. Compile each executable step to a `RuntimeDispatchPolicy` with retry, timeout, cancellation, idempotency, and dead-letter rules from `appendices/runtime-budget-dispatch-policy.md`.

## Interfaces produced

- `teamExecutionPlanService.getApprovedPlanForRun(input)` returns the approved Team plan plus source snapshots and budget envelope.
- `teamExecutionLaunchService.startApprovedTeamRun(input)` starts Team with compiled brief, approved graph, team resolution, and constraints metadata.
- Runtime dispatch emits plan-vs-actual records for ledger/timeline consumers.
- `teamRunSkillExecutor.buildRuntimeDispatchPolicy(input)` returns authority, compatibility, source-snapshot, budget-reservation, retry, timeout, cancel, and dead-letter decisions for a single plan step.

## Interfaces consumed from earlier sections

- Section 03 provides approved plan, source snapshots, preflight revision, budget envelope, and team resolution.
- Section 02 provides surface governance and contract-compatibility state.
- Section 01 provides compiled brief and source refs.

## Implementation notes

- Keep the current LLM planner, but constrain it with the approved plan.
- Heuristics remain only as fallback behavior for incomplete plans or backward compatibility.
- Team ledger and monitoring snapshots should record the approved step graph and actual step choices side by side.
- If a required approval snapshot has drifted or a privileged surface loses authority at dispatch time, runtime must fail closed and emit diagnostics.
- Runtime must not dispatch a step whose surface is still marked compatibility-blocked by the approved plan.
- Runtime should reserve estimated next-action budget before dispatch and reconcile actual usage after completion.
- Side-effecting steps require stable idempotency keys and prior-attempt verification before retry.
- Dead-lettered steps must preserve recovery hints and provider job ids when available.
- Cancellation must record whether provider cancellation succeeded, is pending, or is unsupported.

## Tests to add first

- runEngine kickoff seed tests
- teamRunSkillExecutor plan-first routing tests
- runtime request builder context-propagation tests
- budget-envelope enforcement tests
- runtime dispatch policy tests for tokens, tools, media, workflow, agency, duration, retries, and cost credits
- timeout, cancellation, and dead-letter tests for long-running media/workflow/agency surfaces
- contract-compatibility enforcement tests
- legacy plan-absent fallback tests
- idempotent dispatch/resume tests for long-running surfaces

## Done when

- Team kickoff can be seeded from an approved plan.
- Planned surface/capability choices win over heuristics where valid.
- Runtime blocks stale, unauthorized, over-budget, and compatibility-blocked steps.
- Retry/cancel/dead-letter behavior is deterministic and auditable for long-running surfaces.
- Direct Team room flows without approved Work OS plans still work.

## Risks

- legacy direct Team room flows may not have an approved preflight plan
- route mismatches between plan and runtime availability

## Mitigations

- support plan-absent fallback for legacy flows
- record explicit route downgrade/block events when a planned surface is unavailable

## Implementation update

- 2026-04-22: added `apps/web/server/services/teamExecutionPlanService.ts` so Team runtime can parse approved Work OS bundles and derive approved-plan artifacts from run metadata.
- 2026-04-22: updated `apps/web/server/services/runEngine.ts` to prefer approved plan artifacts for `auto_team` runs before falling back to legacy heuristics.
- 2026-04-22: updated `apps/web/server/services/teamRunSkillExecutor.ts` so explicit approved-plan surfaces and capability ids win over heuristic routing, including direct `agency` dispatch when the approved step requires it.
