# P2 Implementation Spec — Advisory QA and Asset Preservation

## Accepted outcome

Visual/cinematic QA reports useful findings while preserving production and asset availability. Quality status is not media readiness. No usable image/video can be rejected, hidden, or replaced solely because a score is low or QC warns/fails. Repairs are explicit and bounded; a failed candidate never replaces the last successful version.

## Existing components to reuse

`verticalDramaQc.ts`, `verticalDramaFrameContinuityQc.ts`, `verticalDramaClipIdentityQc.ts`, `verticalDramaEpisodes.runFrameContinuityQc`, `runClipIdentityQc`, `verticalDramaEpisodeRepair.ts`, episode repair attempts, media artifact/asset ownership, `verticalDramaEpisodeVideoAssembly.ts` and existing assembly manifest/version projection.

## Scope

Finish direct UI/API proof of identity/continuity warning accessibility, distinguish advisory report/run state from generated media status, retain successful versions across repair/provider failures, offer manual selective repair without auto-spend, and verify existing partial assembly and truthful fallback labeling.

Exclude aesthetic rejection, auto-repair loops, any forced quality approval, silent image-to-video substitution, and changes that weaken ownership, technical artifact validity, content-safety or billing checks.

## Acceptance

After warning, failed/unavailable QC, report persistence failure, timeout or failed repair, a tenant-authorized user can still inspect/download the previous usable output. Assembly passes through quality warnings but continues to enforce essential technical media integrity and truthful partial/fallback labels.
