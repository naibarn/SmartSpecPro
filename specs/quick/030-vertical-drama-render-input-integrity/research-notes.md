# Research notes

## Discovery method

SocratiCode was attempted first as required by `AGENTS.md`, but its transport was closed. Research therefore used targeted `rg`, `sed`, and scoped `git diff` reads.

## Current image path

- Client entry: `apps/web/client/src/pages/VerticalDramaEpisodePage.tsx` → `handleGeneratePromptAndImage` → `generateStartFrameImage` or `generateStartFrameAngleVariations`.
- Both mutations live in `apps/web/server/routers/verticalDramaEpisodes.ts`.
- `resolveShotCharacterReferenceEntries` queries character rows using `inArray` but does not restore `requiredCharacterRefs` order.
- Missing portrait URLs are filtered out silently.
- `mergeAndTrimReferenceImageUrls` preserves array priority but can trim after mandatory and optional references are merged; callers do not assert mandatory portrait completeness first.
- The level-zero render path trusts the skill-authored identity lock and has no deterministic postcondition before `generateImageAsync`.
- Existing mutation `onError` handlers already surface server messages through `toast.error(err.message)`, so no new UI component is necessary.
- `generateStartFrameAngleVariations` duplicates much of the same reference-resolution behavior and must share the new contract.

## Skill behavior

- `vertical-drama-shot-start-frame-render` and `vertical-drama-shot-start-frame-prompt` instruct the LLM to bind names to `Image N` and preserve face shape, skin tone, hairstyle, clothing/outfit, and distinguishing features.
- The batch skill assumes attachment order matches the shot character list.
- The per-shot skill consumes a real `character_reference_manifest`, but code currently does not validate that the final skill output still contains every binding.
- Both lowercase and uppercase skill files exist and are not byte-identical, so behavior must not rely on editing only one copy. The code-side postcondition is the authoritative recurrence guard.

## Current dialogue path and dirty work

- Canonical lines come from `resolveShotDialogueLines` in the router.
- The previous service check used the LLM-returned `outcome.data.dialogue` when available, allowing a truncated echo to define compliance.
- The dirty worktree already contains relevant fixes in:
  - `verticalDramaVideoMotionPromptGeneration.ts`: use source `shotContext.dialogueLines`, retry, then deterministic append;
  - `verticalDramaPromptQc.ts`: `protectedFragments` support;
  - `verticalDramaEpisodes.ts`: final QC before persistence/provider submission;
  - tests for missing dialogue and QC preservation.
- These changes must be reviewed and completed, not overwritten.
- Current `protectedFragments` logic de-duplicates strings with `Set`; the approved design requires intentional repeated lines to remain ordered, so dialogue block construction needs sequence-aware handling.

## Model-family capability

- `apps/web/server/services/modelRegistry.ts` contains dirty work implementing `isGrokVideoFamily` and an invariant in `resolveVerticalDramaCapabilities` that forces `nativeAudioDialogue` and `supportsNativeAudio` true regardless of provider row metadata.
- Existing tests cover model capability parity; implementation should extend/verify provider aliases rather than introduce another capability layer.

## Test surfaces

- `apps/web/server/routers/__tests__/verticalDramaEpisodes.shotReferencesAndQualityReview.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.characterRefV2.test.ts`
- `apps/web/server/routers/__tests__/verticalDramaEpisodes.characterLockSoften.test.ts`
- `apps/web/server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts`
- `apps/web/server/services/__tests__/verticalDramaPromptQc.test.ts`
- `apps/web/server/services/__tests__/verticalDramaModelCapabilities.test.ts`
- `apps/web/shared/verticalDramaSeries/characterIdentityMap.test.ts`

## Boundary and security notes

- Existing tenant/user/series scoping must remain unchanged.
- Error logs must not include signed URL query strings.
- Preflight must run before credit deduction and provider task creation.
- No auth, schema, or permission changes are needed.

