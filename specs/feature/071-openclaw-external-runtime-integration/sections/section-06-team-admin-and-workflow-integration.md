# Section 06: Team, Admin, and Workflow Integration

## Ownership

This section owns user-facing binding and visibility for OpenClaw workers across teams, workflow dispatch, and admin fleet operations.

## Target files and modules

- `apps/web/server/services/teamService.ts`
- `apps/web/server/routers/team.ts`
- `apps/web/server/services/runEngine.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- admin worker UI modules

## Scope

- allow external connectors to bind/unbind to registered workers
- preserve `externalRef`
- surface worker status in Teams UI when bound
- add admin fleet visibility for registered workers
- wire workflow/persona dispatch to the scheduler when a registered worker is involved
- preserve paused-run reasons the current workflow board can still render during rollout

## TDD expectations

- team-service tests for binding/unbinding and duplicate handling
- Teams UI tests for unresolved vs bound states
- admin worker-list tests for status and runtime metadata
- workflow-panel regression tests for external-connector pause display

## Acceptance checks

- users can bind a connector to a worker without losing the historical reference string
- unresolved connectors remain supported
- admin users can inspect and manage OpenClaw workers from SmartSpecPro
- paused runs waiting on OpenClaw still show a valid external-waiting state in the current UI

## Risks and coordination notes

- avoid forcing all teams to migrate immediately
- keep worker-management controls behind appropriate admin/tenant permissions
