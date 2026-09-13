# Section 02: Shared Wrapper and Call-Site Coverage

## Ownership boundary

Own the Vertical Drama LLM wrapper and migrate every in-scope LLM caller. Do not change
story semantics or redesign the Settings UI here.

## Target files/modules

- `apps/web/server/services/verticalDramaStoryBible.ts`
- new shared Vertical Drama wrapper module
- `verticalDramaScriptGeneration.ts`
- `verticalDramaStoryboardGeneration.ts`
- `verticalDramaStartFrameGeneration.ts`
- `verticalDramaDialogueAudio.ts`
- `verticalDramaVideoMotionPromptGeneration.ts`
- Character Prompt/Visual Bible/Variant, Location, Special Tie-in, Quality Review, Memory,
  Ad Banner, Shot Image Action, and remaining audited Vertical Drama LLM services
- wrapper and coverage tests

## Implementation contract

The wrapper must accept `seriesId`, optional `episodeId`, task class, messages/prompt,
schema/vision options, and the relevant settings source. It must return the existing parsed
result plus effective-quality and fallback metadata without changing existing persistence
contracts.

Every LLM caller must be classified as:

- migrated through the wrapper; or
- deterministic/non-reasoning and explicitly excluded with a test.

No new caller may import the low-level provider transport directly unless it is the wrapper
itself.

## TDD expectations

- Mock wrapper calls for each task class.
- Add a coverage manifest test.
- Test both episode settings and series-level settings for services outside the episode
  pipeline.
- Test retries preserve the effective policy and fallback candidates re-adapt it.

## Acceptance checks

- Character and Special Tie-in paths receive the same policy as Script/Storyboard.
- Clip dialogue and auxiliary review paths do not silently revert to provider defaults.
- Existing credit calculations and idempotency keys remain unchanged.
- Vision-aware calls preserve image/reference behavior while adding only provider-valid
  reasoning fields.
