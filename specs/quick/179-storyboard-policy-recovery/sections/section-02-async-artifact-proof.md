# Section 02: Async Artifact Proof

Ownership: `verticalDramaEpisodePipeline.ts` and the nearest focused async pipeline test.

When candidate-aware safety recovery is exhausted, persist the candidate, attempt count, and findings into the failed run artifact. Do not write that candidate to the active episode storyboard. Preserve existing generic handling for every other error.

Acceptance: focused tests prove artifact evidence survives and no public/API/schema contract changes are introduced.

## Implemented

- Added a guarded recovery-payload projection for `VD_STORY_POLICY_RISK` errors.
- Wired the async storyboard failure branch to persist the final candidate, repair count, and findings in the immutable run artifact.
- Generic failures retain the previous stage-only payload behavior; the active episode storyboard is still written only on success.
- Focused pipeline regression passes without schema or API changes.
