# Feature 191 implementation plan

## 1. Shared contract and deterministic planner

Extend the shared camera-motion contract with the new Face + Activity mode,
analysis mode (`quick`/`full_scan`), evidence references, policy/capability
fingerprints, bounded target tracks, activity intervals, and plan provenance.
Keep legacy modes readable. Add pure helpers for coordinate normalization,
feasible crop bounds, weighted target selection, temporal smoothing, occlusion
hold/reacquisition, Mark precedence, plan fingerprinting, and validation.
The planner must be deterministic for the same normalized inputs and never
emit a crop window outside the source frame.

## 2. Worker preview modes

Update `MediaVideoEditorPlayer` to expose Face + Activity with Quick and Full
Scan states. Quick uses the existing bounded detector sample and can update the
preview immediately. Full Scan submits/observes a canonical analysis job,
shows scanning/checkpoint/stale/degraded states, and applies only an approved
plan. Existing Mark controls and local persistence remain intact. Preview uses
the same shared plan evaluation as the render request.

## 3. Vision and Full Scan adapter

Add a capability-aware composition scan boundary beside the existing speaker
aware runner. Reuse available face/person adapters and activity intervals;
allow hand/object adapters only when an explicit model/runtime capability is
ready. Emit bounded keyframes and evidence references, not raw frames or
secrets. Add checkpoint schema, source/policy/capability fingerprints, and
idempotent resume/promotion guards. Keep local Quick fallback functional when
Full Scan is unavailable.

## 4. Rust renderer and local command boundary

Teach Rust plan validation and edit-plan serialization to accept the new
versioned mode/provenance fields, preserve segment time remapping, and reject
malformed or stale plans. Remove the blanket non-manual rejection only when a
validated focus/camera plan is supplied. Keep manual-region behavior unchanged.
Ensure preview/render coordinate semantics and aspect-ratio crop math match.

## 5. Feature 186 integration

Use the existing canonical job/outbox/lease contract for Full Scan. Do not add
a second job table. Bind analysis artifacts to the canonical job, use guarded
promotion against source and Mark revisions, and expose retry/cancel/stale
states. A late result may be recorded as an observation but cannot replace a
newer plan.

## 6. Verification, rollout, and documentation

Add targeted unit/property tests for planner math, Mark precedence, track
clamping, Quick/Full state transitions, checkpoint resume, stale-result races,
Rust validation/remapping, and preview/render parity. Add fixture-level tests
without paid provider calls. Run focused Vitest/Cargo/Python/static checks;
skip `npm typecheck`. Record a ten-round implementation/spec audit and fix
each material gap before finalizing.

## File map

- `packages/shared/src/video-editor/cameraMotion.ts`: shared contract/planner.
- `apps/worker-app/src/screens/media-workspace/MediaVideoEditorPlayer.tsx`:
  modes, preview state, Mark preservation, request wiring.
- `apps/worker-app/src-tauri/src/media_pipeline.rs`: Rust contract,
  validation, remapping, FFmpeg plan consumption.
- `apps/worker-app/src-tauri/src/commands.rs`: local command admission and
  canonical plan payload.
- `apps/worker-app/speaker-aware-runner/`: capability-aware scan adapter and
  tests.
- `apps/worker-app/tests/media-workspace/` and Rust/Python tests: focused proof.
- Existing Feature 186 server control-plane modules: only if the exact
  Full-Scan job route already exists; otherwise add the smallest adapter-bound
  integration using the existing job APIs.
