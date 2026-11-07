# P3 Implementation Spec — Audio, Editing and Cross-Episode Continuity

## Accepted outcome

Complete only the source-verified gaps in dialogue/lip-sync, sound design, audio/video editing and continuity across episodes. Existing user audio mode is authoritative. Optional audio/continuity/QC failure cannot invalidate a usable generated video or erase the previous successful audio/video version.

## Existing implementation to reuse

Current dialogue/audio plans and controls; `verticalDramaDialogueAudio.ts`, `verticalDramaAudioPipelineCoordinator.ts`, `verticalDramaAudioQc.ts`, `verticalDramaAudioRepair.ts`, `verticalDramaAudioMastering.ts`, `verticalDramaEpisodeVideoAssembly.ts`; series memory and story bible; `worker_jobs` plus outbox. Feature 175 is a large design with 28 unresolved canonical requirements and must be reconciled before adopting its proposed schema, model matrix or processing features.

## Scope

Select bounded Feature 175 slices that close actual dialogue, voice identity, SFX/ambience, lip-sync, mixing, mastering, edit and cross-episode visual/audio canon gaps. Keep original/native media and user settings intact. Use only approved execution for heavy isolated work; do not introduce OpenSandbox, Docker dispatch, always-on compute, or a parallel queue.

## User-facing behavior

Audio-on/off and dialogue-only behavior remain as selected by the user. Audio warnings and repair suggestions are advisory. A missing optional audio enhancement yields an understandable warning and preserves usable video; no new wait or approval is added.

## Acceptance

Video stays inspectable/exportable when optional audio generation/QC/mix fails. Existing dialogue-only and silent modes remain correct. Cross-episode facts are revisioned and tenant-scoped; missing/stale context uses the current episode's valid inputs.
