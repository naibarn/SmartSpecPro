# Research Notes

- `apps/web/server/routers/verticalDramaEpisodes.ts` builds the final cover
  prompt in `generateEpisodeCover`, then branches to Hermes or
  `mediaGenerationService.generateImageAsync`.
- `apps/web/shared/verticalDramaSeries/episodeCover.ts` owns the prompt
  assembly and cover JSONB state shape.
- `apps/web/server/services/imagePromptSafetyService.ts` currently returns
  Vertical Drama prompts unchanged in `vertical_drama_managed` mode and runs
  the generic skill only for standard requests.
- `apps/web/server/services/mediaGenerationService.ts` invokes the safety
  service for normal image requests. The existing `__prompt_safety` metadata is
  persisted/internal and stripped from provider-facing parameters.
- `apps/web/skills/vertical-drama-shot-synopsis-image-prompt` is a focused
  Start Frame skill, not an episode-cover skill; the generic
  `image-prompt-safety-rewriter` is documented as non-drama.
- No SQL migration is needed because cover state is JSONB and the safety
  summary can be additive.
- The worktree is heavily dirty across the same domain; edits must remain
  limited to owned files and tests.
