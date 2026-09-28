# Section 07 — Render, export and output QC

## Goal

Provide Auto, Manual Remotion/FFmpeg and GPU render choices with truthful
capability admission and durable outputs.

## Implementation

- Auto selects the first compatible mode from a server policy and records the
  decision. Manual mode requires the selected executor token. GPU mode requires
  a matching device/codec profile; it never silently falls back to CPU.
- Render jobs pin revision, plan hash, output profile, FPS, dimensions, codec,
  audio mapping and all asset checksums. Worker verifies duration, dimensions,
  codec, non-zero size and checksum before upload.
- Export MP3, extracted audio, still frame and video use distinct output roles,
  content types and download names. Save-current-frame is browser capture with
  `video.render_still` fallback when a rendered frame is required.
- Result review shows mode, QC, source revision, artifact checksum, stale state,
  preview/download and publish/apply actions.

## Tests and proof

Golden render fixtures for Auto/Remotion/FFmpeg/GPU, MP3 metadata, still-frame
pixel dimensions, cancellation, retry, partial upload and stale output. Stage
real Worker claim and server artifact verification for every enabled mode.

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
