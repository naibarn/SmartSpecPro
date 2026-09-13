# Section 07 — Python/Celery Compatibility

## Goal

Make Celery and Beat thin adapters using canonical IDs while preserving existing queue behavior during migration waves.

## Files

- Add `python-backend/app/services/job_control_plane.py` and `python-backend/app/tasks/job_adapter.py`.
- Add `python-backend/tests/services/test_job_control_plane.py` and adapter tests.
- Add/update `python-backend/app/core/celery_app.py` only for explicit wrapper registrations/Beat intent entries.
- Add `rollout-manifest.json` with all discovered direct producer call sites and their migration state.

## Requirements

Use existing HTTP/config dependencies to call the web control-plane port. Payloads contain canonical IDs and bounded metadata, never copied mutable business status. Map lease/report errors to stable domain errors. `task.retry()` remains transport-only; `acks_late`, prefetch, time limits, and routing remain runtime controls. Beat creates deterministic occurrence intents only. Legacy task IDs are references and ambiguous bindings are quarantined.

## TDD acceptance

Cover canonical payload shape, client timeout/auth errors, transport-only retry, duplicate Beat occurrence, timezone/missed policy, broker failure, and legacy compatibility.
