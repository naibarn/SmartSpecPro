# Section 04 — Project and run lifecycle

## Goal

Provide the project-first draft and idempotent run lifecycle used by the full-screen wizard.

## API surface

Add a protected router/service boundary with `listCompatibleSkills`, `getSkillSchema`, `estimate`, `createDraft`, `updateDraft`, `createRunFromProject`, `confirmAndStart`, `getProject`, `getRun`, `cancel`, `retryShots`, `rebuildReviewProjection`, `archiveProject`, and project-character bind/unbind/read procedures. Draft/run creation returns `{ projectId, runId, status: "awaiting_confirmation", normalizedSnapshot }`; confirmation is fingerprinted and idempotent.

## State machine

Persist before returning success. Support `draft`, `awaiting_confirmation`, `queued`, `planning`, `prompting`, `generating_images`, `building_video_prompts`, `projection_pending`, `succeeded`, `partial`, `failed`, `cancel_requested`, `cancelled`, and `archived`. Shot transitions are monotonic; stale workers can resume; duplicate delivery cannot duplicate credits, provider jobs, or projections.

## Billing and authorization

Estimate is free. One parent confirmation owns image-run reservation/settlement; retries use explicit failed-stage attempts. Validate owner/team scope, managed asset ownership, model capability, schema snapshot, quota, and fingerprint before enqueue. No silent provider/model fallback and no real-credit calls in tests.

## Tests

Cover ownership, draft update, duplicate create/confirm, fingerprint mismatch, status transitions, cancel/retry, stale-run recovery, one confirmation, and safe terminal errors. Use injected repositories/queue/billing seams.

## UI/UX Contract

### Target User / JTBD
Creator can save, estimate, confirm once, and recover from partial generation.

### Surface Inventory
Draft save, estimate, confirmation, progress, cancel, retry, and archive surfaces.

### Component Map
Lifecycle owns transitions; wizard/review render server status and action availability.

### State Matrix
Expose awaiting confirmation, queued, running, partial, failed, cancel requested, cancelled, succeeded.

### Responsive Matrix
Confirmation and retry remain reachable at 320px and desktop widths.

### Accessibility Acceptance
Pending actions expose disabled reasons, focus-safe errors, and live progress.

### Copy Contract
Thai/English copy distinguishes estimate, reservation, retry, and cancellation.

### Browser Evidence Required
Demonstrate one confirmation, duplicate-submit safety, partial retry, and cancel.
