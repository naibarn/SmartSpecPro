# section-03-backend-synthesis

## Goal

Add a protected backend path that invokes the new skill and returns one schema-valid synthesized preset draft without writing a preset row.

## Ownership Boundaries

Owns:

- `apps/web/server/services/verticalDramaPresetSynthesis.ts`
- `apps/web/server/services/__tests__/verticalDramaPresetSynthesis.test.ts`
- `apps/web/server/routers/verticalDramaSeries.ts`
- `apps/web/server/routers/__tests__/verticalDramaSeries.synthesizeGenrePreset.test.ts`

May reuse:

- helpers from `verticalDramaStoryBible.ts`
- skill prompt loading style from `verticalDramaScriptGeneration.ts`

Does not own:

- DB schema.
- seed content.
- client UI.

## Procedure Contract

Add `verticalDramaSeries.synthesizeGenrePreset`.

Input:

```ts
{
  locale: "th" | "en";
  selectedPresetIds?: string[];
  selectedCategories?: string[];
  primarySelectionId?: string;
  businessContext?: string;
  productContext?: string;
  targetEpisodeCount?: number;
  toneHint?: string;
}
```

Selection rules:

- Require at least 2 total selections.
- Cap at 5 total selections for MVP.
- Allow selected preset IDs only if visible to the caller.
- Allow selected categories from current global/private preset list and from the six new known labels.

Return:

```ts
{
  draft: SynthesizedGenrePresetDraft;
  creditsUsed: number;
  model: string;
}
```

## Service Flow

1. Normalize and validate input.
2. Load selected preset/category details.
3. Check credits.
4. Load `vertical-drama-preset-synthesizer` skill prompt.
5. Build compact JSON user prompt.
6. Execute JSON LLM call with retry.
7. Validate with Zod.
8. Deduct credits only after valid output.
9. Return draft.

## Error Handling

- Too few selections: `BAD_REQUEST` with simple UX copy.
- Too many selections: `BAD_REQUEST` with max count.
- Invisible private preset ID: `NOT_FOUND` or `BAD_REQUEST` without disclosing ownership.
- Insufficient credits: `FORBIDDEN`.
- Schema failure: `UNPROCESSABLE_CONTENT`, no credit deduction.
- Unexpected LLM failure: `INTERNAL_SERVER_ERROR` with safe message.

## TDD Expectations

- Unit-test service prompt construction and credit behavior with mocked LLM.
- Router-test visibility rules for global/private presets.
- Test that malformed LLM output does not deduct credits.
- Test that no DB insert occurs.

## Acceptance Checks

- The mutation is feature-flag protected through `verticalDramaProcedure`.
- Private preset ownership boundary is preserved.
- Returned draft shape matches the UI contract.

## Risks

- This is a new paid LLM action. UX copy must label it clearly.
- Router tests should not depend on production seed data; use local fixtures or mocked DB/service where possible.
