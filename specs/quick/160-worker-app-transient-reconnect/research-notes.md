# Research notes

## Current flow

- `apps/worker-app/src-tauri/src/commands.rs` probes `/api/workers/:id/policy`
  and falls back to saved-token refresh when the execution token is missing or
  near expiry.
- `probe_worker_access` already recognizes that timeout, 5xx, and 429 are not
  auth verdicts, but the later health command converts refresh errors into
  `healthy: false`.
- `apps/worker-app/src/main.tsx` opens a native reconnect-required dialog for
  every `healthy: false` response and leaves `connectionState === "error"`
  sticky after a later healthy response.
- `apps/worker-app/src-tauri/src/worker_control_plane.rs` uses a 30-second
  control-plane request timeout and exposes status-bearing HTTP errors.
- `apps/web/server/services/workerAuthService.ts` has a 60-second refresh-token
  reuse grace window and returns the same token set for a replay inside it.

## Runtime evidence from the incident window

- `smartspec-web.service` received explicit graceful restart commands at
  07:53:59, 07:54:28, and 07:56:23 on 2026-08-23.
- Current `/healthz` returned 200 and the service was active during diagnosis.
- No cgroup OOM or kill events were observed in the current service window.

## Impacted files

- Rust: `apps/worker-app/src-tauri/src/commands.rs`.
- UI: `apps/worker-app/src/main.tsx`.
- Rust unit tests: colocated test module in `commands.rs`.
- UI/source tests: existing Worker App test conventions are sparse; add the
  smallest deterministic helper coverage available without introducing a new
  test dependency.
