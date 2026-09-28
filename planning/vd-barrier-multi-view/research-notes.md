# Research Notes

## Current code fit

- `apps/web/shared/verticalDramaSeries/contracts.ts` stores per-shot start-frame JSON and already carries required/screen-caller refs.
- `apps/web/shared/verticalDramaSeries/barrierDialogue.ts` is the prior single-frame closed-door contract. It must become a compatibility input, not the primary production representation.
- `apps/web/server/routers/verticalDramaEpisodes.ts` owns shot reference assignment, start-frame prompt/image generation, video prompt generation, reference attachment ordering, and frame QC.
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` owns batch/per-shot image prompt contracts and reference-frame mode.
- `apps/web/server/services/verticalDramaShotReferences.ts` plus `vertical_drama_shot_references` already persist extra per-shot media assets, including `source: reference_frame`, with tenant/user/episode ownership checks.
- Video render already starts with the approved frame and merges `clip.extraReferenceAssetIds` plus manually linked shot references before portraits/location references. The missing piece is semantic role/order and fail-closed validation for the barrier reference.
- Speaker-aware video prompt generation already computes ordered speaker-switch windows and currently emits one consolidated clip. Extend those windows with barrier side/view metadata instead of changing the whole storyboard shot count in the first implementation.
- `VerticalDramaReferenceFrameDialog` already supports user-authored supplementary reference frame generation; Barrier Multi-View needs a dedicated two-slot UI and per-view character/location inputs rather than reusing generic selection implicitly.
- Existing start-frame/reference-frame skills have paired `SKILL.md`/`skill.md` files and image prompt reference-frame mode. They need an explicit barrier-view contract block while preserving existing generic reference-frame behavior.

## Risk and boundary findings

- `requiredCharacterRefs` must remain the physical cast visible in the main start frame. Adding the outside actor there would reintroduce the original bug.
- A generic reference row has no reliable semantic role for video prompt authoring. Persist a frame-level barrier pointer and use a typed/validated `barrier_reference` role for the linked row; the DB column is already varchar.
- Location continuity must allow two adjacent location keys. A single scene continuity lock cannot be reused as if both views were the same room.
- Provider reference-image caps are real: start frame consumes one slot. The barrier reference must be prioritized before generic extras, and a missing primary pair must fail before paid render rather than silently trim to one image.
- Current `closed_door` implementation may already have persisted data. Migration must be non-destructive and show an incomplete-pair state until the outside image exists.
