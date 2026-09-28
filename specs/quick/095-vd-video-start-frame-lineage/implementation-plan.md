# Implementation Plan

## Objective

Ensure every Vertical Drama video render uses the current approved shot image,
preserve that lineage through per-shot prompt regeneration, create correctly
suffixed Hermes image artifacts, and fail deterministic Kie file-type
validation errors immediately.

## Current-codebase fit

The implementation extends existing invariants rather than adding a new
storage or transport layer:

- `startFramePlan` remains authoritative.
- `motionPromptPack` remains a denormalized render plan.
- reference resolution continues through `resolveMediaAssetUrlsByIds`.
- Hermes output validation remains magic-byte based.
- Celery retry classification continues through
  `_is_non_retryable_media_error`.

## Implementation approach

### Web

First add failing router tests for missing and stale clip lineage. Update all
per-shot prompt persistence branches to retain the approved ID. At
`generateVideoClip`, derive the primary shot's current approved asset from the
loaded episode row and use it ahead of any projected or fallback reference.

Do not mutate production episode JSON merely to repair old rows. Lazy
submission-time reconciliation is sufficient.

### Worker

Add a pure helper that maps supported image magic bytes to a file extension.
Use it when writing downloaded HTTPS result markers. Keep the existing
validation and error codes.

### Python

Add the exact deterministic Kie failure phrase to the permanent-error
classifier and prove transient failures remain retryable.

## Risks and mitigations

- Risk: changing reference order for legacy clips.
  Mitigation: only force the authoritative frame when one exists; preserve
  current fallback behavior otherwise.
- Risk: split clips use a different persistence constructor.
  Mitigation: test and patch both single and split branches.
- Risk: extension detection diverges from validation.
  Mitigation: derive both from the same supported magic-byte table/helper.
- Risk: retry classifier becomes overly broad.
  Mitigation: match `file type not supported`, not generic words such as
  `file`, `type`, or `unsupported`.

## Acceptance criteria

1. Per-shot prompt generation cannot erase the approved start-frame ID.
2. A newer approved frame overrides a stale clip projection at submission.
3. Grok Video with max one reference sends exactly the approved current frame.
4. New Hermes JPEG/PNG/WebP/GIF outputs use matching suffixes.
5. Kie `File type not supported` fails immediately; transient errors retry.
6. Focused Web, Rust, and Python tests pass.
7. No unrelated dirty-worktree files are modified.

## Rollout

Implementation and local tests may proceed without interruption. Building and
restarting production Web/Celery services or distributing a rebuilt Worker
requires explicit confirmation at the deployment boundary. Paid provider smoke
tests require separate explicit approval.

