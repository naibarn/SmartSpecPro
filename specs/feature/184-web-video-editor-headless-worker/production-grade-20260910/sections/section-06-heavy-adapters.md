# Section 06 — Heavy media adapters

## Goal

Move expensive work to Worker jobs with reviewable outputs and no false success.

## Operation matrix

- Quick Silence Cut: silence/VAD analysis returns segments, waveform peaks and a
  reviewable edit map; apply uses revision CAS.
- Extract audio: creates a lineage-linked A-track asset. Ducking compiles a
  bounded volume envelope from presets and displays waveform changes.
- Speaker scan/transcribe/align/subtitle: requires ASR/diarization adapter,
  confidence/timing coverage and human review before subtitle or cut apply.
- Face/object tracking and blur: requires a vision adapter; every interval has
  confidence and fallback policy. Untracked intervals block auto-apply.
- AI Music and AI Media Studio: use server-authorized provider/credit/consent
  gates, immutable prompt/model provenance and managed output publication.
- Recording normalize is native FFmpeg; microphone capture remains browser
  `MediaRecorder` with a device/permission/MIME matrix.

## Adapter proof

Each adapter gets a manifest, health endpoint, fixture media, checksum/QC output,
performance budget, cancellation test and staging record before its operation
claim token is enabled. Unsupported operation state is visible as
`ต้องติดตั้ง Worker adapter` with a remediation path.

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
