# Storyboard live lightbox and duplicate-submission protection

**Status:** Approved for implementation
**Scope:** Storyboard Skill Framework image generation and its Storyboard review projection.

## Goal

While a nine-shot storyboard is generating sequentially, every completed image
must be viewable from the result panel without leaving the page. The user may
cancel while reviewing partial output. Completed shots remain durable and can
be resumed later without generating them again.

## Contract

- A completed shot is previewable only when it has a valid managed image URL and
  a successful persisted shot/asset binding.
- Clicking a completed thumbnail opens an accessible lightbox with close and
  previous/next controls over the completed images. Queued, generating, failed,
  and suppressed shots are not previewable as completed output.
- Cancellation is guarded by the existing tenant/run control-plane boundary.
  Before provider submission, pending work is terminally cancelled immediately
  and unpublished dispatch intent cannot be published. A provider operation
  already submitted is not assumed cancellable; the attempt is fenced and a
  late result cannot mutate the cancelled run or be used to create a new shot.
- Completed shots are retained in the run and projected to the Storyboard
  review even when the run is cancelled or partial. Resume is allowed only for
  an explicitly resumable partial/paused run and only for shots without a
  usable `imageAssetId`; successful shots are never reset.
- A shot has one deterministic provider operation key derived from run, shot,
  and business attempt. The guarded generating transition, persisted operation
  key, durable media identity, and success update prevent duplicate provider
  submissions from clicks, redelivery, restart, or response loss.

## Implementation shape

1. Add lightbox state and accessible thumbnail buttons to the Skill Framework
   result panel. The existing 2.5-second status query supplies newly completed
   image URLs; no browser-only cache is authoritative.
2. Make cancellation preserve completed shots and attempt a partial review
   projection. Projection failure remains visible/recoverable and never creates
   a replacement job.
3. Harden projection recovery for incomplete prompt metadata so cancellation
   before provider work does not throw or fabricate a paid image.
4. Keep the existing fenced `markShotGenerating`/`markSucceeded` and
   deterministic operation-key path; add explicit tests for duplicate claim,
   cancellation races, late provider results, and resume filtering.

## Failure handling and security

All reads and mutations remain tenant/user scoped. No provider cancellation API
is required. A late provider response is suppressed after the run is stopped;
its evidence remains attached to the original shot/operation for reconciliation.
The lightbox renders managed URLs already authorized by the existing API and
does not expose provider credentials or raw provider responses.

## Verification

- Unit tests cover completed-thumbnail eligibility, legacy URL normalization,
  and projection task status.
- Service tests cover cancellation idempotency, partial projection, resume
  preserving successful shots, and the existing operation-key duplicate guard.
- Build and focused Vitest suites must pass. A browser-level manual check is
  recommended after deployment: complete one shot, open it in the lightbox,
  cancel, refresh, and verify that only missing shots remain resumable.
