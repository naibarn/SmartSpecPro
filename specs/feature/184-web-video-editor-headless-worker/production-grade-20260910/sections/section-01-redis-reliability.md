# Section 01 — Redis readiness, memory and queue reliability

## Goal

Keep the web process and Worker queue available while Redis is booting or
reconnecting, without weakening production fail-closed behavior or deleting the
existing RDB/volume.

## Implementation

- Keep Redis as an explicit required dependency for BullMQ, rate limits and
  Worker handoff. `REDIS_URL` is validated and redacted in diagnostics.
- Use a bounded startup retry (10 attempts, 2-second ping timeout, 1-second
  delay) before declaring preflight failure. `/readyz` remains a live DB+Redis
  readiness probe and returns 503 while either dependency is unavailable.
- Keep the active infra compose service's published host port, healthcheck,
  RDB volume and memory budget aligned. Set `start_period` for RDB restore,
  preserve `noeviction` for queue safety, and alert before the cgroup limit is
  reached. Tune maxmemory from measured queue/cache usage instead of guessing.
- Add reconnect metrics: ping latency, consecutive failures, restore duration,
  queue write errors, BullMQ stalled jobs and Redis memory/fragmentation.
- Add a runbook for a stuck Redis container: inspect health/logs and cgroup
  pressure, wait for restore, raise the bounded memory limit if needed, then
  restart the service. Never remove `smartspec_redis_data` as a first response.

## Tests and proof

Unit-test retry/backoff and `/readyz` 200/503 shapes. In staging, delay Redis
startup, restart it during a queued job and verify lease recovery, duplicate
idempotency and no job loss. Capture compose config, health output and metrics.

## Rollback

Disable new editor dispatch with the tenant/operator feature flag; keep the
existing queue and database rows intact. Revert only retry/config changes after
capturing the incident evidence.

## UI/UX Contract

### Target User / JTBD
Editors need to complete the requested media task, understand whether it runs in the browser or Worker, and recover safely from a blocked or failed operation.

### Surface Inventory
The owning editor panel, Worker handoff state, Worker Jobs result/review state, and Dashboard deep link are the required surfaces for this section.

### Component Map
Reuse the existing Phase 3 editor shell and shared operation status components. Add a typed panel state, operation capability badge, progress/error banner and review action where this section owns a user action.

### State Matrix
`idle` → `editing` → `preflight` → `queued` → `running` → `review` → `applied`; `blocked`, `failed`, `canceled`, `stale` and `expired` are explicit recoverable states. No unavailable capability is shown as success.

### Responsive Matrix
Verify the surface at 390x844, 768x1024, 1280x800 and 1440x900. Horizontal timeline overflow is intentional and scrollable; dialogs must remain usable without clipping.

### Accessibility Acceptance
Every action has an accessible name, keyboard path, visible focus, disabled reason and status announcement. Errors identify the next recovery action without exposing tokens, paths or signed URLs.

### Copy Contract
Use `Worker Jobs` / `คิวงาน Worker` for the queue. Use `กำลังตรวจสอบความสามารถ Worker`, `ต้องติดตั้ง Worker adapter`, `รอตรวจสอบผลลัพธ์` and `ผลลัพธ์ล้าสมัย` for the corresponding states.

### Browser Evidence Required
Capture a focused browser trace or screenshot for the happy path and each blocked/error state. Record viewport, operation, capability manifest revision and whether the proof is local, staging or production.
