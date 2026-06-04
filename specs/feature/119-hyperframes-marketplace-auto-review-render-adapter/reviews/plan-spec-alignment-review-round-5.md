# Plan/Spec Alignment Review Round 5

## Verdict

The plan has been updated to close the latest contract and execution-dependency
clarity findings. The changes are still planning-only and do not touch
application code.

## Improvements Applied

- Replaced the pseudo-section wording `section-12-preflight` with
  `section-12 preflight slice`, explicitly noting that it is not a separate
  manifest section.
- Added Section 12 preflight deliverables in both the implementation index and
  Section 12 so implementers can run dependency/runtime checks before Section 05.
- Added shared contract coverage for `HyperframesChargeSummary`,
  `HyperframesPollingGuidance`, and `HyperframesRepairAction`.
- Added `repairActions: HyperframesRepairAction[]` to
  `HyperframesRenderStatusProjection` and required it to be present even when
  empty.
- Updated router/UI/worker plan sections so repair availability comes from
  typed `repairActions`, not parsed status copy.

## Remaining Implementation Notes

Implementation should keep command names aligned with actual `apps/web` scripts,
avoid installing HyperFrames runtime packages before the preflight gate, and keep
Standard Order regression tests in every rollout stage.
