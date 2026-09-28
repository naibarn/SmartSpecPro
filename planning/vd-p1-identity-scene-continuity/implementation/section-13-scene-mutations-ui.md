# Section 13 implementation record

Implemented the Feature 138 Scene Visual State surface:

- Added flag-gated `planSceneVisualState` and `updateSceneVisualState` router mutations with owner checks, scene-group resolution (including per-shot location overrides), roster-backed location authoring facts/reference lookup, strict bounded manual patches, row-lock persistence, idempotent/force behavior, `expectedRevision` conflict protection, and explicit authoring error mapping.
- Added `flags.sceneContinuity` to `getEpisodeDetail` without adding a new query position; it is resolved alongside the existing density flag read.
- Added the props-only `VerticalDramaSceneLockRow`/dialog, location-bible wiring, per-shot scene-lock chip, read-only persisted anchor-provenance badge, and page/workspace mutation threading.
- Added focused UI tests for the row and storyboard chip/flag behavior.

Binding override applied: neighbor-anchor generation/writer remains deferred to the separate P1b child flag; the P1a UI only displays a persisted provenance stamp when one already exists. Existing dirty worktree changes in the large panel/workspace/page files were preserved and not normalized wholesale.

Verification:

- `VerticalDramaSceneLockRow.test.tsx`: 3 tests passed after the expected-revision contract change.
- `VerticalDramaStoryboardPanel.sceneContinuityUi.test.tsx`: 2 tests passed.
- The storyboard UI test also verifies the Thai provenance copy and approved-source title while the flag is on, and keeps the badge hidden when the flag is off.
- Existing start-frame/video router regressions: 62 tests passed.
- Existing model-family/image-prompt-mode client regressions: 4 tests passed.
- `git diff --check` clean for touched paths.
- Full TypeScript output was filtered to touched paths; no diagnostics were emitted for the touched paths. The repository still has a large unrelated baseline diagnostic set.
