# Section 10 — Staged rollout, browser proof and acceptance

## Goal

Ship incrementally with evidence, rollback and no hidden production assumptions.

## Waves

1. **Internal:** native Worker operations, Redis readiness, Bin/Library ingest,
   revisions and Worker Jobs read-only.
2. **Canary:** one tenant enables submit, native render/audio/silence/still;
   capture real R2 and Worker claim/artifact proof.
3. **Adapter canary:** enable one heavy adapter only after its staging record;
   monitor capability blocks and QC for 24 hours.
4. **Default:** enable reviewed operations, keep `?legacy=1` rollback until queue
   drain and two successful deploys.

## Acceptance matrix

The matrix covers all requested controls: Bin single/multiple upload; Library,
Media History and drag/drop; Transform/Keyframes/free pan/zoom/auto camera;
Quick Silence Cut; detach audio; AI Music; blur/object tracking; microphone;
speaker plan; subtitles; Auto/Remotion/FFmpeg/GPU render; MP3; frame save;
frame-guide/render-like preview; detailed ruler; ducking/waveform presets; stock
SVG; AI CSS/React/Three.js preview; track lock/mute/solo/scroll; Worker handoff,
result review and Dashboard/Worker Jobs routing.

For every row record source test, focused test output, browser screenshot or
staging trace, runtime capability, artifact checksum and rollback owner. A row
without real-environment proof stays marked `pending` and its control remains
capability-gated.

## Rollback

Disable the affected operation/tenant flag, stop new claims for its capability,
leave in-flight leases to expire/recover, keep artifacts private and preserve
revisions. Reopen only after the failed gate has a new staging record.

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
