# Vertical Drama — Audience Age Rating (content-tier)

## Problem / intent
Creators need a series-level "target audience age" selector that shapes GENERATED CONTENT (story, script, dialogue, storyboard), not just a render-time safety gate. Default `18plus`; also `13plus` and `under13`. Skill-first: inject a tier context block into each generation stage's prompt + add authoring guidance to skill.md; never hardcode content filtering in TS.

## Field / storage
- `bible.audienceAgeRating: "18plus" | "13plus" | "under13"`, default `18plus`.
- `bible` is free-form jsonb → **no DB migration**.
- Shared source of truth: `apps/web/shared/verticalDramaSeries/audienceAgeRating.ts` (DONE) — enum + default + `resolveAudienceAgeRating()` + `AUDIENCE_AGE_RATING_LABELS` + `renderAudienceAgeRatingBlock(rating)` (the injected prompt block, English, firm per-tier constraints).

## Distinct from existing
`enforceMediaAgeSafety` (media.ts) = per-generation raw-prompt safety gate. This feature = creative planning steer. Complementary, not a replacement.

## Phase 1 (field plumbing + master story bible) — THIS CHECKPOINT
1. Wizard (`CreateSeriesWizard.tsx`): `audienceAgeRating` in `WizardState`/`INITIAL_WIZARD` (default `18plus`); a Step-1 `<Select>` (mirror the `locale` select ~L815); send top-level in `handleCreate` (~L420) and `handleSynthesizePreset` (~L340).
2. Router (`verticalDramaSeries.ts`): add `audienceAgeRating: z.enum([...]).optional()` to `createSeriesInput` (~L2001) and `synthesizeGenrePresetInput` (~L2038); merge into `bible` in `create` (~L2357, mirror `userPremise`); read back with `resolveAudienceAgeRating(bible.audienceAgeRating)` in the two story-bible job spots (~L1067, L1321).
3. Story bible expansion (`verticalDramaStoryBible.ts`): thread `params.audienceAgeRating`; inject `renderAudienceAgeRatingBlock(...)` into `buildPrompts` (system L1144-1167 + user array L1178, beside `userPremiseBlock`) AND `buildDeepDraftPrompts` (L2363-2389 / L2413).
4. Tests + verify + deploy. (Bible drives everything downstream, so Phase 1 already shapes the whole series.)

## Phase 2 (per-episode stage coverage + skills) — NEXT CHECKPOINT
Thread `audienceAgeRating` from the pipeline choke point (`verticalDramaEpisodePipeline.ts`, reads `bible` at L1915/2319/2719; mirror `genre` threading) into each stage service + inject `renderAudienceAgeRatingBlock`:
- script builder `verticalDramaScriptGeneration.ts` (mirror `genre` ~L657)
- storyboard `verticalDramaStoryboardGeneration.ts` (~L557)
- dialogue `verticalDramaDialogueAudio.ts` (new param, ~L1173)
- video/motion `verticalDramaVideoMotionPromptGeneration.ts` (new param, ~L705)
- improve-script `verticalDramaImproveScript.ts` (new param, user array ~L479)
- character visual bible `verticalDramaCharacterImageGeneration.ts` (`StoryContextFields` ~L480 — wardrobe modesty)
Add an "Audience age rating" authoring section to each stage's skill.md (+ SKILL.md mirror): script-builder, storyboard-shotgrid, dialogue-audio-planner, video-motion-prompt-pack (+ shot-video-prompt siblings), character-visual-bible, drama-script-evaluate-improve.

## Verify each phase
`pnpm check` (filtered), targeted vitest, manual create-series smoke, deploy (frontend build:deploy + restart if server/*.ts changed).
