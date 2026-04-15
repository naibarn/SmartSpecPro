# Section 07 - Role Monitor UI and Operator Surfaces

## Purpose

This section defines the operator-facing control-plane surfaces that turn the persistent role model into a usable AI operations center.

The goal is to provide one coherent role-centric experience for configuring, observing, and governing AI roles while reusing the monitor, room, and workpack surfaces that already exist in the platform.

## Why this section comes after the backend sections

- The UI must render durable role, routine, checkpoint, workpack, and exception projections rather than inventing placeholder state.
- Typed role communication and exception ownership from Section 05 are required before internal comms and triage panels can be trustworthy.
- Learning and promotion information from Section 06 is required before the operator can safely understand role maturity and autonomy posture.

## Files in scope

- `apps/web/client/src/pages/AutonomousTeamMonitor.tsx` new monitor page
- `apps/web/client/src/pages/RoleAgentDetail.tsx` new role detail page
- `apps/web/client/src/pages/RoleMissionPlanner.tsx` new mission and contract editing surface
- `apps/web/client/src/pages/RoleRoutineScheduler.tsx` new routine configuration surface or integrated panel
- `apps/web/client/src/components/role-monitor/*` new role-monitor components
- `apps/web/client/src/components/orchestrator/RunMonitorPanel.tsx` only where shared layout patterns or reusable subcomponents should be extracted
- `apps/web/client/src/components/orchestrator/TeamRoomView.tsx` only where typed role-communication rendering can be reused or adapted
- `apps/web/client/src/App.tsx` and route wiring for new role-monitor entrypoints
- `apps/web/client/src/pages/__tests__/*` new page and component tests

## Product surface sequence

The first-wave UI should include:

1. Autonomous Team Monitor
2. Role Agent Detail
3. Mission Planner
4. Routine Scheduler
5. Internal Comms Stream
6. Improvement Queue and Shift Review panel

These pages should feel like one connected control room, not a collection of disconnected admin forms.

## Autonomous Team Monitor layout

The default layout should follow the product direction from the spec:

- left rail for the role roster
- center pane for mission timeline, queue, and current activity
- right rail for health, autonomy, budget, connector posture, and drift
- lower pane for exceptions, improvement queue, and replay shortcuts

The monitor should expose:

- current role status
- autonomy tier
- checkpoint freshness
- backlog depth and age
- KPI trend
- active blockers
- routine-cycle state
- deep links into underlying workpack surfaces

This view should reuse current monitor patterns where useful, but its vocabulary must be role-centric.

## Role Agent Detail

The role detail surface should expose:

- active contract version and history
- mission statement and KPI targets
- role-workpack bindings
- routine definitions and next wakes
- active and recent routine cycles
- checkpoint posture
- memory posture
- linked workpack dependency posture
- recent handoffs and communication
- current improvement and promotion state

This page should be the operator's primary debugging and governance view for one virtual worker.

## Mission Planner and Routine Scheduler

These surfaces should let operators:

- activate or edit role blueprints
- define mission and KPI targets
- manage workpack-family bindings and resolution policies
- define routine schedules, triggers, and concurrency policies
- view rollback baselines and safe version posture

The editing experience should make authority boundaries and risky changes visible at the point of configuration, not only during execution.

## Internal Comms Stream

The UI should render typed role-to-role communication distinctly from generic discussion.

The stream should make it obvious:

- who asked whom to act
- what routine or workpack context the message belongs to
- whether the message is informational, blocking, approval-seeking, or handing off ownership
- whether the related work is pending, accepted, blocked, or completed

This surface should reuse the current room-rendering substrate where possible, but typed role metadata must be first-class in the presentation.

## Deep links into Feature 079

Feature 080 should not copy workpack replay, connector, readiness, incident, or ROI surfaces.

The role monitor UI should instead deep-link into current workpack pages for:

- replay and shift review
- connector posture
- exception detail
- readiness blockers
- ROI and intervention history

The role layer should explain why a role depends on those workpack surfaces, then send the operator to the existing source of truth.

## Ownership boundaries

This section owns:

- monitor and role-detail page structure
- role-centric visual vocabulary
- editing affordances for mission and routine configuration
- typed communication presentation
- deep-link pathways into Feature 079 surfaces

This section does not own:

- backend aggregation or command semantics
- role memory or promotion logic
- workpack replay or connector detail payloads
- admin rollout and telemetry backends

## Implementation guidance

1. Start from current control-plane components that already solve live monitor and threaded message presentation problems.
2. Keep the role monitor role-centric in vocabulary even when it reuses run-monitor or room-rendering building blocks.
3. Make authority, autonomy, and blocker state visually obvious. Operators should not have to inspect JSON to understand why a role is paused or downgraded.
4. Use deep links to existing workpack pages instead of reproducing detailed replay, incident, or connector widgets inside the role UI.
5. Keep edit surfaces separated from passive monitoring surfaces so risky contract changes are clearly reviewable.

## TDD expectations

Write the tests for this section before implementation work lands.

- Test: Autonomous Team Monitor renders role roster, mission state, checkpoint freshness, backlog, KPI, and blocker summaries.
- Test: Role Agent Detail renders contract history, routines, bindings, active routine cycle, recent handoffs, and linked workpack posture.
- Test: Mission Planner renders editable mission, KPI, and authority-envelope controls with the expected warning states for risky changes.
- Test: Routine Scheduler renders trigger, schedule, concurrency, and rollback-baseline controls clearly.
- Test: Internal Comms Stream distinguishes typed handoffs, approval requests, escalations, blocks, and summaries from generic chat.
- Test: monitor and detail pages deep-link to existing Feature 079 workpack surfaces for replay, exceptions, readiness, connectors, and ROI.
- Test: UI falls back gracefully when a role is blocked, quarantined, or waiting for safe resume review.

## Done when

This section is complete when operators can configure roles, inspect their current operational posture, understand why they are healthy or blocked, and move into underlying workpack truth surfaces without losing context.
