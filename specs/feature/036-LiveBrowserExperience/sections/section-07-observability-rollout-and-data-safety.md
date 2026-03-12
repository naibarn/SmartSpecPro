# Section 07: Observability, Rollout, And Data Safety

## Goal

Finish the feature with production-facing protections: metrics, alerts, provider readiness, cleanup jobs, migration safety, evidence retention, and a rollback path that protects existing automation surfaces.

## Scope

- Add live-browser metrics, incident telemetry, and ownership-aware alert routing.
- Add provider readiness checks and feed them into the live release gate.
- Add cleanup jobs for provisioning failures, stale leases, expired sessions, and expired idempotency rows.
- Finalize migration safety, backup, restore, and rollback guidance in implementation artifacts.
- Enforce evidence retention and provider-artifact cleanup policies.
- Add live-session budget, quota, and reconciliation controls.

## Implementation Work

1. Emit metrics for create success/failure, transport readiness, reconnect success, takeover latency, approval latency, assist completion, abandonment, and policy deny rate.
2. Add provider readiness probes and integrate them into the live-browser release gate and user-facing `stream_unavailable` state.
3. Implement scheduled cleanup for stale provisioning sessions, expired sessions, expired controller leases, and expired idempotency rows.
4. Add dashboard and alert routing metadata across frontend, Node, and Python ownership.
5. Implement evidence retention cleanup for provider-originated artifacts and stored handles.
6. Validate backup, rollback, and fail-closed live disablement procedures.
7. Define live-session budget reservation, incremental spend accounting, quota enforcement, and refund or reconciliation paths.

## Tests To Write First

- Test: provider readiness failures disable live-mode entry through the release gate.
- Test: cleanup jobs mark stale provisioning sessions as failed and expired sessions as terminal.
- Test: stale controller leases are cleaned up and emit the expected events.
- Test: metrics and incident hooks fire for create failures, reconnect failures, lease expiry, and provider failures.
- Test: evidence-retention cleanup handles provider-originated artifacts according to retention rules.
- Test: disabling the live release gate stops new live sessions without breaking non-live automation.
- Test: budget exhaustion and quota exhaustion produce explicit blocked states and correct accounting outcomes.

## Files And Areas Likely Touched

- cleanup and maintenance task modules
- release-gate and readiness services
- metrics and audit/logging integrations
- deployment/runbook documentation or planning docs referenced by implementers

## Risks And Guardrails

- Do not let provider health remain implicit or only observable through user failures.
- Keep rollback fail-open for existing non-live features and fail-closed for live mode.
- Ensure retention cleanup does not remove evidence still required by active approvals or unresolved incidents.

## Done Criteria

- Observability and alerting are wired.
- Readiness and cleanup jobs are in place.
- Data safety and rollback paths are explicit.
- Feature rollout can be controlled without destabilizing existing automation surfaces.

## As-Built

- Actual files changed:
  - `apps/web/server/services/liveBrowserGateway.ts`
  - `apps/web/server/services/liveBrowserReadiness.ts`
  - `apps/web/server/services/__tests__/liveBrowserReadiness.test.ts`
  - `apps/web/server/routers/__tests__/liveBrowser.test.ts`
  - `python-backend/app/api/live_browser.py`
  - `python-backend/app/main.py`
  - `python-backend/app/core/celery_app.py`
  - `python-backend/app/services/live_browser_maintenance.py`
  - `python-backend/app/services/live_browser_observability.py`
  - `python-backend/app/services/live_browser_runtime.py`
  - `python-backend/app/tasks/live_browser_tasks.py`
  - `python-backend/tests/test_live_browser_api.py`
  - `python-backend/tests/test_live_browser_tasks.py`
  - `python-backend/tests/integration/test_launch_readiness.py`
  - `python-backend/tests/unit/services/test_live_browser_maintenance.py`
- Deviations from plan:
  - The rollout readiness gate consumes an operational Redis snapshot at `live-browser:readiness` rather than running active provider/runtime probes inside the web tier itself.
  - Cleanup is scheduled through Celery beat and telemetry is durable in Redis, but production dashboard and alert routing integration still sits outside this section's scope.
- Tests added/updated:
  - `apps/web/server/services/__tests__/liveBrowserReadiness.test.ts`
  - `apps/web/server/routers/__tests__/liveBrowser.test.ts`
  - `python-backend/tests/test_live_browser_api.py`
  - `python-backend/tests/test_live_browser_tasks.py`
  - `python-backend/tests/integration/test_launch_readiness.py`
  - `python-backend/tests/unit/services/test_live_browser_maintenance.py`
- Known follow-ups:
  - Publish real provider/runtime readiness probe snapshots into `live-browser:readiness` before tenant rollout depends on the new create-session gate.
  - Bridge Redis-backed live-browser incidents and counters into the production metrics and alert pipeline.
