# Vertical Drama Video Start-Frame Lineage Repair

Date: 2026-07-20
Status: Approved design, pending implementation planning

## Problem

Generating a per-shot video prompt can remove the shot's
`motionPromptPack.clips[].startFrameAssetId`. When the user then renders a
video, `generateVideoClip` cannot identify the current approved start frame and
may use a lower-priority shot reference instead. For a one-reference model such
as Grok Imagine Video, that fallback becomes the only submitted image.

In the observed incident, the fallback was an old `previous_main` image whose
Hermes artifact key ended in `.img`. Kie.ai rejected the video submission with
`File type not supported`, even though the shot's current approved image was a
valid Kie GPT Image 2 PNG.

## Production Evidence

- Kie image task `d7e12507-6ab8-410e-a9c8-0941e5a17962`, provider task
  `7140ae7420d24f6cda9867d2fc8ff854`, returned
  `file_000000003b88822f8413beafc4478fa4.png`.
- The returned image was registered as media asset `770` with MIME type
  `image/png`.
- Episode `108`, shot `1`, correctly stored
  `startFramePlan.frames[].approvedMediaAssetId = "770"`.
- The matching motion clip had no `startFrameAssetId`.
- Shot reference asset `769`, source `previous_main`, pointed to the older
  Hermes URL ending in `result-marker-0.img`.
- Video task `b7c60663-7aa0-423a-862f-303cb052b40f` submitted asset `769`
  instead of asset `770` and failed before Kie created an external video task.
- Hermes worker job `4e8cf6c2-ca31-48bf-9474-d44b1711d39c` produced the older
  image. Its bytes were valid JPEG, but `collect_hermes_outputs` assigned the
  generic `.img` suffix to every downloaded image result marker.

## Root Causes

### 1. Per-shot video-prompt persistence drops start-frame lineage

`generateShotVideoPrompt` replaces the matching clip with a newly constructed
object but does not carry the current approved media asset into
`startFrameAssetId`.

The existing `syncStartFramesOntoMotionPromptClips` helper only runs in the
whole-episode `video_motion_prompt_pack` pipeline. It does not protect the
per-shot prompt-generation path.

### 2. Video submission trusts denormalized clip state

`generateVideoClip` reads `clip.startFrameAssetId` as its only primary-frame
source. It does not derive the current approved image from
`startFramePlan.frames[]`, even though the latter is the user-controlled source
of truth.

When the field is absent, the reference-image budget is given to shot
references such as `previous_main`. With Grok Video's one-image limit, the
fallback entirely replaces the intended start frame.

### 3. Hermes assigns a generic extension to valid image bytes

For an HTTPS result marker, the Worker downloads bytes into
`result-marker-{index}.img` before validating the image magic bytes. Validation
correctly identifies `image/jpeg`, `image/png`, and other supported formats,
but the local filename and uploaded R2 object key retain `.img`.

### 4. Deterministic provider validation errors appear retryable

The Kie response `File type not supported` is deterministic for an unchanged
payload. The media task retries it and remains pending during the backoff,
making a rejected submission appear as though it was never dispatched.

## Source-of-Truth Contract

For a Vertical Drama clip whose primary shot has an approved image:

1. `startFramePlan.frames[].approvedMediaAssetId` is authoritative.
2. `motionPromptPack.clips[].startFrameAssetId` is a denormalized projection
   used for display and transport preparation.
3. At paid render submission, the authoritative value must replace a missing
   or stale projected value.
4. `previous_main` and manual shot references can consume only the remaining
   reference budget after the authoritative start frame.

This contract applies to direct Kie tasks, MCP transports, and Hermes
transports.

## Design

### A. Preserve lineage when generating a per-shot video prompt

When `generateShotVideoPrompt` writes a new or replacement clip, persist
`startFrameAssetId` from the already validated
`frame.approvedMediaAssetId`.

Apply the same invariant to every branch that constructs replacement clips,
including single-shot, speaker-split, and minimal-pack paths. A prompt-only
operation must not erase media lineage.

### B. Reconcile the start frame at the render boundary

In `generateVideoClip`, determine the primary shot number first and resolve its
current approved asset from `row.startFramePlan`.

- If a current approved asset exists, use it as `startFrameAssetId` even when
  the clip projection is missing or stale.
- If no approved asset exists, preserve the existing compatibility behavior
  for legacy/import-only clips.
- Assemble references in this order:
  authoritative start frame, explicit/speaker references, required character
  portraits, location reference.
- Apply the model's reference limit only after assembling this ordered list.

This read-boundary reconciliation fixes existing episode data without a
database migration or bulk JSON rewrite.

### C. Give future Hermes artifacts their real image extension

After downloading a Hermes HTTPS result marker, detect the supported image
format from magic bytes before choosing the temporary filename:

- JPEG -> `.jpg`
- PNG -> `.png`
- WebP -> `.webp`
- GIF -> `.gif`

Video results remain `.mp4` and continue through the existing ffprobe
validation. Unsupported or corrupt image bytes continue to fail closed.

Existing `.img` objects are not renamed or deleted. They remain available for
history and rollback, while new output keys are correct.

### D. Fail deterministic Kie validation errors immediately

Classify Kie submission errors that indicate an invalid unchanged payload,
including `File type not supported`, as non-retryable. Mark the media task
failed immediately and surface the provider error to the UI.

Transient transport, timeout, throttling, and server-availability failures
retain the current retry policy.

## Data Flow After Repair

1. Kie or Hermes completes an image task.
2. The frontend resolves the media asset and approves it for the shot.
3. `startFramePlan` stores the authoritative asset ID.
4. Per-shot video-prompt generation projects that ID into the clip.
5. Video submission re-reads `startFramePlan` and reconciles the projection.
6. Reference budgeting always reserves the first slot for the approved start
   frame.
7. The provider receives the current approved image, not `previous_main`.

## Compatibility and Migration

- No schema migration is required.
- No production asset is deleted or renamed.
- Existing episodes with missing or stale `clip.startFrameAssetId` are repaired
  lazily at submission time.
- Existing `previous_main` rows remain visible in the reference strip.
- Existing `.img` artifacts remain readable; they simply stop being selected
  ahead of the current approved frame.

## Failure Handling

- If the authoritative asset ID is invalid, deleted, or inaccessible, video
  submission must fail before reserving provider work, with an actionable
  missing-start-frame error.
- A stale clip projection must never override a valid current approved asset.
- Hermes format detection must fail closed for unsupported magic bytes.
- Non-retryable Kie validation errors must not remain in `pending`.

## Verification

### Web/Vertical Drama

- Regression: per-shot video-prompt generation persists the current
  `startFrameAssetId`.
- Regression: replacing an approved image after prompt generation causes
  video submission to use the newer approved asset.
- Regression: a missing clip projection with a `previous_main` reference still
  submits the current approved start frame first.
- Regression: a one-reference model sends exactly the approved start frame and
  trims `previous_main`.
- Regression: multi-reference models retain established ordering after the
  start-frame slot.
- Compatibility: a legacy clip with no approved start frame follows the
  existing fallback behavior.

### Worker

- JPEG result-marker URL produces a `.jpg` collected path and R2 key.
- PNG, WebP, and GIF markers use their matching suffixes.
- Corrupt or unsupported bytes remain rejected.
- Video result-marker behavior remains `.mp4`.

### Python media task

- `File type not supported` becomes terminal without scheduling a retry.
- Timeout, throttling, and transient provider failures still retry.

### Runtime proof

- Build and restart only the services whose source changed after explicit
  deployment confirmation.
- Reuse an existing valid PNG start frame for a no-cost request-inspection
  check where possible.
- A paid live Kie/Grok generation is optional and requires explicit approval
  immediately before submission.

## Trade-offs

The render-boundary lookup adds no new database round trip because
`generateVideoClip` already loads the episode row containing both JSON
documents. The dual write/read guard intentionally duplicates a small
invariant: write-side projection keeps state coherent, while read-side
reconciliation protects legacy data and future missed writers.

Format detection in the Worker adds negligible processing because the bytes
are already downloaded and inspected for validation.

## Out of Scope

- Renaming or rewriting existing R2 `.img` objects.
- Deleting the duplicate historical assets `768`/`769`.
- Changing provider reference-image limits.
- Bulk-generating replacement images or videos.
- Charging credits for a live verification run without explicit approval.
