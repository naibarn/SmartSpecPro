# Section 05: Runtime Status Projection and UI Visibility

## Goal

Expose the richer automation state to operators so they can immediately see what the run is doing, waiting on, or blocked by.

This section owns the read-model and UI surfaces that render the new runtime overlay.

## What This Section Must Change

### 1. Runtime projection

Expose the latest snapshot-derived runtime overlay through the existing team-run read path.

The read projection should include:

- current runtime phase
- waiting reason
- next poll hint
- reviewer persona
- risk class
- verification state
- evidence summary

### 2. Status labels

Update user-facing labels so they can distinguish:

- actively running
- waiting for worker
- waiting for poll
- awaiting human approval
- blocked
- completed
- failed

Avoid using “paused” as the generic label for async waiting.

### 3. Team surfaces

Update the main operator surfaces that already read `teamRun.get` so they render the richer runtime state:

- Teams page
- Team Room view
- Room workflow panel
- Autonomous team monitor

Keep the Work OS case and request projection aligned with the same status model so the execution overlay and the business-facing case timeline never disagree about the current work state.

If the work originated in Work OS, the Teams status panel should read as a projection of that same case rather than a separate local interpretation.

If a Work OS mirror write is pending or failed, the UI should surface that sync state explicitly instead of implying the case is fully settled.

### 4. Freshness and invalidation

Preserve the existing invalidation and refetch behavior so the UI remains reactive when runtime state changes.

## Files Likely Touched

- `apps/web/server/routers/teamRun.ts`
- `apps/web/server/services/workOsService.ts`
- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- `apps/web/client/src/pages/AutonomousTeamMonitor.tsx`
- `apps/web/client/src/pages/__tests__/Teams.test.tsx`
- `apps/web/client/src/pages/__tests__/AutonomousTeamMonitor.test.tsx`

## Implementation Notes

- Keep the visual language aligned with the existing team/workflow UI.
- The UI should explain why the run has not progressed.
- The runtime overlay should be the source of truth for transient waiting state.
- The Work OS projection should mirror the same underlying transition history for the same case or request.
- The mapping between team-run states and Work OS states should be deterministic and consistent with the canonical status matrix in the spec.
- The terminal `team_runs.status` still matters, but it should not be the only thing the operator sees.
- The current slice adds a runtime summary banner to `RoomWorkflowPanel` and forwards `runtimeState` from `Teams.tsx`, so operators can see phase, reviewer, evidence, and mirror state without leaving the room.

## Completion Criteria

- The user can tell at a glance what the run is waiting for.
- Waiting and blocked states are visible, not implied.
- The UI still works for historical runs and older state rows.
- Run detail refreshes remain stable after mutations or polling updates.
