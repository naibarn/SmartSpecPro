# TDD plan

## Shared runtime

- Test submit returns a job ID without awaiting a provider that never resolves.
- Test state transitions, bounded error payloads, active pointer ownership, and restart recovery.
- Test enqueue failure is terminal and never invokes a sync fallback.

## Story and prompt expansion

- Test plan worker calls the existing real service with the selected model and persists the story result.
- Test prompt preview result is durable and can be loaded after refresh.
- Test plan failure prevents the dependent deep draft enqueue.

## Legacy and analysis jobs

- Test preset/lineage/source/location/character/duplicate routes return quickly and workers persist results.
- Test source rows move queued -> running -> succeeded/failed exactly once per attempt.
- Test user-confirmed merge remains a DB mutation and does not create an LLM job.

## Shot prompt

- Test reference prompt submit/worker/persist/poll and selected model propagation.

## Billing/security

- Test every job kind supplies skill slug, canonical name, selected model, trace ID, tenant and series/session.
- Test worker retry does not double-settle a call key; explicit rerun creates a new run/charge.
- Test cross-tenant and stale/unbound job reads are rejected.

## Client/completion

- Test queued/running/succeeded/failed/poll-budget-exhausted states.
- Test refresh loads active job and terminal result.
- Test missing dialogue/episode data enqueues repair and does not report complete.

## Regression

- Test the public router source does not directly call the expensive LLM services.
- Run focused Vitest/jsdom tests and `git diff --check`.
