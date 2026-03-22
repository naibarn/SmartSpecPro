# Implementation Plan

## Objective

Enable SmartSpec teams to behave like autonomous daily workers:

- start work automatically
- inspect pending work and yesterday's outcomes
- identify failures and unread alerts
- discuss internally as a team
- produce artifacts and send them through approval
- leave a complete inspectable trace in room chat and summaries

## Current Codebase Fit

The existing platform already has the right primitives:

- persona identity and working hours
- durable teams and team members
- rooms and run history
- scheduler infrastructure
- approval APIs
- notifications and SSE
- summary generation

The biggest missing piece is the runtime coordination layer that turns these primitives into a daily operating system for virtual workers.

## Recommended Domain Model

### 1. Keep persona as identity

Persona should continue to hold:

- expertise
- style
- nickname
- language/gender/tone
- working hours

### 2. Add team member role semantics

Extend `assistant_profiles` with role concepts such as:

- `orchestrator`
- `specialist`
- `reviewer`
- `publisher`

Backward compatibility rule:

- if no explicit orchestrator role exists, the current `isLead=true` member acts as orchestrator

### 3. Add routine work definitions

Introduce a durable routine catalog per team/member:

- routine name
- schedule
- source inputs
- execution playbook
- expected outputs
- approval route
- fallback/retry policy
- success metrics

### 4. Add work item / backlog model

The orchestrator needs a first-class “what needs doing” layer:

- routine-generated work items
- manually created assignments
- recovered failed jobs
- follow-ups from yesterday
- unread alerts / pending approvals

### 5. Add daily review loop

Before routine execution starts, the orchestrator should run a daily review pass:

- inspect unfinished work
- inspect yesterday summaries
- inspect failed or partial jobs
- inspect unread notifications
- inspect pending approvals
- generate today's plan

## Architecture

### Phase 1: Supervisor mode

Goal:

- orchestrator summarizes and plans automatically each morning
- does not yet fully self-delegate across the team

Flow:

1. scheduler triggers a team routine run
2. orchestrator member loads:
   - open work items
   - previous day summaries
   - pending notifications
   - pending approvals
   - recent failures
3. orchestrator posts a planning message in the team room
4. user sees daily plan / risk digest / recommendations

### Phase 2: Delegating orchestrator

Goal:

- orchestrator can assign work to specialists automatically

Flow:

1. orchestrator decomposes daily work into tasks
2. runtime chooses next speaker/member using team policy plus working-hours availability
3. specialist members execute subtasks
4. reviewer/publisher members validate output
5. approval gate sends either:
   - AI reviewer approval
   - human approval request

### Phase 3: Adaptive office

Goal:

- team learns from repeated work and proposes improvements

Flow:

- use historical summaries, failures, and accepted outputs to refine:
  - recurring task list
  - routing rules
  - review criteria
  - staffing suggestions

## Impact Analysis

### Positive

- natural fit with existing team abstractions
- routine automation can reuse scheduler stack
- chat history and room summaries already support inspectability
- approval and notification surfaces already exist

### Risks

- without a work-item layer, autonomous runs will become “smart chat” without dependable operations
- persona edits can affect many teams because persona is reusable
- budget/cost can spike if full-team autonomy runs too freely
- stale external dependencies (news, auth, channels) will cause frequent failed routines unless health checks exist
- approval fatigue if every step requests human review

### Mitigations

- add explicit work-item state machine
- keep persona reusable but move team-specific policy into profile/runtime
- gate autonomy with budget caps, max rounds, and approval policy
- add preflight checks for data sources, credentials, and provider health
- support approval by class of action, not one approval per low-risk step

## Acceptance Criteria

- one persona can remain attached to many teams with no architectural conflict
- each team can designate an orchestrator-compatible member
- scheduler can kick off a daily review run automatically
- orchestrator can produce:
  - pending work summary
  - yesterday success/failure digest
  - proposed daily plan
- room history preserves traceable discussion and summary output
- approval routing can send tasks either to AI reviewer or human approver

## Rollout Notes

- start with read-mostly autonomy: summarize, inspect, propose
- then enable delegation for low-risk routines
- finally enable artifact publishing with approvals
