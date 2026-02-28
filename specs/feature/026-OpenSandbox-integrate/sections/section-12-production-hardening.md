Now I have a thorough understanding of the entire feature, all dependencies, and what section 12 needs to cover. Let me generate the section content.

# Section 12: Production Hardening and Launch

## Overview

This is the final section in the OpenSandbox integration. It validates that every prior section is functioning correctly, verifies security invariants, defines chaos testing scenarios, establishes a rollback strategy, provides a legacy code removal plan, and documents the launch readiness checklist that must pass before switching from `DISPATCH_MODE=optional` to `DISPATCH_MODE=required`.

Section 12 is not primarily a code-authoring section. It is a verification, testing, and operational hardening section. The deliverables are test suites, scripts, runbooks, and configuration changes -- not new application features.

### Dependencies

This section depends on ALL prior sections being completed:

- **section-06-media-pipeline-migration**: FFmpeg and media subprocess calls must route through sandbox
- **section-07-skill-workflow-migration**: Skill executor and workflow code/HTTP nodes must route through sandbox
- **section-08-router-modifications**: Chat, skills, media, and library routers must integrate sandbox dispatch
- **section-09-hetzner-setup**: Production Hetzner server must be provisioned and reachable
- **section-10-admin-observability**: Admin UI, reconciliation workers, monitoring metrics, and data retention must be operational
- **section-11-config-feature-flags**: Feature flag system and all environment variables must be in place

### What This Section Delivers

1. A **launch readiness gate** script that programmatically verifies all 8 readiness criteria
2. **Chaos test scenarios** (Python pytest) that simulate infrastructure failures
3. A **rollback strategy runbook** with step-by-step instructions for each rollback tier
4. A **legacy path removal plan** for dead code cleanup after rollout
5. A **final security verification** test suite checking network isolation, secret hygiene, and artifact integrity

---

## Tests (Write First)

### 12.1 Launch Readiness Gate Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_launch_readiness.py`

These tests verify that each gate criterion is met. They are designed to run against a real (or staging) environment with `OPENSANDBOX_ENABLED=true`. When any test fails, the system is NOT ready for `required` mode.

```python
"""Launch readiness gate tests for OpenSandbox production hardening.

These tests validate that all prerequisites are met before switching
DISPATCH_MODE from 'optional' to 'required'. Run against staging or
production with OPENSANDBOX_ENABLED=true.

Markers: integration, sandbox, readiness
"""
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestGate1HighRiskFeaturesUseSandbox:
    """Gate 1: All HIGH-risk features execute via sandbox_jobs."""

    async def test_media_ffmpeg_routes_through_sandbox(self):
        """Verify media_job_worker dispatches FFmpeg commands to sandbox when enabled."""

    async def test_skill_sandbox_code_routes_through_sandbox(self):
        """Verify skills with sandbox-code execution mode dispatch to sandbox."""

    async def test_workflow_code_node_routes_through_sandbox(self):
        """Verify workflow code executor uses sandbox instead of RestrictedPython."""

    async def test_library_file_parsing_routes_through_sandbox(self):
        """Verify PPTX/PDF uploads dispatch file parsing to sandbox."""

    async def test_docker_executor_routes_through_sandbox(self):
        """Verify DockerExecutor uses SANDBOX mode when enabled."""

    async def test_presentation_render_ffmpeg_routes_through_sandbox(self):
        """Verify presentation render FFmpeg calls route through sandbox."""


class TestGate2DefaultDenyEgress:
    """Gate 2: Default deny egress verified in all profiles."""

    async def test_code_default_profile_has_deny_network(self):
        """code-default profile: networkDefaultAction = 'deny'."""

    async def test_media_processing_profile_has_deny_network(self):
        """media-processing profile: networkDefaultAction = 'deny'."""

    async def test_file_parser_profile_has_deny_network(self):
        """file-parser profile: networkDefaultAction = 'deny'."""

    async def test_browser_default_profile_has_allow_network(self):
        """browser-default profile: networkDefaultAction = 'allow' (intentional)."""


class TestGate3NoDirectSubprocess:
    """Gate 3: No production service calls subprocess directly when enabled."""

    def test_media_job_worker_no_subprocess_when_enabled(self):
        """When OPENSANDBOX_ENABLED=true, media_job_worker must not call subprocess.run()."""

    def test_factory_orchestrator_no_subprocess_when_enabled(self):
        """When OPENSANDBOX_ENABLED=true, factory_orchestrator must not call subprocess.run()."""

    def test_docker_executor_no_create_subprocess_when_enabled(self):
        """When OPENSANDBOX_ENABLED=true, docker_executor must not call create_subprocess_exec()."""


class TestGate4ImageAllowlist:
    """Gate 4: Image allowlist enforced."""

    async def test_sandbox_profiles_use_known_images(self):
        """All active profiles reference images from an approved registry/list."""

    async def test_tenant_policies_restrict_allowed_images(self):
        """Tenant sandbox policies have allowedImagesJson populated."""


class TestGate5OrphanReconciler:
    """Gate 5: Orphan sandbox reconciler is active."""

    async def test_orphan_cleanup_task_registered(self):
        """Verify the Celery beat schedule includes the orphan cleanup task."""

    async def test_stuck_job_detection_task_registered(self):
        """Verify the Celery beat schedule includes stuck job detection."""


class TestGate6CostTracking:
    """Gate 6: Cost tracking functional."""

    async def test_sandbox_job_records_cost_actual(self):
        """Completed sandbox_jobs have non-null cost_actual."""

    async def test_credit_deduction_on_dispatch(self):
        """Credits are deducted when a sandbox job is dispatched."""

    async def test_credit_reconciliation_on_completion(self):
        """Credits are reconciled (refund overage or charge additional) on completion."""


class TestGate7TenantQuotas:
    """Gate 7: Per-tenant quota enforcement tested."""

    async def test_concurrent_limit_enforced(self):
        """Dispatch is rejected when tenant exceeds maxConcurrentSandboxes."""

    async def test_daily_runtime_limit_enforced(self):
        """Dispatch is rejected when tenant exceeds maxDailyRuntimeSeconds."""


class TestGate8RollbackPlan:
    """Gate 8: Rollback plan tested."""

    def test_disable_sandbox_falls_back_to_legacy(self):
        """Setting OPENSANDBOX_ENABLED=false activates legacy subprocess paths."""

    def test_dispatch_mode_optional_handles_sandbox_failure(self):
        """When DISPATCH_MODE=optional and sandbox fails, legacy path is used."""
```

### 12.2 Chaos Test Scenarios

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_chaos_sandbox.py`

These tests simulate infrastructure failures and verify the system degrades gracefully. They use mocks and fault injection rather than actually killing services.

```python
"""Chaos testing scenarios for OpenSandbox integration.

Simulates infrastructure failures to verify graceful degradation.
Tests use mocks/patches for fault injection -- no real service disruption.

Markers: integration, sandbox, chaos
"""
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestChaosOpenSandboxDown:
    """Scenario: OpenSandbox server killed mid-execution."""

    async def test_sandbox_creation_failure_retries_then_fails(self):
        """Client retries 3 times on create_sandbox failure, then raises."""

    async def test_sandbox_creation_failure_falls_back_when_optional(self):
        """With DISPATCH_MODE=optional, creation failure falls back to legacy."""

    async def test_mid_execution_disconnect_marks_job_failed(self):
        """When connection drops during run_command, job status becomes 'failed'."""

    async def test_mid_execution_partial_output_collected(self):
        """Timeout during execution collects partial stdout/stderr if available."""

    async def test_sandbox_destruction_failure_logged_not_fatal(self):
        """Sandbox destroy failure logs warning; orphan reconciler handles cleanup."""


class TestChaosR2Outage:
    """Scenario: R2/S3 outage during artifact transfer."""

    async def test_input_staging_failure_retries(self):
        """stage_inputs retries on S3 upload failure (transient)."""

    async def test_input_staging_failure_falls_back_when_optional(self):
        """With DISPATCH_MODE=optional, staging failure falls back to legacy."""

    async def test_output_collection_failure_marks_job_failed(self):
        """When collect_outputs fails, job is marked failed with reason."""

    async def test_output_collection_partial_success_handled(self):
        """If 3 of 5 output files collected, artifacts for successful ones are persisted."""


class TestChaosNetworkFlap:
    """Scenario: Network flap between GCP and Hetzner."""

    async def test_circuit_breaker_opens_after_consecutive_failures(self):
        """After 5 consecutive failures, circuit breaker opens and rejects immediately."""

    async def test_circuit_breaker_half_open_allows_probe(self):
        """After timeout_duration, one request is allowed to test recovery."""

    async def test_circuit_breaker_resets_on_success(self):
        """Successful request in half-open state resets to closed."""

    async def test_retry_with_exponential_backoff_on_timeout(self):
        """Timeout errors trigger retry with exponential backoff (1s, 2s, 4s)."""


class TestChaosConcurrentBurst:
    """Scenario: Concurrent sandbox burst exceeding limits."""

    async def test_global_concurrent_limit_rejects_excess(self):
        """When SANDBOX_MAX_CONCURRENT_GLOBAL is reached, new jobs are rejected."""

    async def test_per_tenant_concurrent_limit_rejects_excess(self):
        """When tenant's maxConcurrentSandboxes is reached, new jobs are rejected."""

    async def test_burst_does_not_crash_dispatcher(self):
        """100 simultaneous dispatch requests do not crash the dispatcher service."""

    async def test_rejected_jobs_return_clear_error(self):
        """Rejected jobs return a user-friendly error, not a 500."""


class TestChaosHetznerRestart:
    """Scenario: Hetzner server restart."""

    async def test_health_check_detects_server_down(self):
        """Health monitor detects Hetzner is unreachable within polling interval."""

    async def test_running_jobs_marked_failed_on_server_loss(self):
        """Jobs in 'executing' status are marked 'failed' by stuck job detection."""

    async def test_recovery_after_restart_accepts_new_jobs(self):
        """After Hetzner comes back, new sandbox creation succeeds."""
```

### 12.3 Final Security Verification Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_sandbox_security_final.py`

```python
"""Final security verification for OpenSandbox integration.

Comprehensive checks that sandbox isolation, secret hygiene, and
artifact integrity are maintained across the entire system.

Markers: integration, sandbox, security
"""
import pytest

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestNetworkIsolation:
    """Verify sandbox containers cannot reach host services."""

    async def test_sandbox_exec_network_is_internal(self):
        """The opensandbox-exec Docker network has internal: true."""

    async def test_sandbox_cannot_reach_postgres(self):
        """A sandbox container cannot connect to PostgreSQL on port 5432."""

    async def test_sandbox_cannot_reach_redis(self):
        """A sandbox container cannot connect to Redis on port 6379."""

    async def test_sandbox_cannot_reach_host_services(self):
        """A sandbox container cannot reach localhost services (3000, 8000, 8080)."""

    async def test_deny_profile_blocks_outbound_internet(self):
        """code-default profile sandbox cannot make outbound HTTP requests."""


class TestSecretHygiene:
    """Verify no secrets leak into sandbox environments."""

    def test_sanitize_env_blocks_all_secret_prefixes(self):
        """sanitize_env() blocks OPENAI_, AWS_, R2_, STRIPE_, DATABASE_URL, JWT_, etc."""

    def test_sandbox_env_does_not_contain_database_url(self):
        """Sandbox creation request never includes DATABASE_URL in env vars."""

    def test_sandbox_env_does_not_contain_api_keys(self):
        """Sandbox creation request never includes LLM API keys in env vars."""

    def test_audit_log_does_not_contain_secrets(self):
        """Sandbox audit events do not log decrypted API keys or tokens."""

    def test_signed_urls_have_limited_ttl(self):
        """Artifact signed URLs have max 15-minute TTL by default."""


class TestArtifactIntegrity:
    """Verify artifact checksums and tenant isolation."""

    async def test_artifact_sha256_matches_content(self):
        """SHA-256 checksum stored in sandbox_artifacts matches the actual file content."""

    async def test_artifact_tenant_isolation(self):
        """Tenant A cannot access artifacts belonging to Tenant B."""

    async def test_artifact_signed_url_expires(self):
        """Signed URL returns 403 after TTL expiration."""
```

### 12.4 TypeScript Readiness Verification Tests

**File**: `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/readiness.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Readiness verification tests for the Node.js sandbox integration layer.
 * These validate that the dispatch service, policy resolver, and cost estimator
 * are correctly wired and degrade gracefully.
 */
describe("sandbox readiness verification", () => {
  /**
   * Test: dispatchService.shouldUseSandbox returns true for all sandbox-* modes
   *       when OPENSANDBOX_ENABLED=true
   */

  /**
   * Test: dispatchService.shouldUseSandbox returns false for core-text/llm-only
   *       regardless of OPENSANDBOX_ENABLED
   */

  /**
   * Test: Setting OPENSANDBOX_ENABLED=false causes all dispatch calls
   *       to skip sandbox and return immediately
   */

  /**
   * Test: costEstimator.estimateCost returns valid non-negative number
   *       for all 4 baseline profiles
   */

  /**
   * Test: policyResolver.checkTenantPolicy returns {allowed: true} for
   *       a tenant with no custom policy (uses global defaults)
   */

  /**
   * Test: statusProjection.projectStatus covers all 12 internal statuses
   *       without throwing
   */
});
```

### 12.5 Rollback Verification Tests

**File**: `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_rollback_sandbox.py`

```python
"""Rollback strategy verification for OpenSandbox integration.

Tests that toggling feature flags correctly switches between sandbox
and legacy execution paths without data loss or service disruption.

Markers: integration, sandbox
"""
import pytest
from unittest.mock import patch

pytestmark = [pytest.mark.integration, pytest.mark.sandbox]


class TestRollbackPhase1to4:
    """Phase 1-4: DISPATCH_MODE=optional, rollback by disabling flag."""

    def test_disable_opensandbox_enabled_activates_legacy(self):
        """Setting OPENSANDBOX_ENABLED=false makes all dispatch go to legacy path."""

    def test_in_flight_sandbox_jobs_complete_normally(self):
        """Jobs already in sandbox continue to completion after flag is toggled off."""

    def test_new_jobs_use_legacy_after_disable(self):
        """New jobs dispatched after disabling use subprocess/legacy path."""

    def test_sandbox_jobs_table_unaffected_by_rollback(self):
        """Existing sandbox_jobs records remain intact after rollback."""


class TestRollbackPhase5Plus:
    """Phase 5+: DISPATCH_MODE=required, selective rollback strategies."""

    def test_disable_per_feature_sandbox_require_for_media(self):
        """Setting SANDBOX_REQUIRE_FOR_MEDIA=false falls back media to legacy."""

    def test_disable_per_feature_sandbox_require_for_skills(self):
        """Setting SANDBOX_REQUIRE_FOR_SKILLS=false falls back skills to legacy."""

    def test_reduce_tenant_concurrency_to_zero(self):
        """Setting maxConcurrentSandboxes=0 blocks all sandbox jobs for tenant."""

    def test_emergency_legacy_override(self):
        """Setting OPENSANDBOX_ENABLED=false overrides DISPATCH_MODE=required."""
```

---

## Implementation Details

### 12.A -- Launch Readiness Gate Script

**New file**: `/home/dev/projects/SmartSpecPro/scripts/sandbox-readiness-check.sh`

A bash script that runs the complete readiness verification. It checks all 8 gates programmatically and produces a pass/fail report. This script must be run BEFORE changing `DISPATCH_MODE` from `optional` to `required`.

The script performs these checks:

1. **Gate 1 -- High-risk features use sandbox**: Queries `sandbox_jobs` table to verify that jobs for each feature type (`media`, `skill`, `workflow`, `library`) have been created in the last 24 hours. If any feature type has zero sandbox jobs, the gate fails.

2. **Gate 2 -- Default deny egress**: Queries `sandbox_profiles` table to verify that `code-default`, `media-processing`, and `file-parser` profiles have `networkDefaultAction = 'deny'`. Confirms `browser-default` has `networkDefaultAction = 'allow'` (intentional exception for HTTP egress).

3. **Gate 3 -- No direct subprocess**: Runs a `grep -rn` scan of the Python backend source for `subprocess.run`, `subprocess.Popen`, `create_subprocess_exec` calls that are NOT behind a `OPENSANDBOX_ENABLED` check. The scan excludes test files and the MockSandboxBackend.

4. **Gate 4 -- Image allowlist**: Queries `sandbox_profiles` to verify all `baseImage` values match an approved list (configurable in the script). Checks that tenant policies with `allowedImagesJson` have at least one entry.

5. **Gate 5 -- Orphan reconciler active**: Checks `celery_app.conf.beat_schedule` for the orphan cleanup and stuck job detection tasks. Alternatively, queries the Celery inspect API to confirm beat tasks are registered.

6. **Gate 6 -- Cost tracking**: Queries `sandbox_jobs WHERE status = 'completed' AND cost_actual IS NOT NULL` in the last 24 hours. If zero rows, cost tracking is not functional.

7. **Gate 7 -- Tenant quotas**: Runs the pytest test class `TestGate7TenantQuotas` and checks for pass.

8. **Gate 8 -- Rollback plan**: Runs the pytest test class `TestRollbackPhase1to4` and checks for pass.

The script outputs a summary table:

```
Gate | Description                          | Status
-----|--------------------------------------|--------
  1  | High-risk features use sandbox       | PASS
  2  | Default deny egress                  | PASS
  3  | No direct subprocess                 | PASS
  4  | Image allowlist enforced             | PASS
  5  | Orphan reconciler active             | PASS
  6  | Cost tracking functional             | PASS
  7  | Tenant quota enforcement             | PASS
  8  | Rollback plan tested                 | PASS
-----|--------------------------------------|--------
RESULT: ALL GATES PASSED -- Ready for DISPATCH_MODE=required
```

If any gate fails, the script exits with code 1 and prints specific remediation instructions.

### 12.B -- Chaos Testing Infrastructure

The chaos tests in `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_chaos_sandbox.py` use mock-based fault injection. They do NOT kill real services. The injection patterns are:

**OpenSandbox Down**: Patch the httpx client in `python-backend/app/integrations/opensandbox/client.py` to raise `httpx.ConnectError` or `httpx.ReadTimeout`. Verify:
- Retry logic attempts 3 times with exponential backoff (per tenacity configuration in section-03)
- Circuit breaker opens after 5 consecutive failures (per pybreaker configuration in section-03)
- When `DISPATCH_MODE=optional`, the sandbox dispatcher falls back to legacy subprocess execution
- When `DISPATCH_MODE=required`, an error is returned to the caller with a user-friendly message

**R2 Outage**: Patch the S3/R2 upload/download functions in `python-backend/app/integrations/opensandbox/files.py` to raise `botocore.exceptions.ClientError`. Verify:
- Input staging retries on transient errors (5xx status codes)
- Output collection failure marks the job as `failed` with `statusReason` explaining the storage error
- Partial output collection is handled (some artifacts succeed, others fail -- successful ones are persisted)

**Network Flap**: Alternate the httpx mock between success and failure on consecutive calls. Verify:
- Circuit breaker state transitions: closed -> open -> half-open -> closed
- Exponential backoff timing (1s base, 10s max, per tenacity configuration)
- After recovery, new jobs succeed without manual intervention

**Concurrent Burst**: Use `asyncio.gather` to dispatch 100 sandbox job requests simultaneously. Verify:
- The dispatcher does not crash or deadlock
- Jobs exceeding `SANDBOX_MAX_CONCURRENT_GLOBAL` or `SANDBOX_MAX_CONCURRENT_PER_TENANT_DEFAULT` are rejected with clear error messages
- Accepted jobs proceed normally
- Database connection pool is not exhausted

**Hetzner Restart**: Patch the health check endpoint to return failures, then switch to success. Verify:
- The health monitor (from section-10) detects the outage within its polling interval
- Jobs in `executing` status are detected by the stuck job reconciler and marked `failed`
- After recovery, new sandbox creation succeeds

### 12.C -- Rollback Strategy Runbook

**New file**: `/home/dev/projects/SmartSpecPro/docs/runbooks/sandbox-rollback.md`

This runbook is the operational reference for rolling back the sandbox integration at any phase. It covers three rollback tiers:

**Tier 1: Full Sandbox Disable (fastest, any phase)**

Use when: OpenSandbox server is down, critical bug in sandbox dispatch, or data integrity concern.

Steps:
1. Set `OPENSANDBOX_ENABLED=false` in environment variables
2. For apps/web: `sudo systemctl restart smartspec-web.service`
3. For python-backend: `sudo systemctl restart smartspec-backend.service`
4. In-flight sandbox jobs will remain in their current state. The stuck job reconciler will mark them as `failed` after timeout
5. All new workloads immediately use legacy subprocess paths
6. Verify: `curl -s http://localhost:8000/health` returns 200, `curl -s http://localhost:3000/api/health` returns 200
7. Monitor JSONL audit logs for any `sandbox_dispatch_failed` events that should now be absent

**Tier 2: Per-Feature Disable (selective, Phase 5+)**

Use when: Sandbox works for most features but one feature type has issues.

Steps:
1. Set `SANDBOX_REQUIRE_FOR_MEDIA=false` (or `SANDBOX_REQUIRE_FOR_SKILLS=false`) as needed
2. Restart the affected service
3. The specific feature type falls back to legacy while others remain on sandbox
4. Verify by creating a job of the affected type and confirming it uses the legacy path

**Tier 3: Tenant-Level Disable (targeted, Phase 5+)**

Use when: A specific tenant experiences sandbox issues.

Steps:
1. Update `tenant_sandbox_policies` for the affected tenant: set `maxConcurrentSandboxes = 0`
2. This blocks all new sandbox jobs for that tenant without affecting others
3. Jobs already in-flight continue to completion
4. To re-enable: set `maxConcurrentSandboxes` back to the previous value

**Emergency Override:**

If `DISPATCH_MODE=required` and sandbox is completely unavailable:
1. Set `OPENSANDBOX_ENABLED=false` -- this OVERRIDES `DISPATCH_MODE=required`
2. All sandbox-mode workloads fall back to legacy even though `required` is set
3. This is the escape hatch for catastrophic sandbox failure

### 12.D -- Legacy Path Removal Plan

After the sandbox system has been running in `DISPATCH_MODE=required` mode for at least 30 days with no rollbacks, the legacy subprocess execution paths can be removed. This section documents what to remove and in what order.

**Phase 1 -- Remove feature flag conditionals (safe cleanup)**

Files to modify:
- `/home/dev/projects/SmartSpecPro/python-backend/app/video/sandbox_runner.py`: Remove the `if not self._enabled` branch in `run_command()` that falls back to `subprocess.run()`. Make sandbox the only path.
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/data_executors/code_executor.py`: Remove `_execute_restricted()` (RestrictedPython path). Make `_execute_in_sandbox()` the only path.
- `/home/dev/projects/SmartSpecPro/python-backend/app/orchestrator/node_executors/integration_executors/http_executor.py`: Remove `_execute_direct()` for external URLs. Keep it for internal URLs.
- `/home/dev/projects/SmartSpecPro/python-backend/app/services/docker_executor.py`: Remove `HOST` and `DOCKER` execution modes. Keep only `SANDBOX`.
- `/home/dev/projects/SmartSpecPro/apps/web/server/services/skillExecutor.ts`: Remove the `executePythonSkill()` subprocess spawn path.

**Phase 2 -- Remove dead code (after Phase 1 is stable for 7 days)**

Files to consider removing entirely:
- RestrictedPython dependency from `requirements.txt` (if only used in code_executor)
- `SandboxMediaRunner.__aexit__` no longer needs to check `self._enabled` before destroying sandbox
- Mock sandbox backend (only needed for development without OpenSandbox)

**Phase 3 -- Simplify configuration**

Environment variables to remove:
- `OPENSANDBOX_ENABLED` (always true)
- `OPENSANDBOX_DISPATCH_MODE` (always required)
- `SANDBOX_REQUIRE_FOR_SKILLS` (always true)
- `SANDBOX_REQUIRE_FOR_MEDIA` (always true)

### 12.E -- Final Security Verification

The security verification in `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_sandbox_security_final.py` covers three domains.

**Network isolation verification:**
- Confirm the `opensandbox-exec` Docker network is configured with `internal: true` by inspecting the Docker network configuration via `docker network inspect opensandbox-exec`
- Verify that a sandbox container on the `opensandbox-exec` network cannot connect to `localhost:5432` (PostgreSQL), `localhost:6379` (Redis), `localhost:3000` (web), or `localhost:8000` (backend)
- Verify that a sandbox using the `code-default` profile (network deny) cannot make outbound HTTP requests

**Secret hygiene verification:**
- Call `sanitize_env()` from `python-backend/app/orchestrator/sandbox.py` with a comprehensive set of environment variables and verify ALL blocked prefixes are removed (OPENAI_, AWS_, R2_, STRIPE_, DATABASE_URL, JWT_, CONTROL_PLANE_, ORCHESTRATOR_)
- Verify that sandbox creation requests (the HTTP POST to OpenSandbox) do not include any environment variables matching secret patterns
- Verify that JSONL audit events for sandbox jobs do not contain decrypted secrets by pattern-matching for common key formats (sk-, Bearer, postgresql://)
- Verify that signed URLs generated by the artifact access service have a maximum TTL of 15 minutes by default

**Artifact integrity verification:**
- Upload a known file to a sandbox, collect the output, verify the SHA-256 checksum matches
- Attempt to access an artifact belonging to Tenant B using Tenant A's credentials -- expect null/403
- Generate a signed URL, wait for TTL expiration, verify the URL returns 403

### 12.F -- Celery Beat Schedule Updates for Reconciliation

The orphan cleanup and stuck job detection tasks (defined in section-10) must be registered in the Celery beat schedule. Verify these entries exist in `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py`:

```python
# Expected beat_schedule entries (from section-10, verified here):
"cleanup-sandbox-orphans": {
    "task": "app.tasks.sandbox_tasks.cleanup_orphan_sandboxes",
    "schedule": crontab(minute="*/10"),  # Every 10 minutes
},
"detect-stuck-sandbox-jobs": {
    "task": "app.tasks.sandbox_tasks.detect_stuck_jobs",
    "schedule": crontab(minute="*/5"),  # Every 5 minutes
},
"cleanup-sandbox-artifacts": {
    "task": "app.tasks.sandbox_tasks.cleanup_expired_artifacts",
    "schedule": crontab(hour=4, minute=0),  # Daily at 4:00 AM UTC
},
"sandbox-hetzner-health": {
    "task": "app.tasks.sandbox_tasks.check_hetzner_health",
    "schedule": 60.0,  # Every 60 seconds
},
```

Also verify that the `celery-sandbox` queue is listed in `REQUIRED_QUEUES` and `task_queues`:

```python
REQUIRED_QUEUES = ["celery", "video", "media", "presentation_export", "presentation_import", "celery-sandbox"]

# In task_queues:
Queue("celery-sandbox"),

# In task_routes:
"app.tasks.sandbox_tasks.cleanup_orphan_sandboxes": {"queue": "celery-sandbox"},
"app.tasks.sandbox_tasks.detect_stuck_jobs": {"queue": "celery-sandbox"},
"app.tasks.sandbox_tasks.cleanup_expired_artifacts": {"queue": "celery-sandbox"},
"app.tasks.sandbox_tasks.check_hetzner_health": {"queue": "celery-sandbox"},
"app.workers.sandbox_job_worker.execute_sandbox_job": {"queue": "celery-sandbox"},
```

---

## Files to Create

| File | Description |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_launch_readiness.py` | Launch readiness gate tests (8 gates) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_chaos_sandbox.py` | Chaos testing scenarios (5 failure types) |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_sandbox_security_final.py` | Final security verification tests |
| `/home/dev/projects/SmartSpecPro/python-backend/tests/integration/test_rollback_sandbox.py` | Rollback strategy verification tests |
| `/home/dev/projects/SmartSpecPro/apps/web/server/services/sandbox/__tests__/readiness.test.ts` | TypeScript readiness verification tests |
| `/home/dev/projects/SmartSpecPro/scripts/sandbox-readiness-check.sh` | Launch readiness gate script |
| `/home/dev/projects/SmartSpecPro/docs/runbooks/sandbox-rollback.md` | Rollback strategy runbook |

## Files to Modify

| File | Changes |
|---|---|
| `/home/dev/projects/SmartSpecPro/python-backend/app/core/celery_app.py` | Verify `celery-sandbox` queue and sandbox task routes are present (from section-04/10), add any missing reconciliation task registrations |
| `/home/dev/projects/SmartSpecPro/python-backend/pyproject.toml` | Add `readiness`, `chaos`, `security` pytest markers |

---

## Implementation Checklist

1. Write all Python test files (readiness, chaos, security, rollback) with pytest markers
2. Write the TypeScript readiness test file
3. Create the `scripts/sandbox-readiness-check.sh` script
4. Create the `docs/runbooks/sandbox-rollback.md` runbook
5. Add new pytest markers (`readiness`, `chaos`, `security`) to `pyproject.toml`
6. Verify Celery beat schedule has all reconciliation tasks registered
7. Verify `celery-sandbox` queue is in `REQUIRED_QUEUES` and `task_queues`
8. Run all readiness tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m "sandbox and readiness" -v`
9. Run chaos tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m "sandbox and chaos" -v`
10. Run security tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m "sandbox and security" -v`
11. Run rollback tests: `cd /home/dev/projects/SmartSpecPro/python-backend && pytest -m "sandbox and integration" -v`
12. Run TypeScript readiness tests: `cd /home/dev/projects/SmartSpecPro/apps/web && pnpm test -- --grep readiness`
13. Run the readiness gate script: `bash /home/dev/projects/SmartSpecPro/scripts/sandbox-readiness-check.sh`
14. Verify all 8 gates pass
15. After all gates pass, update environment: `OPENSANDBOX_DISPATCH_MODE=required`
16. Restart services and verify system operates correctly in required mode
17. Monitor JSONL audit logs for 24 hours to confirm no fallback events