# Section 02 — Worker capability manifest and adapter protocol

## Goal

Make Worker admission truthful: a job is claimable only when the installed
runtime can execute the exact operation and publish its declared artifact.

## Contract

- Registration returns `editorMedia.protocolVersion`, `manifestVersion`,
  operation IDs, executor kind (`builtin_ffmpeg`, `remotion`, `adapter`), runtime
  version, resource profile, supported codecs and health timestamp.
- The server derives `requiredClaimCapability` from the canonical operation token
  (`editor-media-operation-*`) and also stores the protocol token for audit.
- Built-in operations are probe, proxy, waveform, thumbnail, analysis,
  silence_detect, audio_extract, audio_export, recording_normalize,
  render_still and render. AI/ASR/diarization/vision operations require a
  versioned adapter manifest and a live health check.
- Adapter invocation uses an allowlisted executable or local service, structured
  JSON stdin/stdout, bounded walltime, no shell interpolation, staged paths only,
  checksum-bound inputs and typed failure codes. No provider fallback is
  implicit.
- The server rejects stale manifest versions and the Worker rejects operations
  absent from its own manifest, even if a legacy job type is misqueued.

## Implementation and tests

Add shared operation-to-capability fixtures consumed by TypeScript and Rust.
Test full-superset claim matching, old-worker rejection, missing adapter,
health expiry, cancellation, timeout and artifact-role mismatch. Stage one
adapter at a time (ASR, speaker, vision/privacy, AI music/media) and record
runtime checksum plus output QC before enabling its token.

## Rollback

Remove one operation token from the manifest or disable its adapter flag. Jobs
remain queued with `capability_unavailable`; render and native media operations
continue independently.

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
