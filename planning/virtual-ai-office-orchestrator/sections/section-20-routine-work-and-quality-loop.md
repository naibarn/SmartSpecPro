# Section 20: Routine Work And Quality Loop

## Goal

Turn schedules and inbox tasks into durable work items that move through a multi-member quality loop instead of one-shot execution.

## Deliverables

- routine catalog model
- work item state machine
- morning supervisor flow
- review/revision loop rules
- daily summary and carry-over rules

## Required Rules

- schedules wake the orchestrator or intake layer first
- work is represented as explicit work items, not only transient chat turns
- every meaningful work step must also be posted into the team room as a visible work update, critique, suggestion, revision, or decision
- medium-risk and high-risk artifacts require an independent review step before completion
- rejected work returns to `needs_revision` rather than being silently dropped
- all work item transitions must be mirrored into room history and summary outputs

## Baseline Work Item States

- `planned`
- `triaged`
- `researching`
- `drafting`
- `in_review`
- `needs_revision`
- `awaiting_approval`
- `scheduled_for_delivery`
- `completed`
- `failed`
- `blocked`

## Morning Supervisor Loop

1. inspect routines due today
2. inspect open carry-over work
3. inspect yesterday summaries and failures
4. inspect unread alerts and pending approvals
5. create/update work items
6. publish the daily plan into the room

## Collaboration Pattern

The room timeline should allow a pattern like:

1. agent A posts research findings and draft output with citations
2. agent B replies with creative or presentation improvements
3. agent C replies with critique, missing angles, or conversion guidance
4. agent A posts a revision
5. reviewer/approver posts decision
6. orchestrator posts final ready-to-deliver status

## Acceptance Clues

- the system can explain why a work item is open, who owns it now, and what gate is blocking completion
- yesterday's failures are visible and actionable in today's planning loop
- the room timeline shows the full chain of research post, peer feedback, revision, and final decision for important work items
