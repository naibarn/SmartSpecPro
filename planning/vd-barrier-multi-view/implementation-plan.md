# Implementation Plan

## Objective

Implement the approved two-view barrier flow end to end: configure two explicit views, generate and display separate Start/Reference frame slots, attach both with semantic ordering, create speaker-side timed cuts, preserve legacy migration, and block unsafe/incomplete video generation.

## Work packages

### 1. Shared contract and migration

- Add `VerticalDramaBarrierMultiView`, view/status/cut types, normalization, validation, and deterministic prompt fact helpers in a focused shared module.
- Extend `VerticalDramaStartFramePlan.frames[]` and client view types with `barrierMultiView`.
- Add migration projection from legacy `barrierDialogue` to an incomplete `barrierMultiView` configuration. Keep legacy data untouched.
- Extend shot-reference role/source types with `barrier_reference` while keeping DB varchar compatibility.
- Ensure status is derived from asset/config freshness and does not claim ready when the reference asset is missing.

### 2. UI and per-view image generation

- Add a dedicated Barrier Multi-View block to `VerticalDramaStoryboardPanel`, separate from Caller and generic reference frames.
- Add a configuration dialog with explicit inside/outside character pickers and location selectors, validation, loading, empty, stale, success, and retry states.
- Thread callbacks through `VerticalDramaEpisodeWorkspace` and `VerticalDramaEpisodePage`.
- Add a paired-generation action with one paid confirmation boundary; persist partial success so only the missing view retries.
- Reuse the existing start-frame generation for the inside view and reference-frame generation path for the outside view, but pass view-specific character refs/location key and stable barrier labels.
- Link the generated outside asset through the existing shot-reference service with `source: reference_frame`, `role: barrier_reference`, and the frame-level asset pointer.
- On view assignment changes, clear stale prompt/QC/video lineage and preserve unrelated generic references.

### 3. Video prompt and render integration

- Extend speaker-switch windows with `side`, `viewRole`, and stable view ids from the explicit `dialogueSideMap`.
- Attach labeled Start/Reference view images to video prompt authoring; include a deterministic `barrierMultiViewPlan` fact and timed cut plan.
- Thread barrier facts through both consolidated speaker-switch and normal video prompt paths; reject any dialogue speaker without a side map.
- In video render, prioritize start frame then barrier reference before generic shot refs, portraits, and locations. Report exact trim/kept assets.
- Add a capability gate: if the selected model cannot preserve both primary view inputs/multi-shot cut semantics, stop with an actionable error instead of reverting to one image.
- Keep clip provenance for both view asset ids and the chosen render mode.

### 4. QC, migration UX, and tests

- Add deterministic validation for disjoint view character sets, location keys, speaker-side completeness, Caller conflicts, and asset pair completeness.
- Add image QC inputs for inside/outside view role, character presence, location, duplicate image detection, and closed-door separation.
- Add prompt/render payload tests proving stable labels, cut order, start-first/reference-second ordering, and fail-closed trimming.
- Add UI tests for two slots, partial failure/retry, stale state, and Caller exclusion.
- Add migration tests for legacy single-frame `barrierDialogue`.
- Verify paired start-frame skill files remain byte-identical.

## Affected areas

- Shared: `apps/web/shared/verticalDramaSeries/contracts.ts`, new barrier multi-view helper/module, shot-reference contracts/barrel, shared tests.
- Server: `apps/web/server/routers/verticalDramaEpisodes.ts`, `verticalDramaStartFrameGeneration.ts`, `verticalDramaEpisodePipeline.ts`, `verticalDramaShotReferences.ts`, video prompt/render helpers, server tests.
- Client: `VerticalDramaStoryboardPanel.tsx`, `VerticalDramaEpisodeWorkspace.tsx`, `VerticalDramaEpisodePage.tsx`, copy strings, barrier configuration dialog, client tests.
- Skills: paired `vertical-drama-shot-start-frame-render` and `vertical-drama-shot-start-frame-prompt` files as needed; keep uppercase/lowercase copies identical.

## Acceptance criteria

- A configured shot displays two distinct slots: Start frame/Inside and Reference frame/Outside.
- The example configuration stores Irin only in the main frame and Krit only in the outside view; neither is classified as phone Caller.
- The system can generate/retry each view independently and never reports the pair ready with a missing/stale outside reference.
- Video prompt output contains explicit side/view mapping and timed speaker cuts.
- Video render payload sends the main start frame first and the barrier reference second, and never silently drops the barrier reference.
- Legacy single-frame data migrates to an incomplete two-view state without data loss.
- Focused tests pass; any repository-wide failures are reported separately.

## Rollout

Gate with a tenant feature flag if existing feature-flag conventions make this low-cost. Enable only after focused tests and one real episode evidence pass. Do not delete the old `closed_door` field until migration telemetry confirms adoption.
