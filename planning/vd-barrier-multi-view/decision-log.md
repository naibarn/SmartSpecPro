# Decision Log

## Depth

Chosen depth: standard quick-plan.

Reason: the feature spans shared contracts, server prompt/render paths, a React shot-card UI, and focused QC/tests, but the repository already has the asset/reference table, reference-frame generation path, speaker-switch planner, and video attachment path. No new service or database table is required for the first implementation.

## Decisions

1. Use a dedicated `barrierMultiView` contract, not generic supplementary-reference inference.
2. Keep one logical storyboard shot and one consolidated multi-shot video clip in the first provider-capable path. Add explicit timed cuts and view roles to the prompt/metadata.
3. Keep the existing main start frame as `approvedMediaAssetId`; store the outside reference asset id in the frame's barrier metadata and link it through the existing shot-reference table.
4. Use explicit `dialogueSideMap`; never infer sides from synopsis prose.
5. Make start frame first and barrier reference second in the render reference ordering. Fail closed if the pair cannot both be attached under the selected model's reference limit.
6. Treat old single-frame `barrierDialogue` as a migration source only. Do not silently use it as the complete production input.
7. Generic reference frames remain available for other use cases and are not automatically promoted to a barrier view.

## Risks that may trigger promotion later

- A provider may accept multiple images but not reliably perform timed hard cuts. The first release must expose capability/quality evidence; a later fallback can render per-view sub-clips and assemble them.
- If frame JSON becomes too large or view history/versioning is needed, move barrier metadata to a normalized table in a follow-up migration.
