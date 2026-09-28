# Implementation Plan

## Objective

Allow one sub-episode to generate image prompts in the synopsis language and
video prompts in a separately selected language, without breaking legacy
episodes or changing already generated media.

## Approach

1. Extend shared contracts and introduce a pure resolver for effective image
   prompt language.
2. Add image-language persistence and make the existing video-language setter
   snapshot legacy image language atomically.
3. Route every image prompt path through the image resolver while leaving every
   video path on `motionPromptPack.promptLanguage`.
4. Preserve image language through start-frame plan projection/regeneration.
5. Split the UI into image and video prompt-language controls. Disable image
   translation when Option 1 is selected or auto-resolved.
6. Add regression tests before/alongside each behavior change and run targeted
   tests, typecheck, diff checks, and responsive browser verification where
   available.

## Expected files

- `apps/web/shared/verticalDramaSeries/contracts.ts`
- a small shared/server resolver module under `apps/web/shared/verticalDramaSeries/`
- `apps/web/server/routers/verticalDramaEpisodes.ts`
- `apps/web/server/services/verticalDramaEpisodePipeline.ts`
- `apps/web/server/services/verticalDramaStartFrameGeneration.ts` only if
  projection preservation or exported params require it
- `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaEpisodeWorkspace.tsx`
- `apps/web/client/src/components/verticalDramaSeries/VerticalDramaStoryboardPanel.tsx`
- `apps/web/client/src/components/verticalDramaSeries/verticalDramaWorkspaceCopy.ts`
- targeted router/service/component tests

## Risks and mitigations

- Lost JSONB updates: lock and re-read before merging.
- Legacy semantic drift: snapshot old effective image language before changing
  video language.
- Plan regeneration erases preference: explicitly carry the plan-level field.
- Option 1 accidental translation: keep the deterministic branch free of any
  prompt-language instruction and test Thai round-trip.
- UI ambiguity: distinct labels and a real disabled state.

## Acceptance criteria

- Image and video language values persist independently per sub-episode.
- Option 1 output remains in the original synopsis language.
- Option 2/legacy/reference/batch image generators use image language.
- Video generators use only video language.
- Changing video language on a legacy episode does not change future image
  language.
- Full start-frame plan refresh preserves image language.
- Existing generated prompts/assets remain unchanged.
- Targeted tests and TypeScript typecheck pass.

## Rollout

No migration or backfill. Deploy backend and frontend together, restart the
backend, then verify Option 1 and Option 2 at the required viewports. Existing
episodes transition lazily on their first language-setting change.
