# Section 03 Code Review

Date: 2026-05-06

## Verdict

PASS

## Scope Reviewed

- `apps/web/client/src/lib/mediaModelInputs.ts`
- `apps/web/client/src/lib/mediaModelInputs.test.ts`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.tsx`
- `apps/web/client/src/components/media/ModelInputFieldsPanel.test.tsx`
- `apps/web/server/services/mediaProviderUtils.ts`
- `apps/web/server/services/mediaProviderUtils.test.ts`
- `apps/web/server/routers/media.ts`
- `apps/web/server/routers/__tests__/media.db-first.contract.test.ts`

## Findings

No blocking findings.

## Notes

- Generic model input parsing now preserves numeric constraints, max text length, and allowed library extensions.
- The number-field UI applies parsed `min`, `max`, and `step` metadata.
- Magnific seed input metadata now carries negative prompt, Nano Banana Google Search, Change Camera controls, Image Expand controls, and reference media extension hints.
- Server-side Magnific validation rejects user-supplied webhook/callback fields, invalid resolutions, invalid numeric ranges, unsupported Google Search usage, missing/oversized reference videos, unsafe reference URLs, and over-limit reference inputs before provider calls.
- `getModelWithPricing()` no longer applies static config constraints to DB rows that explicitly have `configJson: null`, preserving existing provider behavior.

## Verification

- PASS: `npm --prefix apps/web test -- client/src/lib/mediaModelInputs.test.ts client/src/components/media/ModelInputFieldsPanel.test.tsx`
- PASS: `npm --prefix apps/web test -- server/routers/__tests__/media.db-first.contract.test.ts`
- PASS: `npm --prefix apps/web test -- scripts/__tests__/seed-media-models-magnific.test.ts server/services/mediaProviderUtils.test.ts server/services/__tests__/modelRegistry.mapToApiModelId.test.ts server/services/mediaGenerationService.test.ts client/src/lib/mediaModelInputs.test.ts client/src/components/media/ModelInputFieldsPanel.test.tsx server/routers/__tests__/media.db-first.contract.test.ts`
- PASS: `npm --prefix apps/web run check`
- PASS: targeted `git diff --check`

