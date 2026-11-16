# Section 02 — Canonical Binding and Read Model

## Deliverable

An additive narrow Harness execution binding tied to exact canonical tenant/workspace, Job, Attempt, Runner and existing execution session. Mission/Conversation are nullable and only attached from trusted explicit Core admission context. Add bounded authorized projection reads; do not duplicate scheduling, lifecycle or events.

## Scope

- SmartSpecPro PostgreSQL migration, binding validator and receipt/admission integration.
- Core SQL projections and authorization tests.

## Prerequisites

- Section 01 Runner identity contract.
- Existing `worker_jobs`, `worker_job_attempts`, `worker_job_events`, `runner_nodes` and `runner_execution_sessions` remain authorities.

## Evidence / remaining gaps

- Additive migration 0442 and exact dispatch/session binding are implemented. A disposable PostgreSQL 15.17 fixture verified the function behavior and narrow role grants; configured DEV migration is still pending.
- Mission is returned as `null` until a trusted explicit Mission-to-Job association is available. Historical executions remain unbound; no guessed backfill is performed.
