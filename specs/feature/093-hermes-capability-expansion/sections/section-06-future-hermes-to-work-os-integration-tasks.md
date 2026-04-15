# Section 06 - Future Hermes To Work OS Integration Tasks

This task breakdown is the implementation-ready companion for the future integration slice.

## Goal

Let Hermes create and update canonical Work OS records through Feature 082 without creating a parallel work model.

## Target files

- `apps/web/server/services/workerRuntime.ts` if Hermes runtime metadata needs a work-intent hint or surfaced capability flag
- `apps/web/server/services/workerDelegationService.ts` for task-to-work-mode routing and safe delegation handoff
- `apps/web/server/services/teamService.ts` for team-facing binding and work-assist presentation
- `apps/web/server/services/workerSchedulerService.ts` if Hermes-triggered work actions need scheduler-aware dispatch
- `apps/web/server/services/workerCallbackService.ts` for status acknowledgements and lifecycle callbacks
- `apps/web/server/routers/chat.ts` or the relevant Hermes entry router if user intent starts from chat
- `apps/web/server/routers/teamWorkItem.ts` or the canonical Work OS router surface from Feature 082 for create/update operations
- `apps/web/client/src/pages/Teams.tsx` for user-facing summaries
- `apps/web/client/src/pages/AdminMonitoring.tsx` for operator-facing summaries
- `apps/web/client/src/components/orchestrator/*` if Hermes work summaries need to share UI patterns with existing orchestration surfaces

## Task breakdown

### 1. Define intent-to-work mapping

- identify which Hermes intents should create Work OS requests
- identify which intents should update existing cases, tasks, or assignments
- keep ambiguous intents routed to triage

### 2. Add a thin integration adapter

- call Feature 082 APIs only
- forward tenant scope, actor attribution, and trace identifiers
- do not store local Hermes-only work state

### 3. Project canonical state back into Hermes surfaces

- show Work OS status in plain language
- surface queue, approval, exception, and outcome state read-only
- keep internal Work OS jargon out of default user summaries

### 4. Preserve canonical ownership

- reject any write path that bypasses Feature 082
- ensure no parallel queue, case, or approval store appears in Hermes code
- fall back safely when the target or ownership is unclear

### 5. Add regression coverage

- verify canonical work creation and updates happen through Feature 082
- verify ambiguous targets route to triage
- verify tenant isolation and actor attribution survive every write

## Suggested implementation order

1. Define mappings and adapter contract.
2. Add canonical Work OS calls.
3. Add read-only summaries in Hermes UI.
4. Add regression tests.

## Acceptance criteria

1. Hermes can create a canonical `work_request` through Feature 082.
2. Hermes can update a `work_task` or `work_assignment` through Feature 082.
3. Hermes never creates a parallel work model.
4. Unsafe or ambiguous targets route to triage.
5. Work updates preserve tenant isolation and actor attribution.

