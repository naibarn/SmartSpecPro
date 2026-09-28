# Presentation export media URL refresh design

## Goal

Make PNG/JPG/PDF/MP4 presentation export resilient to expired or transiently
unavailable image/video URLs without ever packaging a slide with missing media.
The existing fail-closed `E_SLIDE_MEDIA_DEGRADED` behavior remains the final
guard.

## Current evidence

- Deck 449 slide 0 stores a managed `/api/storage/files/...` URL.
- The corresponding R2 object exists and can be `HEAD`-checked and presigned in
  the local environment.
- The internal slide-render route already creates a fresh presigned URL when it
  receives a managed storage URL, but the Python worker has no bounded retry for
  a media load failure.
- The worker runtime currently advertises `INTERNAL_RENDER_BASE_URL` as
  `http://host.docker.internal:3000`; this must be valid in the worker's actual
  network namespace. A DNS/configuration failure is not fixed by retrying.

## Recommended approach

Use just-in-time refresh at the internal slide-render boundary plus bounded
worker retry:

1. On every slide-render request, normalize persisted managed media references
   and issue a new presigned GET URL. This makes each slide request an implicit
   URL preflight and avoids carrying an old signed URL through the export job.
2. Before screenshot/video capture, require the existing readiness state to
   report `mediaReady=true` and `mediaDegraded=false`.
3. If navigation or media readiness fails with a transient network/timeout
   condition, reload the same slide at most two times. Each attempt receives a
   new internal token and a new set of media URLs.
4. Fail immediately for deterministic errors such as HTTP 401/403/404 from the
   render route, invalid token/schema, missing storage object, or malformed
   slide data.
5. After the retry budget is exhausted, raise the existing
   `E_SLIDE_MEDIA_DEGRADED` error. No placeholder is captured and no slide data
   or generated media is mutated.

This keeps media resolution server-side, so the worker never needs a browser
session to read protected storage. It also avoids an extra provider request for
every URL solely to inspect its expiration timestamp: a new presigned URL is
cheaper and more reliable than trusting a possibly stale URL.

## Components and data flow

- `apps/web/server/routes/slideRender.ts`: canonicalize managed media and
  presign it per slide request; preserve the readiness state contract.
- `python-backend/app/tasks/presentation_render.py`: classify render failures,
  retry transient slide attempts with fresh navigation/token, and retain the
  fail-closed media gate.
- Focused Node and Python tests: verify URL refresh, readiness failure, retry
  bounds, and immediate failure for deterministic HTTP errors.
- Runtime configuration: validate the worker's `INTERNAL_RENDER_BASE_URL`
  against its network namespace. Do not bake a Docker-only hostname into code or
  silently switch to an unsafe external URL.

## Failure and security behavior

- A missing R2 object is not regenerated or replaced with another asset; export
  fails with the media error and preserves authored slide content.
- Retry does not retry provider generation and does not spend media credits.
- Internal render tokens remain short-lived and slide-scoped. They are sent in
  headers, never in the URL.
- Presigned URLs remain short-lived and are embedded only in the internal HTML
  response consumed by Playwright.
- Existing network/IP and token checks on the internal route remain unchanged.

## Testing and operational proof

- Node route tests assert managed URLs are refreshed on each render request and
  direct non-managed URLs are not broadened into arbitrary fetches.
- Python tests assert transient retry attempts are bounded and that each retry
  rebuilds the slide URL/token path, while 401/403/404 and media-degraded states
  remain fail-closed.
- Run focused Node/Python tests and `git diff --check`.
- Run a local authenticated/browser render for deck 449 when the worker base URL
  is reachable; otherwise report the runtime gate as unverified.
- No database migration, dependency, provider-generation call, or production
  export is part of this change.

## Trade-offs

- Always refreshing managed URLs adds one presign operation per media reference
  per slide request, but avoids expiration races and is bounded by the existing
  export workload.
- Two retries increase worst-case render latency by seconds, but reduce failures
  caused by short network/storage interruptions without hiding permanent data
  loss.
- Keeping fail-closed may reject an export when one media object is unavailable;
  this is intentional because a successful download of a blank or incomplete
  presentation is worse than a visible error.
