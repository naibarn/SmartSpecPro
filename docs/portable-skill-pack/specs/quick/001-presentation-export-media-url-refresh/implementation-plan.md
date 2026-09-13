# Implementation plan

## Objective

Prevent avoidable presentation export failures when managed media URLs expire
or a transient network/storage interruption occurs immediately before capture.

## Files and ownership

- `apps/web/server/routes/slideRender.ts`: keep managed-media refresh just in
  time and add no arbitrary URL fetching.
- `apps/web/server/routes/slideRender.test.ts`: extend route proof for repeated
  requests and unchanged direct URLs.
- `python-backend/app/tasks/presentation_render.py`: add bounded per-slide
  retry around navigation/readiness/capture for screenshot and record modes.
- `python-backend/tests/test_presentation_render_task.py`: cover transient
  recovery, retry bound, and deterministic terminal failures.

## Approach

The Node route already re-resolves `/api/storage/files/...` and `/uploads/...`
references every time it builds the internal HTML response. Keep that behavior
as the URL refresh/preflight seam. Do not add a database write or expose a
presigned URL to the client.

In Python, factor the common navigation/readiness gate into a bounded helper or
small local abstraction. For each attempt, create a fresh page and apply a new
slide token before `goto()`. If the response is non-2xx, raise a terminal
render-route error; do not retry authorization, missing-object, or structural
errors. If the page reports `mediaDegraded`, retry only while the attempt
budget remains, then raise the existing media error. Capture only after the
page is accepted by the readiness gate.

Apply the same policy to screenshot mode and `?mode=record` video mode. Ensure
failed pages are closed before the next attempt and successful pages are closed
after capture/recording. Preserve progress updates once per successfully
completed slide.

## Acceptance criteria

- Managed URLs are freshly presigned per internal render request.
- A transient failed attempt can recover on the next attempt.
- No more than two retries occur for one slide.
- Deterministic HTTP and media failures never produce a screenshot/video clip.
- Existing fail-closed error names and token/header security remain intact.
- Focused Node/Python tests and diff hygiene pass.

## Rollout and verification

- Run Node `slideRender.test.ts` and Python presentation-render tests.
- Run a focused web typecheck if source types change.
- Run a local browser render for deck 449 only if the worker base URL is
  reachable; do not enqueue a real export or mutate production state.
- Report the unresolved `host.docker.internal` runtime gate separately if it
  remains unavailable.
