# TDD implementation guidance

## Test-first cases

1. `resolveReferencePortraitSource` with existing own primary + `none` returns `{url:null, source:null}` and does not call primary lookup.
2. `explicit`/explicit asset id returns the exact owned asset, including when it is a history image; out-of-scope asset fails before generation.
3. `auto` resolves own primary, then inherited parent/twin source as before.
4. Main payload builder defaults to `none`; intentional reference selection emits exact id.
5. Look payload builder defaults to `auto`; primary/look choices emit exact ids.
6. Provider model selection sees `hasReferenceImage=false` for main none and true for explicit/look auto when a URL exists.
7. Successful replacement demotes old primary without deleting it; failed generation does not demote.

## Expected initial failures

New tests should initially fail because the current resolver treats absent `referenceAssetLinkId` as auto and client payloads have no policy field.

## Fixtures/mocks

- Reuse existing owner-scoped stock fixtures and image-generation mocks.
- Assert resolver call count where practical to prove `none` does not read primary.
- Assert persisted task parameters/reference URLs, not only returned UI DTOs.
- Use an explicit old/history media asset fixture to distinguish “shown as default” from “user selected”.

## Regression suite

- `verticalDramaCharacters.needsSetup.test.ts`
- `verticalDramaCharacters.customInstruction.test.ts` targeted cases
- `verticalDramaCharacterImageGeneration.test.ts`
- relevant client pure-builder tests

## Failure debugging

After two failed attempts, inspect actual test logs and mocked call arguments before changing behavior. Never weaken ownership or explicit-reference assertions to make tests pass.
