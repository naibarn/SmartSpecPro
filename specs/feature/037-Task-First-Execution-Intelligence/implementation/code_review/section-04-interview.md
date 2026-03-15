# Section 04 Code Review Interview

## Auto-fixed
| # | Finding | Fix |
|---|---------|-----|
| 2 | linkArtifactToTaskRun truthy check on ID 0 | Changed to `!= null` checks |
| 4 | video_storyboard unreachable | Removed from ArtifactIntent union |
| 7 | Stringly-typed artifact fields | Imported and used ArtifactIntent/ExecutionRoute types |
| 8 | linkArtifactToTaskRun wasteful no-op | Added early return when neither ID provided |

## Let go (by design)
| # | Finding | Rationale |
|---|---------|-----------|
| 1 | No runtime integration | Same pattern as section 03 — foundation first, wiring later. Section 05 covers integration rollout |
| 3 | No FK on presentationDeckId/artifactMessageId | Nullable FK to existing tables could complicate cascade deletes. Soft linkage is intentional for v1 |
| 5 | Substring matching too broad | v1 heuristic. Can add skill-type metadata in future for precise classification |
| 6 | No test for linkArtifactToTaskRun | Requires DB integration test setup |
| 9 | media_audio not tested | Trivial — covered by Set membership |
| 10 | No indexes on new columns | Premature — add when telemetry queries materialize |
