# Workflow and Lifecycle Integration

## Goal
Make deep-project, deep-plan, deep-plan-quick, deep-implement, Orchestra, session-finish, integration-controller, and verification/deployment evidence flows consume and update the shared handoff model.

## Scope
Update workflow scripts/references and skill behavior tests to initialize handoff/ledger, preserve continuation, bind evidence to exact revisions, and resume from next ready work. Do not revive retired queues/engines or add a second durable work ledger.

## User-Facing Behavior
Starting and resuming engineering work reuses canonical progress and continuation decisions; generated status cannot override requirement or lifecycle evidence.

## Technical Constraints
Use existing WorkUnit and worker_jobs/outbox semantics where runtime scheduling is required. Repository project-local skills may call the common CLI/library. Keep updates fail-safe and backward-compatible where existing workflows lack handoff data.

## Dependencies
Split 01. Consumers must share the same schema/version and agree on update ownership.

## Outputs
Skill/workflow changes, adapters or shared Python helper, handoff behavior tests, updated Orchestra routing/scenarios, exact-SHA evidence contract.

## Edge Cases
Legacy worktree without manifest; resumed task with stale source evidence; integration branch diverges; another session has unrelated dirty files; deployment evidence points at a prior SHA.

## Error Handling
Missing state triggers reconciliation/initialization; stale evidence downgrades completion and requests validation; no caller may silently mark COMPLETE.

## Testing Expectations
Focused contract tests for each consumer family, behavior scenarios, resume/continuation tests, stale exact-SHA evidence and retired-system guard checks.
