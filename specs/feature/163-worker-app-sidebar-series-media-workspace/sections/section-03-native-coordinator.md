# Section 03 — Native root, coordinator, and Control Plane client

## Goal

Implement typed Tauri commands, secure local root/cache state, singleton
background coordinator, durable checkpoint/recovery, and REST client calls.

## Files

- Extend `apps/worker-app/src-tauri/src/control_plane.rs` with typed Series,
  binding, workspace, Quick Action calls and request-proof headers.
- Add native modules for root manager, HMAC fingerprint, local cache/job store,
  coordinator and commands; register in existing Tauri command wiring.
- Reuse `credentials.rs`/`settings.rs` secure boundaries; add Rust tests.

## Required behavior

Commands: `pick_local_root`, `validate_local_root`, `scan_preview`,
`get_local_workspace_status`, `revoke_local_root`. Absolute paths stay in
protected native state and are displayed locally only. Root ID is opaque;
fingerprint is versioned device-keyed HMAC over canonical path/filesystem
identity/workspace mode. Reject symlink/junction/reparse escapes, unstable
files, hidden roots, unsupported files, recursion, and unsafe cleanup.

Persist only safe webview projections, encrypt/OS-protect cache and credentials
where available, expire/invalidate cache on unpair/account/tenant/root revoke.
One native coordinator owns heartbeat/claim/upload/GPU lease; multiple windows
subscribe. Jobs pin root/binding/policy/source/idempotency/remote execution and
reconcile/quarantine on restart or revoke.

## TDD requirements

Test path safety, HMAC determinism/rotation, redaction, cache invalidation,
checkpoint atomicity, singleton coordinator, offline authority blocking,
recovery/quarantine, and typed request/response/error mapping.

## Acceptance

Native Worker can bind and monitor a local root without leaking path or token,
and restart/revoke behavior is deterministic.

## UI/UX Contract

### Target User / JTBD
N/A — native boundary; expose safe progress and recovery to Worker shell.
### Surface Inventory
N/A — typed Tauri commands only.
### Component Map
N/A — Rust root manager/coordinator and typed event bridge.
### State Matrix
Expose disconnected, validating, ready, scanning, blocked, stale, processing, revoked, recovered, quarantined.
### Responsive Matrix
N/A — native operations have no responsive layout.
### Accessibility Acceptance
Native errors/progress become labeled status updates in the shell.
### Copy Contract
Stable codes/localized keys; absolute path only in local confirmation UI.
### Browser Evidence Required
N/A — Tauri/native evidence required for picker, redaction, restart, revoke.
