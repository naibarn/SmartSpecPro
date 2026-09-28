# Research notes

- Persisted episode 140 / shot 5 showed a self-consistent but wrong
  `frameAnalysis` and prompt. The validator compared the prompt to that same
  generated analysis, so it could not detect the wrong identity assignment.
- The approved frame's required refs contain all five physical characters.
- Deep-draft dialogue speakers are display names, while portrait lookups and
  reference attachment expect stable `characterKey` values.
- `generateVideoClip` already has a paid-render precondition area before credit
  reservation; it is the correct final gate.
- `setApprovedStartFrameAsset` already removes the affected motion prompt when an
  approved image changes. The new position lock must also be invalidated there
  and in character-reference/video-anchor changes.
- Existing JSONB artifacts can carry an additive optional lock without a schema
  migration.
- SocratiCode transport is unavailable in this session; discovery used bounded
  `rg`, line-range reads, persisted DB evidence, and focused tests.

Security boundary: the new write procedure must use `verticalDramaProcedure`,
`loadOwnedEpisode`, tenant/user filters, series-roster validation, and exact asset
matching. It must not accept arbitrary names or assets.
