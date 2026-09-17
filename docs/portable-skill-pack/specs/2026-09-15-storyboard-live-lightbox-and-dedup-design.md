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

## Follow-up closure: recovery index and spoken-story expansion

- The unfinished-jobs index is a recoverability projection, not a history
  list. It excludes terminal storyboard runs and also excludes rows whose
  canonical control-plane job is already `succeeded`, `cancelled`, or
  `expired`, even when an older domain row still says `queued` or `running`.
  The client applies the same defensive filter and removes a cancelled row
  optimistically after an idempotent cancel action. Each actionable row has
  its own Cancel button; `cancel_requested` remains actionable until the
  durable terminal transition completes.
- Idea expansion receives the selected story type and shot count. Its strict
  structured response includes `dialogueLines`; mime mode requires an empty
  array, while dialogue/hybrid mode requires at least one structured
  speaker/text/language line. The preview exposes the generated script for
  editing, and applying the preview writes it into the canonical dialogue
  draft before confirmation. This keeps the user-authored story mode and the
  generation contract aligned instead of relying on a prose-only expansion.

## Follow-up closure: character capture and project binding

The Character tab now has an explicit, user-controlled capture path. A durable
completed storyboard shot can be saved as a portrait for a new/existing library
character or as a named look for an existing character. Saving is never
automatic: the user must open the action from a completed shot, preview it, and
confirm the target character and role. The server rechecks run ownership, shot
success, suppression state, managed media ownership, and character ownership in
one transaction.

Character library responses include the current portrait and saved look
thumbnails. Before confirmation, the checkbox selects a usable character and a
small image selector chooses Portrait or one of its saved looks. Once a draft
exists, the same controls call the guarded bind/unbind boundary so the project
snapshot, normalized run input, and reference image list stay synchronized.
The selected look is stored in the existing `lookJson` plus the existing
`character_library_assets` role `look`; no second character/job ledger or new
provider path is introduced.

Repeated capture is idempotent by the deterministic source shot and role for
new characters and by the existing character/media/role uniqueness constraint
for existing characters. A missing portrait/look is shown as an actionable
empty state and cannot be selected as a visual reference. Failed, pending, or
suppressed shots are never offered as character sources.
