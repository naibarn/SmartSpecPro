# Section 04: Regression Tests

## Purpose

Lock the new Team workflow behavior with regression tests so auto-start, review/rework, and terminal-state history cannot regress quietly.

## Scope

This section should concentrate on:

- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
- `apps/web/server/routers/__tests__/teamRoom.test.ts`
- `apps/web/server/services/__tests__` or the nearest existing service test files for run/work-item behavior

## Responsibilities

- Verify `auto_team` starts automatically when a room is created
- Verify `auto_team` asks the LLM planner to build the initial plan from room objective and member/persona context
- Verify every generated plan step has an accountable owner and reviewer selected from active room members
- Verify `auto_team` keeps going through rework loops until the completion gate
- Verify review failures and reviewer comments are visible in the read model
- Verify terminal stop reasons are displayed instead of silent failure
- Verify strict no-fallback behavior for planning, plan review, step review, and final review
- Verify the Team dashboard can render structured workflow data
- Verify detailed attempt audit metadata is reachable from the dashboard
- Verify auto rooms default to the ledger-first view with conversation collapsed
- Verify historical derived rooms are labeled partial when detail is missing

## Test scenarios

- create an `auto_team` room and ensure the run starts without a second click
- create an `auto_team` room and assert the planner call includes room title, objective, language, goal, and member/persona summaries
- return a valid planner response and ensure owner/reviewer assignments persist into the plan artifact
- return an incomplete planner response and ensure the runtime fails the planning gate without repairing it
- return an owner or reviewer ID that is not an active member and ensure the runtime emits a diagnostic planner validation error
- make the reviewer LLM unavailable and ensure the gate fails or pauses with no fallback review
- make the final reviewer LLM unavailable and ensure final acceptance does not proceed through a fallback reviewer
- remove or omit the persisted plan artifact before final review and ensure the run pauses with `final_review_plan_artifact_missing`
- force a review failure and ensure the next attempt is visible as rework
- force more than one rework loop and ensure findings map to the resolving attempt
- ensure a passing review preserves the prior rejected attempt in history
- ensure a stop reason is exposed when completion is impossible
- ensure the dashboard panels render objective, plan, review, and audit timeline data
- ensure the dashboard renders the plan-and-responsibilities section before execution events
- ensure failed strict gates show the specific reason and `noFallbackApplied` metadata
- ensure reload or active-run recovery preserves current gate state and prior history
- ensure pre-feature historical rooms derive a ledger and show reconstructed-state labeling

## Key implementation notes

- Prefer targeted regression tests that model the real lifecycle
- Keep the tests aligned with the structured ledger read model
- Add coverage for both manual and auto flows where they share behavior
- Assert no provider fallback for the strict planner/reviewer paths by checking request options or observable single-attempt behavior where the tests can do so without coupling to provider internals
