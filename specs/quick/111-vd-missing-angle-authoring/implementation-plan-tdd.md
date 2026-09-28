# TDD guidance

## Tests first

1. Add/extend a pure helper test for the coverage-gap draft transition if a
   helper is extracted; otherwise test the rendered card behavior.
2. Add a component regression proving a gap click creates an editable prompt,
   editing the textarea changes the `generateLocationImage` payload, and the
   candidate enters the approval state.
3. Assert the approval mutation receives the gap's coverage role and does not
   invoke primary-image selection.
4. Assert the existing shot picker displays the approved variant and selecting
   it calls `onSetShotLocationVariant`.

## Expected red conditions

- Current implementation renders the generated prompt in a non-editable
  paragraph, so a textarea/edit assertion should fail before the change.
- Current generation path reads the preview object directly, so an edited value
  is not represented in the mutation payload.

## Regression commands

- `npm test --workspace apps/web -- client/src/components/verticalDramaSeries/__tests__/VerticalDramaStoryboardPanel...`
- `npm test --workspace apps/web -- server/routers/__tests__/verticalDramaLocations.test.ts`
- `git diff --check`
- `npm run check --workspace apps/web` (report known unrelated baseline errors
  separately if the dirty checkout is not globally clean).
