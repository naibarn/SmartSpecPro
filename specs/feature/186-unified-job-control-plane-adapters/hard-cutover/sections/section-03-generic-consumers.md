# Section 03 — Generic Consumers

## Objective

Make transport consumers claim and report canonical jobs rather than owning
business lifecycle state.

## Files

- `apps/web/server/services/jobExecutorRegistry.ts`
- `apps/web/server/services/jobExecutor.ts`
- `apps/web/server/jobs/unifiedJobConsumer.ts`
- `python-backend/app/tasks/unified_job_task.py`
- focused web/Python tests

## Requirements

- validate envelope/version before claim
- load context from PostgreSQL by canonical `job_id`
- claim once and invoke the registered handler
- use complete lease/fencing context for every report
- classify handler failures without incrementing attempts on broker retry

## Done when

Duplicate, stale, unsupported-version, cancellation, and handler-failure
tests pass for the implemented Node boundary. The Python boundary remains a
tracked follow-up and is not represented as migrated in the rollout manifest.
