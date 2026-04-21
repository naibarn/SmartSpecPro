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

## Implementation notes

- Keep the current LLM planner, but constrain it with the approved plan.
- Heuristics remain only as fallback behavior for incomplete plans or backward compatibility.
- Team ledger and monitoring snapshots should record the approved step graph and actual step choices side by side.
- If a required approval snapshot has drifted or a privileged surface loses authority at dispatch time, runtime must fail closed and emit diagnostics.
- Runtime must not dispatch a step whose surface is still marked compatibility-blocked by the approved plan.

## Tests to add first

- runEngine kickoff seed tests
- teamRunSkillExecutor plan-first routing tests
- runtime request builder context-propagation tests
- budget-envelope enforcement tests
- contract-compatibility enforcement tests

## Risks

- legacy direct Team room flows may not have an approved preflight plan
- route mismatches between plan and runtime availability

## Mitigations

- support plan-absent fallback for legacy flows
- record explicit route downgrade/block events when a planned surface is unavailable
