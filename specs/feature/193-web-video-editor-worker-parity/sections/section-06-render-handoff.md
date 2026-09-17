# Section 06 — Canonical render handoff

## Objective

Make Web export submit the same canonical Worker render contract as the Worker
App while preserving a compatibility shim for old clients.

## Implementation status

Implemented render envelope metadata (`video.render`, Feature 186 version,
camera plan, silence cut map) through the existing Web render compatibility
adapter. The server hard-cutover route remains the canonical production gate;
the browser never performs heavy encoding itself.

## Implementation scope

- Refactor `VideoEditorPhase3.tsx`, `VideoEditorRenderService`, and related
  client/server adapters so final export uses `video.render` through Feature
  186.
- Require a saved project revision. Include managed assets, camera plan and
  five-point evidence reference, activity track/association data, silence
  cut-map fingerprint, output profile, and idempotency key.
- Map `render_mp4_h264` to the canonical envelope during migration. Validate
  source/revision/plan/cut fingerprints before encoding.
- Route to connected Worker App, approved hosted/worker-pull executor, or a
  durable Worker-required state. Browser closure must not cancel queued work.

## TDD targets

- Canonical envelope construction from saved revision.
- Legacy render alias convergence and idempotency.
- Face Focus five-point and Face + Activity render validation.
- Silence cut-map render parity and stale revision refusal.
- Queue, cancel, retry, settlement, and browser-closure behavior.

## UI/UX Contract

### Target User / JTBD

Creator submits a trustworthy final render and can leave the browser while the
Worker completes it.

### Surface Inventory

Export dialog, save-required guard, Worker-required message, queued progress,
cancel/retry actions, and completed artifact state.

### Component Map

Export UI requests a saved revision; server/router owns canonical job creation;
status surface consumes Feature 186 state.

### State Matrix

Dirty project asks save; queued shows durable job; running shows progress;
blocked explains Worker requirement; stale plan asks re-analysis; completed
shows managed artifact; failure offers bounded retry/review.

### Responsive Matrix

Export primary action and status remain visible on mobile/tablet/desktop; long
diagnostics collapse without hiding the reason or action.

### Accessibility Acceptance

Export/save/cancel/retry are keyboard accessible with visible focus and clear
labels; status changes are announced without exposing secrets.

### Copy Contract

Thai primary copy: “บันทึกก่อน Render”, “ส่งเข้า Worker แล้ว”, “ยังไม่มี Worker
สำหรับ Render”, and “ผลลัพธ์พร้อมดาวน์โหลด”; English fallback required.

### Browser Evidence Required

Browser test proves save-required guard, queued state, tab-close resilience
messaging, and Worker-required fallback.
