# Feature 144 implementation usage

## Runtime behavior

The Vertical Drama character routes resolve the selected canonical image model
before invoking the Visual Bible skill. GPT Image 2 and Nano Banana use the
`rich` single-prompt profile with a 20,000-character cap; Seedream uses the
`compact` profile with a 5,000-character cap. Target prompts describe
avoidance inline and the normalized provider request has no negative field.

Legacy/non-target models continue to use the existing separate negative prompt
shape.

## Verification

```bash
npm --workspace @smartspec/web run test -- \
  server/services/__tests__/verticalDramaCharacterPromptContract.test.ts \
  server/services/__tests__/verticalDramaCharacterRequestNormalizer.test.ts \
  server/services/__tests__/verticalDramaCharacterPromptCatalogParity.test.ts \
  server/services/__tests__/modelPromptBudget.test.ts \
  server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts \
  server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts \
  server/routers/__tests__/verticalDramaCharacters.modelSelection.test.ts

npm --workspace @smartspec/web run test -- \
  server/routers/__tests__/verticalDramaCharacters.referenceFraming.test.ts \
  server/routers/__tests__/verticalDramaCharacters.regionEthnicity.test.ts

bash apps/web/skills/vertical-drama-character-visual-bible/scripts/verify.sh

npm --workspace @smartspec/web run test -- \
  server/services/mediaGenerationService.test.ts -t 'negative_prompt'
```

Automated verification does not call paid image providers. Broad enablement
still requires the explicitly approved manual A/B gate in Section 05.
