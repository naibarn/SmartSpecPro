# Section 01: Ledger Runtime

## Purpose

Create the backend foundation for a structured Team ledger so the UI can render objective, LLM-generated plan, step, attempt, review, and terminal-state history.

## Scope

This section should concentrate on:

- `apps/web/server/services/runEngine.ts`
- `apps/web/server/services/callLLMStructured.ts`
- `apps/web/server/services/llmRouter.ts`
- `apps/web/server/services/workItemService.ts`
- `apps/web/server/services/monitoringService.ts`
- `apps/web/server/routers/teamRoom.ts` if new read helpers are needed
- any lightweight aggregation helper needed to compose the Team read model

## Responsibilities

- Standardize the workflow entities that already exist in partial form
- On kickoff and re-plan, send the room title, objective, goal, language, and active assistant member/persona context to the LLM planner
- Require every generated plan step to include a valid owner member, distinct reviewer member when multiple members exist, objective, required evidence, verification method, and retry rule
- Reject unknown owner/reviewer IDs, incomplete steps, schema-invalid planner output, and unavailable planner calls with explicit diagnostic stop reasons
- Ensure step attempts and review outcomes remain visible after revision loops
- Emit or preserve explicit audit events for the important state transitions
- Make terminal reasons and completion evidence available as structured data
- Keep access checks tied to tenant, room, and run scope
- Ensure every automation-visible room entry can be traced back to a step, attempt, review, or terminal event
- Never create a synthetic fallback plan, fallback review, or fallback final review for an `auto_team` run

## Data flow

1. A run starts or resumes from an objective
2. The run engine asks the LLM planner to create a strict plan from the objective and active room personas
3. The plan reviewer validates the generated plan without repair or fallback
4. The work-item service tracks step state, revisions, approvals, and reviewer findings
5. The monitoring service exposes runtime phase, persisted plan snapshot, and terminal reason
6. The Team router returns a read model that the dashboard can render
7. If a required persisted plan snapshot is missing, the runtime exposes that as a missing-plan state instead of reconstructing or synthesizing a substitute plan

## Key implementation notes

- Reuse existing plan artifacts and work-item event history where possible
- Add the smallest aggregation helper needed to expose a coherent read model
- Do not create a second competing source of truth
- Treat LLM planning as a hard gate: invalid schema, unavailable model/provider, missing members, unknown member IDs, or owner/reviewer conflicts must pause the run with a clear error
- LLM planner and reviewer calls for this workflow must disable provider fallback and schema retry fallback so a pass/fail decision is attributable to the actual call
- `getRun` and final review must not synthesize a plan artifact when the persisted audit snapshot is absent
- Preserve rejected attempts instead of overwriting them
- Preserve enough attempt metadata that later sections can expose LLM/provider/prompt drill-down safely

## Tests expected from this section

- work-item revision and approval transitions
- run plan artifact retains owner/reviewer/evidence information
- LLM planner receives room objective and member/persona context before assigning owners and reviewers
- invalid planner owner/reviewer IDs, incomplete steps, or planner unavailability pause the run with explicit diagnostic metadata
- missing persisted plan artifact is exposed as missing evidence instead of being synthesized
- auto-team terminal state and stop reason are preserved
