# TDD Guidance

## Test-first Focus

### 1. Team member role semantics

- add tests for orchestrator-role fallback to lead
- add tests that only one effective orchestrator exists at runtime

### 2. Routine planning

- add tests for daily review aggregation:
  - pending work items
  - unread notifications
  - pending approvals
  - yesterday failures

### 3. Working-hours-aware routing

- add tests that orchestrator does not assign work to off-shift members unless fallback policy allows it

### 4. Approval routing

- add tests for:
  - AI approval path
  - human approval path
  - escalation from AI-review-failed to human review

### 5. Trace and summary

- add tests ensuring room history + summary view includes:
  - planning message
  - delegation record
  - approval outcome
  - final daily summary

## Regression Checks

- existing manual teams still work with `lead` only
- reusable persona across many teams remains valid
- scheduled messages and existing auto-draft presentation flows still work
