# TDD Plan

## Red

- Classifier matrix: Higgsfield/Kie/Magnific/KNPLabs/future Grok video true;
  Grok images and non-Grok video false.
- DB/static/seed capability tests fail on missing or stale false values.
- Speaker-switch mock response omitting one or all lines must fail current
  expectations.
- QC refinement that removes a protected line must fail.
- Storyboard regeneration leaving downstream artifacts active must fail.

## Green

- Implement the smallest shared classifier/override.
- Add explicit seed flags and config serialization.
- Extract/reuse compliance enforcement and deterministic append.
- Add protected-fragment QC.
- Add revision helpers and stale guards to every storyboard write/use path.

## Refactor

- Remove provider-specific Grok exceptions superseded by the family invariant.
- Keep helpers pure and table-driven.
- Avoid moving unrelated code in dirty files.

## Commands

```bash
npm --workspace apps/web test -- --run \
  server/services/__tests__/verticalDramaModelCapabilities.test.ts \
  server/routers/__tests__/mediaModels.verticalDramaCapabilityParity.test.ts \
  scripts/__tests__/seed-media-models-mcp-providers.test.ts

npm --workspace apps/web test -- --run \
  server/services/__tests__/verticalDramaShotVideoPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaVideoMotionPromptGeneration.test.ts \
  server/services/__tests__/verticalDramaPromptQc.test.ts

npm --workspace apps/web test -- --run <focused storyboard revision tests>
npm --workspace apps/web run check
```

