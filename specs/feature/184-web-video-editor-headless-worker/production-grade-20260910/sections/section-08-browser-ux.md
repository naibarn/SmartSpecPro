# Section 08 — Preview, recording, accessibility and responsive UX

## Goal

Make the Web editor usable at production viewport sizes and with real devices.

## Implementation

- Preview modes are labelled: frame guide/camera view, fit-to-canvas preview,
  quality/render-like preview and transform edit mode. Avoid layout overflow and
  keep controls keyboard reachable with visible focus and announcements.
- Bin is the default tab; Library, Bin, Media History, panels and Worker handoff
  preserve selection and deep-link state. Worker Jobs opens from Dashboard and
  `/render-jobs` preserves query parameters.
- Recording enumerates microphones, requests permission only on user action,
  handles unsupported MIME, device removal, pause/resume and upload failure,
  then links the managed recording to the selected track.
- Use responsive breakpoints and reduced-motion behavior. On small screens,
  timeline authoring may be constrained but review/recovery remains complete.

## Tests and proof

Playwright/Chromium keyboard and screen-reader landmark checks at 390x844,
768x1024, 1280x800 and 1440x900; real microphone matrix on staging; visual
regression for Bin, panels, ruler and multi-track scroll.

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
