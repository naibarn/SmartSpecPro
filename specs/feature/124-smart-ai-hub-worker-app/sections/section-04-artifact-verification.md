# Section 04: Artifact Verification

## Goal

Verify worker-rendered HyperFrames artifacts on the server before marking a job
complete or publishing output to Media Library.

## Dependencies

- section-01-contracts-and-flags
- section-02-worker-queue-scheduler
- section-03-lease-attempt-watchdog

## In Scope

- Expected artifact types.
- Server verification service.
- Integration with worker artifact completion.
- Verified output references for HyperFrames projection.
- Publish only after verification passes.
- Retention, cleanup, stale-artifact quarantine/deletion policy.

## Files To Review

- `apps/web/server/services/workerArtifactService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/hyperframesLibraryFinalizeService.ts`
- `apps/web/server/storage.ts`
- `apps/web/server/services/__tests__/workerArtifactService.test.ts`
- `apps/web/server/services/__tests__/hyperframesLibraryFinalizeService.test.ts`

## Files To Change

- new `apps/web/server/services/hyperframesWorkerVerificationService.ts`
- `apps/web/server/services/workerRegistryService.ts`
- `apps/web/server/services/workerArtifactService.ts`
- tests listed above plus new verification tests

## Test First

- Test: verification rejects missing final MP4.
- Test: verification rejects hash mismatch.
- Test: verification rejects MIME type mismatch.
- Test: verification rejects duration/aspect/fps outside tolerance.
- Test: verification requires runtime doctor report.
- Test: verification requires probe report.
- Test: stale attempt artifact completion is rejected before verification.
- Test: large final videos uploaded through signed direct/multipart/chunk upload
  sessions still require active assignment attempt and lease validation on init,
  part/chunk registration, and complete.
- Test: successful verification writes report into `worker_jobs.outputJson`.
- Test: Library publish happens only after verification passes.
- Test: expired signed input manifest cannot be reused by an old attempt.
- Test: incomplete uploads expire and are garbage-collected.
- Test: stale artifacts are rejected and deleted or quarantined according to
  policy.
- Test: sanitized log bundle redacts tokens, signed URLs, local paths, and raw
  composition HTML.
- Test: diagnostic smoke runtime or ASS/FFmpeg fallback output is rejected as
  final composite.

## Implementation Steps

1. Define artifact types:
   - `hyperframes_final_video`
   - `hyperframes_render_manifest`
   - `hyperframes_runtime_doctor`
   - `hyperframes_probe_report`
   - `hyperframes_snapshot`
   - optional `subtitle_file`
   - optional `transcript_file`
   - optional `sanitized_log_bundle`
2. Add verification service that reads worker job input, expected requirements,
   recorded artifacts, and uploaded artifact metadata.
3. Verify assignment attempt and lease identity before accepting completion.
4. Support large artifact upload sessions through the existing artifact service:
   signed direct upload, multipart upload, or chunked upload may be used, but
   every init/part/complete operation must echo the active job id, artifact id,
   assignment attempt, lease identity, content hash metadata, and expected
   artifact type.
5. Verify composition hash, timeline hash, template id/version, runtime evidence,
   output hash, MIME, size, duration, aspect, fps, audio/subtitle policy.
6. Store a sanitized verification report in output JSON.
7. Trigger publish/finalize only after verification succeeds.
8. Return safe error messages for user projection and detailed diagnostics only
   for admin/support paths.
9. Add retention/cleanup handling for signed manifests, incomplete uploads,
   stale artifacts, verified outputs, and sanitized support bundles.

## Important Constraints

- FFmpeg/FFprobe may be used for probing, not for replacing HyperFrames overlay
  rendering.
- Failed verification must not mark final composite completed.
- Do not expose signed URLs or local paths in normal user output.
- Cleanup must never delete verified Media Library artifacts.
- Verification must reject diagnostic, fallback, or unapproved runtime outputs.

## Acceptance Criteria

- A completed worker job has verified artifacts and a server verification report.
- Bad/stale/missing artifacts never publish.
- HyperFrames projection can read verified output refs.

## UI/UX Contract

### Target User / JTBD

Creators need to know whether a worker output is verified and safe to download.
Admins/support need actionable diagnostics when verification fails, without
leaking local paths or signed URLs to normal users.

### Surface Inventory

- Storyboard Review final composite completion/failure panel.
- User job monitor output link and verification failure state.
- Admin job detail diagnostics.
- Worker App upload/verification status.

### Component Map

- No visual component is implemented in this section.
- Verification results must expose safe status fields consumed by the user and
  admin surfaces in later sections.

### State Matrix

- Uploading artifacts: show upload/progress state.
- Server verifying: show verification in progress after worker upload.
- Verified: show final video download/open link and verified timestamp.
- Verification failed: show plain reason and recommended next action.
- Missing artifact/hash mismatch/stale attempt: do not show a downloadable final
  video as completed.

### Responsive Matrix

Verification reason copy should be short in job cards and expandable in details.
Long artifact ids/hashes should appear only in admin details with copy controls.

### Accessibility Acceptance

Verification success/failure must use text and status icons with accessible
labels. Download links must have descriptive labels.

### Copy Contract

Normal users see terms such as output verification failed, missing video,
duration mismatch, or worker output expired. Admins can see artifact type,
expected/actual duration, hash mismatch, and probe report references.

### Browser Evidence Required

Later UI sections must capture verified output, verification in progress, and
verification failed states in Storyboard Review and job monitor views.
