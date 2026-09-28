# Section 02 — Adapter Policy and Preflight

## Goal

Make user-selected VAD, diarization, face/person, and active-speaker adapters explicit, capability-gated, and fail-closed. Prevent silent fallback and false success.

## Files owned

- `apps/web/shared/verticalDramaMedia/speakerAwareWorkflow.ts` policy helpers and capability types from section 01.
- `apps/worker-app/src-tauri/src/speaker_aware_adapters.rs`.
- `apps/worker-app/src-tauri/src/worker_executor.rs` and `worker_loop.rs` only for constants/admission wiring.
- `apps/worker-app/tests/media-workspace/speakerAwareAdapters.test.ts`.

## Implementation tasks

1. Implement registry entries for `SileroOnnx`, `FireRedOnnx`, `TenVad`, `WebRtcVad`, `PyannoteDiarization`, `MediaPipeFace`, `PersonBody`, and `ActiveSpeakerFusion`.
2. Define capability probing: executable/runtime, model path/checksum, device/GPU, supported input, version, license metadata, and resource estimates.
3. Resolve only `enabledAdapters` from `AdapterPolicyV1`; primary must be in the enabled list. `deny` blocks if primary is unavailable. `allow_listed` selects the first ready allow-listed adapter and records fallback evidence. `report_unknown` never invents a result and exposes unknown status.
4. Add JSONL external-process contract with bounded timeout, cancellation, stderr capture, schema validation, and checksum. Reject absolute paths/URLs/credentials from persisted payloads.
5. Expose preflight as a worker command/job capability result for the UI; never advertise an adapter as ready merely because its code is compiled.

## TDD first

- Primary ready selects primary.
- Primary missing with `deny` returns blocked, no fallback invocation.
- Primary missing with allow-list selects the listed ready fallback and records `fallbackFrom`/reason.
- Model checksum mismatch, unsupported sample rate, GPU unavailable, malformed JSONL, timeout, and cancellation produce typed non-success outcomes.
- Unknown adapter ID is rejected before job claim.

## Exit evidence

Focused Rust tests, TypeScript policy tests, and a capability matrix fixture containing ready/missing/incompatible states. Document which adapters are not installed in the local environment.

## UI/UX Contract

### Target User / JTBD
N/A for direct UI; this section supplies capability data to the adapter policy editor.

### Existing Pattern Reference
Reuse existing worker job summary and settings/status patterns in the consuming UI.

### Surface Inventory
N/A; preflight data only.

### Component Map
N/A; the adapter editor is section 07.

### State Matrix
Capability states are serialized as `ready`, `missing_model`, `missing_runtime`, `gpu_unavailable`, `incompatible`, `disabled`, or `error` for section 07.

### Responsive Matrix
N/A; no visual surface.

### Accessibility Acceptance
N/A; section 07 must render status text and remediation, not color alone.

### Copy Contract
Status keys and remediation keys are provided to section 07; no free-form copy here.

### Browser Evidence Required
N/A for this section; adapter status browser evidence is section 08.
