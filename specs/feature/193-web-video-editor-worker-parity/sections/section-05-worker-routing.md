# Section 05 — Worker analysis and routing

## Objective

Route heavy analysis through Feature 186 without disabling local editing or
creating duplicate status/result sources.

## Implementation status

Implemented operation/version mapping, composition-scan router procedures,
Feature 186 outer-version correction, executor validation, and safe bounded
status/promotion responses. Generic `media.composition_scan` remains an alias
to the canonical `video.composition_scan` job family.

## Implementation scope

- Extend editor media operation validation and server routing for
  `media.composition_scan`; use the canonical `video.composition_scan` helper
  and executor with explicit transport/nested contract mapping.
- Extend composition scan payload/evidence for project revision, five-point
  face data, activity associations, and required stages:
  `probe → sample → face_5point → track → activity_associate → plan → ready`.
- Reuse existing `media.silence_detect`, waveform, probe, and proxy job paths
  for local fallback failures or explicit Worker requests.
- Keep tenant, asset, revision, capability, lease, idempotency, checkpoint,
  cancellation, and stale-promotion guards server-owned.

## TDD targets

- Operation-to-job mapping and capability claim tokens.
- Version mismatch rejection before claim.
- Checkpoint/restart, duplicate delivery, lease loss, cancellation, and stale
  promotion.
- Managed artifact references and no raw detector payload persistence.

## UI/UX Contract

### Target User / JTBD

Creator understands whether analysis is local, queued, stale, or unavailable
without needing to inspect transport internals.

### Surface Inventory

Analysis action/status in Smart Camera and Silence panels; job progress and
review state in the existing Worker/status surface.

### Component Map

Server router owns authorization/routing; existing editor panels render bounded
status and actions.

### State Matrix

Queued shows job status; running shows progress; stale shows re-run; rejected
shows safe reason; unavailable preserves local editing and manual fallback.

### Responsive Matrix

Progress and primary fallback action remain visible on narrow and desktop views.

### Accessibility Acceptance

Job status uses semantic live regions sparingly, actionable errors are focusable,
and no raw IDs/secrets are exposed.

### Copy Contract

Thai primary copy distinguishes “รอ Worker”, “กำลังวิเคราะห์”, “ผลเก่า”, and
“ใช้โหมดในเครื่อง”; English fallback keys mirror the states.

### Browser Evidence Required

Router/component tests prove Worker unavailability does not disable the editor
and that queued status remains understandable.
