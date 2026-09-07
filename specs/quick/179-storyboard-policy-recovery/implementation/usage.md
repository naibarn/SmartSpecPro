# Usage Guide

The change is automatic. Submit the existing `storyboard_shotgrid` stage normally.

- Safe output proceeds unchanged.
- A policy finding triggers up to three targeted repairs inside the same run.
- The accepted candidate is persisted and charged once.
- If all repairs remain blocked, the run artifact contains `safety_recovery.candidate`, `repair_attempts`, and `findings`; unsafe content is not activated on the episode.

Focused verification:

`npm --workspace apps/web test -- --run server/services/__tests__/verticalDramaStoryboardGeneration.test.ts server/services/__tests__/verticalDramaEpisodePipeline.repairStage.test.ts server/services/__tests__/verticalDramaStorySafety.test.ts`
