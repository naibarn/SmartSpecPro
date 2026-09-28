# Research Notes

## Discovery

SocratiCode was attempted first but its MCP transport returned `Transport
closed`, so research used targeted `rg` and bounded source reads.

## Current ownership

- Shared types: `apps/web/shared/verticalDramaSeries/contracts.ts`
  - `VerticalDramaStartFramePlan` already stores `imagePromptMode`.
  - `VerticalDramaMotionPromptPack.promptLanguage` currently claims ownership
    of both image and video prompts.
- UI state: `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
  - Reads one `selectedPromptLanguage` from `motionPromptPack`.
  - Calls `setEpisodeVideoPromptLanguage`.
- UI rendering:
  - `VerticalDramaEpisodeWorkspace.tsx` forwards the language props.
  - `VerticalDramaStoryboardPanel.tsx` renders one `LanguageSelect`.
  - `LanguageSelect` currently has no `disabled` prop.
  - `verticalDramaWorkspaceCopy.ts` owns Thai/English labels.
- Server persistence: `apps/web/server/routers/verticalDramaEpisodes.ts`
  - `setEpisodeVideoPromptLanguage` patches `motionPromptPack`.
  - `setEpisodeImagePromptMode` is the closest minimal-plan pattern.
- Image language consumers:
  - single-shot start frame and supplementary reference-frame paths in
    `verticalDramaEpisodes.ts` read `motionPromptPack.promptLanguage`.
  - whole-plan path in `verticalDramaEpisodePipeline.ts` also reads the motion
    pack language.
  - `verticalDramaStartFrameGeneration.ts` consumes the passed language in
    legacy/cinematic builders; the policy-safe branch already omits language
    translation instructions.
- Video consumers in `verticalDramaEpisodePipeline.ts` and
  `verticalDramaEpisodes.ts` correctly read `motionPromptPack.promptLanguage`.

## Existing tests

- `verticalDramaEpisodes.videoPromptLanguage.test.ts`
- `verticalDramaEpisodes.imagePromptMode.test.ts`
- `verticalDramaStartFrameGeneration.imagePromptModes.test.ts`
- storyboard panel/workspace mode and language component tests
- pipeline start-frame and language wiring tests under server service tests

## Risk notes

- Updating whole JSONB values from a stale pre-transaction row could erase
  frames or clips. Setters need a transaction, row lock, and fresh merge.
- `projectStartFramePlan` can erase new plan-level fields unless the projection
  explicitly carries them over.
- Legacy fallback must stop following video language immediately after the
  first video-language change; snapshotting makes that transition durable.
