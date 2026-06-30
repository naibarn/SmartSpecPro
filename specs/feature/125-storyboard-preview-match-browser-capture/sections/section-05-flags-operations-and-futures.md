# Section 05: Flags, Operations, And Futures

## Goal

Make preview-match capture controllable in production and keep future client/Worker App paths explicit without weakening MVP quality or verification.

## Scope

- Add feature flags and kill switches.
- Add concurrency, timeout, retry, and cleanup controls.
- Add rollout and rollback guidance.
- Add operator metrics and support runbook notes.
- Keep client capture and Worker App capture as future paths behind flags.

## UI/UX Contract

### Target User / JTBD

Storyboard Review user should not be confused when capture is unavailable, rolled back, or partially enabled.

### Surface Inventory

- final composite action area
- quality selector
- blocked/unavailable copy
- future client-capture entry points when experimental flag is enabled

### Component Map

- Capture enabled flag controls capture CTA availability.
- High-quality flag controls high option availability.
- Server-worker flag controls queue capability.
- Client experiment flag controls future local draft UI only.

### State Matrix

- capture disabled: hide or disable capture without affecting render.
- high disabled: standard remains available; high unavailable.
- server worker disabled: capture shows clear blocker.
- client experiment disabled: no client capture UI.
- rollback: in-flight jobs remain projected according to server policy.

### Responsive Matrix

N/A for new layout beyond Section 01. Flag-driven disabled/blocked copy must remain short enough for mobile buttons and status rows.

### Accessibility Acceptance

Disabled and unavailable states must include accessible reasons, not color-only indication.

### Copy Contract

- Capture disabled: explain that preview-match capture is unavailable.
- Existing render remains available and must not be described as disabled by capture rollback.
- Client capture copy must say experimental/local draft if ever shown.

### Browser Evidence Required

- Screenshot with capture disabled and existing render still available.
- Screenshot with high quality disabled but standard capture available.

## Files To Review

- feature flag/config helpers
- worker scheduler/monitoring services
- Storyboard Review UI capability projection
- Worker App contracts from Feature 124
- deployment/runbook docs if present

## Files To Change

- feature flag/config module
- capture service flag checks
- UI capability projection
- worker operational config
- runbook/spec docs
- tests for flag behavior and rollout gates

## Flags

- `STORYBOARD_PREVIEW_MATCH_CAPTURE_ENABLED`
- `STORYBOARD_PREVIEW_MATCH_CAPTURE_HIGH_ENABLED`
- `STORYBOARD_PREVIEW_MATCH_CAPTURE_SERVER_WORKER_ENABLED`
- `STORYBOARD_CLIENT_CAPTURE_EXPERIMENT_ENABLED`

Flag behavior:

- capture disabled must not affect existing `Render Final Composite`
- high disabled keeps `standard` available if capture is enabled
- server worker disabled returns a clear blocker
- client experiment disabled hides client/local draft capture entry points

## Operational Controls

- global capture concurrency
- per-tenant capture concurrency
- per-user queue throttles
- max capture duration
- route token TTL
- attempt timeout
- queue timeout
- max retries
- local workspace cleanup TTL
- evidence retention TTL

## Metrics And Logs

Track:

- job created/started/completed/failed/cancelled
- queue wait time
- capture duration
- encode duration
- verification duration
- quality preset
- capture mechanism
- verification failure code
- Media Library publish result
- billing reservation/reconciliation result

Logs and metrics must use sanitized ids and must not include signed URLs or tokens.

## Rollout

1. Developer fixture only.
2. Internal tenant standard quality.
3. Limited beta standard quality.
4. Enable high quality only after Thai subtitle sharpness evidence passes.
5. Consider Worker App capture after server MVP proves parity and operational cost.

Rollback:

- disable capture flag
- keep existing HyperFrames render available
- allow in-flight jobs to finish or cancel based on operator decision
- do not delete verified Library outputs

## Client Capture Future

Client capture is experimental and not trusted final output in MVP.

It can be explored only for:

- local draft/download
- optional upload to server for verification
- short outputs where tab lifecycle is acceptable

It must not:

- bypass server verification
- publish directly to Library
- expose signed asset URLs broadly
- assume codec support is consistent

## Worker App Future

The capture payload should remain serializable and compatible with a future Smart AI Hub Worker App executor.

Server remains responsible for:

- queueing
- signed manifests
- permission checks
- billing
- artifact verification
- Library publish

Worker App may later handle:

- asset download
- browser capture
- FFmpeg encode
- artifact upload

## Test First

- Test flags hide/disable only the capture path.
- Test existing HyperFrames render remains available when capture is disabled.
- Test high quality flag controls high option.
- Test concurrency cap rejects or queues excess jobs according to policy.
- Test timeout and retry statuses become user-safe projection.
- Test client capture flag does not enable Library publish.
- Test Worker App contract serialization excludes persistent signed URLs.

## Acceptance Criteria

- Operators can disable capture quickly without impacting existing render.
- Rollout can start with standard quality and limited tenants.
- Client capture and Worker App futures are documented but not accidentally enabled as trusted final output.
