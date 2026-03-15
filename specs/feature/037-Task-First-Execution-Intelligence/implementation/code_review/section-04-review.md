# Section 04 Code Review

## High Severity
1. **No runtime integration** — artifactRouter not called from aiPresentationService or any runtime
2. **linkArtifactToTaskRun truthy check on ID** — will skip ID 0
3. **No FK constraints on presentationDeckId/artifactMessageId** — dangling refs possible
4. **video_storyboard intent unreachable** — defined but never classified/routed

## Medium Severity
5. **Substring matching too broad** — 'analysis', 'summary' may false-positive
6. **No test for linkArtifactToTaskRun** — store persistence untested
7. **Stringly-typed artifact fields in CreateTaskRunInput** — should use ArtifactIntent/ExecutionRoute types
8. **linkArtifactToTaskRun updates even with empty artifact** — wasteful no-op

## Low Severity
9. **media_audio not tested** — missing edge case
10. **No indexes on artifactIntent/executionRoute** — may need for telemetry queries
