# Research notes

- The failed job is `4f157219-202f-43ed-8b5a-731cb623de65`, series `25`, Premium mode, 15 episodes.
- Redis still contains a complete checkpoint with episodes 1-15, but every `threadsResolved` array is empty.
- `buildRegisteredThreadIdsPromptBlock` accepts `openThreadIds`, and Standard mode maintains that set across chunks.
- Premium `callPremiumFanoutCandidate` passes only `openThreads` into `buildDeepDraftPrompts`; it does not carry the structured ID set.
- `validateVerticalDramaContinuity` currently reports non-season open threads only when `seasonEndEpisode` is supplied and does not use `expectedResolutionEpisode`.
- The router rejects a full-season result before writing the new bible, which is correct for data safety but currently produces a generic failed story-job ticket after expensive Premium calls.
- Series #25 has materialized episode summaries but no new structured series memory; the recovery must not overwrite them until the checkpoint passes validation.
- SocratiCode MCP was unavailable; targeted shell, Redis, PostgreSQL, and focused Vitest evidence were used.
