# Section-04 Code Review

## HIGH Severity

- **H-1**: `_update_job_status` uses camelCase kwargs (updatedAt, statusReason, etc.) but SQLAlchemy expects snake_case attribute names
- **H-2**: No `SoftTimeLimitExceeded` handling — Celery's timeout bypasses `except Exception` since it inherits from `BaseException`
- **H-3**: Cost calculation uses `profile.timeout_seconds` as CPU seconds instead of actual duration
- **H-4**: No error handling if Celery dispatch fails after job record committed — orphan job stuck in `accepted`
- **H-5**: Missing `opensandbox-network` on celery-sandbox container per plan spec

## MEDIUM Severity

- **M-1**: Duplicate `FEATURE_PROFILE_MAP` in dispatcher (dead code — dispatcher delegates to profile service)
- **M-2**: `"job" in dir()` is unreliable — should initialize variables before try block
- **M-3**: Artifact service skips S3 when storage_service is None
- **M-4**: Synchronous file I/O in audit inside async context
- **M-5**: No Celery retry for transient sandbox creation failures (plan requires it)
- **M-6**: run-services.sh not updated with sandbox worker management
- **M-7**: Duplicate NON_TERMINAL_STATUSES in dispatcher and worker

## LOW Severity

- **L-1**: No validation of feature_type/execution_mode against enums
- **L-2**: Unrelated celery-import changes in diff
- **L-3**: test_no_retry_on_policy_denied is trivial
- **L-4**: Missing actual state transition test
- **L-5**: Profile cache is per-instance, not process-wide
