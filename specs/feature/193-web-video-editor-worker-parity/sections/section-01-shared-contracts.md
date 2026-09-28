# Section 01 — Shared contracts

## Objective

Create the shared data contracts that let browser playback, Worker analysis,
and Worker render consume the same five-point face evidence, activity
association, camera plan, and silence cut map.

## Implementation status

Implemented in `packages/shared/src/video-editor/cameraEvidence.ts`,
`silenceCutMap.ts`, and the existing camera/media contract exports. Legacy
camera plans remain readable; new five-point evidence and cut maps are
fingerprinted and validated.

## Implementation scope

- Extend `packages/shared/src/video-editor/cameraMotion.ts` with bounded
  `FaceKeypoint5`/activity evidence, validation, plan evidence provenance, and
  source-time evaluation. Preserve legacy plan parsing and mark bbox-only
  evidence degraded.
- Add `packages/shared/src/video-editor/silenceCutMap.ts` for sorted half-open
  source ranges, source↔edited prefix maps, normalization, fingerprinting, and
  stale-source validation. Export it from the video-editor index.
- Add `media.composition_scan` to
  `packages/shared/src/video-editor/mediaExecutionContract.ts`, analysis kinds,
  and claim capability validation.
- Update `apps/web/server/services/editorMediaJobContract.ts` to map the new
  operation while retaining `media.reframe` as an alias.
- Add explicit outer `feature-186-v1` / nested `feature-191.v1` compatibility
  types and validators. Reject unsupported combinations before claim.

## Contract rules

The five points are left eye, right eye, nose tip, left mouth, and right mouth.
Each point is finite, normalized, confidence/visibility-bounded, and tied to a
stable face track. Activity evidence references the same face track or an
explicit manual target. Camera-plan and cut-map fingerprints include source,
revision, trim, aspect, marks, policy, capability, and contract values.

## TDD targets

- Point normalization, missing-point degradation, ROI derivation, and activity
  association validation.
- Legacy plan read/validation and new evidence rejection cases.
- Cut-map sorting, merging, half-open boundaries, reverse mapping, and stale
  source/audio fingerprint rejection.
- Operation allowlist and transport/nested contract version acceptance/rejection.
