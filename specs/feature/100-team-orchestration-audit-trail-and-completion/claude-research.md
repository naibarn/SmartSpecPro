# Research Notes

## Codebase decision

Codebase research is required because this is an existing git repository with a substantial Team and run-engine implementation.

## Relevant findings

### Team already has structured execution primitives

- `apps/web/server/services/runEngine.ts` already models `team_chat`, `auto_team`, and `review` execution modes.
- The run engine already builds a structured `RunPlanArtifact` with:
  - objective
  - step list
  - owner persona
  - reviewer persona
  - verification method
  - retry rule
  - evidence requirements
  - review status
  - exploration candidates
- The run engine already has explicit stop reasons such as:
  - `max_rounds_reached`
  - `max_duration`
  - `budget_exceeded`
  - `idle_timeout`
  - `awaiting_human_choice`
  - `awaiting_final_approval`
  - `planning_review_failed`

### Work items already track revision and review state

- `apps/web/server/services/workItemService.ts` already supports:
  - `planned`
  - `in_progress`
  - `in_review`
  - `needs_revision`
  - `awaiting_approval`
  - `completed`
  - `failed`
  - `blocked`
  - `cancelled`
  - `superseded`
- The service already records work-item events in `workItemEvents`.
- Review acceptance and rejection are already modeled as structured transitions.
- Revision loops already exist at the data layer, so the missing piece is surfacing and organizing them in the Team UI and run timeline.

### Monitoring already derives runtime state

- `apps/web/server/services/monitoringService.ts` already builds runtime state from run records.
- The runtime state already carries:
  - current phase
  - selected skill
  - route reason
  - review state
  - evidence refs
  - plan artifact
  - status bridge
  - work OS linkage
- The monitoring service already has a general timeline aggregation system for incident-style views, which can inform the Team audit trail design.

### Team UI already has partial run visibility, but the primary mental model is still chat-first

- `apps/web/client/src/pages/Teams.tsx` already:
  - loads team rooms and runs
  - polls for active runs
  - hides manual start controls for `auto_team`
  - auto-starts a run after creating an auto room
  - shows a run monitor panel and workflow panel
- However, the page still presents conversation content prominently and does not yet organize the workflow around:
  - plan
  - assignee
  - reviewer
  - result
  - feedback
  - rework loop
  - final approval

### Existing test coverage

- Targeted tests already exist for:
  - Team page behavior
  - Team room router behavior
  - auto-team start behavior
- The web package uses `vitest` with `npm test`.

## Testing approach

Use the existing Vitest setup in `apps/web`.

Recommended coverage layers:

- service tests for run progression, work-item revision, and approval transitions
- router tests for room/run queries needed by the dashboard
- component tests for the new ledger panels, step cards, review cards, and audit timeline
- regression tests for `auto_team` self-start and continuous execution until terminal state

## Implications for the plan

The codebase already has the underlying state machinery. The implementation plan should focus on:

- reshaping the Team UI around structured workflow data
- making audit events first-class and human-readable
- exposing review/rework loops explicitly
- ensuring `auto_team` continues until evidence-based completion or an explicit stop reason

