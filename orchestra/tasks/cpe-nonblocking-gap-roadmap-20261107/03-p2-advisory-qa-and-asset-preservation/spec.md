# P2 — Advisory QA, Repair and Asset Preservation

## Goal

Deliver visual continuity/identity/cinematic QA as advisory information, with safe user-driven selective repair and proven availability of the last successful image/video.

## Scope

Reconcile and finish frame/clip visual QA, report persistence, warnings/badges, manual selective regeneration, output version lineage, successful-asset promotion, and supported partial assembly. Verify that QC failure cannot reject or hide usable media. Inspect existing Feature 137/138/149/157 and `verticalDramaQc`, frame/clip QC routes, repair services, and assembly contracts first.

Exclude any aesthetic threshold that invalidates an asset, forced repair loops, unlimited retries, automatic paid regeneration, or changing hard technical QC into advisory.

## User-Facing Behavior

Users can view or download a completed clip even when identity/continuity/cinematic QA warns or is unavailable. Repair is an explicit, bounded user action. A partial assembly uses only existing supported controls and is labeled as partial; placeholders are never called generated clips.

## Technical Constraints

- Reuse `verticalDramaQc.ts`, `verticalDramaFrameContinuityQc.ts`, `verticalDramaClipIdentityQc.ts`, `verticalDramaEpisodeRepair.ts`, media task artifact ownership, and `verticalDramaEpisodeVideoAssembly.ts`.
- Preserve provider safety, ownership, artifact verification, current asset retention and cancellation.
- Treat QC `passed` as report semantics, not media availability; keep advisory report/run state distinct from image/video task readiness.
- Promote a candidate only after existing task/artifact readiness and owner checks; failure leaves the last successful asset pointer and version readable.

## Dependencies

P0 hard/advisory classification and P1 shot/style/reference lineage.

## Outputs

Advisory QC/repair contracts, asset-version preservation evidence, visible warning/accessibility proof, and verified partial/fallback assembly semantics.

## Edge Cases

- Clip changes while sampling/vision is in flight; stale QC must not attach to the replacement.
- Vision, sampling, or report persistence fails after a valid media output exists.
- A repair provider fails or returns a technically invalid artifact.
- The user deletes/replaces the old asset during analysis.
- Some clips are usable and others have a genuine technical generation failure.

## Error Handling

Store a warning when possible, do not change successful media state, do not replace the active asset with a failed candidate, and do not charge for an unapproved retry. Hard security/safety/ownership and technical artifact validation remain hard.

## Testing Expectations

Directly test character identity warning -> authorized media read/download still succeeds; frame continuity warning -> image/video paths remain eligible; QC/report persistence failure does not reject media; failed repair preserves prior asset; stale QC cannot overwrite a new clip; partial assembly includes only completed clips and labels the result; zero completed clips and essential technical corruption still fail accurately.
