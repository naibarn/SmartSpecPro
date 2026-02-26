# Section-04 Code Review Interview

## User Decision
User selected: **"Apply all auto-fixes (Recommended)"** followed by **"ทำต่อให้จบ"** (continue to completion).

All auto-fixable items applied. Deferred items noted below.

---

## AUTO-FIXED Items

### H-1: camelCase kwargs in _update_job_status → snake_case
**Action:** Fixed. All `_update_job_status` calls now use snake_case Python attribute names:
`updated_at`, `status_reason`, `started_at`, `finished_at`, `stdout_excerpt`, `stderr_excerpt`, `output_manifest_json`, `opensandbox_id`.

### H-2: No SoftTimeLimitExceeded handling
**Action:** Fixed. Added dedicated `except SoftTimeLimitExceeded:` block before `except Exception:` (since it inherits from `BaseException`). Includes partial output collection attempt and status update to `timed_out`.

### H-3: Cost calculation uses profile timeout instead of actual duration
**Action:** Fixed. Cost now uses `(finished_at_ts - started_at_ts).total_seconds()` for actual duration, with proper CPU core scaling from `profile.cpu_limit`.

### H-4: No error handling if Celery dispatch fails after job record committed
**Action:** Fixed. Added try/except around `_dispatch_celery_task()` in dispatcher. On failure, marks job as `failed` with reason to prevent orphan jobs stuck in `accepted` status.

### H-5: Missing opensandbox-network on celery-sandbox container
**Action:** Fixed. Added `opensandbox-network` to celery-sandbox service networks list AND `opensandbox-network: external: true` to top-level networks section in docker-compose.media.yml.

### M-1: Duplicate FEATURE_PROFILE_MAP in dispatcher
**Action:** Fixed. Removed local copy from dispatcher. Now imports from `sandbox_profiles.py` with `from app.services.sandbox_profiles import FEATURE_PROFILE_MAP  # noqa: F401`.

### M-2: `"job" in dir()` is unreliable variable check
**Action:** Fixed. Initialized `job = None`, `profile = None`, `started_at_ts = None` before try block. Safe access via `job.tenant_id if job else "unknown"` pattern. Added `_emit_failure_audit()` helper for safe attribute access.

### M-5: No Celery retry for transient sandbox creation failures
**Action:** Fixed. Wrapped sandbox provisioning in try/except catching `SandboxProvisionError` and `RetryableHTTPError`, calling `task.retry(exc=prov_err)`.

### M-7: Duplicate NON_TERMINAL_STATUSES in dispatcher and worker
**Action:** Fixed. Both files now derive from `SandboxJobStatus` enum:
```python
_TERMINAL = {"completed", "failed", "timed_out", "canceled"}
NON_TERMINAL_STATUSES = {s.value for s in SandboxJobStatus if s.value not in _TERMINAL}
```

---

## DEFERRED Items

### M-3: Artifact service skips S3 when storage_service is None
**Reason:** Intentional for current phase. S3/R2 integration will be wired in section-05 or later. The `if self._storage is not None:` guard is the correct pattern.

### M-4: Synchronous file I/O in audit inside async context
**Reason:** Acceptable for audit JSONL writes (small, local, fast). Can be optimized later if profiling shows contention.

### M-6: run-services.sh not updated with sandbox worker management
**Reason:** Deferred to section-09 (Hetzner setup) or section-12 (production hardening) where service management is the primary focus.

### L-1 through L-5: Low severity items
**Reason:** Let go. Enum validation (L-1) is not critical for internal services. Other items are minor observations.

---

## Test Results After Fixes
- **36/36 tests passed** in 11.05s
- 7 warnings (AsyncMock with db.add() — harmless)
- All section-03 regression tests also pass
