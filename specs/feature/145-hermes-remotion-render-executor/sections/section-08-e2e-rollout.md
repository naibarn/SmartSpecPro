# Section 08 — End-to-end proof, rollout, and rollback

## Scope

Prove the complete MCP-to-render-to-download path, platform parity and safe
rollout before enabling production routing.

## Owned files and operational assets

- Existing web Vitest integration fixtures for MCP → scheduler → claim → render
  stub → artifact publication → status/download.
- `apps/remotion-executor` fake-control-plane and platform smoke fixtures.
- Python pytest tenant/history fixtures and Rust Cargo compatibility tests.
- CI/release matrix and operator runbook for Windows 11 native, WSL2, macOS
  arm64, macOS x64 and Linux where enabled.

## Evidence gates

1. Section 01 contracts/migration pass with flag off.
2. MCP auth/scope/ACL/download pass without an executor.
3. Executor doctor/fake server/lease/artifact tests pass on declared targets.
4. Deterministic fixture proves idempotency, progress, lease, checksum,
   publication, status and opaque download.
5. Real short image/video/Remotion preview passes on Windows 11 native and both
   macOS architectures; WSL2 is separately proven before its manifest is enabled.
6. Compare Worker App and dedicated outputs for duration, audio, subtitles,
   overlays, checksum, failure/retry and history publication.
7. Enable one non-production tenant, preview-only, then selected production
   tenants while monitoring queue/render/memory/upload/lease/Redis/auth/ACL and
   duplicate-charge metrics.

## Rollback

Set dedicated dispatch kill switch false, hide dedicated MCP submit/connection
tools if necessary, stop new dedicated claims, and reconcile/requeue only with a
contract-compatible executor. Do not delete jobs, artifacts, credentials or enum
values. Worker App is a controlled fallback selected by the scheduler, never an
implicit target mutation.

## Tests first

- deterministic complete flow and all documented error cases;
- duplicate idempotency and no duplicate charge;
- provider auth expiry, unsupported model, worker offline, upload failure,
  cancellation and cross-tenant denial;
- flag-off legacy behavior and kill-switch rollback;
- real platform evidence and parity comparison;
- focused-test report separates repository-wide baseline diagnostics.

## Dependencies and rollback

Depends on Sections 01–07 and is the final implementation gate. Any failed
security, ACL, artifact or platform proof blocks production enablement; the
system remains on existing Worker App/legacy routing.

## UI/UX Contract


### Target User / JTBD
N/A — backend, worker, security, packaging or operational section; no browser task.

### Surface Inventory
N/A — no browser route, component, modal or visual surface is changed.

### Component Map
N/A — no frontend component ownership is introduced.

### State Matrix
N/A — state is represented by server/worker/API contracts and test fixtures, not UI states.

### Responsive Matrix
N/A — no responsive layout is changed.

### Accessibility Acceptance
N/A — no browser interaction is introduced; API/CLI outputs remain bounded and sanitized.

### Copy Contract
N/A — no user-facing browser copy is added; sanitized machine-readable error codes are defined in the section.

### Browser Evidence Required
N/A — browser evidence is not required for this section; end-to-end operational evidence is owned by section-08.
