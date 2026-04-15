# Section 06: Teams UI Plan Visibility and Continuous Plan Inspection

## Goal

Make the Teams UI show the current plan continuously so operators can inspect the decomposition, ownership, review chain, and evidence while the run is in flight.

This section owns the plan panel or equivalent view that sits alongside the runtime status display.

## What This Section Must Change

### 1. Plan visibility

Add a plan panel or equivalent Teams UI region that can display the current durable plan for the active run.

The plan view should show, at minimum:

- the goal or topic
- the subtask breakdown
- the owner for each subtask
- the reviewer for each subtask
- the status of each subtask
- the evidence already written
- the verification criteria that remain

### 2. Continuous refresh

The plan view must refresh while the run is active so the operator can inspect it at any time.

It should be clear whether the team is:

- still planning
- executing a planned step
- waiting on review
- waiting on a worker result
- blocked by policy
- ready for the next step

### 3. Teams integration

Prefer using the existing Teams and room workflow surfaces rather than adding a disconnected planning page.

The plan should be visible in the same operator context that already shows team status and run controls.
If the work came from Work OS, the plan should clearly inherit the Work OS case/request objective and keep the same case identity visible alongside the plan.

## Files Likely Touched

- `apps/web/client/src/pages/Teams.tsx`
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx`
- `apps/web/client/src/components/orchestrator/RoomWorkflowPanel.tsx`
- `apps/web/client/src/pages/__tests__/Teams.planVisibility.test.tsx`
- any plan-read service or query used to surface the durable plan

## Implementation Notes

- Feed the UI from the durable plan artifact introduced in section 1.
- Keep the plan readable enough that operators can reason about ownership and next steps at a glance.
- Avoid a separate product shell unless the existing Teams surfaces cannot reasonably carry the plan panel.
- The plan view should remain durable and refreshable throughout execution.

## Completion Criteria

- The Teams UI always exposes the current plan for the active run.
- Ownership, reviewer, status, and evidence are visible at a glance.
- Operators can inspect the plan without waiting for completion.
- The UI still works for runs that are only partially planned or waiting for review.
- The plan never appears as a disconnected duplicate when the case already exists in Work OS.
