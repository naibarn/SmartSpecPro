# Section 08: Tauri HyperFrames Executor

## Goal

Add a Rust/Tauri executor for `hyperframes_final_composite` that claims jobs,
runs the official HyperFrames runtime sidecar, uploads artifacts, reports
progress, and cleans up safely.

## Dependencies

- section-01-contracts-and-flags
- section-03-lease-attempt-watchdog
- section-04-artifact-verification
- section-06-worker-connect-auth
- section-07-worker-app-runtime-pack

## In Scope

- Executor branch in worker loop.
- Workspace staging.
- Asset download and hash checks.
- Sidecar invocation.
- Local output probe.
- Artifact upload.
- Ordered progress/failure events.
- Cooperative stop command handling.
- Cleanup.

## Files To Review

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/worker_control_plane.rs`
- `apps/worker-app/src-tauri/src/worker_runtime.rs`
- `apps/worker-app/src-tauri/tests/worker_control_plane_tests.rs`
- `apps/worker-app/src-tauri/tests/worker_runtime_tests.rs`
- existing `apps/tauri-shell` worker runtime modules only as reference or
  extraction sources

## Files To Change

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- optional `apps/worker-app/src-tauri/src/hyperframes_executor.rs`
- `apps/worker-app/src-tauri/src/worker_control_plane.rs`
- `apps/worker-app/src-tauri/tests/**`
- Rust tests for executor/control-plane/runtime

## Test First

- Test: mocked HyperFrames job runs event sequence in order.
- Test: executor downloads assets and verifies hashes before rendering.
- Test: executor fails when sidecar exits nonzero.
- Test: executor fails when output path escapes workspace.
- Test: executor uploads final video, manifest, doctor, and probe artifacts.
- Test: executor uses signed direct/multipart/chunk upload sessions for large
  artifacts while preserving assignment attempt validation.
- Test: executor includes assignment attempt in events and uploads.
- Test: executor reports `job.failed` with valid HyperFrames failure code.
- Test: sidecar receives structured manifests and allowlisted arguments, not
  server-provided shell command strings.
- Test: sidecar does not expose a local HTTP/LAN service in MVP.
- Test: executor stops sidecar safely and sends `cancel-ack`/`transfer-ack`
  when server requests reassignment or timeout.
- Test: pause accepting jobs, quit after current, and policy-approved quit now
  do not orphan the active lease.
- Test: worker loop continues after idle/failure according to loop policy.

## Implementation Steps

1. Add typed local execution plan for HyperFrames job input.
2. Add claim preparation for HyperFrames assets and workspace.
3. Download each signed asset into workspace and verify hash/size.
4. Write sidecar input manifest expected by official HyperFrames runtime.
5. Invoke sidecar with allowlisted command and arguments; pass structured
   manifest files/stdin/stdout or equivalent local IPC, not shell command
   strings from the server.
6. Ensure the sidecar does not open a local HTTP/LAN service in the MVP worker
   app unless a later security review explicitly approves it.
7. Stream or periodically report `render_hyperframes` progress.
8. Probe generated MP4 and write probe report.
9. Upload required artifacts through existing control-plane upload helpers or
   signed direct/multipart/chunk upload sessions for large videos.
10. Report `server_verification` or `job.completed` according to server contract.
11. Poll/handle heartbeat commands for pause, reassignment stop, timeout stop,
    runtime update required, and connection revoked.
12. Implement pause accepting jobs, quit after current, and policy-approved quit
    now so active leases are released or acknowledged safely.
13. Cleanup local workspace after success or safe failure.

## Important Constraints

- Do not use ASS fallback to create final overlay output.
- Do not run arbitrary shell commands from job input.
- Do not expose local HTTP ports or generic IPC endpoints from the sidecar in
  MVP.
- Do not upload artifacts outside workspace.
- Do not expose tokens/signed URLs in logs.
- Do not upload partial output after cooperative stop or stale assignment.

## Acceptance Criteria

- A mocked control plane can claim, execute, upload, and complete a HyperFrames
  final composite job.
- Failure cases produce valid worker events and safe cleanup.

## UI/UX Contract

### Target User / JTBD

Workers should run jobs in the background while users can minimize the app and
still see clear progress, current stage, errors, and upload/verification state.

### Surface Inventory

- Smart AI Hub Worker App job dashboard/current job panel.
- Tray/minimized status.
- User job monitor and Storyboard Review status fed by executor events.
- Admin worker monitor diagnostics fed by executor events.

### Component Map

- Executor does not own React layout, but it must emit progress events for:
  preparing workspace, downloading assets, running HyperFrames, probing output,
  uploading artifacts, server verification, completed, failed, canceled/released.
- Worker App UI from section 07 must map those events to a stable progress bar
  and readable current-stage label.

### State Matrix

- Idle: no active job.
- Claiming/preparing: job accepted and workspace preparing.
- Downloading: asset count and current file progress where available.
- Rendering: HyperFrames progress or heartbeat-based elapsed time.
- Uploading: artifact upload progress.
- Verifying: waiting for server verification.
- Failed: show safe error and support diagnostics link.
- Completed: show uploaded/verified status and clear current job.

### Responsive Matrix

Windows desktop app should remain usable when narrow or minimized/restored.
Progress text should truncate with tooltip rather than stretching the window.

### Accessibility Acceptance

Progress stages must be text-visible and not only color-coded. Long-running
progress updates should be polite, not assertive, for screen readers.

### Copy Contract

Normal app copy should explain what is happening: downloading assets, rendering
with HyperFrames, uploading result, verifying on server. Technical command lines
and local paths stay in admin/support diagnostics only.

### Browser Evidence Required

Desktop screenshots or automated UI checks must cover idle, rendering,
uploading/verifying, failed, and completed states once the UI section is
implemented.
