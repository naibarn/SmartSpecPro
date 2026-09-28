# Section 05 — Worker execution and recovery

## Objective

Execute Comfy jobs through the selected MCP profile, validate outputs, save them
on the Worker machine, and optionally publish them without duplicate execution.

## Owned files

- `apps/worker-app/src-tauri/src/worker_executor.rs`
- `apps/worker-app/src-tauri/src/worker_loop.rs`
- `apps/worker-app/src-tauri/src/comfy_executor.rs` (legacy boundary only)
- `apps/worker-app/src-tauri/src/comfy_execution_ledger.rs` (consume the
  Section 02-owned module; do not create a second ledger)
- existing media safety/output helpers and focused Rust tests

## Required implementation

1. Dispatch `comfy_image_generation`, `comfy_video_generation`,
   `shot_video_generation`, and `comfy_workflow_run` while isolating Remotion,
   Hermes, and media-ingest branches.
2. Revalidate profile, workflow, capability, permission, policy, and lease
   before submit. Do not advertise stale cached Comfy capability.
3. Stage approved inputs with one-time local staged IDs and validate hash/type/
   role/Series and remote-consent rules.
4. Execute phases: preflight → stage → MCP submit → running → collect → validate
   → atomic local save → optional multipart publication → completion.
5. Persist immutable execution reference, event sequence, output fingerprints,
   upload parts, cleanup state, and reconciliation deadline.
6. Validate image magic/MIME and video codec/dimensions/duration/count/size/role
   mapping. Prevent traversal, symlink escape, unsafe output, and arbitrary
   provider path use.
7. After submit, reconnect/query the reference; never blindly resubmit. On
   restart reconcile all nonterminal records before claiming new work.

## TDD sequence

- Four dispatch types and legacy branch isolation.
- Typed staging and Series/role/consent validation.
- MCP correlation, progress, cancellation, deadline, lease expiry, retry.
- Safe output validation and atomic local-only completion.
- Multipart init/part/complete/abort/resume and checksum mismatch.
- Crash/window close/sleep/network-loss/restart and orphan prevention.

## UI/UX Contract

### Target User / JTBD

The operator needs truthful progress, local output location status, upload
status, and a clear recovery action after a crash or connection loss.

### Surface Inventory

Worker Overview active card, Comfy Jobs detail, Queue, and Published output
surfaces consume execution state; raw local paths remain on-device only.

### Existing Pattern Reference

- Searched `worker_executor.rs`, `worker_loop.rs`, `comfy_executor.rs`, media
  safety helpers, and existing Worker queue/output screens.
- Decision: reuse dispatch, heartbeat, ffprobe, artifact upload, and recovery
  patterns; diverge only for the MCP execution reference and local ledger.

### Visual Direction / Token Strategy

Reuse existing Worker progress cards, phase/status tokens, spacing, and motion
restraint; never expose raw provider text as a visual label.

### Component Map

Phase timeline, progress, execution reference, output validation, local-save
confirmation, publication progress, cancel, retry, and reconcile controls.

### State Matrix

Preflight/staging/running/collecting/validating/saved/uploading/completed,
blocked, canceled, expired, and reconciling each have distinct labels and
actions; duplicate events are silent/idempotent.

### Responsive Matrix

Active phase and progress stay above the fold; detailed evidence collapses into
a drawer on tablet/mobile.

### Accessibility Acceptance

Progress is announced at a throttled interval, phase order is semantic, errors
are associated with recovery buttons, and output links have descriptive labels.

### Copy Contract

Thai/English phase/error strings avoid raw provider errors and include safe job
ID/correlation ID for support.

### Browser Evidence Required

Use fake MCP to prove progress, cancellation, local save, upload resume, and
restart reconciliation in the actual Worker UI.

## Exit criteria

Each job type reaches a validated local file in fake execution, publication can
resume without rerun, and restart cannot duplicate remote execution/artifacts.
