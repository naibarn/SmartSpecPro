# Section 04 — ComfyUI Worker Adapter

## Goal

Execute approved ComfyUI image/video jobs on an eligible local worker and
publish verified outputs using the existing worker artifact and ACL path.

## Ownership

Modify only the typed Comfy worker adapter/handler, worker-side process/service
binding, and focused tests discovered from the existing worker claim loop. Do
not add a new job queue, direct browser-to-Comfy route, or independent storage.

## Contract

Reuse `comfy_image_generation`, `comfy_workflow_run`, existing progress/failure
codes, scheduler admission, lease, billing, and artifact init/complete.
Implement typed operations equivalent to:

- `detectRegisteredService`
- `checkReadiness`
- `submitWorkflow`
- `readExecution`
- `interruptExecution`
- `collectApprovedOutputs`

The service binding defaults to authenticated loopback and contains no arbitrary
job URL/path. The adapter submits `/prompt`, tracks `prompt_id`, uses bounded
polling and WebSocket progress when available, reads history, interrupts by the
same `prompt_id` only, and detects rejection/timeout/orphan states.

Each job gets an isolated workspace. Inputs use authorized short-lived refs and
checksum/size verification. Outputs remain inside the registered root and pass
real-path/symlink/junction checks. Images pass MIME/size/dimension/checksum;
videos additionally pass duration/dimension/framerate/codec/container/ffprobe.
Upload/publication is acknowledged before terminal success. Default concurrency
is one per runtime and cancel/retry/reconnect are idempotent.

## Tests-first requirements

- Service registration rejects arbitrary LAN/URL/path input.
- Readiness covers missing service/version/model/custom node/GPU/VRAM/disk.
- Image and video submission/progress/history/interrupt/output validation.
- Workflow rejection, timeout, missing output, malformed output, process crash,
  lease expiry, orphan cleanup, restart, and upload retry.
- Three queued jobs execute sequentially with no duplicate/reordered artifacts.
- Web/MCP submitters return the same typed status contract.

## Acceptance evidence

Fixture tests may prove adapter contracts. Real ComfyUI image/video workflows,
models/custom nodes, GPU compatibility, and Windows/macOS publication remain
external production gates and must be recorded as such.

## UI/UX Contract

### Target User / JTBD

User requests image/video generation and needs a truthful queue/readiness/result
state; no new Comfy-specific UI is required in this worker adapter section.

### Surface Inventory

Existing web/MCP generation submission, worker status, media history, and
artifact download surfaces.

### Component Map

N/A for new components; existing submit/status/history components consume the
typed contract.

### State Matrix

Queued, preparing, running, uploading, publishing, completed, canceled,
failed, blocked by readiness, and pending publication.

### Responsive Matrix

N/A for adapter code; consuming status surfaces must remain usable on mobile
and desktop.

### Accessibility Acceptance

Typed failures must expose readable next actions and progress semantics to the
existing accessible status components.

### Copy Contract

Use human failure/remediation copy; never expose local Comfy paths, prompt ids,
or storage keys in default UI.

### Browser Evidence Required

Web submit/status/history/download evidence is required when a real Comfy
runtime is available; fixture tests alone do not close the gate.

## Implementation status

Implemented the desktop adapter and worker dispatch for image and video-capable
ComfyUI outputs: loopback-only readiness, exact matching against the Worker App
registered service, typed submit/poll/cancel, bounded output download, image
magic-byte validation, runtime-pack ffprobe validation for video, safe
subfolder confinement, progress/failure events, and reuse of the existing
artifact upload/publication path. Cancellation is prompt-scoped so one queued
job cannot interrupt another local ComfyUI job. Real ComfyUI model/custom-node
and GPU acceptance, including an actual image and video job, remains external
evidence.
