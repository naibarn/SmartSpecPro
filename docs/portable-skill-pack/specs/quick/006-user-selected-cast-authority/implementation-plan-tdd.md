# TDD Guidance

## Shared resolver

1. Add failing tests with three frame-selected refs and a fourth storyboard-only
   ref; assert only the three physical refs are returned.
2. Add a caller ref and assert it is returned in a separate caller collection,
   never in physical refs.
3. Add duplicate/order fixtures and assert deterministic de-duplication.
4. Implement the pure resolver.

## Start Frame

1. Add a failing prompt fixture containing a mention-only character in the
   storyboard context and three user-selected frame refs.
2. Assert the identity/reference block and scene-character list contain only the
   selected refs, plus any explicit caller role.
3. Assert prompt generation remains available and does not throw for the extra
   narrative ref.
4. Implement the selected-cast integration and narrative-only instruction.

## Enhanced

1. Add a failing `buildEnhancedSkillInput`/context fixture matching shot 9.
2. Assert `shot.characterIds`, canonical character context, and dialogue speaker
   candidates do not promote the mention-only ref.
3. Assert caller refs remain represented separately.
4. Implement the integration and preserve current selected-look position tests.

## Legacy

1. Add a failing Legacy prompt fixture with the same three selected refs and one
   narrative-only storyboard ref.
2. Assert the generated identity map and scene-character inputs contain only the
   selected cast.
3. Assert exact dialogue text and speaker mapping are unchanged.
4. Implement the shared resolver wiring.

## Regression commands

```bash
pnpm exec vitest run \
  server/services/__tests__/verticalDramaEnhancedVideoPrompt.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.test.ts \
  server/services/__tests__/verticalDramaStartFrameGeneration.requiredCharacters.test.ts \
  server/routers/__tests__/verticalDramaEpisodes.generateShotVideoPrompt.test.ts \
  server/__tests__/verticalDramaShotPromptJobsWiring.test.ts

uv run --frozen --project apps/web/skills/generic-commercial-video-director \
  python -m unittest apps/web/skills/generic-commercial-video-director/tests/test_enhanced_audio_bridge.py -v

git diff --check
```

Do not run a paid Enhanced job or call a provider as part of these checks.
