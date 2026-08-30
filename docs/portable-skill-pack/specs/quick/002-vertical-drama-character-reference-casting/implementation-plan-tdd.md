# TDD Plan

## First tests

1. Service pure builders: enum/default normalization, bounded image count, additional instructions, input JSON and multimodal message shape.
2. Service runtime: named skill loaded, reference images attached, plain-text output accepted, empty output rejected, skill billing called once.
3. Stock metadata: optional snapshot/reference metadata round-trips; prompt-only candidate is readable/claimable.
4. Stock selection: snapshot-backed candidate writes DNA; prompt-only candidate promotes image and preserves existing `data.visualBible`.
5. Router: no-reference candidate branch calls existing generator; reference branch calls adapter and passes reference IDs/options; ownership failure is rejected.
6. Submit: references are resolved at submit time and passed to provider/Hermes; one output per candidate remains enforced.
7. UI pure helpers/render tests: labels, defaults, optional textarea, count 1–5, no-reference copy and payload omission.

## Focused commands

```bash
npm --workspace apps/web test -- --run apps/web/server/services/__tests__/verticalDramaCharacterReferenceCasting.test.ts
npm --workspace apps/web test -- --run apps/web/server/services/__tests__/verticalDramaCharacterStock.test.ts
npm --workspace apps/web test -- --run apps/web/server/routers/__tests__/verticalDramaCharacters.referenceCasting.test.ts
npm --workspace apps/web test -- --run apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.characterCrud.test.ts
npm --workspace apps/web exec vitest run --environment jsdom apps/web/client/src/components/verticalDramaSeries/__tests__/VerticalDramaCharacterStockPanel.referenceCasting.test.tsx
git diff --check
```

## Regression checks

- Existing `verticalDramaCharacters.customInstruction.test.ts`, candidate recovery tests and reference picker tests.
- Verify no migration/schema file changed.
- Verify generated reference URLs are not accepted as browser-controlled input.
