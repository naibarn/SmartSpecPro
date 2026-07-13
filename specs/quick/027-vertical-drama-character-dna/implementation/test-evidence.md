# Test Evidence

## Focused regression suite

Command:

```bash
npm --workspace apps/web test -- --run \
  server/services/__tests__/verticalDramaCharacterImageGeneration.test.ts \
  server/services/__tests__/verticalDramaCharacterVisualBible.skillContent.test.ts \
  server/services/__tests__/verticalDramaCharacterDesignContext.test.ts \
  server/services/__tests__/verticalDramaCharacterDnaPersistence.test.ts \
  server/routers/__tests__/verticalDramaCharacters.customInstruction.test.ts \
  server/routers/__tests__/verticalDramaCharacters.characterSheetType.test.ts \
  server/routers/__tests__/verticalDramaCharacters.modelSelection.test.ts \
  shared/verticalDramaSeries/characterProfile.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterDna.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.buildCharacterRosterEntries.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterCrud.test.ts \
  client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.referencePicker.test.ts
```

Final result: **12 files passed, 283 tests passed**.

## TypeScript

- `npm --workspace apps/web run check` still fails on the repository's existing baseline
  errors, including duplicated Tiptap command types and duplicated React/UI ref types.
- Filtering the same check output to every Character-DNA file changed in this implementation
  returned no matching errors.

## Static gates

- Both modified skill JSON schemas parse with `jq empty`.
- `git diff --check` passes for all scoped implementation and evidence files.
- No production database or paid model/provider was invoked by tests.

## Browser evidence

The local app answered on port 3000, but no authenticated tenant/series fixture and no
reusable browser session for the Characters route were available in this task. Browser
viewport checks are therefore recorded as skipped, not passed. No layout/CSS/component
hierarchy changed; the UI change is state handoff plus an existing toast surface.
