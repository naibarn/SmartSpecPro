# Research notes

- SocratiCode MCP was unavailable; targeted `rg` and line-range reads were used.
- Existing `verticalDramaEpisodePipeline.repairStage` repairs one pipeline stage and can pass the current script/storyboard, but it does not atomically replace synopsis, dialogue, and the 9-shot storyboard as one episode revision.
- Existing `verticalDramaStoryJobs` provides BullMQ dispatch, Redis status, per-series exclusivity, idempotency, progress and recovery. Reuse it with a new job kind rather than adding a queue.
- `verticalDramaEpisodes` stores script/storyboard/startFramePlan/dialogueAudioPlan/motionPromptPack/assemblyManifest, but no revision ledger. `vertical_drama_run_artifacts` is tied to stage runs and is not a suitable user-facing revision history by itself.
- Existing `VerticalDramaSeriesMemoryService.buildEpisodeMemoryBundle` is deterministic and prior-state oriented. A repair needs a separate bounded next-episode constraint so future knowledge cannot leak into character memory.
- Existing skills already provide story script generation, storyboard shotgrid generation, start-frame render planning, series memory planning, and episode quality review. The repair path should invoke these existing contracts and add a policy-safe context block rather than bypassing them.
- Existing prompt safety mode for managed Vertical Drama preserves the assembled prompt; it does not provide dedicated child/vulnerability story filtering. A separate deterministic story-risk analyzer is required before persistence and before paid media generation.
- Existing focused test command is `npm --workspace apps/web test -- <files>`.
